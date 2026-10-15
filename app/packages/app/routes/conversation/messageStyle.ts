/**
 * Thread styling by message type (INB-36): customer (no border), agent reply (grey), AI reply (purple), internal
 * note (yellow), side thread (blue), scheduled (green), draft (dashed), failed (red), forward and system notices.
 * Colour is never the only signal: every type also shows its label. In the thread, the customer writes on the start
 * side, the team (replies, notes, side threads, drafts) on the end side, system notices across.
 */
import { __ } from '@wordpress/i18n';
import type { Message } from '../../inbox/api';

export type MessageStyle =
	| 'customer'
	| 'agent'
	| 'ai'
	| 'note'
	| 'side'
	| 'scheduled'
	| 'draft'
	| 'failed'
	| 'forward'
	| 'system';

/**
 * Style of a message: its delivery state first (failed, scheduled, draft), then its kind.
 *
 * @param m Message.
 */
export function messageStyle(
	m: Pick< Message, 'kind' | 'status' | 'direction' >
): MessageStyle {
	if ( m.status === 'failed' || m.status === 'bounced' ) {
		return 'failed';
	}
	if ( m.status === 'scheduled' || m.status === 'pending_undo' ) {
		return 'scheduled';
	}
	if ( m.status === 'ai_draft' || m.status === 'held' ) {
		return 'draft';
	}
	switch ( m.kind ) {
		case 'note':
			return 'note';
		case 'side_thread':
			return 'side';
		case 'ai_reply':
			return 'ai';
		case 'forward':
			return 'forward';
		case 'system_notice':
			return 'system';
		case 'customer':
			return 'customer';
		case 'call':
		case 'voice_note':
			return m.direction === 'inbound' ? 'customer' : 'agent';
		default:
			return 'agent';
	}
}

/** Classes of a style (theme tokens, so light and dark both pass contrast). */
export const STYLE_CLASSES: Record< MessageStyle, string > = {
	customer: 'border-line bg-sunken',
	agent: 'border-accent-subtle bg-accent-subtle',
	ai: 'border-pro border-s-4 bg-surface',
	note: 'border-warning-line bg-warning-subtle',
	side: 'border-info-line bg-info-subtle',
	scheduled: 'border-success-line bg-success-subtle',
	draft: 'border-dashed border-line-strong bg-surface',
	failed: 'border-danger-line bg-danger-subtle',
	forward: 'border-dashed border-line-strong bg-sunken',
	system: 'border-line bg-canvas',
};

/** Side of the thread a style sits on. */
export function styleSide( s: MessageStyle ): 'start' | 'end' | 'full' {
	if ( s === 'customer' ) {
		return 'start';
	}
	return s === 'system' ? 'full' : 'end';
}

/**
 * Text label of a style.
 *
 * @param s Style.
 */
export function styleLabel( s: MessageStyle ): string {
	switch ( s ) {
		case 'customer':
			return __( 'Customer', 'cliedesk' );
		case 'agent':
			return __( 'Reply', 'cliedesk' );
		case 'ai':
			return __( 'AI reply', 'cliedesk' );
		case 'note':
			return __( 'Internal note', 'cliedesk' );
		case 'side':
			return __( 'Side thread', 'cliedesk' );
		case 'scheduled':
			return __( 'Scheduled', 'cliedesk' );
		case 'draft':
			return __( 'Draft', 'cliedesk' );
		case 'failed':
			return __( 'Not delivered', 'cliedesk' );
		case 'forward':
			return __( 'Forwarded', 'cliedesk' );
		default:
			return __( 'System', 'cliedesk' );
	}
}
