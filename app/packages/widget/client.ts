/**
 * Widget API client: keeps the visitor secret in localStorage (per product), holds the short-lived access token in
 * memory and renews it once when the server says the session ended. No cookies (credentials: 'omit').
 */
import type {
	WidgetConfig,
	WidgetConversation,
	WidgetMessage,
	WidgetChallenge,
	WidgetOffline,
	WidgetWithin,
	WidgetSurvey,
	WidgetNotice,
	WidgetQueue,
} from './types';
import { widgetUrl } from './url';

export class WidgetError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super( message );
	}
}

type Fetch = typeof fetch;

export class WidgetClient {
	private token: string | null = null;

	constructor(
		private config: Pick<
			WidgetConfig,
			| 'api'
			| 'product'
			| 'privacy'
			| 'identity'
			| 'checkout'
			| 'identityUrl'
			| 'sessionDays'
			| 'shop'
		>,
		private doFetch: Fetch = ( ...a ) => fetch( ...a ),
		private storage: Pick<
			Storage,
			'getItem' | 'setItem'
		> | null = safeStorage( config.sessionDays === 0 )
	) {}

	/** SEC-07: drop the access token; the next call starts a session with the current identity. */
	forget(): void {
		this.token = null;
	}

	/**
	 * CRM-07: the signed-in WordPress user's proof from the same-site endpoint (cached pages cannot carry it); a
	 * token signed by another site's server (SEC-07) is used as it is.
	 */
	private async identity(): Promise< string | undefined > {
		const own = this.config.identity;
		const url = this.config.identityUrl;
		if (
			! url ||
			( own && ! own.startsWith( 'cdi1.' ) ) ||
			new URL( url, window.location.href ).origin !==
				window.location.origin
		) {
			return own;
		}
		try {
			const r = await this.doFetch( url, { credentials: 'same-origin' } );
			const j = r.ok ? await r.json() : null;
			return typeof j?.identity === 'string' ? j.identity : own;
		} catch {
			return own;
		}
	}

	private get key(): string {
		return `cliedesk:visitor:${ this.config.product }`;
	}

	private url( path: string, query: Record< string, string > = {} ): string {
		return widgetUrl( this.config.api, path, query );
	}

	/** Whether this browser already has a visitor session (SEC-12: private mode starts none before the chat opens). */
	hasSession(): boolean {
		return !! this.storage?.getItem( this.key );
	}

