/**
 * Command palette data from the server (INB-05, INB-06):
 * - GET palette?q → up to 5 conversations, contacts and views in the person's scope (a half-typed search operator
 *   does not fail it);
 * - GET palette/recent → my 10 most recently read conversations (shown while the query is empty);
 * - GET actions → every Action the person may run (built from the registry, so module and Pro Actions appear).
 *   Conversation Actions that need nothing but the conversation become palette actions on the open conversation,
 *   previewed and confirmed, sent with If-Match.
 */
import { api, queryOptions, type QueryClient } from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import {
	conversationKeys,
	type Conversation,
	type InboxItem,
} from '../inbox/api';
import { afterChange, mergeDetail } from '../routes/conversation/shared';
import { versionTag } from '../workspace/api';
import type { PaletteItem } from './CommandPalette';

export interface PaletteSearch {
	conversations: Array< Pick< InboxItem, 'id' | 'number' | 'subject' > >;
	contacts: Array< {
		id: number;
		displayName: string;
		email: string | null;
	} >;
	views: Array< { key: string; name: string } >;
}

export interface CatalogAction {
	name: string;
	label: string;
	method: string | null;
	route: string | null;
	inputs: string[];
	readonly: boolean;
	destructive: boolean;
	customerVisible: boolean;
	confirm: boolean;
	pro: boolean;
}

export const paletteSearchQuery = ( q: string ) =>
	queryOptions( {
		queryKey: [ 'palette', 'search', q ] as const,
		queryFn: async ( { signal } ): Promise< PaletteSearch > => {
			const d = (
				await api.get< Partial< PaletteSearch > >( 'palette', {
					query: { q },
					signal,
				} )
			).data;
			return {
				conversations: Array.isArray( d?.conversations )
					? d.conversations
					: [],
				contacts: Array.isArray( d?.contacts ) ? d.contacts : [],
				views: Array.isArray( d?.views ) ? d.views : [],
			};
		},
		staleTime: 30 * 1000,
	} );

export const paletteRecentQuery = () =>
	queryOptions( {
		queryKey: [ 'palette', 'recent' ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: InboxItem[] } >( 'palette/recent', {
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

export const actionCatalogQuery = () =>
	queryOptions( {
		queryKey: [ 'actions', 'catalog' ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: CatalogAction[] } >( 'actions', {
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
		staleTime: 10 * 60 * 1000,
	} );

const conversationItem = (
	group: string,
	c: Pick< InboxItem, 'number' | 'subject' >,
	prefix: string
): PaletteItem => ( {
	id: `${ prefix }:${ c.number }`,
	group,
	label: `#${ c.number } ${ c.subject }`,
	keywords: String( c.number ),
	target: { to: '/c/$number', params: { number: String( c.number ) } },
} );

/**
 * Recently read conversations.
 *
 * @param items Conversations.
 */
export function recentItems( items: InboxItem[] ): PaletteItem[] {
	return items.map( ( c ) =>
		conversationItem( __( 'Recent', 'cliedesk' ), c, 'recent' )
	);
}

/**
 * Server search results; views already listed locally are left out.
 *
 * @param r                    Results.
 * @param localIds             Ids of the items already shown.
 * @param groups               Group labels.
 * @param groups.conversations Conversations group.
 * @param groups.goTo          Go-to group (views).
 */
export function searchItems(
	r: PaletteSearch,
	localIds: Set< string >,
	groups: { conversations: string; goTo: string }
): PaletteItem[] {
	return [
		...r.conversations.map( ( c ) =>
			conversationItem( groups.conversations, c, 'conversation' )
		),
		...r.contacts.map( ( c ) => ( {
			id: `contact:${ c.id }`,
			group: __( 'Contacts', 'cliedesk' ),
			label: c.email
				? `${ c.displayName } · ${ c.email }`
				: c.displayName,
			target: {
				to: '/contacts/$contactId',
				params: { contactId: String( c.id ) },
			},
		} ) ),
		...r.views
			.filter( ( v ) => ! localIds.has( `view:${ v.key }` ) )
			.map( ( v ) => ( {
				id: `view:${ v.key }`,
				group: groups.goTo,
				label: v.name,
				target: { to: '/inbox/$view', params: { view: v.key } },
			} ) ),
	];
}

const CONVERSATION_ROUTE =
	/^\/conversations\/\(\?P<id>\\d\+\)\/([a-z0-9_/-]+)$/;

/** Conversation Actions the palette already offers with their own choices (status, priority, assign, tags, follow). */
const HANDLED = [ 'status', 'priority', 'assign', 'follow', 'tags' ];

/**
 * Catalog Actions that act on the open conversation and need nothing else: previewed, confirmed, sent with If-Match.
 *
 * @param qc      Query client.
 * @param c       Open conversation.
 * @param catalog Action catalog.
 * @param group   Group label.
 */
export function catalogActions(
	qc: QueryClient,
	c: Conversation,
	catalog: CatalogAction[],
	group: string
): PaletteItem[] {
	const out: PaletteItem[] = [];
	for ( const a of catalog ) {
		const m = a.route ? CONVERSATION_ROUTE.exec( a.route ) : null;
		const path = m?.[ 1 ] ?? '';
		if (
			! m ||
			a.method !== 'POST' ||
			a.readonly ||
			a.destructive ||
			HANDLED.includes( path ) ||
			a.inputs.some( ( i ) => i !== 'id' )
		) {
			continue;
		}
		out.push( {
			id: `action:${ a.name }`,
			group,
			label: a.label,
			keywords: a.name,
			confirm: sprintf(
				/* translators: 1: action, e.g. "Mark as spam"; 2: conversation number, e.g. "#1042". */
				__( '%1$s: %2$s?', 'cliedesk' ),
				a.label,
				`#${ c.number }`
			),
			run: async () => {
				const current =
					qc.getQueryData< Conversation >(
						conversationKeys.detail( c.id )
					) ?? c;
				const r = await api.post< Partial< Conversation > >(
					`conversations/${ c.id }/${ path }`,
					{ body: {}, ifMatch: versionTag( current.version ) }
				);
				if ( r.data && typeof r.data.version === 'number' ) {
					mergeDetail( qc, c.id, r.data );
				}
				afterChange( qc, c.id );
				// A risky Action over its limit comes back as an approval request instead of running (TEAM-22/26).
				return r.data;
			},
		} );
	}
	return out;
}
