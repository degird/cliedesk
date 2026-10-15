/**
 * Presence (INB-59): who else is on a conversation and what they do (viewing, replying, writing a note).
 *
 * - `usePresence(id)` sends a heartbeat (POST conversations/{id}/presence) when the conversation opens, every 5 s
 *   and whenever the composer state changes, and `left` when it closes. Each beat returns the others and the
 *   history events by other people since the last beat ("Updated while you were typing").
 * - `useListPresence(ids)` reads presence for visible list rows (GET presence?ids[]=…, at most 100).
 * - The composer reports its state through `setComposerState` (replying / noting while typing, viewing when idle).
 */
import { api, createStore, useQuery, useQueryClient } from '@cliedesk/data';
import { cx } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { conversationKeys } from './api';
import { initials } from './components';

export type PresenceState = 'viewing' | 'replying' | 'noting';

export interface PresenceOther {
	userId: number;
	name: string;
	state: PresenceState;
	at: string;
}

export interface PresenceEvent {
	id: number;
	type: string;
	actorType?: number;
	actorName: string;
	at: string;
}

export interface PresenceBeat {
	others: PresenceOther[];
	events: PresenceEvent[];
	lastEventId: number;
	version: number;
}

export const HEARTBEAT_MS = 5000;
export const IDLE_MS = 10000;
export const MAX_SHOWN = 3;

/** Composer state per conversation id. */
export const composerStates = createStore< Record< number, PresenceState > >(
	{}
);

/**
 * Set what the composer of a conversation is doing.
 *
 * @param id    Conversation id.
 * @param state State.
 */
export function setComposerState( id: number, state: PresenceState ): void {
	composerStates.set( ( old ) =>
		old[ id ] === state ? old : { ...old, [ id ]: state }
	);
}

/**
 * Label of a presence state.
 *
 * @param s State.
 */
export function stateLabel( s: PresenceState ): string {
	switch ( s ) {
		case 'replying':
			return __( 'replying', 'cliedesk' );
		case 'noting':
			return __( 'writing a note', 'cliedesk' );
		default:
			return __( 'viewing', 'cliedesk' );
	}
}

/**
 * Sentence for one person ("Maria is replying").
 *
 * @param o Person.
 */
export function presenceSentence( o: PresenceOther ): string {
	const name = o.name || __( 'Someone', 'cliedesk' );
	switch ( o.state ) {
		case 'replying':
			/* translators: %s: person. */
			return sprintf( __( '%s is replying', 'cliedesk' ), name );
		case 'noting':
			/* translators: %s: person. */
			return sprintf( __( '%s is writing a note', 'cliedesk' ), name );
		default:
			/* translators: %s: person. */
			return sprintf( __( '%s is viewing', 'cliedesk' ), name );
	}
}

/**
 * Short label of a history event type ("status changed").
 *
 * @param type Event type.
 */
export function changeLabel( type: string ): string {
	switch ( type ) {
		case 'message.created':
		case 'conversation.message_added':
			return __( 'new message', 'cliedesk' );
		case 'conversation.note_added':
			return __( 'note added', 'cliedesk' );
		case 'conversation.status_changed':
			return __( 'status changed', 'cliedesk' );
		case 'conversation.priority_changed':
			return __( 'priority changed', 'cliedesk' );
		case 'conversation.assigned':
			return __( 'assignee changed', 'cliedesk' );
		case 'conversation.tags_changed':
			return __( 'tags changed', 'cliedesk' );
		case 'conversation.subject_changed':
			return __( 'subject changed', 'cliedesk' );
		case 'conversation.fields_changed':
			return __( 'fields changed', 'cliedesk' );
		case 'conversation.type_changed':
			return __( 'type changed', 'cliedesk' );
		case 'conversation.moved':
			return __( 'queue changed', 'cliedesk' );
		default:
			return ( type.split( '.' ).pop() ?? type ).replace( /_/g, ' ' );
	}
}

/**
 * "status changed by Ana" (or "… by the customer").
 *
 * @param e Event.
 */
export function describeChange( e: PresenceEvent ): string {
	if ( e.actorName ) {
		return sprintf(
			/* translators: 1: what changed, 2: person. */
			__( '%1$s by %2$s', 'cliedesk' ),
			changeLabel( e.type ),
			e.actorName
		);
	}
	if ( e.actorType === 1 ) {
		return sprintf(
			/* translators: %s: what changed. */
			__( '%s by the customer', 'cliedesk' ),
			changeLabel( e.type )
		);
	}
	return changeLabel( e.type );
}

/**
 * Heartbeat for an open conversation.
 *
 * @param id Conversation id.
 */
