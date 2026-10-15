/**
 * Command palette (INB-05, INB-06; plan.frontend-ux.md §5.4). Ctrl/⌘-K or the top-bar button.
 *
 * - Go to: screens from the nav registry, inbox views (GET inbox/views), My drafts and settings sections, each
 *   filtered by the user's capabilities and modules.
 * - "#1042" (or "1042"): looked up with GET conversations/number/{n}; only a conversation the server returns is
 *   listed, so nothing outside the user's scope ever shows.
 * - Search: conversations, contacts and views from GET palette?q (in the user's scope), and "Search conversations
 *   for …", which opens /inbox/search?q=….
 * - Recent: with an empty query, my most recently read conversations (GET palette/recent).
 * - Actions on the open conversation (status, assign, priority, tags, follow), the other conversation Actions from
 *   the catalog (GET actions) that need nothing else, and registered commands, listed only when the user has the
 *   capability. An action shows a preview and runs after confirmation. Data from the server: ./remote.
 *
 * Keys: ↑ ↓ move, Enter opens or runs, Ctrl/⌘+Enter opens in a new tab, Esc closes.
 */
import {
	api,
	can,
	getBoot,
	hasModule,
	isApiError,
	useQuery,
	useQueryClient,
	type QueryClient,
} from '@cliedesk/data';
import { Button, Modal, announce, cx } from '@cliedesk/ui';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type KeyboardEvent,
} from 'react';
import {
	PRIORITIES,
	agentLookupQuery,
	conversationKeys,
	conversationQuery,
	numberQuery,
	sidebarQuery,
	statusesQuery,
	tagsQuery,
	type AgentRef,
	type Conversation,
	type Sidebar,
	type Status,
	type Tag,
} from '../inbox/api';
import { ActionError } from '../inbox/components';
import { priorityLabel } from '../inbox/labels';
import { absoluteHref, type LinkTarget } from '../links';
import {
	getCommands,
	getNavItems,
	getSettingsSections,
	isEnabled,
} from '../registry';
import {
	manualRulesQuery,
	requestRunRule,
	type ManualRule,
} from '../routes/conversation/ManualRules';
import {
	afterChange,
	currentVersion,
	inOrder,
	mergeDetail,
} from '../routes/conversation/shared';
import { sectionDescription } from '../routes/settings/descriptions';
import { openConversationStore } from '../state';
import { versionTag } from '../workspace/api';
import { announceResult } from '../workspace/forms';
import {
	actionCatalogQuery,
	catalogActions,
	paletteRecentQuery,
	paletteSearchQuery,
	recentItems,
	searchItems,
} from './remote';

export const DRAFTS_PATH = '/drafts';

export interface PaletteItem {
	id: string;
	group: string;
	label: string;
	/** Extra words that match (not shown). */
	keywords?: string;
	/** Navigation target (opens; Ctrl/⌘+Enter opens in a new tab). */
	target?: LinkTarget;
	/** Action: preview text shown before it runs. */
	confirm?: string;
	run?: () => Promise< unknown > | void;
}

export const GROUPS = {
	goTo: () => __( 'Go to', 'cliedesk' ),
	conversations: () => __( 'Conversations', 'cliedesk' ),
	search: () => __( 'Search', 'cliedesk' ),
	actions: () => __( 'Actions', 'cliedesk' ),
};

/**
 * Whether an item matches the query (every word appears in the label or keywords).
 *
 * @param item  Item.
 * @param query Query.
 */
export function matches( item: PaletteItem, query: string ): boolean {
	const words = query.toLowerCase().split( /\s+/ ).filter( Boolean );
	const hay = `${ item.label } ${ item.keywords ?? '' }`.toLowerCase();
	return words.every( ( w ) => hay.includes( w ) );
}

/**
 * Conversation number typed in the palette ("#1042", "1042"), or null.
 *
 * @param query Query.
 */
export function numberFromQuery( query: string ): number | null {
	const m = /^#?\s*(\d{1,9})$/.exec( query.trim() );
	const n = m ? Number( m[ 1 ] ) : 0;
	return n > 0 ? n : null;
}

/**
 * "Go to" items the user may open.
 *
 * @param sidebar Inbox views (when loaded).
 */
