/**
 * Saved replies and macros (MAC-01, 02, 07, 08, 12, 16, 18): types, query keys, query options, permission checks,
 * client validation and the request body of the editor.
 *
 * Endpoints (MacroActions.php): GET/POST saved-replies, GET/PATCH/DELETE saved-replies/{id} (PATCH with If-Match),
 * POST saved-replies/{id}/duplicate, GET saved-replies/{id}/versions, POST saved-replies/{id}/restore {version},
 * GET saved-replies/tokens, GET saved-replies/export?format=, POST saved-replies/import {format, data},
 * GET conversations/{id}/macro-steps (MAC-12) and POST messages/{id}/macro-retry (MAC-14).
 *
 * Keys: ['saved-replies', …] (the bulk-bar picker shares the prefix, so a save refreshes it too).
 */
import { api, can, getBoot, queryOptions } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';
import { textToHtml } from '../inbox/html';
import { validateEmail } from '../workspace/forms';

export type ReplyScope = 'personal' | 'team' | 'shared';
export const SCOPES: ReplyScope[] = [ 'personal', 'team', 'shared' ];
export type ReplyStatus = 'active' | 'inactive' | 'archived';
export const STATUSES: ReplyStatus[] = [ 'active', 'inactive', 'archived' ];
export type ReplyMode = 'new' | 'reply' | 'note' | 'bulk';
export const MODES: ReplyMode[] = [ 'new', 'reply', 'note', 'bulk' ];
export type ReplySort = 'manual' | 'name' | 'usage' | 'recent';
export const SORTS: ReplySort[] = [ 'manual', 'name', 'usage', 'recent' ];

/** Macro step types, in the order of ConversationActions::MACRO_STEPS. */
export const STEP_TYPES = [
	'status',
	'priority',
	'type',
	'queue',
	'assign',
	'tags',
	'field',
	'follow',
	'cc',
	'link',
	'task',
	'commerce',
] as const;

/** MAC-03: commerce actions a macro may run (Free; Pro adds its own). */
export const COMMERCE_STEP_ACTIONS = [
	'order.resend_email',
	'order.add_note',
] as const;

/** COM-26: order targets of a commerce step. */
export const ORDER_TARGETS = [ 'linked', 'last', 'last_unfulfilled' ] as const;
export type StepType = ( typeof STEP_TYPES )[ number ];

/** Link types seen from the conversation the macro runs on (LinkType.php). */
export const LINK_TYPES = [
	'related',
	'duplicate_of',
	'part_of',
	'caused_by',
	'blocks',
	'child_of',
	'split_from',
];

export interface MacroStep {
	/** A Free type, or one an extension registered (macros/extensions.ts). */
	type: StepType | ( string & {} );
	status?: string;
	snoozeHours?: number;
	priority?: string;
	typeId?: number;
	queueId?: number | null;
	/** 0 = the person applying the macro, null = unassigned. */
	assigneeId?: number | null;
	teamId?: number;
	add?: number[];
	remove?: number[];
	key?: string;
	value?: string | number | boolean | null;
	email?: string;
	targetId?: number;
	linkType?: string;
	subject?: string;
	/** MAC-03: commerce step. */
	action?: string;
	target?: string;
	orderId?: number;
	text?: string;
	customer?: boolean;
}

export interface Variant {
	language: string;
	subject: string | null;
	html: string;
}

export interface Availability {
	modes?: ReplyMode[];
	channels?: string[];
	typeIds?: number[];
	queueIds?: number[];
	productIds?: number[];
}

export interface Reference {
	type: string;
	id: number;
	name: string;
}

export interface SavedReply {
	id: number;
	uid: string;
	name: string;
	shortcut: string | null;
	category: string | null;
	scope: ReplyScope;
	ownerId: number | null;
	status: ReplyStatus;
	defaultLanguage: string;
	noteHtml: string | null;
	steps: MacroStep[];
	availability: Availability;
	variants: Variant[];
	sort: number;
	useCount: number;
	lastUsedAt: string | null;
	version: number;
	updatedAt: string | null;
	/** Detail only. */
	teamIds?: number[];
	productIds?: number[];
	canEdit?: boolean;
	references?: Reference[];
}

