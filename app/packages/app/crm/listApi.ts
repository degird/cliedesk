/**
 * Contacts list (CRM-36/37), segments (CRM-38), bulk actions (CRM-40) and export (CRM-41): types, keys and calls.
 *
 * Keys: ['contacts', 'query', {conditions, q, sort}], ['segments', 'list'], ['segments', 'preview', conditions],
 * ['bulk', uid]. The change feed's contact invalidation (['contacts']) refreshes the list.
 */
import { api, queryOptions } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';
import type { ContactSummary, TagRef } from '../inbox/api';
import { getPrefs, savePrefs } from '../prefs';

// ------------------------------------------------------------------ Query.

export type ContactSort = 'last_conversation' | 'created' | 'name';
export const CONTACT_SORTS: ContactSort[] = [
	'last_conversation',
	'created',
	'name',
];

/** A contact row of POST contacts/query (the contact API shape). */
export interface ContactRow extends ContactSummary {
	country?: string | null;
	city?: string | null;
	language?: string | null;
	ownerId?: number | null;
	lastConversationAt?: string | null;
	createdAt?: string;
	identities?: Array< { type: string; value: string } >;
	/** Primary first. */
	organizations?: Array< { id: number; name: string; isPrimary?: boolean } >;
	tags?: TagRef[];
}

export interface ContactQueryInput {
	conditions: string | null;
	q: string;
	sort: ContactSort;
}

export const LIST_PAGE_SIZE = 50;

export const contactQueryKey = ( input: ContactQueryInput ) =>
	[ 'contacts', 'query', input ] as const;

/**
 * One page of the filtered contact list (the first page also asks for the total).
 *
 * @param input  Filter, search and sort.
 * @param cursor Cursor.
 * @param signal Abort signal.
 */
export async function fetchContactQuery(
	input: ContactQueryInput,
	cursor: string | null,
	signal?: AbortSignal
): Promise< {
	items: ContactRow[];
	nextCursor: string | null;
	total: number | null;
} > {
	const d = (
		await api.post< {
			items: ContactRow[];
			nextCursor: string | null;
			total: number | null;
		} >( 'contacts/query', {
			body: {
				...( input.conditions ? { conditions: input.conditions } : {} ),
				...( input.q.trim() ? { q: input.q.trim() } : {} ),
				sort: input.sort,
				limit: LIST_PAGE_SIZE,
				...( cursor ? { cursor } : { total: true } ),
			},
			signal,
		} )
	).data;
	return {
		items: Array.isArray( d?.items ) ? d.items : [],
		nextCursor: d?.nextCursor ?? null,
		total: typeof d?.total === 'number' ? d.total : null,
	};
}

/**
 * Sort label.
 *
 * @param s Sort.
 */
export function sortLabel( s: ContactSort ): string {
	switch ( s ) {
		case 'last_conversation':
			return __( 'Last conversation', 'cliedesk' );
		case 'created':
			return __( 'Newest', 'cliedesk' );
		case 'name':
			return __( 'Name', 'cliedesk' );
	}
	return s;
}

// ------------------------------------------------------------------ Columns.

export type ColumnKey =
	| 'name'
	| 'emails'
	| 'phones'
	| 'country'
	| 'city'
	| 'organization'
	| 'tags'
	| 'conversations'
	| 'lastConversation'
	| 'created';

export const COLUMNS: ColumnKey[] = [
	'name',
	'emails',
	'phones',
	'country',
	'city',
	'organization',
	'tags',
	'conversations',
	'lastConversation',
	'created',
];

export const DEFAULT_COLUMNS: ColumnKey[] = [
	'name',
	'emails',
	'phones',
	'conversations',
	'lastConversation',
];

/**
 * Column label.
 *
 * @param c Column.
 */
