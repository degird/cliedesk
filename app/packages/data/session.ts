/**
 * Nonce lifecycle and the re-authenticate state (plan.frontend-ux.md §3.8, §3.13).
 *
 * - `refreshNonce()` calls `boot.rest.nonceUrl` (INB-01: GET `/dash/__session`, cookie-authenticated, never admin-ajax).
 * - A response of `0` or a non-2xx status means the session ended → `requestReauth()`.
 * - `requestReauth()` opens the Re-authenticate dialog (rendered by @cliedesk/app) and resolves when the user
 *   signed in again; concurrent callers share one prompt.
 */
import apiFetch from '@wordpress/api-fetch';
import { getBoot } from './boot';
import { createStore } from './store';

export type ReauthReason = 'expired' | 'blocked';

export interface ReauthState {
	open: boolean;
	reason: ReauthReason;
}

export const reauthStore = createStore< ReauthState >( {
	open: false,
	reason: 'expired',
} );

let nonce: string | null | undefined;
const nonceListeners = new Set< ( n: string ) => void >();
let lastRefresh = Date.now();

/** Current REST nonce. */
export function getNonce(): string | null {
	if ( nonce === undefined ) {
		nonce = getBoot().rest.nonce;
	}
	return nonce;
}

/**
 * Set the nonce (refresh, or broadcast from the leader tab). Also updates core's apiFetch nonce middleware.
 *
 * @param value     New nonce.
 * @param broadcast Notify listeners (the leader broadcasts to other tabs); false for values received from a tab.
 */
export function setNonce( value: string, broadcast = true ): void {
	nonce = value;
	lastRefresh = Date.now();
	const mw = (
		apiFetch as unknown as { nonceMiddleware?: { nonce: string } }
	 ).nonceMiddleware;
	if ( mw ) {
		mw.nonce = value;
	}
	if ( broadcast ) {
		nonceListeners.forEach( ( l ) => l( value ) );
	}
}

/**
 * Listen for locally refreshed nonces (the change feed broadcasts them to other tabs).
 *
 * @param listener Listener.
 */
export function onNonceRefreshed(
	listener: ( n: string ) => void
): () => void {
	nonceListeners.add( listener );
	return () => {
		nonceListeners.delete( listener );
	};
}

/** Milliseconds since the last refresh. */
export function nonceAge(): number {
	return Date.now() - lastRefresh;
}

export type NonceFetch = (
	url: string
) => Promise< { ok: boolean; status: number; text: () => Promise< string > } >;

let nonceFetch: NonceFetch = ( url ) =>
	window.fetch( url, { credentials: 'same-origin', cache: 'no-store' } );

/**
 * Replace the fetch used for nonce refreshes (tests).
 *
 * @param fn Fetch implementation.
 */
export function setNonceFetch( fn: NonceFetch ): void {
	nonceFetch = fn;
}

export type NonceResult =
	{ ok: true; nonce: string } | { ok: false; reason: ReauthReason };

let inflight: Promise< NonceResult > | null = null;

/** Fetch a fresh nonce. Concurrent callers share one request. */
export function refreshNonce(): Promise< NonceResult > {
	if ( ! inflight ) {
		inflight = ( async (): Promise< NonceResult > => {
			try {
				const res = await nonceFetch( getBoot().rest.nonceUrl );
				const text = ( await res.text() ).trim();
				if (
					! res.ok ||
					text === '' ||
					text === '0' ||
					text === '-1'
				) {
					return { ok: false, reason: 'expired' };
				}
				if ( ! /^[A-Za-z0-9]{6,64}$/.test( text ) ) {
					// An HTML page (security plugin, WAF) instead of a nonce: the session path is blocked.
					return { ok: false, reason: 'blocked' };
				}
				setNonce( text );
				return { ok: true, nonce: text };
			} catch {
				return { ok: false, reason: 'blocked' };
			}
		} )().finally( () => {
			inflight = null;
		} );
	}
	return inflight;
}

let pending: {
	promise: Promise< void >;
	resolve: () => void;
	reject: ( e: unknown ) => void;
} | null = null;

/**
 * Open the Re-authenticate dialog; resolves after a successful sign-in, rejects when the user dismisses it.
 *
 * @param reason Why the session is considered ended.
 */
export function requestReauth(
	reason: ReauthReason = 'expired'
): Promise< void > {
	if ( ! pending ) {
		let resolve!: () => void;
		let reject!: ( e: unknown ) => void;
		const promise = new Promise< void >( ( res, rej ) => {
			resolve = res;
			reject = rej;
		} );
		pending = { promise, resolve, reject };
	}
	reauthStore.set( { open: true, reason } );
	return pending.promise;
}

/** Called by the dialog after the user signed in and a fresh nonce was obtained. */
export function completeReauth(): void {
	reauthStore.set( { open: false, reason: 'expired' } );
	pending?.resolve();
	pending = null;
}

/**
 * Called when the user dismisses the dialog: waiting requests fail with their original error.
 *
 * @param error Error passed to waiting requests.
 */
export function cancelReauth(
	error: unknown = new Error( 'reauth_cancelled' )
): void {
	reauthStore.set( { open: false, reason: 'expired' } );
	pending?.reject( error );
	pending = null;
}

// ------------------------------------------------------------------ Recent authentication (sudo).

export interface SudoState {
	open: boolean;
}

/** "Confirm your password" dialog state: sensitive Actions answer 403 `cliedesk_reauth_required`. */
export const sudoStore = createStore< SudoState >( { open: false } );

let sudoPending: {
	promise: Promise< void >;
	resolve: () => void;
	reject: ( e: unknown ) => void;
} | null = null;

/**
 * Ask for the password (dialog rendered by @cliedesk/app); resolves after a successful confirmation, rejects when
 * the user cancels. Concurrent callers share one prompt.
 */
export function requestSudo(): Promise< void > {
	if ( ! sudoPending ) {
		let resolve!: () => void;
		let reject!: ( e: unknown ) => void;
		const promise = new Promise< void >( ( res, rej ) => {
			resolve = res;
			reject = rej;
		} );
		sudoPending = { promise, resolve, reject };
	}
	sudoStore.set( { open: true } );
	return sudoPending.promise;
}

/** The password was confirmed: waiting requests are retried. */
export function completeSudo(): void {
	sudoStore.set( { open: false } );
	sudoPending?.resolve();
	sudoPending = null;
}

/**
 * The user cancelled: waiting requests fail with their original error.
 *
 * @param error Error passed to waiting requests.
 */
export function cancelSudo(
	error: unknown = new Error( 'sudo_cancelled' )
): void {
	sudoStore.set( { open: false } );
	sudoPending?.reject( error );
	sudoPending = null;
}

/** Set when any request answers 403 `cliedesk_2fa_required` (the app then shows the set-up page). */
export const twoFactorBlockedStore = createStore< boolean >( false );
