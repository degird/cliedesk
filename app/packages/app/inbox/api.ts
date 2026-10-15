/**
 * Inbox, conversations, contacts, tags and fields (INB, CNV, CRM): types, query keys and query options for the
 * /dash inbox, conversation and contact screens.
 *
 * Keys: ['inbox', 'views', …], ['inbox', 'list', view, sort], ['conversation', id, part], ['conversation-number', n],
 * ['contacts', 'list', q, state], ['contact', id, part], ['statuses'], ['types'], ['tags', 'list'],
 * ['fields', scope], ['team', 'agents', 'lookup']. The change feed invalidates ['inbox'], ['conversation', id] and
 * ['contact', id] (core.ts).
 */
import {
	api,
	can,
	keepPreviousData,
	queryOptions,
	type ApiResult,
} from '@cliedesk/data';
import type { VocabEntry } from './conditions';
import { prefsStore } from '../prefs';

export type Priority = 'none' | 'low' | 'normal' | 'high' | 'urgent';
export const PRIORITIES: Priority[] = [
	'none',
	'low',
	'normal',
	'high',
	'urgent',
];

export type Lane = 'needs_work' | 'waiting' | 'resolved' | 'closed';
export const LANES: Lane[] = [ 'needs_work', 'waiting', 'resolved', 'closed' ];

export type SortKey =
	'priority' | 'waiting' | 'later' | 'updated' | 'created' | 'oldest';
/**
 * A list sort: built in, a custom field (`field:<key>` ascending, `field:<key>:desc`, INB-03), or one a module adds
 * (the server's view vocabulary lists it, e.g. Pro's `sla`).
 */
export type ListSort =
	SortKey | `field:${ string }` | ( string & Record< never, never > );

export const SORTS: SortKey[] = [
	'priority',
	'waiting',
	'later',
	'updated',
	'created',
	'oldest',
];

export const CHANNELS = [
	'widget',
	'email',
	'form',
	'portal',
	'api',
	'whatsapp',
	'messenger',
	'instagram',
	'sms',
	'telegram',
	'voice',
	'review',
	'social_comment',
	'slack',
	'discord',
	'teams',
	'x',
	'custom',
	'internal',
	'forum',
] as const;

export interface StatusRef {
	id?: number;
	key: string;
	category: string;
	label: string;
}

/** Why a conversation is in Spam (SEC-15): the latest `conversation.spam` event. */
export interface SpamInfo {
	/** marked_spam, sender_rule, sender_marked_spam, or another key from the spam filter. */
	reason: string;
	detail?: { pattern?: string; rule?: number } & Record< string, unknown >;
	at: string;
}

export interface InboxItem {
	id: number;
	number: number;
	subject: string;
	productId: number;
	status: StatusRef | null;
	lane: string;
	priority: Priority;
	assigneeId: number | null;
	queueId: number | null;
	requesterId: number;
	requesterName: string;
	lastMessagePreview: string;
	lastMessageAt: string | null;
	waitingSince: string | null;
	messageCount: number;
	unread: boolean;
	updatedAt: string;
	version: number;
	/** Spam view rows (SEC-15). */
	spam?: SpamInfo | null;
	/** TRI-07: the Sentiment field, -2..2 (absent when not set). */
	sentiment?: number;
}

export interface InboxPage {
	items: InboxItem[];
	next: string | null;
	slow: boolean;
	/** Index hint when slow (INB-18): narrowed by an indexed condition, and the costly conditions. */
	hint: { narrow: boolean; costly: string[] } | null;
	view: { key: string; name: string; columns: string[] };
}

export interface SystemView {
	key: string;
	name: string;
	hidden: boolean;
	/** Open conversations; null when counts are hidden for this person (no cliedesk_see_view_counts). */
	count: number | null;
}

export type Visibility = 'private' | 'shared' | 'public';

