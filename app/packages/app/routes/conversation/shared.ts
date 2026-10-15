/**
 * Conversation screen helpers: one mutation hook for the header actions (If-Match with the conversation's version,
 * cache update from the response, inbox refresh).
 */
import {
	api,
	useMutation,
	useQueryClient,
	type QueryClient,
} from '@cliedesk/data';
import {
	conversationKeys,
	inboxKeys,
	normaliseConversation,
	type Conversation,
} from '../../inbox/api';
import { versionTag } from '../../workspace/api';
import { createContext, useContext } from 'react';

export interface PaneInfo {
	/** Shown next to the inbox list (INB-02) instead of as its own page. */
	inPane: boolean;
	/** Close the pane. */
	onClose?: () => void;
	/** Open the previous (-1) or next (1) conversation of the list next to the pane. */
	onStep?: ( delta: 1 | -1 ) => void;
}

/** Whether the conversation is shown in the inbox's conversation pane. */
export const PaneContext = createContext< PaneInfo >( { inPane: false } );

export const usePane = (): PaneInfo => useContext( PaneContext );

export interface ConversationActionInput {
	/** Path below `conversations/{id}/`, e.g. `status`. */
	path: string;
	body: Record< string, unknown >;
	/** Send If-Match with the version the screen shows. */
	versioned?: boolean;
}

export type ConversationActionResult = Partial< Conversation > & {
	missingRequired?: string[];
	statusMapped?: boolean;
};

/** The newest version our own writes got back, per query client and conversation. */
const savedVersions = new WeakMap< QueryClient, Map< number, number > >();

/** The last write per conversation; the next one starts when it is done. */
const lastWrite = new Map< number, Promise< unknown > >();

/**
 * The version to send as If-Match: the newest of the cached detail and what our own last write returned (a refetch
 * that started before that write cannot make it older).
 *
 * @param qc       Query client.
 * @param id       Conversation id.
 * @param fallback Version on screen.
 */
export function currentVersion(
	qc: QueryClient,
	id: number,
	fallback: number
): number {
	return Math.max(
		qc.getQueryData< Conversation >( conversationKeys.detail( id ) )
			?.version ?? fallback,
		savedVersions.get( qc )?.get( id ) ?? 0
	);
}

/**
 * Run conversation writes one after another: a second quick change (assign, then status) waits for the first and
 * sends the version the first one returned, so the agent's own change is never "someone else's".
 *
 * @param id    Conversation id.
 * @param write The write; reads the version when it starts.
 */
export function inOrder< T >(
	id: number,
	write: () => Promise< T >
): Promise< T > {
	const next = ( lastWrite.get( id ) ?? Promise.resolve() ).then( write );
	const done = next.then(
		() => undefined,
		() => undefined
	);
	lastWrite.set( id, done );
	void done.then( () => {
		if ( lastWrite.get( id ) === done ) {
			lastWrite.delete( id );
		}
	} );
	return next;
}

/**
 * Merge a write response into the cached detail (some responses omit tags, participants or episodes).
 *
 * @param qc   Query client.
 * @param id   Conversation id.
 * @param next Response data.
 */
export function mergeDetail(
	qc: QueryClient,
	id: number,
	next: Partial< Conversation >
): void {
	if ( typeof next.version === 'number' ) {
		const known = savedVersions.get( qc ) ?? new Map< number, number >();
		known.set( id, Math.max( known.get( id ) ?? 0, next.version ) );
		savedVersions.set( qc, known );
	}
	qc.setQueryData< Conversation >( conversationKeys.detail( id ), ( old ) =>
		old
			? normaliseConversation( {
					...old,
					...next,
					tags: next.tags ?? old.tags,
					participants: next.participants ?? old.participants,
					episodes: next.episodes ?? old.episodes,
				} )
			: old
	);
}

/**
 * Refresh what a conversation change affects: its events and the inbox lists and counts.
 *
 * @param qc Query client.
 * @param id Conversation id.
 */
export function afterChange( qc: QueryClient, id: number ): void {
	void qc.invalidateQueries( { queryKey: conversationKeys.events( id ) } );
	void qc.invalidateQueries( { queryKey: inboxKeys.all } );
}

/**
 * Mutation for `POST conversations/{id}/{path}`.
 *
 * @param conversation Conversation (current version).
 */
export function useConversationAction( conversation: Conversation ) {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: ( input: ConversationActionInput ) =>
			inOrder( conversation.id, async () => {
				const r = await api.post< ConversationActionResult >(
					`conversations/${ conversation.id }/${ input.path }`,
					{
						body: input.body,
						// The newest version this screen knows (our own replies and tag changes bump it too).
						ifMatch: input.versioned
							? versionTag(
									currentVersion(
										qc,
										conversation.id,
										conversation.version
									)
								)
							: undefined,
					}
				);
				// Before the next queued write reads the version.
				if ( r.data && typeof r.data.version === 'number' ) {
					mergeDetail( qc, conversation.id, r.data );
				}
				return r;
			} ),
		onSuccess: ( r ) => {
			if ( r.data && typeof r.data.version === 'number' ) {
				mergeDetail( qc, conversation.id, r.data );
			} else {
				void qc.invalidateQueries( {
					queryKey: conversationKeys.detail( conversation.id ),
				} );
			}
			afterChange( qc, conversation.id );
		},
	} );
}

/** Composer toolbar trigger for menus and popovers (same look and size as an IconButton). */
export const TOOL_BUTTON =
	'inline-flex size-(--cd-control-h) shrink-0 items-center justify-center rounded-md text-fg-muted outline-none data-[hovered]:bg-sunken data-[hovered]:text-fg data-[pressed]:bg-selected data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus';
