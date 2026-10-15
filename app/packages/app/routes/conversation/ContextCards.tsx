/**
 * More context panel cards (INB-65, Free), loaded on their own (lazy chunk, each card its own query, so a slow card
 * never holds up the timeline): the AI summary (Pro slot), the web visit, side threads, the customer's other
 * conversations, recent activity (customer timeline) and the contact notepad.
 */
import { api, queryOptions, useQuery } from '@cliedesk/data';
import { Slot } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import {
	messagesQuery,
	type Conversation,
	type Message,
} from '../../inbox/api';
import { Muted, PanelSection } from '../../inbox/components';
import { fullTime, relativeTime } from '../../inbox/labels';
import { NotesCard } from '../../crm/Notes';
import { widgetContextOf } from './Attachments';
import { sideThreadOf } from './sideThreads';

interface ContactConversation {
	id: number;
	number: number;
	subject: string;
	status?: { label?: string } | null;
	updatedAt: string;
}

interface CustomerEvent {
	id: number;
	type: string;
	createdAt: string;
	data: Record< string, unknown > | null;
	conversation: { id: number; number?: number; subject?: string } | null;
}

const contactConversationsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'contact', id, 'conversations', 'recent' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: ContactConversation[] } >(
					`contacts/${ id }/conversations`,
					{ query: { limit: 6 }, signal }
				)
			).data?.items ?? [],
	} );

interface PageView {
	url: string;
	title: string;
	at: string;
}

/** CRM-20: pages the customer saw recently (refreshed while the card is shown). */
const pageViewsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'contact', id, 'page-views' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: PageView[] } >(
					`contacts/${ id }/page-views`,
					{ signal }
				)
			).data?.items ?? [],
		refetchInterval: 30000,
	} );

const activityQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'contact', id, 'timeline', 'recent' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: CustomerEvent[] } >(
					`contacts/${ id }/timeline`,
					{ query: { limit: 8 }, signal }
				)
			).data?.items ?? [],
	} );

/**
 * Words for a customer event type.
 *
 * @param type Event type.
 */
export function customerEventLabel( type: string ): string {
	const known: Record< string, string > = {
		'conversation.created': __( 'Started a conversation', 'cliedesk' ),
		'conversation.episode_started': __( 'Wrote again', 'cliedesk' ),
		'wp.registered': __( 'Registered on the site', 'cliedesk' ),
		'wp.login': __( 'Logged in', 'cliedesk' ),
	};
	if ( known[ type ] ) {
		return known[ type ];
	}
	return type.startsWith( 'custom.' ) ? type.slice( 7 ) : type;
}

/** The AI summary card: a Pro slot (staff see the PRO badge without Pro). */
export function SummaryCard() {
	return <Slot name="contact.ai_summary" className="py-2" />;
}

/**
 * The latest web visit of this conversation (widget page, device, browser, language).
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function VisitCard( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const q = useQuery( messagesQuery( c.id ) );
	const views = useQuery( pageViewsQuery( c.requesterId ) );
	const ctx = [ ...( q.data ?? [] ) ]
		.reverse()
		.map( ( m: Message ) => widgetContextOf( m ) )
		.find( Boolean );
	const pages = views.data ?? [];
	if ( ! ctx && ! pages.length ) {
		return null;
	}
	const devices: Record< string, string > = {
		mobile: __( 'Mobile', 'cliedesk' ),
		desktop: __( 'Desktop', 'cliedesk' ),
	};
	const facts = ctx
		? [
				devices[ ctx.device ?? '' ] ?? '',
				ctx.browser ?? '',
				ctx.language ?? '',
			].filter( Boolean )
		: [];
	return (
		<PanelSection
			id="cd-side-visit"
			title={ __( 'Web visit', 'cliedesk' ) }
		>
			{ ctx && ! pages.length && (
				<p className="truncate text-sm">
					<a
						href={ ctx.pageUrl }
						target="_blank"
						rel="noreferrer noopener"
						className="text-accent underline"
					>
						<bdi>{ ctx.pageTitle || ctx.pageUrl }</bdi>
					</a>
				</p>
			) }
			{ pages.length > 0 && (
				<ol className="flex flex-col gap-1 text-sm">
					{ pages.slice( 0, 6 ).map( ( p, i ) => (
						<li key={ `${ p.at }${ i }` } className="flex gap-2">
							<a
								href={ p.url }
								target="_blank"
								rel="noreferrer noopener"
								className={ `min-w-0 flex-1 truncate underline ${
									i === 0 ? 'font-medium text-accent' : ''
								}` }
							>
								<bdi>{ p.title || p.url }</bdi>
							</a>
							<time
								dateTime={ p.at }
								title={ fullTime( p.at ) }
								className="text-fg-muted"
							>
								{ relativeTime( p.at ) }
							</time>
						</li>
					) ) }
				</ol>
			) }
			{ facts.length > 0 && (
				<p className="text-sm text-fg-muted">{ facts.join( ' · ' ) }</p>
			) }
		</PanelSection>
	);
}

/**
 * Side threads of this conversation with their people.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function SideThreadsCard( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const q = useQuery( messagesQuery( c.id ) );
	const roots = ( q.data ?? [] ).filter(
		( m ) => m.kind === 'side_thread' && m.sideThreadId === m.id
	);
	if ( ! roots.length ) {
		return null;
	}
	return (
		<PanelSection
			id="cd-side-threads"
			title={ __( 'Side threads', 'cliedesk' ) }
		>
			<ul className="flex flex-col gap-1 text-sm">
				{ roots.map( ( m ) => {
					const t = sideThreadOf( m );
					const replies = ( q.data ?? [] ).filter(
						( x ) => x.sideThreadId === m.id
					).length;
					return (
						<li key={ m.id }>
							<a href={ `#m-${ m.id }` } className="underline">
								<bdi>
									{ t?.subject ||
										__( 'Side thread', 'cliedesk' ) }
								</bdi>
							</a>{ ' ' }
							<span className="text-fg-muted">
								{ sprintf(
									/* translators: 1: email addresses, 2: number of messages. */
									__( '%1$s · %2$d messages', 'cliedesk' ),
									t?.people.join( ', ' ) ?? '',
									replies
								) }
							</span>
						</li>
					);
				} ) }
			</ul>
		</PanelSection>
	);
}

