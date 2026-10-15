/**
 * Inbox layout (INB-02, INB-03): split (list and conversation side by side on wide screens), list or table, the
 * width of the list next to the conversation pane, and whether the views sidebar is hidden. Kept per user on the
 * server (prefs.layout, PATCH me/prefs, see prefs.ts), so it follows the agent to other devices.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getPrefs, prefsStore, savePrefs } from '../prefs';

export type ListMode = 'split' | 'list' | 'table';

export interface InboxLayout {
	mode: ListMode;
	/** List width in px when the conversation pane is open. */
	listWidth: number;
	sidebarCollapsed: boolean;
}

export const LIST_MIN = 320;
export const LIST_MAX = 560;
export const LIST_DEFAULT = 420;
export const RESIZE_STEP = 16;
/** Wide screens show the list and the conversation side by side. */
export const WIDE_QUERY = '(min-width: 1280px)';

/**
 * Clamp a list width.
 *
 * @param w Width.
 */
export function clampWidth( w: number ): number {
	if ( ! Number.isFinite( w ) ) {
		return LIST_DEFAULT;
	}
	return Math.min( LIST_MAX, Math.max( LIST_MIN, Math.round( w ) ) );
}

/**
 * The layout from the preferences.
 */
export function loadLayout(): InboxLayout {
	const l = getPrefs().layout;
	const mode = ( [ 'split', 'list', 'table' ] as const ).includes(
		l.inboxMode as ListMode
	)
		? ( l.inboxMode as ListMode )
		: 'split';
	return {
		mode,
		listWidth: clampWidth( Number( l.paneWidth ) ),
		sidebarCollapsed: l.sidebarHidden === true,
	};
}

/**
 * The layout and a function to change part of it (applied at once, saved to the server shortly after).
 */
export function useInboxLayout(): [
	InboxLayout,
	( patch: Partial< InboxLayout > ) => void,
] {
	const store = prefsStore();
	useSyncExternalStore( store.subscribe, store.get, store.get );
	const layout = loadLayout();
	const update = useCallback( ( patch: Partial< InboxLayout > ) => {
		savePrefs( {
			layout: {
				...( patch.mode ? { inboxMode: patch.mode } : {} ),
				...( patch.listWidth !== undefined
					? { paneWidth: clampWidth( patch.listWidth ) }
					: {} ),
				...( patch.sidebarCollapsed !== undefined
					? { sidebarHidden: patch.sidebarCollapsed }
					: {} ),
			},
		} );
	}, [] );
	return [ layout, update ];
}

/**
 * Whether a media query matches (false without matchMedia).
 *
 * @param query Query.
 */
export function useMediaQuery( query: string ): boolean {
	const get = () =>
		typeof window.matchMedia === 'function' &&
		window.matchMedia( query ).matches;
	const [ matches, setMatches ] = useState( get );
	useEffect( () => {
		if ( typeof window.matchMedia !== 'function' ) {
			return undefined;
		}
		const mq = window.matchMedia( query );
		const on = () => setMatches( mq.matches );
		on();
		mq.addEventListener?.( 'change', on );
		return () => mq.removeEventListener?.( 'change', on );
	}, [ query ] );
	return matches;
}