export interface CustomView {
	id: number;
	name: string;
	icon: string | null;
	conditions: Record< string, unknown >;
	columns: string[];
	sort: SortKey;
	visibility: Visibility;
	shareUsers: number[];
	shareTeams: number[];
	ownerId: number;
	pinned: boolean;
	version: number;
	/** Null when counts are hidden for this person. */
	count?: number | null;
}

export interface Sidebar {
	system: SystemView[];
	custom: CustomView[];
}

export interface ViewInput {
	name?: string;
	icon?: string;
	conditions?: string;
	columns?: string[];
	sort?: SortKey;
	visibility?: Visibility;
	shareUsers?: number[];
	shareTeams?: number[];
	pinned?: boolean;
	duplicateOf?: number;
}

export interface Status {
	id: number;
	key: string;
	category: string;
	label: string;
	/** What the customer sees (CNV-12). */
	customerLabel?: string;
	active: boolean;
	system: boolean;
	sort: number;
}

export interface ConversationType {
	id: number;
	key: string;
	name: string;
	statusIds: number[];
	archived: boolean;
}

export interface TagRef {
	id: number;
	name: string;
	color: string | null;
}

export interface Participant {
	role: 'requester' | 'cc' | 'follower' | 'agent' | 'unknown';
	partyType: 'user' | 'contact';
	partyId: number;
}

export interface Conversation {
	id: number;
	number: number;
	productId: number;
	typeId: number;
	/** Type id and key (task, tracker, …): detects tasks and trackers without the types list. */
	type?: { id: number; key: string } | null;
	status: StatusRef | null;
	lane: string;
	priority: Priority;
	/** TRI-03: conversation language (de, pt_BR); agents override it. */
	language?: string | null;
	/** TRI-07: the Sentiment field, -2..2. */
	sentiment?: number | null;
	queueId: number | null;
	teamId: number | null;
	assigneeId: number | null;
	requesterId: number;
	subject: string;
	currentChannel: string;
	snoozedUntil: string | null;
	/** INB-70: if_no_reply (a customer reply wakes it) or regardless; null when not snoozed. */
	snoozeMode?: 'if_no_reply' | 'regardless' | null;
	messageCount: number;
	mergedIntoId: number | null;
	createdAt: string;
	updatedAt: string;
	version: number;
	tags: TagRef[];
	participants: Participant[];
	episodes: Array< { id: number; seq: number } >;
	/** In Spam (lane quarantine): why (SEC-15). */
	spam?: SpamInfo | null;
}

export interface Message {
	id: number;
	kind: string;
	visibility: 'internal' | 'public';
	direction: string;
	authorType: number;
	authorId: number | null;
	channel: string;
	status: string;
	html: string | null;
	text: string;
	meta?: Record< string, unknown > | null;
	createdAt: string;
	/** Reply to a message (notes thread under their parent note, INB-56). */
	parentId?: number | null;
	/** First message of its side thread (INB-61). */
	sideThreadId?: number | null;
	/** Note reactions: emoji → user ids (INB-56). */
	reactions?: Record< string, number[] > | unknown[];
	/** Earlier versions kept (INB-56). */
	editCount?: number;
	editedAt?: string | null;
	deletedAt?: string | null;
	/** Files (SEC-20); `url` is a short-lived signed link. */
	attachments?: MessageFile[];
}

export interface MessageFile {
	id: number;
	name: string;
	mime: string;
	size: number;
	url: string | null;
	/** SEC-21: malware scan (infected files are quarantined: no link). */
	scan?: 'clean' | 'infected' | 'unscanned';
}

export interface TimelineEvent {
	id: number;
	type: string;
	actorType: number;
	actorId: number | null;
	data: Record< string, unknown > | null;
	timeline: boolean;
	createdAt: string;
}

/** Author / actor types (database Appendix A). */
export const AUTHOR_CONTACT = 1;
export const AUTHOR_USER = 2;
export const AUTHOR_SYSTEM = 5;

export interface Identity {
	id: number;
	type: string;
	value: string;
	norm: string;
	primary: boolean;
	shared: boolean;
	verified: boolean;
}