export function columnLabel( c: string ): string {
	switch ( c ) {
		case 'name':
			return __( 'Name', 'cliedesk' );
		case 'emails':
			return __( 'Emails', 'cliedesk' );
		case 'phones':
			return __( 'Phones', 'cliedesk' );
		case 'country':
			return __( 'Country', 'cliedesk' );
		case 'city':
			return __( 'City', 'cliedesk' );
		case 'organization':
			return __( 'Organization', 'cliedesk' );
		case 'tags':
			return __( 'Tags', 'cliedesk' );
		case 'conversations':
			return __( 'Conversations', 'cliedesk' );
		case 'lastConversation':
			return __( 'Last conversation', 'cliedesk' );
		case 'created':
			return __( 'Created', 'cliedesk' );
		case 'id':
			return __( 'ID', 'cliedesk' );
		case 'kind':
			return __( 'Kind', 'cliedesk' );
		case 'language':
			return __( 'Language', 'cliedesk' );
		case 'blocked':
			return __( 'Blocked', 'cliedesk' );
	}
	return c;
}

/** Columns saved before they moved to the server preferences (read once, then dropped). */
const LEGACY_COLUMNS_KEY = 'cliedesk.contacts.columns';

/**
 * Known columns of a saved list (null when it is not usable).
 *
 * @param list Saved value.
 */
function validColumns( list: unknown ): ColumnKey[] | null {
	if ( ! Array.isArray( list ) ) {
		return null;
	}
	const ok = COLUMNS.filter( ( c ) => list.includes( c ) );
	return ok.includes( 'name' ) ? ok : null;
}

/**
 * Visible columns: kept per user on the server (prefs.layout.contactColumns), so they follow the agent.
 */
export function loadColumns(): ColumnKey[] {
	const saved = validColumns( getPrefs().layout.contactColumns );
	if ( saved ) {
		return saved;
	}
	try {
		const raw = window.localStorage.getItem( LEGACY_COLUMNS_KEY );
		const legacy = validColumns( raw ? JSON.parse( raw ) : null );
		if ( legacy ) {
			return legacy;
		}
	} catch {
		// Storage blocked or bad JSON: defaults.
	}
	return DEFAULT_COLUMNS;
}

/**
 * Remember the visible columns (applied at once, saved to the server shortly after).
 *
 * @param cols Columns.
 */
export function saveColumns( cols: ColumnKey[] ): void {
	savePrefs( { layout: { contactColumns: cols } } );
	try {
		window.localStorage.removeItem( LEGACY_COLUMNS_KEY );
	} catch {
		// Nothing to clean up.
	}
}

// ------------------------------------------------------------------ Selection.

/** Selected contacts, or every contact matching the current filter and search. */
export type Selection =
	| { kind: 'ids'; ids: number[] }
	| {
			kind: 'all';
			conditions: string | null;
			q: string;
			total: number | null;
	  };

/**
 * Request fields of a selection.
 *
 * @param s Selection.
 */
export function selectionBody( s: Selection ): Record< string, unknown > {
	if ( s.kind === 'ids' ) {
		return { contactIds: s.ids };
	}
	return {
		...( s.conditions ? { conditions: s.conditions } : {} ),
		...( s.q.trim() ? { q: s.q.trim() } : {} ),
	};
}

/**
 * Number of contacts in a selection (null: unknown).
 *
 * @param s Selection.
 */
export const selectionCount = ( s: Selection ): number | null =>
	s.kind === 'ids' ? s.ids.length : s.total;

// ------------------------------------------------------------------ Segments.

export interface Segment {
	id: number;
	uid: string;
	name: string;
	kind: 'dynamic' | 'static';
	conditions: unknown;
	teamIds: number[] | null;
	memberCount: number;
	refreshedAt: string | null;
	systemKey: string | null;
	version: number;
}

export interface SegmentInput {
	name: string;
	kind?: 'dynamic' | 'static';
	conditions?: string;
	teamIds?: number[] | null;
}

export const segmentKeys = {
	all: [ 'segments' ] as const,
	list: [ 'segments', 'list' ] as const,
};

