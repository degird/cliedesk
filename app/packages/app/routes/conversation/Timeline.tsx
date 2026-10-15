/**
 * Conversation timeline (CNV-08, CNV-20): messages and history events in time order. Internal notes are marked
 * in text and visually distinct; message bodies go through the allow-list renderer (inbox/html.tsx).
 *
 * Replies to one message (INB-46) show the quoted excerpt above them, and every public message offers "Reply to
 * this". Sent replies list their CC and BCC (INB-47). Forwards (kind `forward`, internal) read "Forwarded to …";
 * public messages can be forwarded on their own (INB-47, INB-48).
 *
 * A sent reply offers "Save as saved reply" (MAC-12, opens the editor pre-filled), and a note about macro actions
 * that failed offers "Retry failed actions" (MAC-14).
 */
import {
	api,
	can,
	getBoot,
	hasModule,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	IconButton,
	LoadingRegion,
	Slot,
	announce,
	cx,
	toast,
} from '@cliedesk/ui';
import { useRouter } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { ArrowDownUp, Link2, Reply } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { prefsStore, savePrefs, type Prefs } from '../../prefs';
import { useShortcut } from '../../shortcuts';
import {
	AUTHOR_CONTACT,
	AUTHOR_USER,
	eventsQuery,
	messagesQuery,
	statusesQuery,
	type Message,
	type TimelineEvent,
} from '../../inbox/api';
import {
	ActionError,
	Avatar,
	Pill,
	QueryFailed,
	actionMessage,
	useAgents,
} from '../../inbox/components';
import { RESTORE_EVENT } from '../../inbox/keys';
import { announceResult } from '../../workspace/forms';
import { RichText } from '../../inbox/html';
import { decorateEntities } from './Entities';

import { useOrderNoteEvents } from './orderNotes';
import { describeRouted } from '../../inbox/routedLabel';
import {
	actorName,
	describeEvent,
	fullTime,
	relativeTime,
} from '../../inbox/labels';
import { parseUtc } from '../../workspace/api';
import { copyText, messageHref } from '../../links';
import { FailedButtons, HeldButtons, heldReason } from './Held';
import { ContactCardTip } from './ContactCardTip';
import { EditedMarker, NoteTools, isNote } from './Notes';
import {
	STYLE_CLASSES,
	styleSide,
	messageStyle,
	styleLabel,
	type MessageStyle,
} from './messageStyle';

/** Pill tone per message style (INB-36). */
const STYLE_TONES: Partial<
	Record<
		MessageStyle,
		'neutral' | 'accent' | 'success' | 'warning' | 'danger'
	>
> = {
	side: 'accent',
	scheduled: 'success',
	draft: 'warning',
};
import { Attachments, PageContext } from './Attachments';
import { MessageMenu, RedactedMarker } from './Redact';
import { EditReplyDialog, canEditReply, lastEditable } from './EditReply';
import { conversationEmailKit } from './sideThreads';
import {
	excerptOf,
	forwardOf,
	forwardStore,
	forwardSummary,
	recipientsOf,
	replyTo,
	replyToOf,
	editReplyStore,
} from './compose';

/** Statuses of public messages that went out or came in (others cannot be quoted or forwarded). */
const DELIVERED = [ 'received', 'queued', 'sent', 'delivered', 'read' ];

/**
 * Whether a public message can be replied to or forwarded on its own.
 *
 * @param m Message.
 */
export function canQuote( m: Message ): boolean {
	return (
		m.visibility === 'public' &&
		! m.deletedAt &&
		( DELIVERED.includes( m.status ) || ! m.status )
	);
}

/**
 * Scroll to a message of the timeline and focus it.
 *
 * @param id Message id.
 */
function jumpTo( id: number ) {
	const el = document.getElementById( `m-${ id }` );
	el?.scrollIntoView?.( { block: 'center' } );
	el?.focus( { preventScroll: true } );
}

/**
 * CHN-22: the buttons and cards a reply offered, or the option a customer chose.
 *
 * @param props      Props.
 * @param props.meta Message meta.
 */