export interface ReplyVersion {
	version: number;
	state: string;
	author_type: number;
	author_id: number | null;
	diff_summary: string | null;
	created_at: string;
}

export interface ListFilters {
	q: string;
	status: ReplyStatus | 'all';
	category: string;
	sort: ReplySort;
}

export const replyKeys = {
	all: [ 'saved-replies' ] as const,
	list: ( f: ListFilters ) => [ 'saved-replies', 'manage', f ] as const,
	categories: [ 'saved-replies', 'categories' ] as const,
	detail: ( id: number ) => [ 'saved-replies', 'detail', id ] as const,
	versions: ( id: number ) => [ 'saved-replies', 'versions', id ] as const,
	tokens: [ 'saved-replies', 'tokens' ] as const,
};

export const replyListQuery = ( f: ListFilters ) =>
	queryOptions( {
		queryKey: replyKeys.list( f ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: SavedReply[] } >( 'saved-replies', {
					query: {
						q: f.q.trim() || undefined,
						status: f.status,
						category: f.category || undefined,
						sort: f.sort,
						limit: 1000,
					},
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

/** Every folder in use (for the folder filter). */
export const categoriesQuery = () =>
	queryOptions( {
		queryKey: replyKeys.categories,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: SavedReply[] } >( 'saved-replies', {
					query: { status: 'all', sort: 'name', limit: 1000 },
					signal,
				} )
			).data?.items;
			return folderOptions(
				( Array.isArray( items ) ? items : [] ).map(
					( r ) => r.category
				)
			);
		},
		staleTime: 60 * 1000,
	} );

export const replyQuery = ( id: number ) =>
	queryOptions( {
		queryKey: replyKeys.detail( id ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< SavedReply >( `saved-replies/${ id }`, {
					signal,
				} )
			).data,
	} );

export const versionsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: replyKeys.versions( id ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: ReplyVersion[] } >(
					`saved-replies/${ id }/versions`,
					{ signal }
				)
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

export const tokensQuery = () =>
	queryOptions( {
		queryKey: replyKeys.tokens,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: string[] } >( 'saved-replies/tokens', {
					signal,
				} )
			).data?.items;
			return Array.isArray( items )
				? items.filter( ( t ) => typeof t === 'string' )
				: [];
		},
		staleTime: 5 * 60 * 1000,
	} );

/**
 * Every folder and parent folder of a list of categories (`a::b` nests `b` in `a`), sorted.
 *
 * @param categories Categories.
 */
export function folderOptions(
	categories: Array< string | null | undefined >
): string[] {
	const out = new Set< string >();
	for ( const c of categories ) {
		if ( ! c ) {
			continue;
		}
		const parts = c.split( '::' ).map( ( p ) => p.trim() );
		for ( let i = 1; i <= parts.length; i++ ) {
			out.add( parts.slice( 0, i ).join( '::' ) );
		}
	}
	return [ ...out ].sort( ( a, b ) => a.localeCompare( b ) );
}

/**
 * Folder path for display: `a::b` → `a / b`.
 *
 * @param category Category.
 */
export const folderLabel = ( category: string ): string =>
	category
		.split( '::' )
		.map( ( p ) => p.trim() )
		.join( ' / ' );

const CAP_CREATE = 'cliedesk_create_saved_replies';
const CAP_TEAM = 'cliedesk_manage_team_replies';
const CAP_SHARED = 'cliedesk_manage_shared_replies';

/**
 * Whether the user may create or move a reply to a scope (SavedReplies::can_edit).
 *
 * @param scope Scope.
 */
export function canUseScope( scope: ReplyScope ): boolean {
	if ( scope === 'personal' ) {
		return can( CAP_CREATE );
	}
	if ( scope === 'team' ) {
		return can( CAP_TEAM ) || can( CAP_SHARED );
	}
	return can( CAP_SHARED );
}

/** Whether the user may create any saved reply. */
export const canCreateReplies = (): boolean => SCOPES.some( canUseScope );

/** Import and export (saved_reply.import / export). */
export const canTransfer = (): boolean => can( CAP_SHARED );

/**
 * Whether the user may change a reply (the server says so in the detail as `canEdit`).
 *
 * @param r Reply.
 */