export interface ContactSummary {
	id: number;
	displayName: string;
	email: string | null;
	phone: string | null;
	avatar: string | null;
	kind: 'customer' | 'guest';
	conversationCount: number;
	blocked: boolean;
	trashed?: boolean;
}

export interface Contact extends ContactSummary {
	language: string | null;
	timezone: string | null;
	country: string | null;
	city: string | null;
	identities: Identity[];
	createdAt: string;
	version: number;
	mergedIntoId: number | null;
	productIds?: number[];
	/** Contact owner (CRM-23): an agent's user id. */
	ownerId?: number | null;
	/** Linked WordPress account. */
	wpUserId?: number | null;
	/** Organizations the contact belongs to (CRM-30), primary first. */
	organizations: Array< {
		id: number;
		name: string;
		isPrimary: boolean;
		role: string | null;
	} >;
}

export type ContactState = 'active' | 'blocked' | 'trash';
export const IDENTITY_TYPES = [
	'email',
	'phone',
	'whatsapp',
	'messenger',
	'instagram',
	'telegram',
	'x',
	'external',
] as const;

export interface Tag extends TagRef {
	usageCount: number;
}

export interface FieldOption {
	id: number;
	key: string;
	label: string;
	path: string;
	archived: boolean;
	parentId?: number | null;
	color?: string | null;
	/** Tag added when the option is chosen (CNV-27). */
	tagId?: number | null;
}

export interface FieldDef {
	id: number;
	key: string;
	scope: string;
	type: string;
	label: string;
	settings: Record< string, unknown >;
	archived: boolean;
	sort: number;
	options?: FieldOption[];
	/** TEAM-20: the person can see but not change this field (hidden fields are not sent at all). */
	readonly?: boolean;
	customerLabel?: string | null;
	system?: boolean;
	version?: number;
}

export interface FieldValue {
	value: unknown;
	visible: boolean;
	required: boolean;
	/** TEAM-20: read-only for the person. */
	readonly?: boolean;
	/** TRI-16: set by a rule (its name) or the keyword lists; undoable. */
	setBy?: { source: 'rule'; ruleId: number | null; name: string };
}

export interface FieldValues {
	values: Record< string, FieldValue >;
	notices?: Record< string, string >;
}

export interface ConversationLink {
	type: string;
	conversationId: number;
	number: number;
	subject: string;
	done: boolean;
}

export interface Links {
	links: ConversationLink[];
	children: { total: number; done: number };
}

export interface ChecklistItem {
	id: number;
	label: string;
	template: string | null;
	blocking: boolean;
	done: boolean;
}

/** Checklist template item (CNV-23). */
export interface TemplateItem {
	key?: string;
	label: string;
	verify?: string | null;
}

export interface ChecklistTemplate {
	id: number;
	name: string;
	items: TemplateItem[];
	typeIds: number[];
	blocksResolve: boolean;
	active: boolean;
	version: number;
}

/** Every checklist template, active or not (GET checklists). */
export const checklistTemplatesQuery = () =>
	queryOptions( {
		queryKey: [ 'checklists' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< ChecklistTemplate[] >( 'checklists', {
					signal,
				} )
			).data ?? [],
	} );

export interface Checklist {
	items: ChecklistItem[];
	done: number;
	total: number;
}

export interface AgentRef {
	userId: number;
	name: string;
	status: string;
}

export interface MergePreview {
	targetId: number;
	timeline: Array< {
		id: number;
		conversationId: number;
		kind: string;
		createdAt: string;
		excerpt: string;
	} >;
	choices: Record<
		string,
		Array< { conversationId: number; value: string | number | null } >
	>;
	warnings: Array< { code: string; message: string } >;
}

// ------------------------------------------------------------------ Keys.

/** BRD-12: the products the inbox shows (my product switcher; empty: all). */
export function inboxProducts(): number[] {
	return prefsStore().get()?.layout.inboxProducts ?? [];
}

export const inboxKeys = {
	all: [ 'inbox' ] as const,
	views: [ 'inbox', 'views' ] as const,
	list: ( view: string, sort: ListSort | null ) =>
		[ 'inbox', 'list', view, sort, inboxProducts().join() ] as const,
};