export const segmentsQuery = () =>
	queryOptions( {
		queryKey: segmentKeys.list,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: Segment[] } >( 'segments', { signal } )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

/**
 * The filter that shows a segment's contacts.
 *
 * @param id Segment id.
 */
export const segmentFilter = ( id: number ) => ( {
	all: [ { field: 'segment', op: 'in', value: [ id ] } ],
} );

/**
 * Segment id when the filter is exactly "in segment X".
 *
 * @param tree Stored conditions object.
 */
export function segmentOf( tree: unknown ): number | null {
	const all = ( tree as { all?: unknown[] } | null )?.all;
	if ( ! Array.isArray( all ) || all.length !== 1 ) {
		return null;
	}
	const leaf = all[ 0 ] as { field?: string; op?: string; value?: unknown };
	if (
		leaf?.field === 'segment' &&
		leaf.op === 'in' &&
		Array.isArray( leaf.value ) &&
		leaf.value.length === 1
	) {
		return Number( leaf.value[ 0 ] ) || null;
	}
	return null;
}

// ------------------------------------------------------------------ Bulk jobs.

export type JobStatus =
	'queued' | 'running' | 'completed' | 'failed' | 'rolled_back' | 'undoing';

export interface BulkJob {
	uid: string;
	kind: string;
	status: JobStatus | string;
	total: number;
	processed: number;
	failed: number;
	/** Items left alone on purpose (already in that state); not counted in `failed`. */
	skipped?: number;
	result: Record< string, unknown > | null;
	canUndo: boolean;
	createdAt: string;
	finishedAt: string | null;
	/** Large selections (conversation bulk above 5,000 items): a notice to show. */
	warning?: string;
}

export const TERMINAL: string[] = [ 'completed', 'failed', 'rolled_back' ];

export const isTerminal = ( j: Pick< BulkJob, 'status' > ) =>
	TERMINAL.includes( j.status );

let pollMs = 2000;

/** Poll interval of bulk jobs (tests shorten it). */
export const jobPollMs = () => pollMs;

/**
 * Change the poll interval (tests only).
 *
 * @param ms Milliseconds.
 */
export function setJobPollMs( ms: number ): void {
	pollMs = ms;
}

export const jobQuery = ( uid: string ) =>
	queryOptions( {
		queryKey: [ 'bulk', uid ] as const,
		queryFn: async ( { signal } ) =>
			( await api.get< BulkJob >( `bulk/${ uid }`, { signal } ) ).data,
		refetchInterval: ( q ) => {
			const d = q.state.data;
			return d && isTerminal( d ) ? false : jobPollMs();
		},
		staleTime: 0,
	} );

export type BulkOp =
	| 'tag_add'
	| 'tag_remove'
	| 'field_set'
	| 'org_add'
	| 'segment_add'
	| 'block'
	| 'trash';

/**
 * Human name of a bulk operation.
 *
 * @param op Operation.
 */
export function opName( op: string ): string {
	switch ( op ) {
		case 'tag_add':
			return __( 'Add tags', 'cliedesk' );
		case 'tag_remove':
			return __( 'Remove tags', 'cliedesk' );
		case 'field_set':
			return __( 'Set a field', 'cliedesk' );
		case 'org_add':
			return __( 'Add to organization', 'cliedesk' );
		case 'segment_add':
			return __( 'Add to list', 'cliedesk' );
		case 'block':
			return __( 'Block', 'cliedesk' );
		case 'trash':
			return __( 'Move to Trash', 'cliedesk' );
	}
	return op;
}

/**
 * Status label of a job.
 *
 * @param s Status.
 */
export function jobStatusLabel( s: string ): string {
	switch ( s ) {
		case 'queued':
			return __( 'Waiting to start', 'cliedesk' );
		case 'running':
			return __( 'In progress', 'cliedesk' );
		case 'completed':
			return __( 'Done', 'cliedesk' );
		case 'failed':
			return __( 'Failed', 'cliedesk' );
		case 'rolled_back':
			return __( 'Undone', 'cliedesk' );
		case 'undoing':
			return __( 'Undoing', 'cliedesk' );
	}
	return s;
}

/**
 * Signed download link of a finished export (valid for 15 minutes).
 *
 * @param uid Job uid.
 */
export async function downloadUrl( uid: string ): Promise< string > {
	const url = ( await api.get< { url: string } >( `bulk/${ uid }/download` ) )
		.data?.url;
	// Only web links: never a javascript: or data: URL.
	if ( ! url || ! /^(https?:\/\/|\/(?!\/))/i.test( url ) ) {
		throw new Error( __( 'The file is not ready.', 'cliedesk' ) );
	}
	return url;
}

/**
 * Open a download link (a separate function so tests can replace it).
 *
 * @param url URL.
 */
export const navigateTo = {
	assign: ( url: string ) => window.location.assign( url ),
};