export function canEditReply(
	r: Pick< SavedReply, 'scope' | 'ownerId' > & { canEdit?: boolean }
): boolean {
	if ( typeof r.canEdit === 'boolean' ) {
		return r.canEdit;
	}
	if ( r.scope === 'personal' ) {
		return r.ownerId === getBoot().user?.id && can( CAP_CREATE );
	}
	return canUseScope( r.scope );
}

/**
 * Scope for a copy: the original's when allowed, else the first allowed.
 *
 * @param scope Original scope.
 */
export function copyScope( scope: ReplyScope ): ReplyScope | null {
	if ( canUseScope( scope ) ) {
		return scope;
	}
	return SCOPES.find( canUseScope ) ?? null;
}

export function scopeLabel( s: string ): string {
	switch ( s ) {
		case 'personal':
			return __( 'Personal', 'cliedesk' );
		case 'team':
			return __( 'Team', 'cliedesk' );
		case 'shared':
			return __( 'Shared', 'cliedesk' );
	}
	return s;
}

export function statusLabel( s: string ): string {
	switch ( s ) {
		case 'active':
			return __( 'Active', 'cliedesk' );
		case 'inactive':
			return __( 'Inactive', 'cliedesk' );
		case 'archived':
			return __( 'Archived', 'cliedesk' );
		case 'all':
			return __( 'All', 'cliedesk' );
	}
	return s;
}

export function sortLabel( s: ReplySort ): string {
	switch ( s ) {
		case 'manual':
			return __( 'Manual order', 'cliedesk' );
		case 'name':
			return __( 'Name', 'cliedesk' );
		case 'usage':
			return __( 'Most used', 'cliedesk' );
		case 'recent':
			return __( 'Recently used', 'cliedesk' );
	}
	return s;
}

export function modeLabel( m: ReplyMode ): string {
	switch ( m ) {
		case 'new':
			return __( 'New conversation', 'cliedesk' );
		case 'reply':
			return __( 'Reply', 'cliedesk' );
		case 'note':
			return __( 'Internal note', 'cliedesk' );
		case 'bulk':
			return __( 'Bulk actions', 'cliedesk' );
	}
	return m;
}

export { stepLabel } from './stepLabel';

/**
 * A new step with sensible defaults.
 *
 * @param type Step type.
 */
export function newStep( type: StepType ): MacroStep {
	switch ( type ) {
		case 'priority':
			return { type, priority: 'normal' };
		case 'queue':
			return { type, queueId: null };
		case 'assign':
		case 'task':
			return type === 'task'
				? { type, subject: '', assigneeId: 0 }
				: { type, assigneeId: 0 };
		case 'tags':
			return { type, add: [], remove: [] };
		case 'link':
			return { type, linkType: 'related' };
		case 'commerce':
			return {
				type,
				action: 'order.resend_email',
				target: 'linked',
				email: 'confirmation',
			};
		default:
			return { type };
	}
}

const pick = < K extends keyof MacroStep >(
	s: MacroStep,
	keys: K[]
): MacroStep => {
	const out: MacroStep = { type: s.type };
	for ( const k of keys ) {
		if ( s[ k ] !== undefined ) {
			out[ k ] = s[ k ];
		}
	}
	return out;
};

/**
 * Only the inputs the step's Action takes (the schema refuses others).
 *
 * @param s Step.
 */
export function cleanStep( s: MacroStep ): MacroStep {
	switch ( s.type ) {
		case 'status':
			return pick( s, [ 'status', 'snoozeHours' ] );
		case 'priority':
			return pick( s, [ 'priority' ] );
		case 'type':
			return pick( s, [ 'typeId' ] );
		case 'queue':
			return { type: s.type, queueId: s.queueId ?? null };
		case 'assign':
			return pick( s, [ 'assigneeId', 'teamId' ] );
		case 'tags':
			return {
				type: s.type,
				...( s.add?.length ? { add: s.add } : {} ),
				...( s.remove?.length ? { remove: s.remove } : {} ),
			};
		case 'field':
			return pick( s, [ 'key', 'value' ] );
		case 'cc':
			return { type: s.type, email: ( s.email ?? '' ).trim() };
		case 'link':
			return pick( s, [ 'targetId', 'linkType' ] );
		case 'task':
			return {
				...pick( s, [ 'assigneeId' ] ),
				subject: ( s.subject ?? '' ).trim(),
			};
		case 'commerce':
			return s.action === 'order.add_note'
				? {
						...pick( s, [ 'action', 'target', 'orderId' ] ),
						text: ( s.text ?? '' ).trim(),
						customer: !! s.customer,
					}
				: pick( s, [ 'action', 'target', 'orderId', 'email' ] );
	}
	return { type: s.type };
}