/**
 * The customer's other conversations, newest first.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function HistoryCard( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const q = useQuery( contactConversationsQuery( c.requesterId ) );
	const others = ( q.data ?? [] )
		.filter( ( x ) => x.id !== c.id )
		.slice( 0, 5 );
	return (
		<PanelSection
			id="cd-side-history"
			title={ __( 'Other conversations', 'cliedesk' ) }
		>
			{ q.isError && (
				<Muted>
					{ __( 'Could not load conversations.', 'cliedesk' ) }
				</Muted>
			) }
			{ q.isSuccess && ! others.length && (
				<Muted>{ __( 'No other conversations.', 'cliedesk' ) }</Muted>
			) }
			{ others.length > 0 && (
				<ul className="flex flex-col gap-1 text-sm">
					{ others.map( ( x ) => (
						<li key={ x.id } className="flex items-center gap-2">
							<Link
								to="/c/$number"
								params={ { number: String( x.number ) } }
								className="min-w-0 flex-1 truncate underline"
							>
								<bdi>{ x.subject }</bdi>
							</Link>
							<span className="text-fg-muted">
								{ x.status?.label ?? '' }
							</span>
							<time
								dateTime={ x.updatedAt }
								title={ fullTime( x.updatedAt ) }
								className="text-fg-muted"
							>
								{ relativeTime( x.updatedAt ) }
							</time>
						</li>
					) ) }
				</ul>
			) }
		</PanelSection>
	);
}

/**
 * Recent customer activity (registered, logged in, conversations, custom and commerce events).
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function ActivityCard( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const q = useQuery( activityQuery( c.requesterId ) );
	return (
		<PanelSection
			id="cd-side-activity"
			title={ __( 'Recent activity', 'cliedesk' ) }
		>
			{ q.isError && (
				<Muted>
					{ __( 'Could not load the activity.', 'cliedesk' ) }
				</Muted>
			) }
			{ q.isSuccess && ! q.data.length && (
				<Muted>{ __( 'No activity yet.', 'cliedesk' ) }</Muted>
			) }
			{ !! q.data?.length && (
				<ul className="flex flex-col gap-1 text-sm">
					{ q.data.map( ( e ) => (
						<li key={ e.id } className="flex gap-2">
							<span className="min-w-0 flex-1 truncate">
								{ customerEventLabel( e.type ) }
								{ e.conversation?.subject
									? ` · ${ e.conversation.subject }`
									: '' }
							</span>
							<time
								dateTime={ e.createdAt }
								title={ fullTime( e.createdAt ) }
								className="text-fg-muted"
							>
								{ relativeTime( e.createdAt ) }
							</time>
						</li>
					) ) }
				</ul>
			) }
		</PanelSection>
	);
}

/**
 * The contact notepad (agent-only notes pinned to the customer, CRM-22).
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function NotepadCard( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	return (
		<div className="border-b border-line py-3">
			<NotesCard
				entity="contact"
				entityId={ c.requesterId }
				addLabel={ __( 'Save customer note', 'cliedesk' ) }
			/>
		</div>
	);
}

/** Cards by panel section key. */
export const CONTEXT_CARDS: Record<
	string,
	ComponentType< { conversation: Conversation } >
> = {
	summary: SummaryCard,
	visit: VisitCard,
	side_threads: SideThreadsCard,
	history: HistoryCard,
	activity: ActivityCard,
	notepad: NotepadCard,
};

/**
 * One context card by section key.
 *
 * @param props              Props.
 * @param props.name         Section key.
 * @param props.conversation Conversation.
 */
export default function ContextCard( {
	name,
	conversation,
}: {
	name: string;
	conversation: Conversation;
} ) {
	const Card = CONTEXT_CARDS[ name ];
	return Card ? <Card conversation={ conversation } /> : null;
}