function RichParts( { meta }: { meta: Message[ 'meta' ] } ) {
	const rich = meta?.rich as
		| { options?: string[]; cards?: { title: string; url: string }[] }
		| undefined;
	const choice = ( meta?.choice as { label?: string } | undefined )?.label;
	if ( choice ) {
		return (
			<p className="text-sm text-fg-muted">
				{ sprintf(
					/* translators: %s: option label. */
					__( 'Chose: %s', 'cliedesk' ),
					choice
				) }
			</p>
		);
	}
	if ( ! rich?.options?.length && ! rich?.cards?.length ) {
		return null;
	}
	return (
		<ul
			aria-label={ __( 'Buttons and cards', 'cliedesk' ) }
			className="flex flex-wrap gap-2 text-sm"
		>
			{ ( rich.options ?? [] ).map( ( o, i ) => (
				<li
					key={ o }
					className="rounded-full border border-line-strong px-2"
				>
					{ `${ i + 1 }. ${ o }` }
				</li>
			) ) }
			{ ( rich.cards ?? [] ).map( ( c ) => (
				<li key={ c.url }>
					<a href={ c.url } target="_blank" rel="noreferrer">
						{ c.title }
					</a>
				</li>
			) ) }
		</ul>
	);
}

/**
 * The quoted message above a reply (meta.replyTo).
 *
 * @param props        Props.
 * @param props.quote  Quote.
 * @param props.author Author name of the quoted message.
 * @param props.found  The quoted message is in this timeline.
 */
function Quote( {
	quote,
	author,
	found,
}: {
	quote: NonNullable< ReturnType< typeof replyToOf > >;
	author: string;
	found: boolean;
} ) {
	return (
		<figure className="flex flex-col gap-1 border-s-4 border-line-strong ps-3 text-sm">
			<figcaption className="text-fg-muted">
				{ sprintf(
					/* translators: %s: author of the quoted message. */
					__( 'In reply to %s', 'cliedesk' ),
					author
				) }
			</figcaption>
			<blockquote className="text-fg-muted italic">
				<bdi>{ quote.excerpt || '…' }</bdi>
			</blockquote>
			{ found && (
				<Button
					variant="link"
					size="sm"
					className="self-start"
					onPress={ () => jumpTo( quote.id ) }
				>
					{ __( 'Show the original message', 'cliedesk' ) }
				</Button>
			) }
		</figure>
	);
}

/** How long a deep-linked message stays highlighted. */
export const HIGHLIGHT_MS = 2000;

export type TimelineEntry =
	| { kind: 'message'; at: number; id: number; message: Message }
	| { kind: 'event'; at: number; id: number; event: TimelineEvent };

/**
 * Messages and timeline events in one list, oldest first (events marked `timeline: false`, such as
 * "message created", are left out: the message itself is shown).
 *
 * @param messages Messages.
 * @param events   Events.
 */
export function mergeTimeline(
	messages: Message[],
	events: TimelineEvent[]
): TimelineEntry[] {
	const time = ( s: string ) => parseUtc( s )?.getTime() ?? 0;
	const out: TimelineEntry[] = [
		...messages.map( ( m ) => ( {
			kind: 'message' as const,
			at: time( m.createdAt ),
			id: m.id,
			message: m,
		} ) ),
		...events
			.filter( ( e ) => e.timeline !== false )
			.map( ( e ) => ( {
				kind: 'event' as const,
				at: time( e.createdAt ),
				id: e.id,
				event: e,
			} ) ),
	];
	const order = ( a: TimelineEntry, b: TimelineEntry ) => {
		if ( a.kind === b.kind ) {
			return a.id - b.id;
		}
		return a.kind === 'event' ? -1 : 1;
	};
	// Events sort before messages at the same instant (e.g. "started" before the first message).
	return out.sort( ( a, b ) => a.at - b.at || order( a, b ) );
}

export interface TimelineShow {
	messages: boolean;
	notes: boolean;
	events: boolean;
}

/**
 * The entries to show (INB-35): by type, oldest first or newest first.
 *
 * @param entries     Merged entries, oldest first.
 * @param show        Types to show.
 * @param newestFirst Newest first.
 */
export function filterTimeline(
	entries: TimelineEntry[],
	show: TimelineShow,
	newestFirst: boolean
): TimelineEntry[] {
	const kept = entries.filter( ( e ) => {
		if ( e.kind === 'event' ) {
			return show.events;
		}
		return isNote( e.message ) ? show.notes : show.messages;
	} );
	return newestFirst ? kept.reverse() : kept;
}

/**
 * Status and actions of a held reply (undo window or scheduled): "Send now" and "Back to draft" for its author.
 *
 * @param props         Props.
 * @param props.message Message.
 */
