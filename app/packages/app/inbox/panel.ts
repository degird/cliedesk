/**
 * Conversation side panel sections and layouts (INB-66): the order, hidden and collapsed sections come from my own
 * layout (preferences, `layout.panel`), else my team's or type's layout set by an admin (GET panel-layouts/mine),
 * else the built-in order.
 */
import { api, queryOptions } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';

export const PANEL_SECTIONS = [
	'customer',
	'orders',
	'summary',
	'visit',
	'approvals',
	'tags',
	'fields',
	'records',
	'checklist',
	'links',
	'tracker',
	'tasks',
	'reminders',
	'people',
	'apps',
	'side_threads',
	'history',
	'activity',
	'notepad',
] as const;

export interface PanelLayout {
	order: string[];
	collapsed: string[];
	hidden: string[];
}

export interface AdminPanelLayout extends PanelLayout {
	id: number;
	name: string;
	teamId: number | null;
	typeId: number | null;
}

/**
 * Name of a section.
 *
 * @param key Section key.
 */
export function panelSectionLabel( key: string ): string {
	const labels: Record< string, string > = {
		customer: __( 'Customer and organization', 'cliedesk' ),
		orders: __( 'Orders', 'cliedesk' ),
		approvals: __( 'Approvals', 'cliedesk' ),
		tags: __( 'Tags', 'cliedesk' ),
		fields: __( 'Fields', 'cliedesk' ),
		records: __( 'Linked records', 'cliedesk' ),
		checklist: __( 'Checklist', 'cliedesk' ),
		links: __( 'Linked conversations', 'cliedesk' ),
		tracker: __( 'Trackers', 'cliedesk' ),
		tasks: __( 'Tasks', 'cliedesk' ),
		reminders: __( 'My reminders', 'cliedesk' ),
		people: __( 'People', 'cliedesk' ),
		apps: __( 'Apps', 'cliedesk' ),
		summary: __( 'AI summary', 'cliedesk' ),
		visit: __( 'Web visit', 'cliedesk' ),
		side_threads: __( 'Side threads', 'cliedesk' ),
		history: __( 'Other conversations', 'cliedesk' ),
		activity: __( 'Recent activity', 'cliedesk' ),
		notepad: __( 'Contact notes', 'cliedesk' ),
	};
	return labels[ key ] ?? key;
}

/**
 * Every section in layout order (sections the layout does not list keep their built-in place after it).
 *
 * @param layout Layout, or null for the built-in one.
 */
export function orderedSections( layout: PanelLayout | null ): string[] {
	const known = new Set< string >( PANEL_SECTIONS );
	const first = ( layout?.order ?? [] ).filter( ( k ) => known.has( k ) );
	return [
		...first,
		...PANEL_SECTIONS.filter( ( k ) => ! first.includes( k ) ),
	];
}

/**
 * Sections to show, in order, with their collapsed state.
 *
 * @param layout Layout, or null for the built-in one.
 */
export function arrangePanel(
	layout: PanelLayout | null
): { key: string; collapsed: boolean }[] {
	return orderedSections( layout )
		.filter( ( k ) => ! layout?.hidden.includes( k ) )
		.map( ( key ) => ( {
			key,
			collapsed: !! layout?.collapsed.includes( key ),
		} ) );
}

/**
 * The admin layout for me and a conversation type.
 *
 * @param typeId Conversation type.
 */
export const myPanelLayoutQuery = ( typeId: number ) =>
	queryOptions( {
		queryKey: [ 'panel-layouts', 'mine', typeId ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { layout: AdminPanelLayout | null } >(
					'panel-layouts/mine',
					{ query: { typeId }, signal }
				)
			).data?.layout ?? null,
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );

/** INB-67: what the first matching context rule sets for a conversation. */
export interface PanelContext {
	rule: { id: number; name: string } | null;
	cards: PanelLayout | null;
	macros: number[];
	knowledge: { categoryId: number | null; query: string } | null;
	adaptive: boolean;
}

/**
 * INB-67: the context rule result for a conversation (cards, recommended saved replies, help article filter).
 *
 * @param id Conversation.
 */
export const panelContextQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'panel-context', id ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< PanelContext >(
					`conversations/${ id }/panel-context`,
					{ signal }
				)
			).data ?? null,
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );
