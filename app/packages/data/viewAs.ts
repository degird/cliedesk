/**
 * Permission preview ("View as", TEAM-18): the preview session, kept in sessionStorage so a reload keeps it until
 * it expires.
 *
 * - While a preview is active, every API request sends `X-Cliedesk-View-As: <token>` (api.ts) and the boot caps
 *   are replaced by the previewed person's caps (boot.ts).
 * - The server refuses writes with 403 `cliedesk_view_as_readonly` and ends the preview with 403
 *   `cliedesk_view_as_expired`; both are reported through `viewAsNoticeStore` so the app can tell the user.
 *
 * No dependency on boot.ts (boot.ts depends on this module).
 */
import { createStore } from './store';

export interface ViewAsUser {
	id: number;
	name: string;
	roles: string[];
	caps: string[];
	/** Products the person may see: 'all' or product ids. */
	productScope?: 'all' | number[];
	/** Avatar URL. */
	avatar?: string;
}

export interface ViewAsSession {
	token: string;
	/** ISO 8601 (UTC). */
	expiresAt: string;
	user: ViewAsUser;
}

export type ViewAsNotice = {
	kind: 'readonly' | 'expired';
	/** Increases with every notice, so the same kind twice still notifies. */
	seq: number;
};

const STORAGE_KEY = 'cliedesk.viewAs';

/**
 * Validate a stored or received session.
 *
 * @param raw Anything.
 */
export function parseViewAs( raw: unknown ): ViewAsSession | null {
	if ( ! raw || typeof raw !== 'object' ) {
		return null;
	}
	const r = raw as Record< string, unknown >;
	const u = ( r.user ?? {} ) as Record< string, unknown >;
	if (
		typeof r.token !== 'string' ||
		r.token === '' ||
		typeof r.expiresAt !== 'string' ||
		typeof u.id !== 'number'
	) {
		return null;
	}
	const strings = ( v: unknown ): string[] =>
		Array.isArray( v )
			? v.filter( ( x ): x is string => typeof x === 'string' )
			: [];
	const scope = Array.isArray( u.productScope )
		? u.productScope.filter( ( x ): x is number => typeof x === 'number' )
		: 'all';
	return {
		token: r.token,
		expiresAt: r.expiresAt,
		user: {
			id: u.id,
			name: typeof u.name === 'string' ? u.name : '',
			roles: strings( u.roles ),
			caps: strings( u.caps ),
			productScope: scope,
			avatar: typeof u.avatar === 'string' ? u.avatar : '',
		},
	};
}

/**
 * Whether a session has expired (an unreadable date counts as expired).
 *
 * @param s   Session.
 * @param now Current time (ms).
 */
export function viewAsExpired( s: ViewAsSession, now = Date.now() ): boolean {
	const at = Date.parse( s.expiresAt );
	return Number.isNaN( at ) || at <= now;
}

function readStored(): ViewAsSession | null {
	try {
		const raw = window.sessionStorage.getItem( STORAGE_KEY );
		if ( ! raw ) {
			return null;
		}
		const s = parseViewAs( JSON.parse( raw ) );
		if ( ! s || viewAsExpired( s ) ) {
			window.sessionStorage.removeItem( STORAGE_KEY );
			return null;
		}
		return s;
	} catch {
		return null;
	}
}

function writeStored( s: ViewAsSession | null ): void {
	try {
		if ( s ) {
			window.sessionStorage.setItem( STORAGE_KEY, JSON.stringify( s ) );
		} else {
			window.sessionStorage.removeItem( STORAGE_KEY );
		}
	} catch {
		// Storage blocked (private mode, policies): the preview still works until the page reloads.
	}
}

/** The active preview, or null. */
export const viewAsStore = createStore< ViewAsSession | null >(
	typeof window !== 'undefined' ? readStored() : null
);

/** The latest preview notice (write refused, preview ended by the server). */
export const viewAsNoticeStore = createStore< ViewAsNotice | null >( null );

/** The active preview, or null. */
export function getViewAs(): ViewAsSession | null {
	return viewAsStore.get();
}

/**
 * Start (a session) or end (null) the preview. Persists in sessionStorage.
 *
 * @param s Session or null.
 */
export function setViewAs( s: ViewAsSession | null ): void {
	writeStored( s );
	viewAsStore.set( s );
}

/**
 * Report a preview notice (called by the API client).
 *
 * @param kind Kind.
 */
export function notifyViewAs( kind: ViewAsNotice[ 'kind' ] ): void {
	viewAsNoticeStore.set( ( prev ) => ( {
		kind,
		seq: ( prev?.seq ?? 0 ) + 1,
	} ) );
}
