/**
 * CRM (organizations, notes, duplicates and contact merge): types, query keys, query options and labels.
 *
 * Keys: ['organizations', 'list', q], ['organization', id, 'detail'], ['organization', id, 'notes'],
 * ['contact', id, 'notes'], ['contact', id, 'merges'], ['contact', id, 'conversations'],
 * ['contacts', 'duplicates', contactId | 'all'], ['contact-merge', target, source].
 * The change feed invalidates ['organizations'] and ['organization', id] (entity type 3), and ['contacts'] and
 * ['contact', id] (entity type 2), which also covers notes, merges and duplicates (core.ts).
 */
import { api, queryOptions } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';
import type { Contact, StatusRef, TagRef } from '../inbox/api';

// ------------------------------------------------------------------ Organizations.

export interface Organization {
	id: number;
	uid: string;
	name: string;
	parentId: number | null;
	parentName: string | null;
	defaultTeamId: number | null;
	ownerId: number | null;
	propagateTags: boolean;
	/** PRT-17: what members see in the portal (null: workspace default). */
	portalAccess?: PortalAccess | null;
	domains: string[];
	memberCount: number;
	childCount: number;
	version: number;
	createdAt: string;
	updatedAt: string;
}

export interface OrgMember {
	contactId: number;
	displayName: string;
	isPrimary: boolean;
	role: string | null;
	/** PRT-18: may reply for the organization in the portal. */
	canReply?: boolean;
}

export interface PortalAccess {
	view: 'own' | 'full' | 'custom';
	children: boolean;
	excludeTypes: number[];
	excludeQueues: number[];
}

export interface OrganizationDetail extends Organization {
	members: OrgMember[];
	children: Array< { id: number; name: string } >;
	tags: TagRef[];
}

/** A contact's membership (GET contacts/{id}, members endpoints). */
export interface Membership {
	id: number;
	name: string;
	isPrimary: boolean;
	role: string | null;
}

export interface OrgInput {
	name: string;
	parentId: number | null;
	defaultTeamId: number | null;
	ownerId: number | null;
	propagateTags: boolean;
	portalAccess?: PortalAccess | null;
	domains: string[];
}

export const orgKeys = {
	all: [ 'organizations' ] as const,
	list: ( q: string ) => [ 'organizations', 'list', q ] as const,
	detail: ( id: number ) => [ 'organization', id, 'detail' ] as const,
};

export const ORG_PAGE_SIZE = 50;

export { organizationsEnabled } from './settings';

/**
 * Organization with safe defaults.
 *
 * @param o Organization from the API.
 */
export function normaliseOrg< T extends Organization >( o: T ): T {
	return {
		...o,
		domains: Array.isArray( o.domains ) ? o.domains : [],
		parentId: o.parentId ?? null,
		parentName: o.parentName ?? null,
		defaultTeamId: o.defaultTeamId ?? null,
		ownerId: o.ownerId ?? null,
		propagateTags: !! o.propagateTags,
		memberCount: o.memberCount ?? 0,
		childCount: o.childCount ?? 0,
	};
}

/**
 * One page of organizations (keyset, newest first).
 *
 * @param q      Search (name or domain).
 * @param cursor Cursor.
 * @param signal Abort signal.
 * @param limit  Page size.
 */
export async function fetchOrgsPage(
	q: string,
	cursor: string | null,
	signal?: AbortSignal,
	limit = ORG_PAGE_SIZE
): Promise< { items: Organization[]; nextCursor: string | null } > {
	const r = await api.get< {
		items: Organization[];
		nextCursor: string | null;
	} >( 'organizations', {
		query: {
			q: q.trim() || undefined,
			limit,
			cursor: cursor ?? undefined,
		},
		signal,
	} );
	return {
		items: ( r.data?.items ?? [] ).map( normaliseOrg ),
		nextCursor: r.data?.nextCursor ?? null,
	};
}