	/** Start or continue the visitor session. */
	async session(): Promise< string > {
		const secret = this.storage?.getItem( this.key ) ?? null;
		const identity = await this.identity();
		const r = await this.doFetch( this.url( 'session' ), {
			method: 'POST',
			credentials: 'omit',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				product: this.config.product,
				...( secret ? { secret } : {} ),
				...( identity ? { identity } : {} ),
			} ),
		} );
		const body = await r.json().catch( () => null );
		if ( ! r.ok || ! body?.data?.token ) {
			throw new WidgetError( body?.message ?? 'session', r.status );
		}
		if ( body.data.secret ) {
			this.storage?.setItem( this.key, body.data.secret );
		}
		this.token = body.data.token as string;
		return this.token;
	}

	private async call< T >(
		method: 'GET' | 'POST',
		path: string,
		data?: Record< string, unknown > | FormData,
		query: Record< string, string > = {},
		retried = false
	): Promise< T > {
		const token = this.token ?? ( await this.session() );
		const form =
			typeof FormData !== 'undefined' && data instanceof FormData;
		const r = await this.doFetch( this.url( path, query ), {
			method,
			credentials: 'omit',
			headers: {
				'X-Cliedesk-Widget': token,
				...( data && ! form
					? { 'Content-Type': 'application/json' }
					: {} ),
			},
			...( data
				? { body: form ? ( data as FormData ) : JSON.stringify( data ) }
				: {} ),
		} );
		if ( r.status === 401 && ! retried ) {
			this.token = null;
			return this.call< T >( method, path, data, query, true );
		}
		const body = await r.json().catch( () => null );
		if ( ! r.ok ) {
			throw new WidgetError( body?.message ?? 'error', r.status );
		}
		return body?.data as T;
	}

	/** AUT-21: run a "widget script" rule on the visitor's open conversation. */
	/**
	 * CRM-20: tell the team which page the visitor is on. Only for a visitor who already has a session, and never in
	 * private mode or with Do Not Track.
	 */
	async pageView(): Promise< boolean > {
		if (
			this.config.privacy === 'private' ||
			doNotTrack() ||
			! this.hasSession()
		) {
			return false;
		}
		const { pageUrl, pageTitle } = page( this.config.privacy );
		const r = await this.call< { stored: boolean } >( 'POST', 'page-view', {
			pageUrl,
			pageTitle,
		} );
		return !! r?.stored;
	}

	/**
	 * DEV-12: record a customer event (stored only for visitors who are a known contact).
	 *
	 * @param name       Event name (a-z, 0-9, _, .).
	 * @param properties Plain values.
	 */
	async track(
		name: string,
		properties: Record< string, string | number | boolean > = {}
	): Promise< boolean > {
		const r = await this.call< { stored: boolean } >( 'POST', 'track', {
			name,
			properties,
		} );
		return !! r?.stored;
	}

	async runWorkflow( id: number ): Promise< boolean > {
		const r = await this.call< { started: boolean } >(
			'POST',
			'run-workflow',
			{ workflowId: id }
		);
		return !! r?.started;
	}

	conversations(): Promise< {
		items: WidgetConversation[];
		/** PRT-28: the open conversation to reopen (null: open on home). */
		resume?: string | null;
		offline?: WidgetOffline;
		hours?: { open: boolean; opensAt: string | null };
		promise?: string | null;
		replyBy?: string | null;
		within?: WidgetWithin;
		notices?: WidgetNotice[];
		challenge?: WidgetChallenge;
	} > {
		return this.call( 'GET', 'conversations' );
	}

	start( input: {
		text: string;
		name?: string;
		email?: string;
		topic?: string;
		captcha?: string;
		/** CHN-33: subject, order number and fields from a chat link. */
		prefill?: {
			subject?: string;
			order?: string;
			fields?: Record< string, string >;
		};
	} ): Promise< { uid: string } > {
		return this.call( 'POST', 'conversations', {
			...input,
			...page( this.config.privacy ),
			...checkout( this.config.checkout ),
			...( this.config.shop
				? { shop: JSON.stringify( this.config.shop ) }
				: {} ),
		} );
	}

	messages(
		uid: string,
		after: number
	): Promise< {
		items: WidgetMessage[];
		open: boolean;
		hasEmail: boolean;
		typing?: string;
		/** CHN-24: when the team last read the conversation (null: read markers off). */
		seenAt?: string | null;
		replyBy?: string | null;
		survey?: WidgetSurvey | null;
		queue?: WidgetQueue | null;
		/** INB-41: corrected replies. */
		edited?: Array< { id: number; text: string } >;
	} > {
		return this.call( 'GET', `conversations/${ uid }/messages`, undefined, {
			after: String( after ),
		} );
	}

	email( uid: string, email: string ): Promise< { saved: boolean } > {
		return this.call( 'POST', `conversations/${ uid }/email`, { email } );
	}

	/** APP-16: this device gets (or stops getting) browser notifications for replies. */
	push( body: {
		endpoint: string;
		keys?: { p256dh?: string; auth?: string };
		remove?: boolean;
	} ): Promise< { subscribed: boolean } > {
		return this.call( 'POST', 'push', body );
	}

	/** CHN-25, CHN-33: ask for an email code, then confirm it. */
	verify(
		body: { email: string } | { challenge: string; code: string }
	): Promise< { challenge: string; verified?: boolean } > {
		return this.call( 'POST', 'verify', body );
	}

	typing( uid: string ): Promise< { ok: boolean } > {
		return this.call( 'POST', `conversations/${ uid }/typing`, {} );
	}

	rate(
		uid: string,
		body: { rating: number; reasons?: string[]; comment?: string }
	): Promise< WidgetSurvey > {
		return this.call( 'POST', `conversations/${ uid }/csat`, body );
	}

	/** DEV-20: press a button (or send a form) of a card in a team reply. */
	card(
		uid: string,
		messageId: number,
		index: number,
		values: Record< string, string | boolean > = {}
	): Promise< { done: boolean } > {
		return this.call( 'POST', `conversations/${ uid }/card`, {
			messageId,
			index,
			values: JSON.stringify( values ),
		} );
	}

	transcript( uid: string ): Promise< { sent: boolean } > {
		return this.call( 'POST', `conversations/${ uid }/transcript`, {} );
	}

	upload(
		uid: string,
		file: File
	): Promise< { id: number; name: string; size: number } > {
		const form = new FormData();
		form.append( 'file', file, file.name );
		return this.call( 'POST', `conversations/${ uid }/files`, form );
	}

	send(
		uid: string,
		text: string,
		attachmentIds: number[] = []
	): Promise< { id: number } > {
		return this.call( 'POST', `conversations/${ uid }/messages`, {
			text,
			...( attachmentIds.length ? { attachmentIds } : {} ),
			...page( this.config.privacy ),
			...checkout( this.config.checkout ),
			...( this.config.shop
				? { shop: JSON.stringify( this.config.shop ) }
				: {} ),
		} );
	}
}