export const conversationKeys = {
	all: ( id: number ) => [ 'conversation', id ] as const,
	detail: ( id: number ) => [ 'conversation', id, 'detail' ] as const,
	messages: ( id: number ) => [ 'conversation', id, 'messages' ] as const,
	events: ( id: number ) => [ 'conversation', id, 'events' ] as const,
	links: ( id: number ) => [ 'conversation', id, 'links' ] as const,
	checklist: ( id: number ) => [ 'conversation', id, 'checklist' ] as const,
	fields: ( id: number ) => [ 'conversation', id, 'fields' ] as const,
	number: ( n: number ) => [ 'conversation-number', n ] as const,
};

export const contactKeys = {
	list: [ 'contacts', 'list' ] as const,
	listFor: ( q: string, state: ContactState ) =>
		[ 'contacts', 'list', q, state ] as const,
	all: ( id: number ) => [ 'contact', id ] as const,
	detail: ( id: number ) => [ 'contact', id, 'detail' ] as const,
	fields: ( id: number ) => [ 'contact', id, 'fields' ] as const,
};

// ------------------------------------------------------------------ Queries.

export const PAGE_SIZE = 50;

export const sidebarQuery = () =>
	queryOptions( {
		queryKey: [ ...inboxKeys.views, inboxProducts().join() ] as const,
		queryFn: async ( { signal } ) => {
			const products = inboxProducts();
			const r = await api.get< Sidebar >( 'inbox/views', {
				query: products.length ? { products } : {},
				signal,
			} );
			return {
				system: r.data?.system ?? [],
				custom: r.data?.custom ?? [],
			};
		},
	} );

/**
 * One page of the inbox list.
 *
 * @param view   View key or custom view id.
 * @param sort   Sort (null: the view's own sort).
 * @param after  Cursor.
 * @param signal Abort signal.
 */
export async function fetchInboxPage(
	view: string,
	sort: ListSort | null,
	after: string | null,
	signal?: AbortSignal
): Promise< InboxPage > {
	const r = await api.get< InboxPage >( 'inbox', {
		query: {
			view,
			sort: sort ?? undefined,
			after: after ?? undefined,
			limit: PAGE_SIZE,
			products: inboxProducts().length ? inboxProducts() : undefined,
		},
		signal,
	} );
	return {
		items: r.data?.items ?? [],
		next: r.data?.next ?? null,
		slow: !! r.data?.slow,
		hint: r.data?.hint ?? null,
		view: r.data?.view ?? { key: view, name: '', columns: [] },
	};
}

/**
 * Number of conversations in a view (GET inbox?total=true; counting costs a query, so only for "select all").
 *
 * @param view View key or custom view id.
 */
export const inboxTotalQuery = ( view: string ) =>
	queryOptions( {
		queryKey: [ 'inbox', 'total', view, inboxProducts().join() ] as const,
		queryFn: async ( { signal } ): Promise< number | null > => {
			const r = await api.get< { total?: number | null } >( 'inbox', {
				query: {
					view,
					limit: 1,
					total: true,
					products: inboxProducts().length
						? inboxProducts()
						: undefined,
				},
				signal,
			} );
			const total = r.data?.total;
			return typeof total === 'number' && total >= 0 ? total : null;
		},
		staleTime: 30 * 1000,
	} );

export const statusesQuery = () =>
	queryOptions( {
		queryKey: [ 'statuses' ] as const,
		queryFn: async ( { signal } ) =>
			( await api.get< Status[] >( 'statuses', { signal } ) ).data ?? [],
		staleTime: 5 * 60 * 1000,
	} );

export const typesQuery = () =>
	queryOptions( {
		queryKey: [ 'types' ] as const,
		queryFn: async ( { signal } ) =>
			(
				( await api.get< ConversationType[] >( 'types', { signal } ) )
					.data ?? []
			).filter( ( t ) => ! t.archived ),
		staleTime: 5 * 60 * 1000,
	} );