function HeldStatus( { message: m }: { message: Message } ) {
	const qc = useQueryClient();
	const act = useMutation( {
		mutationFn: ( path: 'send' | 'undo' ) =>
			api.post< { draft?: { html: string } | null } >(
				`messages/${ m.id }/${ path }`
			),
		onSuccess: ( r, path ) => {
			void qc.invalidateQueries( { queryKey: [ 'conversation' ] } );
			if ( path === 'undo' ) {
				window.dispatchEvent(
					new CustomEvent( RESTORE_EVENT, {
						detail: {
							conversationId:
								Number( m.meta?.conversationId ?? 0 ) ||
								currentConversation( qc, m ),
							html: r.data?.draft?.html ?? m.html ?? '',
						},
					} )
				);
				announceResult(
					__( 'The reply is back in the composer.', 'cliedesk' )
				);
			} else {
				announceResult( __( 'Reply sent.', 'cliedesk' ) );
			}
		},
	} );
	if ( m.status !== 'pending_undo' && m.status !== 'scheduled' ) {
		return null;
	}
	const sendAt = typeof m.meta?.sendAt === 'string' ? m.meta.sendAt : null;
	const mine =
		m.authorType === AUTHOR_USER && m.authorId === getBoot().user?.id;
	return (
		<>
			<Pill tone="accent">
				{ m.status === 'scheduled'
					? sprintf(
							/* translators: %s: date and time. */
							__( 'Scheduled for %s', 'cliedesk' ),
							sendAt ? fullTime( sendAt ) : '…'
						)
					: __( 'Sending soon', 'cliedesk' ) }
			</Pill>
			{ mine && (
				<>
					<Button
						size="sm"
						variant="ghost"
						isLoading={ act.isPending && act.variables === 'send' }
						onPress={ () => act.mutate( 'send' ) }
					>
						{ __( 'Send now', 'cliedesk' ) }
					</Button>
					<Button
						size="sm"
						variant="ghost"
						isLoading={ act.isPending && act.variables === 'undo' }
						onPress={ () => act.mutate( 'undo' ) }
					>
						{ __( 'Back to draft', 'cliedesk' ) }
					</Button>
				</>
			) }
			{ act.error ? (
				<span role="alert" className="text-sm text-danger">
					{ actionMessage( act.error ) }
				</span>
			) : null }
		</>
	);
}

function currentConversation(
	qc: ReturnType< typeof useQueryClient >,
	m: Message
): number {
	for ( const q of qc
		.getQueryCache()
		.findAll( { queryKey: [ 'conversation' ] } ) ) {
		const data = q.state.data as Message[] | undefined;
		if (
			q.queryKey[ 2 ] === 'messages' &&
			Array.isArray( data ) &&
			data.some( ( x ) => x.id === m.id )
		) {
			return Number( q.queryKey[ 1 ] );
		}
	}
	return 0;
}

function mineOf( m: Message ): boolean {
	return m.authorType === AUTHOR_USER && m.authorId === getBoot().user?.id;
}

/**
 * A note recording macro actions that did not run (MAC-14: meta.macroFailure, status failed).
 *
 * @param m Message.
 */
export const isMacroFailure = ( m: Message ): boolean =>
	m.status === 'failed' &&
	!! m.meta &&
	typeof m.meta.macroFailure === 'object' &&
	m.meta.macroFailure !== null;

/**
 * "Save as saved reply" (MAC-12): a reply an agent sent, for people who may create saved replies.
 *
 * @param m Message.
 */
function canSaveAsReply( m: Message ): boolean {
	return (
		m.authorType === AUTHOR_USER &&
		m.visibility === 'public' &&
		m.kind !== 'forward' &&
		DELIVERED.includes( m.status ) &&
		hasModule( 'macros' ) &&
		can( 'cliedesk_use_saved_replies' ) &&
		// Any scope the person may create in (macros/api canCreateReplies, kept out of this chunk).
		[
			'cliedesk_create_saved_replies',
			'cliedesk_manage_team_replies',
			'cliedesk_manage_shared_replies',
		].some( ( cap ) => can( cap ) )
	);
}

/**
 * Retry for macro actions that failed (MAC-14): POST messages/{id}/macro-retry re-runs only the failed ones.
 *
 * @param props                Props.
 * @param props.message        Failure note.
 * @param props.conversationId Conversation id.
 */