export const orgQuery = ( id: number ) =>
	queryOptions( {
		queryKey: orgKeys.detail( id ),
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< OrganizationDetail >( `organizations/${ id }`, {
					signal,
				} )
			).data;
			return normaliseOrg( {
				...d,
				members: Array.isArray( d?.members ) ? d.members : [],
				children: Array.isArray( d?.children ) ? d.children : [],
				tags: Array.isArray( d?.tags ) ? d.tags : [],
			} );
		},
	} );

/**
 * Field errors of a failed save, split into form fields and per-domain messages ("domains.1").
 *
 * @param fields Field errors from the API.
 * @param sent   Domains sent with the request (the indexes refer to this list).
 */
export function orgErrors(
	fields: Record< string, string >,
	sent: string[]
): { form: Record< string, string >; domains: Record< string, string > } {
	const form: Record< string, string > = {};
	const domains: Record< string, string > = {};
	for ( const [ k, msg ] of Object.entries( fields ) ) {
		const m = /^domains[.[](\d+)\]?$/.exec( k );
		const domain = m ? sent[ Number( m[ 1 ] ) ] : undefined;
		if ( domain !== undefined ) {
			domains[ domain ] = msg;
		} else {
			form[ k.replace( /^values\./, '' ) ] = msg;
		}
	}
	return { form, domains };
}

/**
 * Domain typed by the agent: lower case, without scheme, "www." or "@" (the server normalises again).
 *
 * @param input Input.
 */
export function cleanDomain( input: string ): string {
	return input
		.trim()
		.toLowerCase()
		.replace( /^[a-z]+:\/\//, '' )
		.replace( /^.*@/, '' )
		.replace( /^www\./, '' )
		.replace( /\/.*$/, '' );
}

// ------------------------------------------------------------------ Notes.

export type NoteEntity = 'contact' | 'organization';

export interface Note {
	id: number;
	entity: NoteEntity;
	entityId: number;
	body: string;
	pinned: boolean;
	authorId: number | null;
	authorName: string | null;
	createdAt: string;
	updatedAt: string;
}

export const NOTE_MAX = 10000;

export const noteKeys = {
	list: ( entity: NoteEntity, id: number ) =>
		[ entity, id, 'notes' ] as const,
};

/**
 * Pinned notes first, then newest first.
 *
 * @param notes Notes.
 */
export function sortNotes( notes: Note[] ): Note[] {
	return [ ...notes ].sort(
		( a, b ) =>
			Number( b.pinned ) - Number( a.pinned ) ||
			String( b.createdAt ).localeCompare( String( a.createdAt ) ) ||
			b.id - a.id
	);
}

export const notesQuery = ( entity: NoteEntity, id: number ) =>
	queryOptions( {
		queryKey: noteKeys.list( entity, id ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: Note[] } >( 'notes', {
					query: { entity, entityId: id },
					signal,
				} )
			).data?.items;
			return sortNotes( Array.isArray( items ) ? items : [] );
		},
	} );

// ------------------------------------------------------------------ Duplicates and merge.

export type DuplicateReason =
	| 'shared_identity'
	| 'same_number'
	| 'email_variant'
	| 'phone_suffix'
	| 'name_city'
	| 'same_name';

export interface DuplicateContact {
	id: number;
	displayName: string;
}

export interface DuplicatePair {
	id: number;
	contacts: [ DuplicateContact, DuplicateContact ];
	reason: DuplicateReason | string;
	score: number;
	foundAt: string;
}

/**
 * Why two contacts look like duplicates.
 *
 * @param reason Reason code.
 */
export function reasonLabel( reason: string ): string {
	switch ( reason ) {
		case 'shared_identity':
			return __( 'Same email address or channel account', 'cliedesk' );
		case 'same_number':
			return __( 'Same phone number', 'cliedesk' );
		case 'email_variant':
			return __( 'Similar email address', 'cliedesk' );
		case 'phone_suffix':
			return __( 'Phone numbers end the same', 'cliedesk' );
		case 'name_city':
			return __( 'Same name and city', 'cliedesk' );
		case 'same_name':
			return __( 'Same name', 'cliedesk' );
	}
	return reason;
}