export const tagsQuery = () =>
	queryOptions( {
		queryKey: [ 'tags', 'list' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< Tag[] >( 'tags', {
					query: { sort: 'name' },
					signal,
				} )
			).data ?? [],
	} );

export const fieldsQuery = (
	scope: 'conversation' | 'contact' | 'organization'
) =>
	queryOptions( {
		queryKey: [ 'fields', scope ] as const,
		queryFn: async ( { signal } ) =>
			(
				(
					await api.get< FieldDef[] >( 'fields', {
						query: { scope },
						signal,
					} )
				).data ?? []
			)
				.filter( ( f ) => ! f.archived )
				.sort( ( a, b ) => a.sort - b.sort ),
		staleTime: 5 * 60 * 1000,
	} );

/**
 * People for assignee, sharing and mention pickers (`GET agents/picker`, open to everyone who can view
 * conversations).
 */
export const agentLookupQuery = () =>
	queryOptions( {
		queryKey: [ 'team', 'agents', 'lookup' ] as const,
		queryFn: async ( { signal } ) =>
			(
				(
					await api.get< {
						items: Array< {
							userId: number;
							name: string;
							agent: boolean;
						} >;
					} >( 'agents/picker', { signal } )
				).data?.items ?? []
			).map( ( a ) => ( {
				userId: a.userId,
				name: a.name,
				status: a.agent ? 'agent' : 'collaborator',
			} ) ),
		enabled: can( 'cliedesk_view_conversations' ),
		staleTime: 5 * 60 * 1000,
	} );

export const numberQuery = ( n: number ) =>
	queryOptions( {
		queryKey: conversationKeys.number( n ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< { id: number; number: number } >(
					`conversations/number/${ n }`,
					{ signal }
				)
			).data,
	} );

export const conversationQuery = ( id: number ) =>
	queryOptions( {
		queryKey: conversationKeys.detail( id ),
		queryFn: async ( { signal } ) =>
			normaliseConversation(
				(
					await api.get< Conversation >( `conversations/${ id }`, {
						signal,
					} )
				).data
			),
	} );

/**
 * Every page of a keyset list (`{items, next}` with `after` = last id), up to a safety cap.
 *
 * @param path   Path.
 * @param signal Abort signal.
 * @param max    Maximum pages.
 */
async function allPages< T >(
	path: string,
	signal: AbortSignal | undefined,
	max = 20
): Promise< T[] > {
	const out: T[] = [];
	let after: string | null = null;
	for ( let i = 0; i < max; i++ ) {
		const r: ApiResult< { items: T[]; next: string | null } > =
			await api.get( path, {
				query: { limit: 200, after: after ?? undefined },
				signal,
			} );
		out.push( ...( r.data?.items ?? [] ) );
		after = r.data?.next ?? null;
		if ( ! after ) {
			break;
		}
	}
	return out;
}

export const messagesQuery = ( id: number ) =>
	queryOptions( {
		queryKey: conversationKeys.messages( id ),
		queryFn: ( { signal } ) =>
			allPages< Message >( `conversations/${ id }/messages`, signal ),
	} );

export const eventsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: conversationKeys.events( id ),
		queryFn: ( { signal } ) =>
			allPages< TimelineEvent >( `conversations/${ id }/events`, signal ),
	} );

export const linksQuery = ( id: number ) =>
	queryOptions( {
		queryKey: conversationKeys.links( id ),
		queryFn: async ( { signal } ) => {
			const r = await api.get< Links >( `conversations/${ id }/links`, {
				signal,
			} );
			return {
				links: r.data?.links ?? [],
				children: r.data?.children ?? { total: 0, done: 0 },
			};
		},
	} );

export const checklistQuery = ( id: number ) =>
	queryOptions( {
		queryKey: conversationKeys.checklist( id ),
		queryFn: async ( { signal } ) =>
			normaliseChecklist(
				(
					await api.get< Checklist >(
						`conversations/${ id }/checklist`,
						{
							signal,
						}
					)
				).data
			),
	} );