function MacroRetry( {
	message: m,
	conversationId,
}: {
	message: Message;
	conversationId: number;
} ) {
	const qc = useQueryClient();
	const retry = useMutation( {
		mutationFn: () =>
			api.post< { ran: number; failed: unknown[] } >(
				`messages/${ m.id }/macro-retry`
			),
		onSuccess: ( r ) => {
			const left = Array.isArray( r.data?.failed )
				? r.data.failed.length
				: 0;
			// The note leaves Needs attention and the actions may change the conversation.
			void qc.invalidateQueries( {
				queryKey: [ 'conversation', conversationId ],
			} );
			void qc.invalidateQueries( { queryKey: [ 'inbox' ] } );
			const text = left
				? sprintf(
						/* translators: %d: number of actions that failed again. */
						_n(
							'%d action failed again.',
							'%d actions failed again.',
							left,
							'cliedesk'
						),
						left
					)
				: __( 'The failed actions ran.', 'cliedesk' );
			toast( { tone: left ? 'warning' : 'success', title: text } );
			announce( text );
		},
	} );
	return (
		<div className="flex flex-col gap-2 rounded-md border border-danger-line bg-danger-subtle px-3 py-2">
			<p className="text-sm font-medium">
				{ __(
					'Some actions of a saved reply did not run. Retry runs only those again.',
					'cliedesk'
				) }
			</p>
			<ActionError
				error={ retry.error }
				onDismiss={ () => retry.reset() }
			/>
			<Button
				size="sm"
				className="self-start"
				isLoading={ retry.isPending }
				onPress={ () => retry.mutate() }
			>
				{ __( 'Retry failed actions', 'cliedesk' ) }
			</Button>
		</div>
	);
}

/**
 * Reason and Send anyway / Edit / Discard for a reply of mine that is held, failed or bounced (INB-17).
 *
 * @param props                Props.
 * @param props.message        Message.
 * @param props.conversationId Conversation id.
 */
function NeedsAttention( {
	message: m,
	conversationId,
}: {
	message: Message;
	conversationId: number;
} ) {
	const failed = m.status === 'failed' || m.status === 'bounced';
	if ( m.status !== 'held' && ! failed ) {
		return null;
	}
	if ( isMacroFailure( m ) ) {
		return <MacroRetry message={ m } conversationId={ conversationId } />;
	}
	const mine = mineOf( m );
	return (
		<div
			className={ cx(
				'flex flex-col gap-2 rounded-md border px-3 py-2',
				failed
					? 'border-danger-line bg-danger-subtle'
					: 'border-warning-line bg-warning-subtle'
			) }
		>
			<p className="text-sm font-medium">{ heldReason( m ) }</p>
			{ mine && m.status === 'held' && (
				<HeldButtons message={ m } conversationId={ conversationId } />
			) }
			{ mine && failed && (
				<div className="flex flex-wrap gap-2">
					<FailedButtons
						message={ m }
						conversationId={ conversationId }
					/>
					<Button
						size="sm"
						onPress={ () => {
							window.dispatchEvent(
								new CustomEvent( RESTORE_EVENT, {
									detail: {
										conversationId,
										html: m.html ?? '',
									},
								} )
							);
							announceResult(
								__(
									'The text is in the composer. Fix it and send it again.',
									'cliedesk'
								)
							);
						} }
					>
						{ __( 'Edit and resend', 'cliedesk' ) }
					</Button>
				</div>
			) }
		</div>
	);
}

/**
 * The reply's signature (meta.signature), collapsed (INB-53).
 *
 * @param props      Props.
 * @param props.id   Message id.
 * @param props.html Signature HTML.
 */
function SignatureToggle( { id, html }: { id: number; html: string } ) {
	const [ open, setOpen ] = useState( false );
	const region = `cd-msg-signature-${ id }`;
	return (
		<div className="flex flex-col gap-1">
			<Button
				variant="link"
				size="sm"
				className="self-start"
				aria-expanded={ open }
				aria-controls={ region }
				onPress={ () => setOpen( ( x ) => ! x ) }
			>
				{ open
					? __( 'Hide signature', 'cliedesk' )
					: __( 'Show signature', 'cliedesk' ) }
			</Button>
			<div
				id={ region }
				hidden={ ! open }
				className="border-t border-line pt-2 text-sm"
			>
				{ open && <RichText html={ html } text="" /> }
			</div>
		</div>
	);
}

/**
 * Replies to notes (INB-56) are shown under their note instead of in the timeline.
 *
 * @param messages Messages.
 * @return Top-level messages and the replies of each note.
 */