export const duplicateKeys = {
	list: ( contactId: number | null ) =>
		[ 'contacts', 'duplicates', contactId ?? 'all' ] as const,
};

/**
 * One page of possible duplicates (keyset).
 *
 * @param cursor Cursor.
 * @param signal Abort signal.
 * @param limit  Page size.
 */
export async function fetchDuplicatesPage(
	cursor: string | null,
	signal?: AbortSignal,
	limit = 50
): Promise< { items: DuplicatePair[]; nextCursor: string | null } > {
	const d = (
		await api.get< { items: DuplicatePair[]; nextCursor: string | null } >(
			'contacts/duplicates',
			{ query: { limit, cursor: cursor ?? undefined }, signal }
		)
	).data;
	return {
		items: ( Array.isArray( d?.items ) ? d.items : [] ).filter(
			( p ) => Array.isArray( p.contacts ) && p.contacts.length === 2
		),
		nextCursor: d?.nextCursor ?? null,
	};
}

export const duplicatesQuery = ( contactId: number | null, limit = 50 ) =>
	queryOptions( {
		queryKey: duplicateKeys.list( contactId ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: DuplicatePair[] } >(
					'contacts/duplicates',
					{
						query: {
							contactId: contactId ?? undefined,
							limit,
						},
						signal,
					}
				)
			).data?.items;
			return ( Array.isArray( items ) ? items : [] ).filter(
				( p ) => Array.isArray( p.contacts ) && p.contacts.length === 2
			);
		},
	} );

export interface MergeConflict {
	name: string;
	target: string | number | null;
	source: string | number | null;
}

export interface FieldConflict {
	fieldId: number;
	target: unknown;
	source: unknown;
}

export interface ContactMergePreview {
	target: Contact;
	source: Contact;
	identities: unknown[];
	conversations: number;
	participations: number;
	events: number;
	notes: number;
	tags: number;
	organizations: Membership[];
	conflicts: MergeConflict[];
	fieldConflicts: FieldConflict[];
	bothWpUsers: boolean;
}

export interface ContactMergeResult {
	mergeId: number;
	target: number;
	source: number;
	contact: Contact;
}

export interface MergeChoice {
	keep: 'target' | 'source';
}

export const mergePreviewQuery = ( target: number, source: number ) =>
	queryOptions( {
		queryKey: [ 'contact-merge', target, source ] as const,
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< ContactMergePreview >(
					`contacts/${ target }/merge`,
					{ query: { sourceId: source }, signal }
				)
			).data;
			return {
				...d,
				identities: Array.isArray( d?.identities ) ? d.identities : [],
				organizations: Array.isArray( d?.organizations )
					? d.organizations
					: [],
				conflicts: Array.isArray( d?.conflicts ) ? d.conflicts : [],
				fieldConflicts: Array.isArray( d?.fieldConflicts )
					? d.fieldConflicts
					: [],
				conversations: d?.conversations ?? 0,
				participations: d?.participations ?? 0,
				events: d?.events ?? 0,
				notes: d?.notes ?? 0,
				tags: d?.tags ?? 0,
				bothWpUsers: !! d?.bothWpUsers,
			} as ContactMergePreview;
		},
		staleTime: 0,
		retry: false,
	} );

/**
 * Label of a choosable contact attribute in a merge.
 *
 * @param name Attribute.
 */
export function attributeLabel( name: string ): string {
	switch ( name ) {
		case 'displayName':
			return __( 'Name', 'cliedesk' );
		case 'language':
			return __( 'Language', 'cliedesk' );
		case 'timezone':
			return __( 'Time zone', 'cliedesk' );
		case 'country':
			return __( 'Country', 'cliedesk' );
		case 'city':
			return __( 'City', 'cliedesk' );
		case 'ownerId':
			return __( 'Owner', 'cliedesk' );
		case 'name':
			return __( 'Name', 'cliedesk' );
		case 'defaultTeamId':
			return __( 'Default team', 'cliedesk' );
		case 'parentId':
			return __( 'Parent organization', 'cliedesk' );
	}
	return name;
}

