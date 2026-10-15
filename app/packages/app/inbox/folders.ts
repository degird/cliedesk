/**
 * Sidebar folders (INB-11): types, query and helpers.
 *
 * - GET folders → {items: [{id, name, items: ['system:key' | 'view:id' | 'queue:id'], shared, teamIds, canEdit,
 *   collapsed}]}, in my order.
 * - POST folders {name, items?, shared?, teamIds?}; PATCH folders/{id} {name?, items?, teamIds?}; DELETE folders/{id}.
 *   Shared folders need cliedesk_manage_shared_views (only when creating; `shared` cannot change later).
 * - PUT folders/arrangement {order, collapsed}: my own order and collapsed folders (also for shared folders).
 *
 * Item references are resolved against the sidebar data the inbox already loads (system and custom views) and the
 * queue picker; references that do not resolve (deleted views, queues I cannot see) are skipped.
 *
 * Key: ['folders'].
 */
import { api, queryOptions } from '@cliedesk/data';
import type { QueueRef, Sidebar } from './api';

export interface Folder {
	id: number;
	name: string;
	items: string[];
	shared: boolean;
	teamIds: number[];
	canEdit: boolean;
	collapsed: boolean;
}

export interface FolderInput {
	name?: string;
	items?: string[];
	shared?: boolean;
	teamIds?: number[];
}

export const folderKeys = { all: [ 'folders' ] as const };

/**
 * Folder with safe defaults.
 *
 * @param f Folder from the API.
 */
export function normaliseFolder( f: Partial< Folder > ): Folder {
	return {
		id: Number( f.id ),
		name: typeof f.name === 'string' ? f.name : '',
		items: Array.isArray( f.items )
			? f.items.filter( ( x ): x is string => typeof x === 'string' )
			: [],
		shared: !! f.shared,
		teamIds: Array.isArray( f.teamIds )
			? f.teamIds.filter( ( x ): x is number => typeof x === 'number' )
			: [],
		canEdit: f.canEdit !== false,
		collapsed: !! f.collapsed,
	};
}

/**
 * List from an answer ({items}).
 *
 * @param d Data.
 */
export const folderList = ( d: { items?: Folder[] } | undefined ): Folder[] =>
	Array.isArray( d?.items ) ? d.items.map( normaliseFolder ) : [];

export const foldersQuery = () =>
	queryOptions( {
		queryKey: folderKeys.all,
		queryFn: async ( { signal } ) =>
			folderList(
				(
					await api.get< { items?: Folder[] } >( 'folders', {
						signal,
					} )
				).data
			),
		staleTime: 60 * 1000,
		retry: false,
	} );

export type FolderItemKind = 'system' | 'view' | 'queue';

export interface ResolvedItem {
	ref: string;
	kind: FolderItemKind;
	/** View key (system key or custom view id) or queue id. */
	key: string;
	name: string;
	icon?: string | null;
	count?: number | null;
	/** System views I hid. */
	hidden?: boolean;
}

/**
 * Parse a reference.
 *
 * @param ref Reference such as `view:12`.
 */
export function parseRef(
	ref: string
): { kind: FolderItemKind; key: string } | null {
	const m = /^(system|view|queue):([a-z0-9_]{1,64})$/.exec( ref );
	return m ? { kind: m[ 1 ] as FolderItemKind, key: m[ 2 ] as string } : null;
}

/**
 * A reference resolved against the sidebar and the queues, or null when unknown.
 *
 * @param ref     Reference.
 * @param sidebar Sidebar views.
 * @param queues  Queues (null: not loaded).
 */
export function resolveRef(
	ref: string,
	sidebar: Sidebar,
	queues: QueueRef[] | null
): ResolvedItem | null {
	const p = parseRef( ref );
	if ( ! p ) {
		return null;
	}
	if ( p.kind === 'system' ) {
		const v = sidebar.system.find( ( s ) => s.key === p.key );
		return v
			? {
					ref,
					kind: 'system',
					key: v.key,
					name: v.name,
					count: v.count,
					hidden: v.hidden,
				}
			: null;
	}
	if ( p.kind === 'view' ) {
		const v = sidebar.custom.find( ( c ) => String( c.id ) === p.key );
		return v
			? {
					ref,
					kind: 'view',
					key: String( v.id ),
					name: v.name,
					icon: v.icon,
					count: v.count,
				}
			: null;
	}
	const q = queues?.find( ( x ) => String( x.id ) === p.key );
	return q
		? {
				ref,
				kind: 'queue',
				key: String( q.id ),
				name: q.name,
				icon: q.icon,
			}
		: null;
}

/**
 * Every item a folder can hold, for the folder editor.
 *
 * @param sidebar Sidebar views.
 * @param queues  Queues.
 */
export function folderChoices(
	sidebar: Sidebar,
	queues: QueueRef[]
): ResolvedItem[] {
	return [
		...sidebar.system.map( ( s ) => `system:${ s.key }` ),
		...sidebar.custom.map( ( c ) => `view:${ c.id }` ),
		...queues.map( ( q ) => `queue:${ q.id }` ),
	]
		.map( ( ref ) => resolveRef( ref, sidebar, queues ) )
		.filter( ( x ): x is ResolvedItem => x !== null );
}

/**
 * Whether any folder holds a queue (the queue picker is loaded only then).
 *
 * @param folders Folders.
 */
export const hasQueueRefs = ( folders: Folder[] ): boolean =>
	folders.some( ( f ) => f.items.some( ( i ) => i.startsWith( 'queue:' ) ) );

/**
 * The arrangement body for a folder list.
 *
 * @param folders Folders in order.
 */
export function arrangement( folders: Folder[] ): {
	order: number[];
	collapsed: number[];
} {
	return {
		order: folders.map( ( f ) => f.id ),
		collapsed: folders.filter( ( f ) => f.collapsed ).map( ( f ) => f.id ),
	};
}

/**
 * Save my order and collapsed folders.
 *
 * @param folders Folders in order.
 */
export async function saveArrangement(
	folders: Folder[]
): Promise< Folder[] > {
	return folderList(
		(
			await api.put< { items?: Folder[] } >( 'folders/arrangement', {
				body: arrangement( folders ),
			} )
		).data
	);
}

/** Drag data: a folder being moved (its id). */
export const DRAG_FOLDER = 'application/x-cliedesk-folder';
/** Drag data: a view or queue reference, JSON {ref, from} (from: the folder it was in, or null). */
export const DRAG_REF = 'application/x-cliedesk-ref';

/**
 * Folders whose items change when a reference is dropped on a folder: the target gets it at the end, and an
 * editable folder it was dragged out of loses it. Empty when nothing changes.
 *
 * @param folders  Folders.
 * @param ref      Reference.
 * @param from     Folder it came from, or null (the plain sidebar).
 * @param targetId Folder dropped on.
 */
export function dropRef(
	folders: Folder[],
	ref: string,
	from: number | null,
	targetId: number
): Array< { id: number; items: string[] } > {
	const target = folders.find( ( f ) => f.id === targetId );
	if ( ! target?.canEdit || from === targetId || ! parseRef( ref ) ) {
		return [];
	}
	const out: Array< { id: number; items: string[] } > = [];
	if ( ! target.items.includes( ref ) ) {
		out.push( { id: target.id, items: [ ...target.items, ref ] } );
	}
	const source = folders.find( ( f ) => f.id === from );
	if ( source?.canEdit ) {
		out.push( {
			id: source.id,
			items: source.items.filter( ( x ) => x !== ref ),
		} );
	}
	return out;
}