/**
 * What is missing in a step, or null.
 *
 * @param s Step.
 */
export function stepError( s: MacroStep ): string | null {
	switch ( s.type ) {
		case 'status':
			return s.status ? null : __( 'Choose a status.', 'cliedesk' );
		case 'priority':
			return s.priority ? null : __( 'Choose a priority.', 'cliedesk' );
		case 'type':
			return s.typeId ? null : __( 'Choose a type.', 'cliedesk' );
		case 'assign':
			return s.assigneeId !== undefined || s.teamId
				? null
				: __( 'Choose who to assign.', 'cliedesk' );
		case 'tags':
			return s.add?.length || s.remove?.length
				? null
				: __( 'Choose a tag to add or remove.', 'cliedesk' );
		case 'field':
			return s.key ? null : __( 'Choose a field.', 'cliedesk' );
		case 'cc':
			return ( s.email ?? '' ).trim()
				? validateEmail( s.email ?? '' )
				: __( 'Enter a valid email address.', 'cliedesk' );
		case 'link':
			return s.targetId && s.targetId > 0
				? null
				: __( 'Enter the ID of the conversation to link.', 'cliedesk' );
		case 'task':
			return ( s.subject ?? '' ).trim()
				? null
				: __( 'Enter a subject for the task.', 'cliedesk' );
		case 'commerce':
			if ( s.action === 'order.add_note' ) {
				return ( s.text ?? '' ).trim()
					? null
					: __( 'Write the order note.', 'cliedesk' );
			}
			return s.email ? null : __( 'Choose the email.', 'cliedesk' );
	}
	return null;
}

/** One language version of the reply in the editor (plain text, as in the composer). */
export interface VariantForm {
	language: string;
	subject: string;
	text: string;
}

export interface ReplyForm {
	name: string;
	/** Without the leading `!`. */
	shortcut: string;
	category: string;
	scope: ReplyScope;
	status: ReplyStatus;
	defaultLanguage: string;
	variants: VariantForm[];
	note: string;
	steps: MacroStep[];
	modes: ReplyMode[];
	channels: string[];
	typeIds: number[];
	queueIds: number[];
	availabilityProductIds: number[];
	teamIds: number[];
	productIds: number[];
}

export const SHORTCUT = /^[a-z0-9][a-z0-9_-]{0,62}$/;
export const LANGUAGE = /^([a-z]{2,3}(_[A-Z]{2})?)?$/;

/**
 * Plain text → HTML like the composer, keeping the quotes of token fallbacks (`{x | "y"}`) readable for the
 * renderer.
 *
 * @param text Text.
 */
export function replyTextToHtml( text: string ): string {
	return textToHtml( text ).replace( /\{[^{}]*\}/g, ( m ) =>
		m.replace( /&quot;/g, '"' )
	);
}

/**
 * Client checks; keys are the form field ids' suffixes (and the API's field names).
 *
 * @param f Form.
 */
export function validateReply( f: ReplyForm ): Record< string, string > {
	const out: Record< string, string > = {};
	if ( ! f.name.trim() ) {
		out.name = __( 'Enter a name.', 'cliedesk' );
	}
	const shortcut = f.shortcut.trim().replace( /^!/, '' );
	if ( shortcut && ! SHORTCUT.test( shortcut ) ) {
		out.shortcut = __(
			'Use lowercase letters, numbers, - and _ only, starting with a letter or number.',
			'cliedesk'
		);
	}
	if ( f.scope === 'team' && ! f.teamIds.length ) {
		out.teamIds = __( 'Choose at least one team.', 'cliedesk' );
	}
	const seen = new Set< string >();
	f.variants.forEach( ( v, i ) => {
		if ( seen.has( v.language ) ) {
			out[ `variants.${ i }.language` ] = __(
				'This language already has a version.',
				'cliedesk'
			);
		}
		seen.add( v.language );
	} );
	if (
		! f.variants.some( ( v ) => v.text.trim() ) &&
		! f.note.trim() &&
		! f.steps.length
	) {
		out[ 'variants.0.text' ] = __(
			'Enter the reply text, a note or at least one action.',
			'cliedesk'
		);
	}
	f.steps.forEach( ( s, i ) => {
		const e = stepError( s );
		if ( e ) {
			out[ `steps.${ i }` ] = e;
		}
	} );
	return out;
}