export function threadNotes( messages: Message[] ): {
	top: Message[];
	replies: Map< number, Message[] >;
} {
	const notes = new Set( messages.filter( isNote ).map( ( m ) => m.id ) );
	const replies = new Map< number, Message[] >();
	const top: Message[] = [];
	for ( const m of messages ) {
		const parent = m.parentId ?? null;
		if ( isNote( m ) && parent !== null && notes.has( parent ) ) {
			replies.set( parent, [ ...( replies.get( parent ) ?? [] ), m ] );
		} else {
			top.push( m );
		}
	}
	return { top, replies };
}

function MessageItem( {
	message: m,
	author,
	number,
	conversationId,
	highlighted,
	replies = [],
	authorOf,
	actor,
	known,
	isReply = false,
}: {
	message: Message;
	author: string;
	number: number;
	conversationId: number;
	highlighted: boolean;
	replies?: Message[];
	authorOf?: ( m: Message ) => string;
	/** Name of an author by type and id (quotes). */
	actor?: ( type: number, id: number | null ) => string;
	/** Ids of the messages in this timeline. */
	known?: Set< number >;
	isReply?: boolean;
} ) {
	const router = useRouter();
	const forward = forwardOf( m );
	const note =
		m.visibility === 'internal' && ! forward && m.kind !== 'side_thread';
	const style = messageStyle( m );
	const quote = replyToOf( m );
	const copies = recipientsOf( m );
	const actions = canQuote( m ) && can( 'cliedesk_reply_conversations' );
	const signature =
		typeof m.meta?.signature === 'string' && m.meta.signature.trim()
			? m.meta.signature
			: null;
	let ariaLabel: string = note
		? sprintf(
				/* translators: 1: author, 2: date and time. */
				__( 'Internal note by %1$s, %2$s', 'cliedesk' ),
				author,
				fullTime( m.createdAt )
			)
		: sprintf(
				/* translators: 1: author, 2: date and time. */
				__( 'Message from %1$s, %2$s', 'cliedesk' ),
				author,
				fullTime( m.createdAt )
			);
	if ( forward ) {
		ariaLabel = sprintf(
			/* translators: 1: author, 2: date and time. */
			__( 'Forward by %1$s, %2$s', 'cliedesk' ),
			author,
			fullTime( m.createdAt )
		);
	}
	const copy = async () => {
		const url = messageHref( router, number, m.id );
		if ( await copyText( url ) ) {
			toast( {
				tone: 'success',
				title: __( 'Link copied.', 'cliedesk' ),
			} );
		} else {
			toast( {
				tone: 'warning',
				title: __( 'Copy this link:', 'cliedesk' ),
				description: url,
				timeout: null,
			} );
		}
	};
	const side = isReply ? 'full' : styleSide( style );
	return (
		<li
			className={ cx(
				'flex',
				side === 'start' && 'pe-[12%]',
				side === 'end' && 'justify-end ps-[12%]'
			) }
		>
			<article
				id={ `m-${ m.id }` }
				tabIndex={ -1 }
				aria-label={ ariaLabel }
				aria-current={ highlighted ? 'true' : undefined }
				data-style={ style }
				className={ cx(
					'flex min-w-0 scroll-mt-20 flex-col gap-1.5 rounded-xl border px-3 py-2 outline-none focus-visible:outline-2 focus-visible:outline-focus',
					side === 'full' ? 'w-full' : 'max-w-full',
					side === 'start' && 'rounded-ss-sm',
					side === 'end' && 'rounded-se-sm',
					STYLE_CLASSES[ style ],
					highlighted &&
						'ring-4 ring-accent motion-safe:transition-shadow'
				) }
			>
				<header className="flex flex-wrap items-center gap-2">
					<Avatar name={ author } size={ 24 } />
					{ m.authorType === AUTHOR_CONTACT && m.authorId ? (
						<ContactCardTip id={ m.authorId } name={ author } />
					) : (
						<span className="font-semibold">
							<bdi>{ author }</bdi>
						</span>
					) }
					{ /* INB-36: every type also has a text label (notes, forwards and failures have their own below). */ }
					{ ! [ 'note', 'forward', 'failed' ].includes( style ) && (
						<Pill
							tone={ STYLE_TONES[ style ] }
							className={
								style === 'ai'
									? 'border-pro text-pro-fg'
									: undefined
							}
						>
							{ styleLabel( style ) }
						</Pill>
					) }
					{ note && (
						<Pill tone="warning">
							{ isReply
								? __( 'Reply to note', 'cliedesk' )
								: __( 'Internal note', 'cliedesk' ) }
						</Pill>
					) }
					{ forward && (
						<Pill tone="accent">
							{ __( 'Forwarded', 'cliedesk' ) }
						</Pill>
					) }
					{ isNote( m ) && <EditedMarker message={ m } /> }
					<HeldStatus message={ m } />
					<RedactedMarker message={ m } />
					{ m.status === 'held' && (
						<Pill tone="warning">
							{ __( 'On hold', 'cliedesk' ) }
						</Pill>
					) }
					{ m.status === 'failed' || m.status === 'bounced' ? (
						<Pill tone="danger">
							{ isMacroFailure( m )
								? __( 'Actions failed', 'cliedesk' )
								: __( 'Not delivered', 'cliedesk' ) }
						</Pill>
					) : null }
					<time
						dateTime={ m.createdAt }
						title={ fullTime( m.createdAt ) }
						className="ms-auto text-sm text-fg-muted"
					>
						{ relativeTime( m.createdAt ) }
					</time>
					{ actions && (
						<IconButton
							size="sm"
							label={ __( 'Reply to this message', 'cliedesk' ) }
							icon={ <Reply size={ 14 } /> }
							onPress={ () =>
								replyTo( conversationId, {
									id: m.id,
									excerpt: excerptOf( m ),
									author,
								} )
							}
						/>
					) }
					<IconButton
						size="sm"
						label={ __( 'Copy link to this message', 'cliedesk' ) }
						icon={ <Link2 size={ 14 } /> }
						onPress={ () => void copy() }
					/>
					<MessageMenu
						message={ m }
						conversationId={ conversationId }
						articleId={ `m-${ m.id }` }
						onSaveReply={
							canSaveAsReply( m )
								? () =>
										void router.navigate( {
											to: '/automation/replies/$replyId',
											params: { replyId: 'new' },
											search: {
												conversation: conversationId,
												number,
												message: m.id,
											},
										} as never )
								: undefined
						}
						onEdit={
							canEditReply( m )
								? () =>
										editReplyStore.set( {
											conversationId,
											messageId: m.id,
										} )
								: undefined
						}
						onForward={
							actions
								? () =>
										forwardStore.set( {
											conversationId,
											messageId: m.id,
										} )
								: undefined
						}
					/>
				</header>
				<Slot
					name="message.side_thread"
					fillProps={ {
						message: m,
						conversationId,
						kit: conversationEmailKit,
					} }
				/>
				{ copies && (
					<p className="text-sm text-fg-muted">
						{ copies.cc.length > 0 &&
							sprintf(
								/* translators: %s: email addresses. */
								__( 'Cc: %s', 'cliedesk' ),
								copies.cc.join( ', ' )
							) }
						{ copies.cc.length > 0 &&
							copies.bcc.length > 0 &&
							' · ' }
						{ copies.bcc.length > 0 &&
							sprintf(
								/* translators: %s: email addresses. */
								__( 'Bcc: %s', 'cliedesk' ),
								copies.bcc.join( ', ' )
							) }
					</p>
				) }
				{ quote && (
					<Quote
						quote={ quote }
						author={
							actor?.( quote.authorType, quote.authorId ) ?? ''
						}
						found={ !! known?.has( quote.id ) }
					/>
				) }
				{ forward && (
					<p className="text-sm font-medium">
						{ forwardSummary( forward ) }
						{ forward.count > 0 && (
							<span className="block font-normal text-fg-muted">
								{ sprintf(
									/* translators: %d: number of messages. */
									_n(
										'%d message forwarded. The customer does not see this.',
										'%d messages forwarded. The customer does not see this.',
										forward.count,
										'cliedesk'
									),
									forward.count
								) }
							</span>
						) }
					</p>
				) }
				<NeedsAttention
					message={ m }
					conversationId={ conversationId }
				/>
				{ /* CHN-41, CHN-44 (Pro): sender checks and forwards of incoming email. */ }
				<Slot
					name="message.email.notices"
					fillProps={ { message: m, kit: conversationEmailKit } }
				/>
				{ isNote( m ) ? (
					<NoteTools
						message={ m }
						conversationId={ conversationId }
						canReply={ ! isReply }
						body={
							<RichText
								html={ m.html }
								text={ m.text }
								decorate={ decorateEntities }
							/>
						}
					/>
				) : (
					<RichText
						html={ m.html }
						text={ m.text }
						decorate={ decorateEntities }
					/>
				) }
				<Attachments message={ m } />
				{ /* CHN-45 (Pro): quoted text and "View original" of incoming email. */ }
				<Slot
					name="message.email.source"
					fillProps={ { message: m, kit: conversationEmailKit } }
				/>
				<PageContext message={ m } />
				{ signature && (
					<SignatureToggle id={ m.id } html={ signature } />
				) }
				<RichParts meta={ m.meta } />
				{ replies.length > 0 && (
					<ol
						aria-label={ __( 'Replies to this note', 'cliedesk' ) }
						className="flex flex-col gap-2 border-s-2 border-warning-line ps-3"
					>
						{ replies.map( ( r ) => (
							<MessageItem
								key={ r.id }
								message={ r }
								author={ authorOf?.( r ) ?? '' }
								number={ number }
								conversationId={ conversationId }
								highlighted={ false }
								isReply
							/>
						) ) }
					</ol>
				) }
			</article>
		</li>
	);
}

