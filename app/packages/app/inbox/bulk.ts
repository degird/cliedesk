/**
 * Conversation bulk actions (INB-72): selection, operations and the start call (POST conversations/bulk).
 *
 * The selection is either explicit ids (`conversationIds`, at most 1,000) or "every conversation matching the
 * current view and search" (`view` + `q`). Trash may answer 409 `cliedesk_confirm_required` while the workspace
 * asks for confirmation: the caller confirms and sends it again with `confirm: true`. The job comes back in the
 * bulk job format (crm/listApi BulkJob); above 5,000 items it carries a `warning`.
 */
import { api, isApiError } from '@cliedesk/data';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { BulkJob } from '../crm/listApi';

export const MAX_BULK_IDS = 1000;

export type ConversationBulkOp =
	| 'assign'
	| 'status'
	| 'priority'
	| 'tag_add'
	| 'tag_remove'
	| 'read'
	| 'unread'
	| 'trash'
	| 'spam'
	| 'not_spam'
	| 'reply'
	| 'note'
	| 'macro';

/** Selected conversations, or every conversation of a view (and search). */
export type ConversationSelection =
	| { kind: 'ids'; ids: number[] }
	| {
			kind: 'all';
			view: string;
			q: string;
			/** Number of matching conversations, when known (GET inbox?total=true). */
			total?: number | null;
	  };

/**
 * Request fields of a selection.
 *
 * @param s Selection.
 */
export function conversationSelectionBody(
	s: ConversationSelection
): Record< string, unknown > {
	if ( s.kind === 'ids' ) {
		return { conversationIds: s.ids.slice( 0, MAX_BULK_IDS ) };
	}
	return {
		view: s.view,
		...( s.q.trim() ? { q: s.q.trim() } : {} ),
	};
}

/**
 * "3 conversations selected" / "All 240 conversations in this view" (or without the count while it is unknown).
 *
 * @param s Selection.
 */
export function conversationSelectionText( s: ConversationSelection ): string {
	if ( s.kind === 'all' ) {
		if ( typeof s.total === 'number' ) {
			return s.q.trim()
				? sprintf(
						/* translators: %d: number of conversations. */
						_n(
							'The %d conversation matching this search',
							'All %d conversations matching this search',
							s.total,
							'cliedesk'
						),
						s.total
					)
				: sprintf(
						/* translators: %d: number of conversations. */
						_n(
							'The %d conversation in this view',
							'All %d conversations in this view',
							s.total,
							'cliedesk'
						),
						s.total
					);
		}
		return s.q.trim()
			? __( 'All conversations matching this search', 'cliedesk' )
			: __( 'All conversations in this view', 'cliedesk' );
	}
	return sprintf(
		/* translators: %d: number of conversations. */
		_n(
			'%d conversation selected',
			'%d conversations selected',
			s.ids.length,
			'cliedesk'
		),
		s.ids.length
	);
}

/**
 * Name of an operation.
 *
 * @param op Operation.
 */
export function conversationOpName( op: string ): string {
	switch ( op ) {
		case 'assign':
			return __( 'Assign', 'cliedesk' );
		case 'status':
			return __( 'Change status', 'cliedesk' );
		case 'priority':
			return __( 'Change priority', 'cliedesk' );
		case 'tag_add':
			return __( 'Add tags', 'cliedesk' );
		case 'tag_remove':
			return __( 'Remove tags', 'cliedesk' );
		case 'read':
			return __( 'Mark as read', 'cliedesk' );
		case 'unread':
			return __( 'Mark as unread', 'cliedesk' );
		case 'trash':
			return __( 'Move to Trash', 'cliedesk' );
		case 'spam':
			return __( 'Spam', 'cliedesk' );
		case 'not_spam':
			return __( 'Not spam', 'cliedesk' );
		case 'reply':
			return __( 'Reply to each', 'cliedesk' );
		case 'note':
			return __( 'Add a note to each', 'cliedesk' );
		case 'macro':
			return __( 'Apply saved reply', 'cliedesk' );
	}
	return op;
}

/** Thrown when the server wants the bulk trash confirmed first. */
export class ConfirmRequired extends Error {
	constructor( message: string ) {
		super( message );
		this.name = 'ConfirmRequired';
	}
}

/**
 * Whether an error asks for confirmation (409 cliedesk_confirm_required).
 *
 * @param e Error.
 */
export const isConfirmRequired = ( e: unknown ): boolean =>
	e instanceof ConfirmRequired ||
	( isApiError( e ) &&
		e.status === 409 &&
		e.code === 'cliedesk_confirm_required' );

/**
 * Start a conversation bulk job.
 *
 * @param selection Selection.
 * @param body      Operation fields ({op, …}).
 */
export async function startConversationBulk(
	selection: ConversationSelection,
	body: Record< string, unknown >
): Promise< BulkJob > {
	try {
		const r = await api.post< BulkJob >( 'conversations/bulk', {
			body: { ...conversationSelectionBody( selection ), ...body },
		} );
		return r.data;
	} catch ( e ) {
		if ( isConfirmRequired( e ) ) {
			throw new ConfirmRequired(
				isApiError( e ) && e.message
					? e.message
					: __(
							'Confirm to move these conversations to Trash.',
							'cliedesk'
						)
			);
		}
		throw e;
	}
}

/**
 * Label of a conversation in the skipped-items report (the report has ids, not numbers).
 *
 * @param id Conversation id.
 */
export const conversationItemLabel = ( id: number ): string =>
	sprintf(
		/* translators: %d: conversation id (not its number). */
		__( 'Conversation ID %d', 'cliedesk' ),
		id
	);

/** Queries a finished conversation bulk job refreshes. */
export const CONVERSATION_JOB_INVALIDATE = [
	[ 'inbox' ],
	[ 'conversation' ],
] as const;