export function goToItems( sidebar: Sidebar | undefined ): PaletteItem[] {
	const group = GROUPS.goTo();
	const out: PaletteItem[] = getNavItems()
		.filter(
			( n ) =>
				can( n.capability ) && hasModule( n.module ) && isEnabled( n )
		)
		.map( ( n ) => ( {
			id: `nav:${ n.id }`,
			group,
			label: n.label,
			target: { to: n.to },
		} ) );
	const inbox = can( 'cliedesk_view_conversations' ) && hasModule( 'inbox' );
	if ( inbox ) {
		out.push( {
			id: 'nav:drafts',
			group,
			label: __( 'My drafts', 'cliedesk' ),
			keywords: 'unsent',
			target: { to: DRAFTS_PATH },
		} );
		for ( const v of sidebar?.system ?? [] ) {
			out.push( {
				id: `view:${ v.key }`,
				group,
				label: sprintf(
					/* translators: %s: inbox view name. */
					__( 'Inbox: %s', 'cliedesk' ),
					v.name
				),
				keywords: 'view',
				target: { to: '/inbox/$view', params: { view: v.key } },
			} );
		}
		for ( const v of sidebar?.custom ?? [] ) {
			out.push( {
				id: `view:${ v.id }`,
				group,
				label: sprintf(
					/* translators: %s: inbox view name. */
					__( 'Inbox: %s', 'cliedesk' ),
					v.name
				),
				keywords: 'view',
				target: {
					to: '/inbox/$view',
					params: { view: String( v.id ) },
				},
			} );
		}
	}
	for ( const s of getSettingsSections() ) {
		if ( can( s.capability ) && hasModule( s.module ) ) {
			out.push( {
				id: `settings:${ s.area }/${ s.id }`,
				group,
				label: sprintf(
					/* translators: %s: settings section. */
					__( 'Settings: %s', 'cliedesk' ),
					s.label
				),
				keywords: `${
					s.description ?? sectionDescription( s.id ) ?? ''
				} ${ synonyms()[ s.id ] ?? '' }`,
				target: { to: `/settings/${ s.area }/${ s.id }` },
			} );
		}
	}
	return out;
}

/**
 * ADM-02: other words people use for a settings section ("office hours" finds Business hours).
 */
export function synonyms(): Record< string, string > {
	return {
		'business-hours': __(
			'office hours opening hours schedule holidays closed timezone',
			'cliedesk'
		),
		sla: __( 'response time deadline targets service level', 'cliedesk' ),
		rules: __( 'automation workflows triggers macros auto', 'cliedesk' ),
		widget: __( 'chat live chat messenger bubble launcher', 'cliedesk' ),
		email: __( 'smtp sending sender delivery layout', 'cliedesk' ),
		'help-center': __( 'knowledge base faq docs articles', 'cliedesk' ),
		portal: __( 'customer area my tickets account', 'cliedesk' ),
		people: __( 'agents users staff invite seats members', 'cliedesk' ),
		roles: __( 'permissions capabilities access rights', 'cliedesk' ),
		teams: __( 'groups departments', 'cliedesk' ),
		tags: __( 'labels categories', 'cliedesk' ),
		'custom-fields': __( 'attributes properties form fields', 'cliedesk' ),
		types: __( 'request forms ticket types categories', 'cliedesk' ),
		queues: __( 'routing assignment round robin distribution', 'cliedesk' ),
		satisfaction: __( 'csat survey rating feedback nps', 'cliedesk' ),
		security: __(
			'two-factor 2fa password sessions lockdown login',
			'cliedesk'
		),
		audit: __( 'history log who changed', 'cliedesk' ),
		health: __( 'status cron jobs problems diagnostics debug', 'cliedesk' ),
		integrations: __(
			'plugins woocommerce forms add-ons apps',
			'cliedesk'
		),
		brands: __( 'logo colors company', 'cliedesk' ),
		general: __( 'workspace name address timezone', 'cliedesk' ),
		languages: __( 'translation locale multilingual', 'cliedesk' ),
		profile: __( 'my account signature avatar notifications', 'cliedesk' ),
		senders: __( 'spam allow list block list domains', 'cliedesk' ),
		notices: __( 'banner incident announcement outage', 'cliedesk' ),
	};
}

interface ActionData {
	statuses?: Status[];
	agents?: AgentRef[];
	tags?: Tag[];
}

/**
 * Write to the open conversation (If-Match with the newest version known) and update the caches.
 *
 * @param qc   Query client.
 * @param c    Conversation.
 * @param path Path below conversations/{id}/.
 * @param body Body.
 */