/**
 * Scroll to a deep-linked message and highlight it for 2 s (INB-04).
 *
 * @param highlightId Message id from the link.
 * @param ready       Messages loaded.
 * @param found       The message is in this conversation.
 */
function useHighlight(
	highlightId: number | null,
	ready: boolean,
	found: boolean
): number | null {
	const [ active, setActive ] = useState< number | null >( null );
	const done = useRef< number | null >( null );
	useEffect( () => {
		if ( ! highlightId || ! ready || done.current === highlightId ) {
			return undefined;
		}
		done.current = highlightId;
		if ( ! found ) {
			announce(
				__(
					'The linked message is not in this conversation.',
					'cliedesk'
				)
			);
			return undefined;
		}
		setActive( highlightId );
		// After the route's own focus move (page heading), so the message keeps the focus and the scroll.
		const t = window.setTimeout( () => {
			const el = document.getElementById( `m-${ highlightId }` );
			const reduce =
				typeof window.matchMedia === 'function' &&
				window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
			el?.scrollIntoView?.( {
				block: 'center',
				behavior: reduce ? 'auto' : 'smooth',
			} );
			el?.focus( { preventScroll: true } );
		}, 150 );
		const off = window.setTimeout( () => setActive( null ), HIGHLIGHT_MS );
		return () => {
			window.clearTimeout( t );
			window.clearTimeout( off );
		};
	}, [ highlightId, ready, found ] );
	return active;
}

