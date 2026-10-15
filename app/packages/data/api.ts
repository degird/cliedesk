/**
 * REST client for `cliedesk/v1/` (plan.frontend-ux.md §4.7), on top of core `wp.apiFetch` (`parse: false`, so
 * headers stay readable).
 *
 * - Envelopes: success `{ data, meta }` → `ApiResult`; error `{ error: {…} }` → `CliedeskApiError`.
 * - Headers sent: `X-WP-Nonce`, `X-Cliedesk-Client`, `X-Cliedesk-Request-Id`, `Idempotency-Key` (every
 *   mutation; one key per mutation attempt, reused by the automatic retry), `If-Match` (when known).
 * - Headers read: `ETag`, `X-Request-Id`, `Poll-After` / `X-Cliedesk-Poll-After`, `Retry-After`.
 * - Retries: GET network/502/503/504 ×2 (0.5 s, 2 s + jitter); 429 once after `Retry-After` (≤ 30 s);
 *   403 `rest_cookie_invalid_nonce` → nonce refresh, once; 401 → Re-authenticate dialog, then one replay;
 *   mutation network error with an Idempotency-Key → once; 403 `cliedesk_reauth_required` → "Confirm your
 *   password" dialog, then one retry (cancel rejects with the original error); 403 `cliedesk_2fa_required` → the
 *   two-factor set-up page.
 * - Every request carries `_locale=user`, so server messages come back in the agent's language.
 * - During a permission preview (TEAM-18) every request sends `X-Cliedesk-View-As: <token>` (unless
 *   `viewAs: false`); 403 `cliedesk_view_as_readonly` and `cliedesk_view_as_expired` are reported through
 *   `notifyViewAs`, and an expired preview is ended here.
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { addQueryArgs } from '@wordpress/url';
import { getBoot } from './boot';
import { CliedeskApiError } from './errors';
import {
	getNonce,
	refreshNonce,
	requestReauth,
	requestSudo,
	twoFactorBlockedStore,
} from './session';
import { ulid } from './ulid';
import { getViewAs, notifyViewAs, setViewAs } from './viewAs';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue =
	string | number | boolean | null | undefined | Array< string | number >;

export interface RequestOptions {
	query?: Record< string, QueryValue >;
	body?: unknown;
	signal?: AbortSignal;
	/** Reuse a key created when the user acted (e.g. retry button). Generated per call otherwise. */
	idempotencyKey?: string;
	/** `ETag` value to send as `If-Match`; `true` uses the last ETag seen for the same path. */
	ifMatch?: string | true;
	/** Override the timeout (ms). */
	timeout?: number;
	/** Send the permission preview header when a preview is active (default true). */
	viewAs?: boolean;
}

export interface ApiResult< T > {
	data: T;
	meta: Record< string, unknown >;
	status: number;
	etag: string | null;
	requestId: string | null;
	/** Seconds from `Poll-After`, when sent. */
	pollAfter: number | null;
}

export interface TransportRequest {
	url: string;
	method: HttpMethod;
	headers: Record< string, string >;
	data?: unknown;
	signal: AbortSignal;
}

export interface TransportResponse {
	status: number;
	headers: { get: ( name: string ) => string | null };
	text: () => Promise< string >;
}

export type Transport = (
	req: TransportRequest
) => Promise< TransportResponse >;

function isResponseLike( v: unknown ): v is TransportResponse {
	return (
		!! v &&
		typeof v === 'object' &&
		'status' in v &&
		'headers' in v &&
		typeof ( v as TransportResponse ).text === 'function'
	);
}

const apiFetchTransport: Transport = async ( req ) => {
	try {
		// File uploads go as multipart form data (the browser sets the boundary).
		const form =
			typeof FormData !== 'undefined' && req.data instanceof FormData;
		return ( await apiFetch( {
			url: req.url,
			method: req.method,
			headers: req.headers,
			...( form ? { body: req.data as FormData } : { data: req.data } ),
			signal: req.signal,
			parse: false,
		} ) ) as TransportResponse;
	} catch ( e ) {
		if ( isResponseLike( e ) ) {
			return e; // apiFetch throws non-2xx responses when parse is false.
		}
		throw e;
	}
};

const config = {
	transport: apiFetchTransport,
	sleep: ( ms: number ) =>
		new Promise< void >( ( r ) => setTimeout( r, ms ) ),
	random: () => Math.random(),
};

/**
 * Replace the transport, sleep or random source (tests, MSW-free unit tests).
 *
 * @param next Partial config.
 */
export function configureApi( next: Partial< typeof config > ): void {
	Object.assign( config, next );
}

const etags = new Map< string, string >();

/**
 * Last ETag seen for a path (from a GET or a write).
 *
 * @param path Path below `cliedesk/v1/`.
 */
export function getEtag( path: string ): string | null {
	return etags.get( normalisePath( path ) ) ?? null;
}

function normalisePath( path: string ): string {
	return path.replace( /^\/+/, '' );
}

/**
 * Full URL for a path below `cliedesk/v1/` (works with `?rest_route=` roots on plain permalinks).
 *
 * @param path  Path.
 * @param query Query args.
 */
