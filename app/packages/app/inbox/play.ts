/**
 * Next-up (Play) mode (INB-26), client side. The agent presses Play on a view: GET inbox/next opens the first
 * conversation of the view in its order. While Play is on, the conversation screen shows the Play bar (Skip, Stop).
 * Skip posts inbox/skip (optional reason) and opens the next one. After a reply is sent, the agent's preference
 * `layout.playAfterSend` decides: open the next conversation, go back to the list, or stay.
 * Roles in the setting `inbox.play_only_roles` work through Play only: the inbox shows the Play card instead of the list.
 */
import { api, createStore, getBoot } from '@cliedesk/data';
import { toast } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { getPrefs, savePrefs } from '../prefs';
import type { InboxItem, SortKey } from './api';

export type AfterSend = 'next' | 'list' | 'stay';
export const AFTER_SEND: AfterSend[] = [ 'next', 'list', 'stay' ];

export interface PlayState {
	/** View reference (system key, custom view id or queue:id). */
	view: string;
	viewName: string;
	sort: SortKey | null;
	/** Conversation Play opened last. */
	current: number | null;
}

export interface NextResponse {
	conversation: InboxItem | null;
	playOnly: boolean;
	afterSend: string;
}

export const playStore = createStore< PlayState | null >( null );

type Go = ( n: number | null, view: string ) => void;

/**
 * What happens after a send (agent preference, default "next").
 */
export function afterSendPref(): AfterSend {
	return getPrefs()?.layout.playAfterSend ?? 'next';
}

/**
 * Save what happens after a send.
 *
 * @param v Choice.
 */
export function setAfterSendPref( v: AfterSend ): void {
	savePrefs( { layout: { playAfterSend: v } } );
}

/**
 * Whether the current person's role works through Play only.
 */
export function isPlayOnly(): boolean {
	const boot = getBoot();
	const roles = boot.settings?.[ 'inbox.play_only_roles' ];
	const role = boot.user?.roleKey ?? '';
	return Array.isArray( roles ) && role !== '' && roles.includes( role );
}

/**
 * Open what the server returned, or end Play when the view has nothing left.
 *
 * @param state Play state.
 * @param r     Response.
 * @param go    Navigate to a conversation number (null: back to the view's list).
 */
function follow( state: PlayState, r: NextResponse, go: Go ): void {
	if ( r.conversation ) {
		playStore.set( { ...state, current: r.conversation.id } );
		go( r.conversation.number, state.view );
		return;
	}
	playStore.set( null );
	toast( {
		tone: 'success',
		title: __( 'Nothing left to play in this view.', 'cliedesk' ),
	} );
	go( null, state.view );
}

/**
 * Fetch the next conversation of a view.
 *
 * @param view    View.
 * @param sort    Sort.
 * @param current Conversation being left.
 */
export async function fetchNext(
	view: string,
	sort: SortKey | null,
	current: number | null
): Promise< NextResponse > {
	const r = await api.get< NextResponse >( 'inbox/next', {
		query: {
			view,
			...( sort ? { sort } : {} ),
			...( current ? { current } : {} ),
		},
	} );
	return r.data;
}

/**
 * Start Play on a view.
 *
 * @param state Play state without the current conversation.
 * @param go    Navigate.
 */
export async function startPlay(
	state: Omit< PlayState, 'current' >,
	go: Go
): Promise< void > {
	const r = await fetchNext( state.view, state.sort, null );
	follow( { ...state, current: null }, r, go );
}

/**
 * Skip the current conversation (optional reason) and open the next one.
 *
 * @param conversationId Conversation.
 * @param reason         Reason.
 * @param go             Navigate.
 */
export async function skipConversation(
	conversationId: number,
	reason: string,
	go: Go
): Promise< void > {
	const state = playStore.get();
	if ( ! state ) {
		return;
	}
	const r = await api.post< NextResponse >( 'inbox/skip', {
		body: {
			conversationId,
			view: state.view,
			...( reason.trim() ? { reason: reason.trim() } : {} ),
		},
	} );
	follow( state, r.data, go );
}

/**
 * After a reply was sent on a conversation: follow the agent's choice when Play is on for it.
 *
 * @param conversationId Conversation.
 * @param go             Navigate.
 */
export async function afterSend(
	conversationId: number,
	go: Go
): Promise< void > {
	const state = playStore.get();
	if ( ! state || state.current !== conversationId ) {
		return;
	}
	const choice = afterSendPref();
	if ( choice === 'stay' ) {
		return;
	}
	if ( choice === 'list' ) {
		playStore.set( null );
		go( null, state.view );
		return;
	}
	try {
		follow(
			state,
			await fetchNext( state.view, state.sort, conversationId ),
			go
		);
	} catch {
		toast( {
			tone: 'danger',
			title: __( 'Could not open the next conversation.', 'cliedesk' ),
		} );
	}
}

/** Stop Play. */
export function stopPlay(): void {
	playStore.set( null );
}
