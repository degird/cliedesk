/**
 * Keyboard shortcut helpers.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Whether a key event comes from a text input or an open dialog / menu (shortcuts must not fire then).
 *
 * @param e Event.
 */
export function isTyping( e: KeyboardEvent | ReactKeyboardEvent ): boolean {
	const t = e.target as HTMLElement | null;
	if ( ! t || typeof t.closest !== 'function' ) {
		return false;
	}
	return (
		!! t.closest( 'input, textarea, select, [contenteditable="true"]' ) ||
		!! t.closest( '[role="dialog"], [role="alertdialog"], [role="menu"]' )
	);
}

/** Window event: a held reply went back to the reply draft ({conversationId, html}). */
export const RESTORE_EVENT = 'cliedesk:draft-restored';