export function apiUrl(
	path: string,
	query?: Record< string, QueryValue >
): string {
	const root = getBoot().rest.root;
	const base = root.includes( '?' )
		? root.replace( /\?rest_route=\/?/, '?rest_route=/' ) +
			'cliedesk/v1/' +
			normalisePath( path )
		: root.replace( /\/?$/, '/' ) + 'cliedesk/v1/' + normalisePath( path );
	const args: Record< string, unknown > = {};
	for ( const [ k, v ] of Object.entries( query ?? {} ) ) {
		if ( v !== undefined && v !== null ) {
			args[ k ] = v;
		}
	}
	return Object.keys( args ).length ? addQueryArgs( base, args ) : base;
}

function header( res: TransportResponse, name: string ): string | null {
	try {
		return res.headers.get( name );
	} catch {
		return null;
	}
}

function toNumber( v: unknown ): number | null {
	const n = typeof v === 'string' ? parseFloat( v ) : v;
	return typeof n === 'number' && Number.isFinite( n ) ? n : null;
}

type Json = Record< string, unknown >;

/**
 * Normalise an error body into a `CliedeskApiError`.
 *
 * @param status    HTTP status.
 * @param body      Parsed JSON (or null when not JSON).
 * @param raw       Raw text.
 * @param requestId Request id from the header.
 * @param retryHdr  Retry-After header.
 */
export function toApiError(
	status: number,
	body: unknown,
	raw: string,
	requestId: string | null,
	retryHdr: string | null = null
): CliedeskApiError {
	if ( body && typeof body === 'object' ) {
		const b = body as Json;
		const env =
			b.error && typeof b.error === 'object' ? ( b.error as Json ) : null;
		if ( env ) {
			return new CliedeskApiError( {
				code: String( env.code ?? 'cliedesk_error' ),
				message: String( env.message ?? '' ),
				status: toNumber( env.status ) ?? status,
				fields: ( env.fields as Record< string, string > ) ?? {},
				retryAfter: toNumber( env.retry_after ) ?? toNumber( retryHdr ),
				requestId: ( env.request_id as string ) ?? requestId,
				details: env.details ?? null,
			} );
		}
		if ( typeof b.code === 'string' ) {
			// WordPress core shape (e.g. rest_cookie_invalid_nonce, rest_no_route).
			const data = ( b.data as Json ) ?? {};
			return new CliedeskApiError( {
				code: b.code,
				message: String( b.message ?? '' ),
				status: toNumber( data.status ) ?? status,
				fields: ( data.fields as Record< string, string > ) ?? {},
				retryAfter:
					toNumber( data.retry_after ) ?? toNumber( retryHdr ),
				requestId: ( data.request_id as string ) ?? requestId,
			} );
		}
	}
	return new CliedeskApiError( {
		code: 'cliedesk_bad_response',
		message:
			raw.trim() === ''
				? `HTTP ${ status }`
				: __( 'The server sent an unexpected response.', 'cliedesk' ),
		status,
		requestId,
		details: { snippet: raw.slice( 0, 200 ) },
		retryAfter: toNumber( retryHdr ),
	} );
}

const RETRY_STATUS = new Set( [ 502, 503, 504 ] );
const BACKOFF = [ 500, 2000 ];
const SESSION_ENDED = new Set( [
	'cliedesk_unauthorized',
	'rest_not_logged_in',
	'cliedesk_session_expired',
] );

/**
 * Send a request.
 *
 * @param method HTTP method.
 * @param path   Path below `cliedesk/v1/`.
 * @param opts   Options.
 */