export type FieldEntity = 'conversation' | 'contact' | 'organization';

/**
 * Field values of a conversation or contact.
 *
 * @param entity Entity.
 * @param id     Entity id.
 */
export const fieldValuesQuery = ( entity: FieldEntity, id: number ) =>
	queryOptions( {
		queryKey:
			// eslint-disable-next-line no-nested-ternary -- three entity kinds.
			entity === 'conversation'
				? conversationKeys.fields( id )
				: entity === 'contact'
					? contactKeys.fields( id )
					: ( [ 'organization', id, 'fields' ] as const ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< FieldValues >( 'field-values', {
					query: { entity, entityId: id },
					signal,
				} )
			).data?.values ?? {},
	} );

export const contactQuery = ( id: number ) =>
	queryOptions( {
		queryKey: contactKeys.detail( id ),
		queryFn: async ( { signal } ) =>
			normaliseContact(
				( await api.get< Contact >( `contacts/${ id }`, { signal } ) )
					.data
			),
	} );

/**
 * One page of the contact list.
 *
 * @param q      Search.
 * @param state  State.
 * @param after  Cursor.
 * @param signal Abort signal.
 */
export async function fetchContactsPage(
	q: string,
	state: ContactState,
	after: string | null,
	signal?: AbortSignal
): Promise< { items: ContactSummary[]; next: string | null } > {
	const r = await api.get< {
		items: ContactSummary[];
		next: string | null;
	} >( 'contacts', {
		query: {
			q: q.trim() || undefined,
			state,
			limit: PAGE_SIZE,
			after: after ?? undefined,
		},
		signal,
	} );
	return { items: r.data?.items ?? [], next: r.data?.next ?? null };
}

// ------------------------------------------------------------------ Normalisers.

/**
 * Conversation detail with safe defaults.
 *
 * @param c Detail from the API.
 */
export function normaliseConversation( c: Conversation ): Conversation {
	return {
		...c,
		tags: c.tags ?? [],
		participants: c.participants ?? [],
		episodes: c.episodes ?? [],
	};
}

/**
 * Contact with safe defaults.
 *
 * @param c Contact from the API.
 */
export function normaliseContact( c: Contact ): Contact {
	return {
		...c,
		identities: c.identities ?? [],
		organizations: Array.isArray( c.organizations ) ? c.organizations : [],
		language: c.language ?? null,
		timezone: c.timezone ?? null,
		country: c.country ?? null,
		city: c.city ?? null,
	};
}

/**
 * Checklist with safe defaults.
 *
 * @param c Checklist from the API.
 */
export function normaliseChecklist( c: Checklist | undefined ): Checklist {
	return {
		items: c?.items ?? [],
		done: c?.done ?? 0,
		total: c?.total ?? 0,
	};
}

/**
 * Agent display name (assignee, author).
 *
 * @param id     User id.
 * @param agents Known agents.
 */
export function agentName(
	id: number | null,
	agents: AgentRef[] | undefined
): string | null {
	if ( id === null ) {
		return null;
	}
	return agents?.find( ( a ) => a.userId === id )?.name ?? null;
}