/**
 * Timeline of one conversation.
 *
 * @param props               Props.
 * @param props.id            Conversation id.
 * @param props.number        Conversation number (message links).
 * @param props.requesterName Requester display name.
 * @param props.highlightId   Deep-linked message to scroll to and highlight.
 */
export function Timeline( {
	id,
	number,
	requesterName,
	highlightId = null,
}: {
	id: number;
	number: number;
	requesterName: string;
	highlightId?: number | null;
} ) {
	const messages = useQuery( messagesQuery( id ) );
	const events = useQuery( eventsQuery( id ) );
	// COM-13: the linked orders' WooCommerce notes, read live.
	const orderNotes = useOrderNoteEvents( id );
	const statuses = useQuery( statusesQuery() );
	const { nameFor } = useAgents();
	const highlighted = useHighlight(
		highlightId,
		!! messages.data,
		!! messages.data?.some( ( m ) => m.id === highlightId )
	);
	// INB-35: type filters (⌘E / Ctrl+E toggles events) and my newest-first preference.
	const [ show, setShow ] = useState< TimelineShow >( {
		messages: true,
		notes: true,
		events: true,
	} );
	const store = prefsStore();
	const prefs = useSyncExternalStore(
		store.subscribe,
		store.get,
		store.get
	) as Prefs | null;
	const newestFirst = !! prefs?.layout.timelineNewestFirst;
	// INB-41: the reply being edited (from its menu or ↑ in the composer).
	const editing = useSyncExternalStore(
		editReplyStore.subscribe,
		editReplyStore.get,
		editReplyStore.get
	);
	useShortcut( {
		id: 'timeline-events',
		keys: 'mod+e',
		label: __( 'Show or hide events in the timeline', 'cliedesk' ),
		group: __( 'Conversation', 'cliedesk' ),
		run: ( e ) => {
			e.preventDefault();
			setShow( ( v ) => ( { ...v, events: ! v.events } ) );
		},
	} );
	if ( messages.isPending ) {
		return (
			<LoadingRegion label={ __( 'Loading messages…', 'cliedesk' ) } />
		);
	}
	if ( messages.isError ) {
		return (
			<QueryFailed
				title={ __( 'Could not load the messages', 'cliedesk' ) }
				error={ messages.error }
				onRetry={ () => void messages.refetch() }
			/>
		);
	}
	const threads = threadNotes( messages.data );
	const entries = filterTimeline(
		mergeTimeline( threads.top, [
			...( events.data ?? [] ),
			...orderNotes,
		] ),
		show,
		newestFirst
	);
	const authorOf = ( msg: Message ) =>
		actorName( msg.authorType, msg.authorId, nameFor, requesterName );
	const actor = ( type: number, authorId: number | null ) =>
		actorName( type, authorId, nameFor, requesterName );
	const known = new Set( messages.data.map( ( m ) => m.id ) );
	let edited: Message | null = null;
	if ( editing?.conversationId === id ) {
		edited =
			editing.messageId === 'last'
				? lastEditable( messages.data )
				: ( messages.data.find( ( m ) => m.id === editing.messageId ) ??
					null );
	}
	return (
		<section
			aria-labelledby="cd-timeline"
			// One chat surface: the filters, then the thread.
			className="flex flex-1 flex-col gap-3 rounded-lg border border-line bg-surface p-3"
		>
			{ edited && (
				<EditReplyDialog
					message={ edited }
					conversationId={ id }
					onClose={ () => editReplyStore.set( null ) }
				/>
			) }
			<h2 id="cd-timeline" className="sr-only">
				{ __( 'Messages and history', 'cliedesk' ) }
			</h2>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<div
					role="group"
					aria-label={ __( 'Show in the timeline', 'cliedesk' ) }
					className="inline-flex overflow-hidden rounded-md border border-line"
				>
					{ (
						[
							[ 'messages', __( 'Messages', 'cliedesk' ) ],
							[ 'notes', __( 'Notes', 'cliedesk' ) ],
							[ 'events', __( 'Events', 'cliedesk' ) ],
						] as const
					 ).map( ( [ key, label ] ) => (
						<button
							key={ key }
							type="button"
							aria-pressed={ show[ key ] }
							onClick={ () =>
								setShow( { ...show, [ key ]: ! show[ key ] } )
							}
							className="border-e border-line px-2.5 py-0.5 text-fg-muted outline-none last:border-e-0 hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus aria-pressed:bg-accent-subtle aria-pressed:font-medium aria-pressed:text-accent-fg"
						>
							{ label }
						</button>
					) ) }
				</div>
				<button
					type="button"
					aria-pressed={ newestFirst }
					onClick={ () =>
						savePrefs( {
							layout: { timelineNewestFirst: ! newestFirst },
						} )
					}
					className="ms-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-fg-muted outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus aria-pressed:text-accent-fg"
				>
					<ArrowDownUp aria-hidden="true" size={ 14 } />
					{ __( 'Newest first', 'cliedesk' ) }
				</button>
			</div>
			{ entries.length === 0 ? (
				<p className="text-fg-muted">
					{ __( 'No messages yet.', 'cliedesk' ) }
				</p>
			) : (
				<ol className="flex flex-col gap-2">
					{ entries.map( ( e ) =>
						e.kind === 'message' ? (
							<MessageItem
								key={ `m${ e.id }` }
								message={ e.message }
								number={ number }
								conversationId={ id }
								highlighted={ highlighted === e.id }
								replies={ threads.replies.get( e.id ) }
								authorOf={ authorOf }
								actor={ actor }
								known={ known }
								author={ authorOf( e.message ) }
							/>
						) : (
							<li
								key={ `e${ e.id }` }
								className="flex flex-wrap items-center justify-center gap-2 text-center text-sm text-fg-muted"
							>
								<span>
									{ e.event.type === 'conversation.routed'
										? describeRouted(
												e.event.data ?? {},
												nameFor
											)
										: describeEvent(
												e.event,
												actorName(
													e.event.actorType,
													e.event.actorId,
													nameFor,
													requesterName
												),
												statuses.data
											) }
								</span>
								<time
									dateTime={ e.event.createdAt }
									title={ fullTime( e.event.createdAt ) }
								>
									{ relativeTime( e.event.createdAt ) }
								</time>
							</li>
						)
					) }
				</ol>
			) }
			{ events.isError && (
				<p className="text-sm text-fg-muted">
					{ __(
						'The history of this conversation could not be loaded.',
						'cliedesk'
					) }
				</p>
			) }
		</section>
	);
}