export function usePresence( id: number ) {
	const qc = useQueryClient();
	const [ others, setOthers ] = useState< PresenceOther[] >( [] );
	const [ changes, setChanges ] = useState< PresenceEvent[] >( [] );
	const since = useRef< number | null >( null );
	const stateRef = useRef< PresenceState >(
		composerStates.get()[ id ] ?? 'viewing'
	);

	const beat = useCallback(
		( state: PresenceState | 'left' ) =>
			api
				.post< PresenceBeat >( `conversations/${ id }/presence`, {
					body: {
						state,
						sinceEventId: since.current ?? undefined,
					},
				} )
				.then( ( r ) => {
					if ( state === 'left' || ! r.data ) {
						return;
					}
					setOthers( r.data.others ?? [] );
					const first = since.current === null;
					since.current = Math.max(
						since.current ?? 0,
						Number( r.data.lastEventId ) || 0
					);
					const events = first ? [] : ( r.data.events ?? [] );
					if ( ! events.length ) {
						return;
					}
					if ( stateRef.current === 'viewing' ) {
						// Not composing: the screen just refreshes.
						void qc.invalidateQueries( {
							queryKey: conversationKeys.all( id ),
						} );
						return;
					}
					setChanges( ( old ) => [
						...old,
						...events.filter(
							( e ) => ! old.some( ( x ) => x.id === e.id )
						),
					] );
				} )
				.catch( () => {} ),
		[ id, qc ]
	);

	useEffect( () => {
		since.current = null;
		void beat( stateRef.current );
		const t = window.setInterval(
			() => void beat( stateRef.current ),
			HEARTBEAT_MS
		);
		const unsubscribe = composerStates.subscribe( () => {
			const next = composerStates.get()[ id ] ?? 'viewing';
			if ( next !== stateRef.current ) {
				stateRef.current = next;
				void beat( next );
			}
		} );
		return () => {
			window.clearInterval( t );
			unsubscribe();
			void beat( 'left' );
		};
	}, [ id, beat ] );

	const refresh = useCallback( () => {
		setChanges( [] );
		void qc.invalidateQueries( { queryKey: conversationKeys.all( id ) } );
	}, [ id, qc ] );

	return { others, changes, refresh };
}

/**
 * Presence of list rows (GET presence?ids[]=…), refreshed every 10 s.
 *
 * @param ids Conversation ids (the first 100 are asked for).
 */
export function useListPresence( ids: number[] ) {
	const list = ids.slice( 0, 100 );
	const q = useQuery( {
		queryKey: [ 'presence', 'list', list.join( ',' ) ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					items: Record< string, PresenceOther[] >;
				} >( 'presence', { query: { ids: list }, signal } )
			).data?.items ?? {},
		enabled: list.length > 0,
		refetchInterval: 10000,
		retry: false,
	} );
	return q.data ?? {};
}

const RING: Record< PresenceState, string > = {
	viewing: 'ring-line-strong',
	replying: 'ring-danger',
	noting: 'ring-warning',
};

function Face( { o, size }: { o: PresenceOther; size: number } ) {
	return (
		<span
			aria-hidden="true"
			style={ { width: size, height: size } }
			className={ cx(
				'flex shrink-0 items-center justify-center rounded-full bg-sunken text-[0.625rem] font-semibold text-fg ring-2',
				RING[ o.state ] ?? RING.viewing
			) }
		>
			{ initials( o.name || '?' ) }
		</span>
	);
}

/**
 * Who else is on the conversation: up to 3 people (initials with a coloured ring and a text label) and "+N".
 *
 * @param props        Props.
 * @param props.others People.
 */
export function PresenceStack( { others }: { others: PresenceOther[] } ) {
	if ( ! others.length ) {
		return null;
	}
	const shown = others.slice( 0, MAX_SHOWN );
	const extra = others.length - shown.length;
	return (
		<ul
			aria-label={ __( 'Also on this conversation', 'cliedesk' ) }
			className="flex flex-wrap items-center gap-2"
		>
			{ shown.map( ( o ) => (
				<li
					key={ o.userId }
					className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 ps-0.5 pe-2 text-sm"
				>
					<Face o={ o } size={ 22 } />
					<span>{ presenceSentence( o ) }</span>
				</li>
			) ) }
			{ extra > 0 && (
				<li className="text-sm text-fg-muted">
					<span aria-hidden="true">{ `+${ extra }` }</span>
					<span className="sr-only">
						{ sprintf(
							/* translators: %d: number of other people. */
							_n(
								'and %d more person',
								'and %d more people',
								extra,
								'cliedesk'
							),
							extra
						) }
					</span>
				</li>
			) }
		</ul>
	);
}

/**
 * Small presence marker for a list row: up to 3 faces, "+N" and a short text.
 *
 * @param props        Props.
 * @param props.others People.
 */
export function PresenceDots( { others }: { others: PresenceOther[] } ) {
	if ( ! others.length ) {
		return null;
	}
	const shown = others.slice( 0, MAX_SHOWN );
	const extra = others.length - shown.length;
	const busy = others.find( ( o ) => o.state !== 'viewing' );
	const text = busy
		? presenceSentence( busy )
		: sprintf(
				/* translators: %d: number of people viewing. */
				_n( '%d viewing', '%d viewing', others.length, 'cliedesk' ),
				others.length
			);
	return (
		<span className="inline-flex items-center gap-1 text-xs text-fg-muted">
			<span className="inline-flex -space-x-1">
				{ shown.map( ( o ) => (
					<Face key={ o.userId } o={ o } size={ 16 } />
				) ) }
			</span>
			{ extra > 0 && <span aria-hidden="true">{ `+${ extra }` }</span> }
			<span>{ text }</span>
		</span>
	);
}