export async function request< T = unknown >(
	method: HttpMethod,
	path: string,
	opts: RequestOptions = {}
): Promise< ApiResult< T > > {
	const isRead = method === 'GET';
	let key = isRead ? undefined : ( opts.idempotencyKey ?? ulid() );
	const ifMatch = opts.ifMatch === true ? getEtag( path ) : opts.ifMatch;
	// WordPress core switches to the user's locale for `_locale=user`.
	const url = apiUrl( path, { ...opts.query, _locale: 'user' } );
	const timeout = opts.timeout ?? ( isRead ? 20000 : 30000 );

	let networkRetries = 0;
	let nonceRetried = false;
	let reauthed = false;
	let busyRetried = false;
	let sudoRetried = false;

	for (;;) {
		const headers: Record< string, string > = {
			Accept: 'application/json',
			'X-Cliedesk-Client': 'app/' + getBoot().version,
			'X-Cliedesk-Request-Id': ulid(),
		};
		const nonce = getNonce();
		if ( nonce ) {
			headers[ 'X-WP-Nonce' ] = nonce;
		}
		if ( key ) {
			headers[ 'Idempotency-Key' ] = key;
		}
		if ( ifMatch ) {
			headers[ 'If-Match' ] = ifMatch;
		}
		const preview = opts.viewAs === false ? null : getViewAs();
		if ( preview ) {
			headers[ 'X-Cliedesk-View-As' ] = preview.token;
		}

		const controller = new AbortController();
		const onAbort = () => controller.abort();
		opts.signal?.addEventListener( 'abort', onAbort );
		let timedOut = false;
		const timer = setTimeout( () => {
			timedOut = true;
			controller.abort();
		}, timeout );

		let res: TransportResponse;
		try {
			res = await config.transport( {
				url,
				method,
				headers,
				data: opts.body,
				signal: controller.signal,
			} );
		} catch ( e ) {
			clearTimeout( timer );
			opts.signal?.removeEventListener( 'abort', onAbort );
			if ( opts.signal?.aborted ) {
				throw e;
			}
			const err = new CliedeskApiError( {
				code: timedOut ? 'cliedesk_timeout' : 'cliedesk_network_error',
				message: timedOut
					? __( 'The request took too long.', 'cliedesk' )
					: __( 'You are probably offline.', 'cliedesk' ),
				status: 0,
			} );
			if ( isRead && networkRetries < BACKOFF.length ) {
				await config.sleep(
					( BACKOFF[ networkRetries ] as number ) *
						( 1 + config.random() * 0.2 )
				);
				networkRetries++;
				continue;
			}
			if ( ! isRead && key && networkRetries === 0 ) {
				networkRetries++;
				continue;
			}
			throw err;
		}
		clearTimeout( timer );
		opts.signal?.removeEventListener( 'abort', onAbort );

		const raw = await res.text();
		let body: unknown = null;
		try {
			body = raw.trim() === '' ? null : JSON.parse( raw );
		} catch {
			body = undefined;
		}
		const requestId = header( res, 'X-Request-Id' );

		if ( res.status >= 200 && res.status < 300 ) {
			if ( body === undefined ) {
				throw toApiError( res.status, null, raw, requestId );
			}
			const etag = header( res, 'ETag' );
			if ( etag ) {
				etags.set( normalisePath( path ), etag );
			}
			const isEnvelope =
				!! body &&
				typeof body === 'object' &&
				! Array.isArray( body ) &&
				'data' in ( body as Json );
			return {
				data: ( isEnvelope ? ( body as Json ).data : body ) as T,
				meta:
					( isEnvelope
						? ( ( body as Json ).meta as Record< string, unknown > )
						: null ) ?? {},
				status: res.status,
				etag,
				requestId,
				pollAfter: toNumber(
					header( res, 'Poll-After' ) ??
						header( res, 'X-Cliedesk-Poll-After' )
				),
			};
		}

		const err = toApiError(
			res.status,
			body ?? null,
			raw,
			requestId,
			header( res, 'Retry-After' )
		);

		if (
			err.status === 403 &&
			err.code === 'rest_cookie_invalid_nonce' &&
			! nonceRetried
		) {
			nonceRetried = true;
			const r = await refreshNonce();
			if ( ! r.ok ) {
				await requestReauth( r.reason ).catch( () => {
					throw err;
				} );
				reauthed = true;
			}
			continue;
		}
		if (
			err.status === 403 &&
			err.code === 'cliedesk_reauth_required' &&
			! sudoRetried
		) {
			sudoRetried = true;
			await requestSudo().catch( () => {
				throw err;
			} );
			// A new attempt: the refused one may be remembered under its key.
			if ( key && ! opts.idempotencyKey ) {
				key = ulid();
			}
			continue;
		}
		if ( err.status === 403 && err.code === 'cliedesk_view_as_readonly' ) {
			notifyViewAs( 'readonly' );
		}
		if (
			err.status === 403 &&
			err.code === 'cliedesk_view_as_expired' &&
			preview
		) {
			if ( getViewAs()?.token === preview.token ) {
				setViewAs( null );
				notifyViewAs( 'expired' );
			}
		}
		if ( err.status === 403 && err.code === 'cliedesk_2fa_required' ) {
			twoFactorBlockedStore.set( true );
		}
		if (
			err.status === 401 &&
			SESSION_ENDED.has( err.code ) &&
			! reauthed
		) {
			reauthed = true;
			await requestReauth( 'expired' ).catch( () => {
				throw err;
			} );
			continue;
		}
		if (
			isRead &&
			RETRY_STATUS.has( err.status ) &&
			networkRetries < BACKOFF.length
		) {
			await config.sleep(
				( BACKOFF[ networkRetries ] as number ) *
					( 1 + config.random() * 0.2 )
			);
			networkRetries++;
			continue;
		}
		if ( err.status === 429 && ! busyRetried ) {
			busyRetried = true;
			await config.sleep( Math.min( err.retryAfter ?? 1, 30 ) * 1000 );
			continue;
		}
		throw err;
	}
}

export const api = {
	request,
	get: < T = unknown >( path: string, opts?: RequestOptions ) =>
		request< T >( 'GET', path, opts ),
	post: < T = unknown >( path: string, opts?: RequestOptions ) =>
		request< T >( 'POST', path, opts ),
	put: < T = unknown >( path: string, opts?: RequestOptions ) =>
		request< T >( 'PUT', path, opts ),
	patch: < T = unknown >( path: string, opts?: RequestOptions ) =>
		request< T >( 'PATCH', path, opts ),
	del: < T = unknown >( path: string, opts?: RequestOptions ) =>
		request< T >( 'DELETE', path, opts ),
};