/**
 * A merge value as text (field values may be lists or objects).
 *
 * @param v Value.
 */
export function valueText( v: unknown ): string {
	if ( v === null || v === undefined || v === '' ) {
		return __( '(empty)', 'cliedesk' );
	}
	if ( Array.isArray( v ) ) {
		return v.map( valueText ).join( ', ' );
	}
	if ( typeof v === 'object' ) {
		return JSON.stringify( v );
	}
	return String( v );
}

export interface MergeRecord {
	id: number;
	sourceIds: number[];
	createdAt: string;
	undoUntil: string | null;
	undoneAt: string | null;
	canUndo: boolean;
}

/**
 * Merges into a contact or an organization (GET contacts/{id}/merges, organizations/{id}/merges).
 *
 * @param id   Record id.
 * @param kind contact | organization.
 */
export const mergesQuery = (
	id: number,
	kind: 'contact' | 'organization' = 'contact'
) =>
	queryOptions( {
		queryKey: [ kind, id, 'merges' ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: MergeRecord[] } >(
					`${
						kind === 'contact' ? 'contacts' : 'organizations'
					}/${ id }/merges`,
					{ signal }
				)
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

// ------------------------------------------------------------------ Contact conversations (CRM-19).

export interface ContactConversation {
	id: number;
	number: number;
	subject: string;
	status: StatusRef | null;
	currentChannel: string;
	updatedAt: string;
	role: 'requester' | 'cc';
}

export interface ContactConversationsPage {
	items: ContactConversation[];
	nextCursor: string | null;
	total: number;
}

export const RECENT_CONVERSATIONS = 5;

/**
 * One page of a contact's conversations (newest first).
 *
 * @param contactId Contact.
 * @param cursor    Cursor.
 * @param limit     Page size.
 * @param signal    Abort signal.
 */
export async function fetchContactConversations(
	contactId: number,
	cursor: string | null,
	limit: number,
	signal?: AbortSignal
): Promise< ContactConversationsPage > {
	const d = (
		await api.get< ContactConversationsPage >(
			`contacts/${ contactId }/conversations`,
			{ query: { limit, cursor: cursor ?? undefined }, signal }
		)
	).data;
	const items = Array.isArray( d?.items ) ? d.items : [];
	return {
		items,
		nextCursor: d?.nextCursor ?? null,
		total: typeof d?.total === 'number' ? d.total : items.length,
	};
}

// ------------------------------------------------------------------ Organization merge (CRM-15).

export interface OrgMergePreview {
	target: Organization;
	source: Organization;
	members: number | unknown[];
	domains: string[];
	children: number | unknown[];
	conversations: number;
	notes: number;
	conflicts: MergeConflict[];
	fieldConflicts: FieldConflict[];
}

export interface OrgMergeResult {
	mergeId: number;
	target: number;
	source: number;
	organization: Organization;
}

/**
 * A count that the API may send as a number or as the list itself.
 *
 * @param v Number or list.
 */
export const countOf = ( v: unknown ): number =>
	Array.isArray( v ) ? v.length : Number( v ) || 0;

export const orgMergePreviewQuery = ( target: number, source: number ) =>
	queryOptions( {
		queryKey: [ 'organization-merge', target, source ] as const,
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< OrgMergePreview >(
					`organizations/${ target }/merge`,
					{ query: { sourceId: source }, signal }
				)
			).data;
			return {
				...d,
				domains: Array.isArray( d?.domains ) ? d.domains : [],
				members: countOf( d?.members ),
				children: countOf( d?.children ),
				conversations: d?.conversations ?? 0,
				notes: d?.notes ?? 0,
				conflicts: Array.isArray( d?.conflicts ) ? d.conflicts : [],
				fieldConflicts: Array.isArray( d?.fieldConflicts )
					? d.fieldConflicts
					: [],
			} as OrgMergePreview;
		},
		staleTime: 0,
		retry: false,
	} );