/**
 * Whether the visitor asked not to be tracked (SEC-12: Do Not Track or Global Privacy Control).
 */
export function doNotTrack(): boolean {
	const n = navigator as Navigator & { globalPrivacyControl?: boolean };
	return n.doNotTrack === '1' || n.globalPrivacyControl === true;
}

/**
 * CHN-32: the checkout step and the payment error the page shows (WooCommerce classic or block checkout).
 *
 * @param step Checkout step of the page.
 */
export function checkout( step?: string ): Record< string, string > {
	if ( ! step ) {
		return {};
	}
	const error = document.querySelector(
		'.woocommerce-error, .wc-block-components-notice-banner.is-error'
	);
	return {
		checkoutStep: step,
		checkoutError: ( error?.textContent ?? '' )
			.replace( /\s+/g, ' ' )
			.trim()
			.slice( 0, 300 ),
	};
}

function page( privacy?: string ): {
	pageUrl: string;
	pageTitle: string;
	pageLanguage: string;
	referrer: string;
	context: string;
} {
	return {
		pageUrl: window.location.href.slice( 0, 1000 ),
		pageTitle: document.title.slice( 0, 300 ),
		// TRI-03: the page language (WPML or Polylang set it) comes before the browser language.
		pageLanguage: document.documentElement.lang.slice( 0, 20 ),
		// SEC-12: no referrer in private mode or when the visitor asked not to be tracked.
		referrer:
			privacy === 'private' || doNotTrack()
				? ''
				: document.referrer.slice( 0, 1000 ),
		// DEV-10: Cliedesk.setContext() pairs.
		context: contextJson(),
	};
}

function safeStorage(
	tab = false
): Pick< Storage, 'getItem' | 'setItem' > | null {
	try {
		// SEC-10: session-only visitors are forgotten when the browser closes.
		return tab ? window.sessionStorage : window.localStorage;
	} catch {
		return null;
	}
}

const CONTEXT_KEY = 'cliedesk_context';

/**
 * DEV-10: key/value pairs the site sends with the visitor's messages (shown to agents in the sidebar). Up to 50
 * plain pairs; kept for the browser session.
 *
 * @param pairs Pairs (null clears them).
 */
export function setContext(
	pairs: Record< string, string | number | boolean > | null
): void {
	const out: Record< string, string > = {};
	for ( const [ k, v ] of Object.entries( pairs ?? {} ).slice( 0, 50 ) ) {
		if (
			/^[\w .-]{1,40}$/.test( k ) &&
			[ 'string', 'number', 'boolean' ].includes( typeof v )
		) {
			out[ k ] = String( v ).slice( 0, 200 );
		}
	}
	try {
		window.sessionStorage.setItem( CONTEXT_KEY, JSON.stringify( out ) );
	} catch {
		// Storage blocked: the pairs are not sent.
	}
}

/**
 * The pairs set with setContext(), as JSON ('' when none).
 */
export function contextJson(): string {
	try {
		const v = window.sessionStorage.getItem( CONTEXT_KEY ) ?? '';
		return v === '{}' ? '' : v;
	} catch {
		return '';
	}
}