async function conversationWrite(
	qc: QueryClient,
	c: Conversation,
	path: string,
	body: Record< string, unknown >
): Promise< void > {
	await inOrder( c.id, async () => {
		const r = await api.post< Partial< Conversation > >(
			`conversations/${ c.id }/${ path }`,
			{
				body,
				ifMatch: versionTag( currentVersion( qc, c.id, c.version ) ),
			}
		);
		if ( r.data && typeof r.data.version === 'number' ) {
			mergeDetail( qc, c.id, r.data );
		} else {
			void qc.invalidateQueries( {
				queryKey: conversationKeys.detail( c.id ),
			} );
		}
	} );
	afterChange( qc, c.id );
}

/**
 * Actions on the open conversation the user may run.
 *
 * @param qc   Query client.
 * @param c    Conversation.
 * @param data Statuses, agents and tags.
 */
export function conversationActions(
	qc: QueryClient,
	c: Conversation,
	data: ActionData
): PaletteItem[] {
	const group = GROUPS.actions();
	const me = getBoot().user?.id ?? null;
	const num = `#${ c.number }`;
	const out: PaletteItem[] = [];
	const write = ( path: string, body: Record< string, unknown > ) => () =>
		conversationWrite( qc, c, path, body );

	if ( can( 'cliedesk_change_status' ) ) {
		for ( const s of data.statuses ?? [] ) {
			if (
				! s.active ||
				s.id === c.status?.id ||
				s.key === 'snoozed' ||
				s.category === 'new' ||
				s.category === 'closed'
			) {
				continue;
			}
			out.push( {
				id: `status:${ s.id }`,
				group,
				label: sprintf(
					/* translators: %s: status. */
					__( 'Set status to %s', 'cliedesk' ),
					s.label
				),
				keywords: 'status',
				confirm: sprintf(
					/* translators: 1: conversation number, 2: status. */
					__( 'Change the status of %1$s to %2$s?', 'cliedesk' ),
					num,
					s.label
				),
				run: write( 'status', { statusId: s.id } ),
			} );
		}
	}
	if ( can( 'cliedesk_edit_conversation_fields' ) ) {
		for ( const p of PRIORITIES ) {
			if ( p === c.priority ) {
				continue;
			}
			out.push( {
				id: `priority:${ p }`,
				group,
				label: sprintf(
					/* translators: %s: priority. */
					__( 'Set priority to %s', 'cliedesk' ),
					priorityLabel( p )
				),
				keywords: 'priority',
				confirm: sprintf(
					/* translators: 1: conversation number, 2: priority. */
					__( 'Change the priority of %1$s to %2$s?', 'cliedesk' ),
					num,
					priorityLabel( p )
				),
				run: write( 'priority', { priority: p } ),
			} );
		}
	}
	const canSelf = can( 'cliedesk_assign_self' );
	const canOthers = can( 'cliedesk_assign_others' );
	if ( ( canSelf || canOthers ) && me !== null && c.assigneeId !== me ) {
		out.push( {
			id: 'assign:me',
			group,
			label: __( 'Assign to me', 'cliedesk' ),
			keywords: 'assign',
			confirm: sprintf(
				/* translators: %s: conversation number. */
				__( 'Assign %s to you?', 'cliedesk' ),
				num
			),
			run: write( 'assign', { assigneeId: me } ),
		} );
	}
	if ( ( canSelf || canOthers ) && c.assigneeId !== null ) {
		out.push( {
			id: 'assign:none',
			group,
			label: __( 'Unassign', 'cliedesk' ),
			keywords: 'assign unassigned',
			confirm: sprintf(
				/* translators: %s: conversation number. */
				__( 'Remove the assignee of %s?', 'cliedesk' ),
				num
			),
			run: write( 'assign', { assigneeId: null } ),
		} );
	}
	if ( canOthers ) {
		for ( const a of data.agents ?? [] ) {
			if ( a.userId === me || a.userId === c.assigneeId ) {
				continue;
			}
			out.push( {
				id: `assign:${ a.userId }`,
				group,
				label: sprintf(
					/* translators: %s: person. */
					__( 'Assign to %s', 'cliedesk' ),
					a.name
				),
				keywords: 'assign',
				confirm: sprintf(
					/* translators: 1: conversation number, 2: person. */
					__( 'Assign %1$s to %2$s?', 'cliedesk' ),
					num,
					a.name
				),
				run: write( 'assign', { assigneeId: a.userId } ),
			} );
		}
	}
	if ( can( 'cliedesk_edit_conversation_fields' ) ) {
		const tagWrite = ( body: Record< string, unknown > ) => async () => {
			const r = await api.post< { tags: Conversation[ 'tags' ] } >(
				'tags/apply',
				{
					body: { entity: 'conversation', entityId: c.id, ...body },
				}
			);
			if ( r.data?.tags ) {
				mergeDetail( qc, c.id, { tags: r.data.tags } );
			}
			afterChange( qc, c.id );
		};
		for ( const t of data.tags ?? [] ) {
			const has = c.tags.some( ( x ) => x.id === t.id );
			out.push( {
				id: `tag:${ t.id }`,
				group,
				label: has
					? sprintf(
							/* translators: %s: tag. */
							__( 'Remove tag %s', 'cliedesk' ),
							t.name
						)
					: sprintf(
							/* translators: %s: tag. */
							__( 'Add tag %s', 'cliedesk' ),
							t.name
						),
				keywords: 'tag',
				confirm: has
					? sprintf(
							/* translators: 1: tag, 2: conversation number. */
							__( 'Remove the tag %1$s from %2$s?', 'cliedesk' ),
							t.name,
							num
						)
					: sprintf(
							/* translators: 1: tag, 2: conversation number. */
							__( 'Add the tag %1$s to %2$s?', 'cliedesk' ),
							t.name,
							num
						),
				run: tagWrite( has ? { remove: [ t.id ] } : { add: [ t.id ] } ),
			} );
		}
	}
	const following = c.participants.some(
		( p ) =>
			p.role === 'follower' && p.partyType === 'user' && p.partyId === me
	);
	out.push( {
		id: 'follow',
		group,
		label: following
			? __( 'Stop following this conversation', 'cliedesk' )
			: __( 'Follow this conversation', 'cliedesk' ),
		keywords: 'follow unfollow',
		confirm: following
			? sprintf(
					/* translators: %s: conversation number. */
					__( 'Stop following %s?', 'cliedesk' ),
					num
				)
			: sprintf(
					/* translators: %s: conversation number. */
					__( 'Follow %s?', 'cliedesk' ),
					num
				),
		run: async () => {
			const r = await api.post< {
				participants: Conversation[ 'participants' ];
			} >( `conversations/${ c.id }/follow`, {
				body: { follow: ! following },
			} );
			if ( r.data?.participants ) {
				mergeDetail( qc, c.id, { participants: r.data.participants } );
			}
			afterChange( qc, c.id );
		},
	} );
	return out;
}