/**
 * Request body of a save (every field: the PATCH replaces the reply).
 *
 * @param f Form.
 */
export function replyPayload( f: ReplyForm ): Record< string, unknown > {
	const availability: Availability = {};
	if ( f.modes.length ) {
		availability.modes = f.modes;
	}
	if ( f.channels.length ) {
		availability.channels = f.channels;
	}
	if ( f.typeIds.length ) {
		availability.typeIds = f.typeIds;
	}
	if ( f.queueIds.length ) {
		availability.queueIds = f.queueIds;
	}
	if ( f.availabilityProductIds.length ) {
		availability.productIds = f.availabilityProductIds;
	}
	const shortcut = f.shortcut.trim().replace( /^!/, '' );
	return {
		name: f.name.trim(),
		shortcut: shortcut || null,
		category: f.category.trim() || null,
		scope: f.scope,
		status: f.status,
		defaultLanguage: f.defaultLanguage,
		noteHtml: f.note.trim() ? replyTextToHtml( f.note ) : null,
		variants: f.variants
			.filter( ( v ) => v.text.trim() || v.subject.trim() )
			.map( ( v ) => ( {
				language: v.language,
				subject: v.subject.trim() || null,
				html: v.text.trim() ? replyTextToHtml( v.text ) : '',
			} ) ),
		steps: f.steps.map( cleanStep ),
		availability,
		teamIds: f.scope === 'team' ? f.teamIds : [],
		productIds: f.productIds,
	};
}

/**
 * Empty form (a new personal reply when allowed).
 *
 * @param language Default language.
 */
export function emptyForm( language = '' ): ReplyForm {
	return {
		name: '',
		shortcut: '',
		category: '',
		scope: SCOPES.find( canUseScope ) ?? 'personal',
		status: 'active',
		defaultLanguage: language,
		variants: [ { language, subject: '', text: '' } ],
		note: '',
		steps: [],
		modes: [],
		channels: [],
		typeIds: [],
		queueIds: [],
		availabilityProductIds: [],
		teamIds: [],
		productIds: [],
	};
}

/**
 * Editor form of a stored reply.
 *
 * @param r      Reply.
 * @param toText HTML → plain text.
 */
export function formOf(
	r: SavedReply,
	toText: ( html: string ) => string
): ReplyForm {
	const a = r.availability ?? {};
	return {
		name: r.name,
		shortcut: ( r.shortcut ?? '' ).replace( /^!/, '' ),
		category: r.category ?? '',
		scope: r.scope,
		status: r.status,
		defaultLanguage: r.defaultLanguage ?? '',
		variants: r.variants.length
			? r.variants.map( ( v ) => ( {
					language: v.language,
					subject: v.subject ?? '',
					text: toText( v.html ),
				} ) )
			: [ { language: r.defaultLanguage ?? '', subject: '', text: '' } ],
		note: r.noteHtml ? toText( r.noteHtml ) : '',
		steps: Array.isArray( r.steps ) ? r.steps : [],
		modes: a.modes ?? [],
		channels: a.channels ?? [],
		typeIds: a.typeIds ?? [],
		queueIds: a.queueIds ?? [],
		availabilityProductIds: a.productIds ?? [],
		teamIds: r.teamIds ?? [],
		productIds: r.productIds ?? [],
	};
}

/**
 * Save text as a file.
 *
 * @param filename File name.
 * @param text     Content.
 * @param type     Media type.
 */
export function downloadFile(
	filename: string,
	text: string,
	type: string
): void {
	const url = URL.createObjectURL( new Blob( [ text ], { type } ) );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild( a );
	a.click();
	a.remove();
	window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
}