/** Teams (same key and data as the team screens' list, so the cache is shared). */
export const teamsLookupQuery = () =>
	queryOptions( {
		queryKey: [ 'teams', 'list', false ] as const,
		queryFn: async ( { signal } ) => {
			const data = (
				await api.get< TeamRef[] >( 'teams', {
					query: { archived: false },
					signal,
				} )
			).data;
			return Array.isArray( data ) ? data : [];
		},
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );

export interface QueueRef {
	id: number;
	name: string;
	icon: string | null;
}

/** Queues the user may move conversations to (GET queues/picker, INB-14). */
export const queuePickerQuery = () =>
	queryOptions( {
		queryKey: [ 'queues', 'picker' ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: QueueRef[] } >( 'queues/picker', {
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );

export interface TeamRef {
	id: number;
	name: string;
	/** The team's own queue (INB-14 move targets). */
	queueId?: number | null;
}

export interface Draft {
	id: number;
	mode: string;
	html: string;
	review: boolean;
	updatedAt: string;
}

/** One of my drafts (GET drafts, INB-52). */
export interface DraftListItem extends Draft {
	conversationId: number;
	conversationNumber: number;
	subject: string;
}

export interface Drafts {
	reply: Draft | null;
	note: Draft | null;
	side_thread?: Draft | null;
	draftMode: boolean;
	/** Default choice of the send button (INB-49): send, resolve, wait or snooze. */
	postSend?: string;
	/** INB-42: the mode my team's composer starts in. */
	composerMode?: 'reply' | 'note' | 'side_thread';
}

export const draftsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'conversation', id, 'drafts' ] as const,
		queryFn: async ( { signal } ) => {
			const r = await api.get< Drafts >( `conversations/${ id }/drafts`, {
				signal,
			} );
			return {
				reply: r.data?.reply ?? null,
				note: r.data?.note ?? null,
				side_thread: r.data?.side_thread ?? null,
				draftMode: !! r.data?.draftMode,
				composerMode: r.data?.composerMode ?? 'reply',
				postSend:
					typeof r.data?.postSend === 'string'
						? r.data.postSend
						: 'send',
			};
		},
		// Drafts are mine; live updates from the feed must not overwrite what I am typing.
		staleTime: Infinity,
	} );

export interface Vocabulary {
	conditions: VocabEntry[];
	columns: Array< { key: string; label: string } >;
	sorts: string[];
	/** Labels of the sorts modules add (Pro: `sla`). */
	sortLabels: Record< string, string >;
}

/**
 * The sorts modules add to the built-in ones (from the view vocabulary), with their labels.
 *
 * @param vocabulary View vocabulary.
 */
export function moreSorts(
	vocabulary: Vocabulary | undefined
): Array< { key: string; label: string } > {
	return ( vocabulary?.sorts ?? [] )
		.filter(
			( s ) =>
				! ( SORTS as string[] ).includes( s ) &&
				! s.startsWith( 'field:' )
		)
		.map( ( key ) => ( {
			key,
			label: vocabulary?.sortLabels[ key ] ?? key,
		} ) );
}

/** View vocabulary (GET views/vocabulary, CNV-11): conditions, columns and sorts the person may use. */
export const vocabularyQuery = () =>
	queryOptions( {
		queryKey: [ 'views', 'vocabulary' ] as const,
		queryFn: async ( { signal } ): Promise< Vocabulary > => {
			const d = (
				await api.get< Partial< Vocabulary > >( 'views/vocabulary', {
					signal,
				} )
			).data;
			return {
				conditions: Array.isArray( d?.conditions ) ? d.conditions : [],
				columns: Array.isArray( d?.columns ) ? d.columns : [],
				sorts: Array.isArray( d?.sorts ) ? d.sorts : [],
				sortLabels:
					d?.sortLabels && typeof d.sortLabels === 'object'
						? d.sortLabels
						: {},
			};
		},
		staleTime: 5 * 60 * 1000,
	} );

/** One field of a type's form (CNV-31, GET types/{id}/form). */
export interface FormField {
	key: string;
	type: string;
	label: string;
	description: string;
	placeholder: string;
	multiple: boolean;
	options: FieldOption[] | null;
	visible: boolean;
	required: boolean;
	readonly: boolean;
}

/**
 * The agent form of a type, with visibility and required flags for the values so far (CNV-31).
 *
 * @param typeId Type.
 * @param values API values so far (conditions).
 */
export const typeFormQuery = (
	typeId: number,
	values: Record< string, unknown >
) =>
	queryOptions( {
		queryKey: [ 'types', typeId, 'form', values ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { fields: FormField[] } >(
					`types/${ typeId }/form`,
					{
						query: {
							audience: 'agent',
							values: JSON.stringify( values ),
						},
						signal,
					}
				)
			).data?.fields ?? [],
		staleTime: 60 * 1000,
		placeholderData: keepPreviousData,
	} );