/**
 * AUT-20: "Run rule …" for the manual rules the person may run; the open conversation's header runs it (asking for
 * the rule's inputs first when it has any).
 *
 * @param rules  Manual rules.
 * @param number Conversation number.
 */
export function ruleItems(
	rules: ManualRule[],
	number: number
): PaletteItem[] {
	return rules.map( ( rule ) => ( {
		id: `rule:${ rule.id }`,
		group: GROUPS.actions(),
		label: sprintf(
			/* translators: %s: rule name. */
			__( 'Run rule: %s', 'cliedesk' ),
			rule.name
		),
		keywords: 'rule workflow run',
		confirm: sprintf(
			/* translators: 1: rule name, 2: conversation number. */
			__( 'Run “%1$s” on #%2$d?', 'cliedesk' ),
			rule.name,
			number
		),
		run: () => requestRunRule( rule ),
	} ) );
}

/** Registered commands (Pro and add-ons) the user may run. */
function registeredCommands(): PaletteItem[] {
	return getCommands()
		.filter( ( c ) => can( c.capability ) )
		.map( ( c ) => ( {
			id: `cmd:${ c.id }`,
			group: c.group ?? GROUPS.actions(),
			label: c.label,
			keywords: c.keywords?.join( ' ' ),
			run: c.run,
		} ) );
}

function useDebounced( value: string, ms = 150 ): string {
	const [ v, setV ] = useState( value );
	useEffect( () => {
		const t = window.setTimeout( () => setV( value ), ms );
		return () => window.clearTimeout( t );
	}, [ value, ms ] );
	return v;
}

/**
 * The conversation for a typed number, through the API only (null while unknown or not found).
 *
 * @param n Number.
 */
