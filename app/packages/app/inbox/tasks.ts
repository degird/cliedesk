/**
 * Internal tasks (CNV-04) and trackers (CNV-05): calls and types.
 *
 * - POST conversations/{id}/tasks {subject, html, assigneeId, dueAt}: a task linked child-of the conversation.
 * - POST trackers {productId, subject, html, conversationIds}: a tracker with conversations linked part-of it.
 * - GET trackers/{id}/items: linked conversations with openIds / doneIds.
 * - POST trackers/{id}/items {conversationIds}: add conversations to an existing tracker (422
 *   `cliedesk_not_a_tracker` when the target is not a tracker).
 * - A conversation's `type.key` tells tasks and trackers apart.
 * - Resolving a tracker cascades through POST conversations/bulk on the open items (status, reply or note).
 *
 * Keys: ['conversation', id, 'tracker-items'] (refreshed with the conversation by the change feed).
 */
import { api, queryOptions } from '@cliedesk/data';
import type { Conversation, ConversationLink } from './api';

export const TASK_TYPE = 'task';
export const TRACKER_TYPE = 'tracker';

export interface TrackerItems {
	items: ConversationLink[];
	openIds: number[];
	doneIds: number[];
}

export const trackerItemsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'conversation', id, 'tracker-items' ] as const,
		queryFn: async ( { signal } ): Promise< TrackerItems > => {
			const d = (
				await api.get< TrackerItems >( `trackers/${ id }/items`, {
					signal,
				} )
			).data;
			return {
				items: Array.isArray( d?.items ) ? d.items : [],
				openIds: Array.isArray( d?.openIds ) ? d.openIds : [],
				doneIds: Array.isArray( d?.doneIds ) ? d.doneIds : [],
			};
		},
	} );

export interface TaskInput {
	subject: string;
	html?: string;
	assigneeId?: number | null;
	/** `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`. */
	dueAt?: string;
}

/**
 * Spin off an internal task from a conversation.
 *
 * @param conversationId Conversation.
 * @param input          Task.
 */
export async function createTask(
	conversationId: number,
	input: TaskInput
): Promise< Conversation & { parentId: number } > {
	return (
		await api.post< Conversation & { parentId: number } >(
			`conversations/${ conversationId }/tasks`,
			{ body: { ...input } }
		)
	).data;
}

export interface TrackerInput {
	productId: number;
	subject: string;
	html?: string;
	conversationIds?: number[];
}

/**
 * Create a tracker and link conversations to it.
 *
 * @param input Tracker.
 */
export async function createTracker(
	input: TrackerInput
): Promise< Conversation & Partial< TrackerItems > > {
	return (
		await api.post< Conversation & Partial< TrackerItems > >( 'trackers', {
			body: { ...input },
		} )
	).data;
}

/**
 * Whether a conversation is a tracker (from its type key).
 *
 * @param c Conversation.
 */
export const isTracker = ( c: Pick< Conversation, 'type' > ): boolean =>
	c.type?.key === TRACKER_TYPE;

/**
 * Whether a conversation is an internal task (from its type key).
 *
 * @param c Conversation.
 */
export const isTask = ( c: Pick< Conversation, 'type' > ): boolean =>
	c.type?.key === TASK_TYPE;

/**
 * Add conversations to an existing tracker (POST trackers/{id}/items; 422 `cliedesk_not_a_tracker` when it is not
 * a tracker).
 *
 * @param trackerId       Tracker id.
 * @param conversationIds Conversations to add (at most 500).
 */
export async function addTrackerItems(
	trackerId: number,
	conversationIds: number[]
): Promise< TrackerItems > {
	const d = (
		await api.post< TrackerItems >( `trackers/${ trackerId }/items`, {
			body: { conversationIds: conversationIds.slice( 0, 500 ) },
		} )
	).data;
	return {
		items: Array.isArray( d?.items ) ? d.items : [],
		openIds: Array.isArray( d?.openIds ) ? d.openIds : [],
		doneIds: Array.isArray( d?.doneIds ) ? d.doneIds : [],
	};
}

/**
 * Add conversations to an existing tracker found by its number.
 *
 * @param trackerNumber   Tracker number.
 * @param conversationIds Conversations to add.
 * @return The tracker id.
 */
export async function addToTrackerNumber(
	trackerNumber: number,
	conversationIds: number[]
): Promise< number > {
	const tracker = (
		await api.get< { id: number; number: number } >(
			`conversations/number/${ trackerNumber }`
		)
	).data;
	await addTrackerItems( tracker.id, conversationIds );
	return tracker.id;
}
