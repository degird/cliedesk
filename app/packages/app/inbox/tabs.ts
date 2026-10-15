/**
 * Conversation tabs (INB-12): the conversations an agent keeps open as tabs (newest last, at most TABS_MAX, kept in
 * this browser), and the list the agent last worked from (view and sort) for the related list next to a
 * conversation. No React here: the inbox and the conversation screen both use it.
 */

export const TABS_MAX = 10;

const TABS_KEY = 'cliedesk:tabs';
const LIST_KEY = 'cliedesk:tabs:list';

type Listener = () => void;
const listeners = new Set< Listener >();
let tabs: number[] | null = null;

function read(): number[] {
	try {
		const v = JSON.parse( window.localStorage.getItem( TABS_KEY ) ?? '[]' );
		return Array.isArray( v )
			? v
					.map( Number )
					.filter( ( n ) => Number.isInteger( n ) && n > 0 )
					.slice( -TABS_MAX )
			: [];
	} catch {
		return [];
	}
}

function write( next: number[] ): void {
	tabs = next;
	try {
		window.localStorage.setItem( TABS_KEY, JSON.stringify( next ) );
	} catch {
		// Storage blocked: tabs last for this page only.
	}
	listeners.forEach( ( l ) => l() );
}

/** The open tabs (conversation numbers). */
export function getTabs(): number[] {
	tabs ??= read();
	return tabs;
}

/**
 * Listen for changes.
 *
 * @param l Listener.
 */
export function subscribeTabs( l: Listener ): () => void {
	listeners.add( l );
	return () => void listeners.delete( l );
}

/**
 * Open a conversation as a tab (kept in place when already open; the oldest goes when there are too many).
 *
 * @param n Conversation number.
 */
export function openTab( n: number ): void {
	const cur = getTabs();
	if ( cur.includes( n ) ) {
		return;
	}
	write( [ ...cur, n ].slice( -TABS_MAX ) );
}

/**
 * Close a tab.
 *
 * @param n Conversation number.
 */
export function closeTab( n: number ): void {
	write( getTabs().filter( ( x ) => x !== n ) );
}

export interface CurrentList {
	view: string;
	sort: string | null;
	name: string;
}

/**
 * Remember the list the agent works from (the inbox calls this).
 *
 * @param list View, sort and name.
 */
export function setCurrentList( list: CurrentList ): void {
	try {
		window.sessionStorage.setItem( LIST_KEY, JSON.stringify( list ) );
	} catch {
		// Storage blocked: no related list.
	}
}

/** The list the agent last worked from, or null. */
export function currentList(): CurrentList | null {
	try {
		const v = JSON.parse(
			window.sessionStorage.getItem( LIST_KEY ) ?? 'null'
		);
		return v && typeof v.view === 'string' ? ( v as CurrentList ) : null;
	} catch {
		return null;
	}
}