function useNumberLookup( n: number | null ) {
	const lookup = useQuery( {
		...numberQuery( n ?? 0 ),
		enabled: n !== null,
		retry: false,
	} );
	const detail = useQuery( {
		...conversationQuery( lookup.data?.id ?? 0 ),
		enabled: !! lookup.data,
		retry: false,
	} );
	return {
		pending:
			n !== null &&
			( lookup.isPending || ( !! lookup.data && detail.isPending ) ),
		notFound: n !== null && ( lookup.isError || detail.isError ),
		conversation:
			n !== null && lookup.data ? ( detail.data ?? null ) : null,
	};
}

const PER_GROUP_IDLE = 6;
const PER_GROUP = 20;

/**
 * Command palette dialog.
 *
 * @param props         Props.
 * @param props.onClose Close.
 */
export default function CommandPalette( { onClose }: { onClose: () => void } ) {
	const navigate = useNavigate();
	const router = useRouter();
	const qc = useQueryClient();
	const [ query, setQuery ] = useState( '' );
	const [ active, setActive ] = useState( 0 );
	const [ confirming, setConfirming ] = useState< PaletteItem | null >(
		null
	);
	const [ running, setRunning ] = useState( false );
	const [ error, setError ] = useState< unknown >( null );
	const listRef = useRef< HTMLDivElement >( null );
	const inputRef = useRef< HTMLInputElement >( null );
	const debounced = useDebounced( query );
	const q = query.trim();

	const inbox = can( 'cliedesk_view_conversations' ) && hasModule( 'inbox' );
	const sidebar = useQuery( { ...sidebarQuery(), enabled: inbox } );
	const open = useSyncExternalStore(
		openConversationStore.subscribe,
		openConversationStore.get,
		openConversationStore.get
	);
	const current = useQuery( {
		...conversationQuery( open?.id ?? 0 ),
		enabled: !! open,
	} );
	const statuses = useQuery( {
		...statusesQuery(),
		enabled: !! open && can( 'cliedesk_change_status' ),
	} );
	const agents = useQuery( {
		...agentLookupQuery(),
		enabled: !! open && can( 'cliedesk_assign_others' ),
	} );
	const tags = useQuery( {
		...tagsQuery(),
		enabled: !! open && can( 'cliedesk_edit_conversation_fields' ),
	} );
	const n = inbox ? numberFromQuery( debounced ) : null;
	const lookup = useNumberLookup( n );
	const term = debounced.trim();
	const remote = useQuery( {
		...paletteSearchQuery( term ),
		enabled: inbox && term.length >= 2 && n === null,
		retry: false,
	} );
	const recent = useQuery( {
		...paletteRecentQuery(),
		enabled: inbox && q === '',
		retry: false,
	} );
	const catalog = useQuery( {
		...actionCatalogQuery(),
		enabled: !! open,
		retry: false,
	} );
	// AUT-20: manual rules the person may run, on the open conversation.
	const rules = useQuery( { ...manualRulesQuery(), enabled: !! open } );

	const items = useMemo( () => {
		const all: PaletteItem[] = [];
		if ( lookup.conversation ) {
			const c = lookup.conversation;
			all.push( {
				id: `conversation:${ c.number }`,
				group: GROUPS.conversations(),
				label: `#${ c.number } ${ c.subject }`,
				keywords: String( c.number ),
				target: {
					to: '/c/$number',
					params: { number: String( c.number ) },
				},
			} );
		}
		if ( ! q && recent.data ) {
			all.push(
				...recentItems( recent.data ).slice( 0, PER_GROUP_IDLE )
			);
		}
		const local = [
			...goToItems( sidebar.data ),
			...( current.data
				? [
						...conversationActions( qc, current.data, {
							statuses: statuses.data,
							agents: agents.data,
							tags: tags.data,
						} ),
						...catalogActions(
							qc,
							current.data,
							catalog.data ?? [],
							GROUPS.actions()
						),
						...ruleItems( rules.data ?? [], current.data.number ),
					]
				: [] ),
			...registeredCommands(),
		].filter( ( i ) => ! q || matches( i, q ) );
		// Cap each group so the list stays short.
		const counts = new Map< string, number >();
		for ( const i of local ) {
			const k = counts.get( i.group ) ?? 0;
			if ( k < ( q ? PER_GROUP : PER_GROUP_IDLE ) ) {
				all.push( i );
				counts.set( i.group, k + 1 );
			}
		}
		if ( q && remote.data && term === q ) {
			const shown = new Set( all.map( ( i ) => i.id ) );
			all.push(
				...searchItems( remote.data, shown, {
					conversations: GROUPS.conversations(),
					goTo: GROUPS.goTo(),
				} ).filter( ( i ) => ! shown.has( i.id ) )
			);
		}
		if ( q && inbox ) {
			all.push( {
				id: 'search',
				group: GROUPS.search(),
				label: sprintf(
					/* translators: %s: search text. */
					__( 'Search conversations for “%s”', 'cliedesk' ),
					q
				),
				target: {
					to: '/inbox/$view',
					params: { view: 'search' },
					search: { q },
				},
			} );
		}
		// Keep groups together in the order they first appear.
		const order: string[] = [];
		for ( const i of all ) {
			if ( ! order.includes( i.group ) ) {
				order.push( i.group );
			}
		}
		return order.flatMap( ( g ) => all.filter( ( i ) => i.group === g ) );
	}, [
		lookup.conversation,
		remote.data,
		recent.data,
		catalog.data,
		rules.data,
		term,
		sidebar.data,
		current.data,
		statuses.data,
		agents.data,
		tags.data,
		qc,
		q,
		inbox,
	] );

	const index = Math.min( active, Math.max( items.length - 1, 0 ) );
	useEffect( () => setActive( 0 ), [ q ] );
	useEffect( () => {
		const t = window.setTimeout( () => {
			announce(
				items.length
					? sprintf(
							/* translators: %d: number of results. */
							_n(
								'%d result',
								'%d results',
								items.length,
								'cliedesk'
							),
							items.length
						)
					: __( 'No results', 'cliedesk' )
			);
		}, 400 );
		return () => window.clearTimeout( t );
	}, [ items.length ] );
	useEffect( () => {
		listRef.current
			?.querySelector( `[data-index="${ index }"]` )
			?.scrollIntoView?.( { block: 'nearest' } );
	}, [ index ] );

	const choose = ( item: PaletteItem | undefined, newTab = false ) => {
		if ( ! item ) {
			return;
		}
		if ( item.target ) {
			if ( newTab ) {
				window.open(
					absoluteHref( router, item.target ),
					'_blank',
					'noopener'
				);
				return;
			}
			onClose();
			void navigate( item.target as never );
			return;
		}
		if ( item.confirm ) {
			setError( null );
			setConfirming( item );
			return;
		}
		onClose();
		void item.run?.();
	};

	const runConfirmed = async () => {
		if ( ! confirming?.run ) {
			return;
		}
		setRunning( true );
		setError( null );
		try {
			const out = await confirming.run();
			announceResult(
				isApprovalRequest( out )
					? __(
							'Sent for approval. It runs once it is approved.',
							'cliedesk'
						)
					: __( 'Done.', 'cliedesk' )
			);
			onClose();
		} catch ( e ) {
			setError( e );
			setRunning( false );
		}
	};

	const onKeyDown = ( e: KeyboardEvent< HTMLInputElement > ) => {
		if ( e.key === 'ArrowDown' ) {
			e.preventDefault();
			setActive( items.length ? ( index + 1 ) % items.length : 0 );
		} else if ( e.key === 'ArrowUp' ) {
			e.preventDefault();
			setActive(
				items.length ? ( index - 1 + items.length ) % items.length : 0
			);
		} else if ( e.key === 'Enter' ) {
			e.preventDefault();
			choose( items[ index ], e.ctrlKey || e.metaKey );
		}
	};

	const optionId = ( i: number ) => `cd-palette-option-${ i }`;
	let status: string | null = null;
	if ( n !== null && lookup.pending ) {
		status = sprintf(
			/* translators: %d: conversation number. */
			__( 'Looking up #%d…', 'cliedesk' ),
			n
		);
	} else if ( n !== null && lookup.notFound ) {
		status = sprintf(
			/* translators: %d: conversation number. */
			__( 'No conversation #%d that you can open.', 'cliedesk' ),
			n
		);
	}

	const groups: Array< {
		name: string;
		start: number;
		items: PaletteItem[];
	} > = [];
	items.forEach( ( item, i ) => {
		const last = groups[ groups.length - 1 ];
		if ( last && last.name === item.group ) {
			last.items.push( item );
		} else {
			groups.push( { name: item.group, start: i, items: [ item ] } );
		}
	} );

	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				confirming
					? __( 'Confirm action', 'cliedesk' )
					: __( 'Search or jump to', 'cliedesk' )
			}
			size="lg"
		>
			{ confirming ? (
				<div className="flex flex-col gap-4">
					<p className="text-base">{ confirming.confirm }</p>
					<ActionError
						error={ error }
						onDismiss={ () => setError( null ) }
					/>
					{ isApiError( error ) && error.status === 412 && (
						<p className="text-sm text-fg-muted">
							{ __(
								'Someone else changed this conversation. Close the palette to see their changes.',
								'cliedesk'
							) }
						</p>
					) }
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							onPress={ () => {
								setConfirming( null );
								window.setTimeout(
									() => inputRef.current?.focus(),
									0
								);
							} }
						>
							{ __( 'Back', 'cliedesk' ) }
						</Button>
						<Button
							variant="primary"
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
							isLoading={ running }
							onPress={ () => void runConfirmed() }
						>
							{ __( 'Run', 'cliedesk' ) }
						</Button>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<label
						htmlFor="cd-palette-input"
						className="text-sm font-medium"
					>
						{ __(
							'Type a screen, a view, #number, an action or words to search',
							'cliedesk'
						) }
					</label>
					<input
						ref={ inputRef }
						id="cd-palette-input"
						type="text"
						role="combobox"
						aria-expanded={ items.length > 0 }
						aria-controls="cd-palette-list"
						aria-autocomplete="list"
						aria-describedby="cd-palette-keys"
						aria-activedescendant={
							items.length ? optionId( index ) : undefined
						}
						autoComplete="off"
						spellCheck={ false }
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						value={ query }
						onChange={ ( e ) => setQuery( e.target.value ) }
						onKeyDown={ onKeyDown }
						className="h-(--cd-control-h) w-full rounded-md border border-line-strong bg-surface px-(--cd-control-px) text-base text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
					/>
					<p id="cd-palette-keys" className="text-xs text-fg-muted">
						{ __(
							'↑ ↓ move · Enter opens · Ctrl+Enter or ⌘+Enter opens in a new tab · Esc closes',
							'cliedesk'
						) }
					</p>
					{ status && (
						<p className="text-sm text-fg-muted">{ status }</p>
					) }
					<div
						ref={ listRef }
						id="cd-palette-list"
						role="listbox"
						aria-label={ __( 'Results', 'cliedesk' ) }
						className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto"
					>
						{ groups.map( ( g ) => (
							<div
								key={ g.name }
								role="group"
								aria-labelledby={ `cd-palette-group-${ g.start }` }
							>
								<div
									id={ `cd-palette-group-${ g.start }` }
									role="presentation"
									className="px-2 py-1 text-xs font-semibold text-fg-subtle uppercase"
								>
									{ g.name }
								</div>
								{ g.items.map( ( item, k ) => {
									const i = g.start + k;
									return (
										<div
											key={ item.id }
											id={ optionId( i ) }
											data-index={ i }
											role="option"
											tabIndex={ -1 }
											aria-selected={ i === index }
											onMouseMove={ () =>
												i !== index && setActive( i )
											}
											onClick={ ( e ) =>
												choose(
													item,
													e.ctrlKey || e.metaKey
												)
											}
											onKeyDown={ ( e ) => {
												if ( e.key === 'Enter' ) {
													choose( item );
												}
											} }
											className={ cx(
												'cursor-pointer rounded-md px-2 py-1.5 text-base text-fg',
												i === index &&
													'bg-accent-subtle text-accent-fg'
											) }
										>
											<bdi>{ item.label }</bdi>
										</div>
									);
								} ) }
							</div>
						) ) }
					</div>
					{ items.length === 0 && ! status && (
						<p className="text-sm text-fg-muted">
							{ __( 'No results.', 'cliedesk' ) }
						</p>
					) }
				</div>
			) }
		</Modal>
	);
}

/**
 * Whether an Action answered with a pending approval request instead of running (INB-06, TEAM-26).
 *
 * @param out Action result data.
 */
function isApprovalRequest( out: unknown ): boolean {
	const approval = ( out as { approval?: { status?: unknown } } | null )
		?.approval;
	return (
		typeof approval === 'object' &&
		approval !== null &&
		approval.status === 'pending'
	);
}
