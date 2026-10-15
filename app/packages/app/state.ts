/**
 * Small app-wide state (useSyncExternalStore stores; no Zustand).
 */
import { createStore, getBoot, type Store } from '@cliedesk/data';

let safeMode: Store< boolean > | null = null;

/** Safe-mode flag: starts from boot, cleared after "Confirm production". */
export function safeModeStore(): Store< boolean > {
	if ( ! safeMode ) {
		safeMode = createStore( getBoot().safeMode );
	}
	return safeMode;
}

/**
 * Tests only.
 *
 * @param value Value.
 */
export function resetSafeModeStore( value?: boolean ): void {
	safeMode = value === undefined ? null : createStore( value );
}

/** The conversation open on screen (full page or inbox pane), for the command palette's actions. */
export const openConversationStore = createStore< {
	id: number;
	number: number;
} | null >( null );

/** Command palette and shortcut sheet visibility (opened by Ctrl/⌘-K, "?" or the top-bar button). */
export const overlayStore = createStore<
	'palette' | 'shortcuts' | 'help' | null
>( null );
