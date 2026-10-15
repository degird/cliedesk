/**
 * Arrival rules (SEC-17): API calls, the editor's tree model and its JSON form.
 *
 * - GET arrival-rules → {items, fields, channels, sources} (fields: condition field → allowed operators,
 *   `Arrival::FIELDS`; channels and sources: the Channel and ConversationSource enum keys).
 * - POST arrival-rules {name, conditions, actions}; PATCH arrival-rules/{id}; DELETE arrival-rules/{id};
 *   POST arrival-rules/order {ids} → {items}. `conditions` and `actions` travel as JSON strings.
 * - Conditions: groups `{all: [...]}` / `{any: [...]}` (at most 3 levels below the root) and leaves
 *   `{field, op, value}` (value: a string, or a list for in / not_in / between).
 * - Actions: `{block: 'quarantine' | 'drop'}` (drop only when a "sender / domain is" condition is required) or
 *   `{set: {queueId?, teamId?, priority?, productId?, tagIds?, fields?}}`.
 * - Errors: 400 with fields such as `conditions.all.1` (mapped back to the condition) or `actions.block`; 403 for
 *   sort rules without cliedesk_manage_sla_routing.
 */
import { api, queryOptions } from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import type { MatchMode, TreeGroup } from '../components/ConditionGroup';

export interface ArrivalSet {
	queueId?: number;
	teamId?: number;
	priority?: string;
	productId?: number;
	tagIds?: number[];
	fields?: Record< string, unknown >;
}

export type ArrivalActions =
	{ block: 'quarantine' | 'drop' } | { set: ArrivalSet };

export interface ArrivalRule {
	id: number;
	name: string;
	conditions: unknown;
	actions: ArrivalActions | Record< string, unknown >;
	sort: number;
	hits: number;
	lastHitAt: string | null;
	createdBy: number | null;
	updatedAt: string;
}

export type ArrivalFields = Record< string, string[] >;

/** Fallback when the server sends no field list (same as `Arrival::FIELDS`). */
export const ARRIVAL_FIELDS: ArrivalFields = {
	sender: [
		'is',
		'is_not',
		'in',
		'not_in',
		'contains',
		'not_contains',
		'wildcard',
	],
	domain: [ 'is', 'is_not', 'in', 'not_in', 'wildcard' ],
	to: [ 'is', 'is_not', 'in', 'not_in', 'contains', 'wildcard' ],
	original_from: [
		'is',
		'is_not',
		'in',
		'not_in',
		'contains',
		'wildcard',
		'empty',
		'not_empty',
	],
	subject: [
		'contains',
		'not_contains',
		'is',
		'starts_with',
		'wildcard',
		'empty',
	],
	body: [ 'contains', 'not_contains', 'wildcard' ],
	channel: [ 'in', 'not_in' ],
	source: [ 'in', 'not_in' ],
	weekday: [ 'in', 'not_in' ],
	hour: [ 'between' ],
};

export const arrivalKeys = { all: [ 'arrival-rules' ] as const };

export const arrivalQuery = () =>
	queryOptions( {
		queryKey: arrivalKeys.all,
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< {
					items: ArrivalRule[];
					fields: ArrivalFields;
					channels?: string[];
					sources?: string[];
				} >( 'arrival-rules', { signal } )
			).data;
			const fields =
				d?.fields &&
				typeof d.fields === 'object' &&
				! Array.isArray( d.fields ) &&
				Object.keys( d.fields ).length
					? d.fields
					: ARRIVAL_FIELDS;
			const keys = ( v: unknown ): string[] =>
				Array.isArray( v ) ? v.map( String ) : [];
			return {
				items: Array.isArray( d?.items ) ? d.items : [],
				fields,
				channels: keys( d?.channels ),
				sources: keys( d?.sources ),
			};
		},
	} );

// ------------------------------------------------------------------ Tree model.

export interface ALeaf {
	kind: 'leaf';
	id: string;
	field: string;
	op: string;
	/** Text, or a list (in / not_in / between). */
	value: string | string[];
}

/** A stored condition the editor does not know; kept unchanged. */
export interface ARaw {
	kind: 'raw';
	id: string;
	json: unknown;
}

export type ANode = ALeaf | ARaw;
export type AGroup = TreeGroup< ANode >;

/** Deepest group level allowed below the root (server: 3 levels; leaves count as a level). */
export const ARRIVAL_MAX_GROUP_DEPTH = 2;

let seq = 0;
const nextId = () => `a${ ++seq }`;

export type ArrivalValueKind =
	'none' | 'text' | 'list' | 'channels' | 'sources' | 'weekdays' | 'hours';

/**
 * What a condition's value looks like.
 *
 * @param field Field.
 * @param op    Operator.
 */
export function valueKind( field: string, op: string ): ArrivalValueKind {
	if ( op === 'empty' || op === 'not_empty' ) {
		return 'none';
	}
	if ( field === 'hour' ) {
		return 'hours';
	}
	if ( field === 'channel' ) {
		return 'channels';
	}
	if ( field === 'source' ) {
		return 'sources';
	}
	if ( field === 'weekday' ) {
		return 'weekdays';
	}
	return op === 'in' || op === 'not_in' ? 'list' : 'text';
}

/**
 * Default value for a value kind.
 *
 * @param kind Kind.
 */
export function defaultArrivalValue(
	kind: ArrivalValueKind
): string | string[] {
	switch ( kind ) {
		case 'hours':
			return [ '9', '17' ];
		case 'channels':
		case 'sources':
		case 'weekdays':
		case 'list':
			return [];
	}
	return '';
}

/**
 * New condition.
 *
 * @param field  Field.
 * @param fields Allowed operators per field.
 */
export function newArrivalLeaf(
	field = 'sender',
	fields: ArrivalFields = ARRIVAL_FIELDS
): ALeaf {
	const op = fields[ field ]?.[ 0 ] ?? 'is';
	return {
		kind: 'leaf',
		id: nextId(),
		field,
		op,
		value: defaultArrivalValue( valueKind( field, op ) ),
	};
}

/**
 * New group.
 *
 * @param mode     All or any.
 * @param children Children.
 */
export function newArrivalGroup(
	mode: MatchMode = 'all',
	children: Array< ANode | AGroup > = []
): AGroup {
	return { kind: 'group', id: nextId(), mode, children };
}

/**
 * Editor tree from stored conditions. The root is always a group.
 *
 * @param input  Conditions (object or JSON string).
 * @param fields Allowed operators per field.
 */
export function arrivalFromJson(
	input: unknown,
	fields: ArrivalFields = ARRIVAL_FIELDS
): AGroup {
	let tree = input;
	if ( typeof tree === 'string' ) {
		try {
			tree = JSON.parse( tree );
		} catch {
			tree = null;
		}
	}
	const node = parse( tree, fields );
	if ( node.kind === 'group' ) {
		return node;
	}
	return newArrivalGroup( 'all', [ node ] );
}

function parse( t: unknown, fields: ArrivalFields ): ANode | AGroup {
	if ( ! t || typeof t !== 'object' || Array.isArray( t ) ) {
		return newArrivalGroup();
	}
	const o = t as Record< string, unknown >;
	for ( const mode of [ 'all', 'any' ] as const ) {
		if ( Array.isArray( o[ mode ] ) ) {
			return newArrivalGroup(
				mode,
				( o[ mode ] as unknown[] ).map( ( c ) => parse( c, fields ) )
			);
		}
	}
	const field = String( o.field ?? '' );
	const op = String( o.op ?? '' );
	if ( ! fields[ field ]?.includes( op ) ) {
		return { kind: 'raw', id: nextId(), json: t };
	}
	const kind = valueKind( field, op );
	let value: string | string[] = defaultArrivalValue( kind );
	if ( kind === 'text' ) {
		value = Array.isArray( o.value )
			? String( o.value[ 0 ] ?? '' )
			: String( o.value ?? '' );
	} else if ( kind !== 'none' ) {
		value = ( Array.isArray( o.value ) ? o.value : [ o.value ?? '' ] ).map(
			( v ) => String( v )
		);
	}
	return { kind: 'leaf', id: nextId(), field, op, value };
}

/**
 * Split a typed list ("a@x.com, b@y.com" or one per line).
 *
 * @param text Text.
 */
export function splitList( text: string ): string[] {
	return text
		.split( /[\n,;]+/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
}

/**
 * Stored JSON object of a node.
 *
 * @param node Node.
 */
export function arrivalToObject( node: ANode | AGroup ): unknown {
	if ( node.kind === 'group' ) {
		return { [ node.mode ]: node.children.map( arrivalToObject ) };
	}
	if ( node.kind === 'raw' ) {
		return node.json;
	}
	const kind = valueKind( node.field, node.op );
	if ( kind === 'none' ) {
		return { field: node.field, op: node.op };
	}
	let value: string | string[];
	if ( kind === 'list' ) {
		value = splitList(
			Array.isArray( node.value ) ? node.value.join( '\n' ) : node.value
		);
	} else if ( kind === 'text' ) {
		value = String( node.value ).trim();
	} else {
		value = ( Array.isArray( node.value ) ? node.value : [] ).map( String );
	}
	return { field: node.field, op: node.op, value };
}

/**
 * Server error path of every leaf (`conditions.all.1`, `conditions.all.0.any.2`) → leaf id, and of every group.
 *
 * @param root Root group.
 */
export function errorPaths( root: AGroup ): Record< string, string > {
	const out: Record< string, string > = {};
	const walk = ( g: AGroup, path: string ) => {
		out[ path ] = g.id;
		g.children.forEach( ( c, i ) => {
			const p = `${ path }.${ g.mode }.${ i }`;
			if ( c.kind === 'group' ) {
				walk( c, p );
			} else {
				out[ p ] = c.id;
			}
		} );
	};
	walk( root, 'conditions' );
	return out;
}

/**
 * Whether the conditions require a listed sender or domain (`Arrival::names_senders`): Drop is allowed only then.
 *
 * @param node Node.
 */
export function namesSenders( node: ANode | AGroup ): boolean {
	if ( node.kind === 'group' ) {
		if ( ! node.children.length ) {
			return false;
		}
		return node.mode === 'any'
			? node.children.every( namesSenders )
			: node.children.some( namesSenders );
	}
	if ( node.kind === 'raw' ) {
		return false;
	}
	return (
		( node.field === 'sender' || node.field === 'domain' ) &&
		( node.op === 'is' || node.op === 'in' )
	);
}

/**
 * Client checks before saving: messages by condition id, and under '' for an empty group.
 *
 * @param root Root group.
 */
export function validateArrival( root: AGroup ): Record< string, string > {
	const errors: Record< string, string > = {};
	const walk = ( g: AGroup ) => {
		if ( ! g.children.length ) {
			errors[ '' ] = __(
				'Every group needs at least one condition.',
				'cliedesk'
			);
		}
		for ( const c of g.children ) {
			if ( c.kind === 'group' ) {
				walk( c );
				continue;
			}
			if ( c.kind === 'raw' ) {
				continue;
			}
			const kind = valueKind( c.field, c.op );
			const v = arrivalToObject( c ) as { value?: string | string[] };
			if ( kind === 'none' ) {
				continue;
			}
			if ( kind === 'hours' ) {
				const hours = Array.isArray( v.value ) ? v.value : [];
				if (
					hours.length !== 2 ||
					hours.some(
						( h ) => ! /^\d{1,2}$/.test( h ) || Number( h ) > 23
					)
				) {
					errors[ c.id ] = __(
						'Choose two hours from 0 to 23.',
						'cliedesk'
					);
				}
				continue;
			}
			const empty = Array.isArray( v.value )
				? v.value.length === 0
				: ! v.value;
			if ( empty ) {
				errors[ c.id ] =
					kind === 'text' || kind === 'list'
						? __( 'Enter a value.', 'cliedesk' )
						: __( 'Choose at least one.', 'cliedesk' );
			}
		}
	};
	walk( root );
	return errors;
}

// ------------------------------------------------------------------ Labels.

/**
 * Field label.
 *
 * @param field Field key.
 */
export function arrivalFieldLabel( field: string ): string {
	const map: Record< string, string > = {
		sender: __( 'Sender email', 'cliedesk' ),
		domain: __( 'Sender domain', 'cliedesk' ),
		to: __( 'Sent to address', 'cliedesk' ),
		original_from: __( 'Original sender (forwarded mail)', 'cliedesk' ),
		subject: __( 'Subject', 'cliedesk' ),
		body: __( 'Message text', 'cliedesk' ),
		channel: __( 'Channel', 'cliedesk' ),
		source: __( 'Source', 'cliedesk' ),
		weekday: __( 'Day of the week', 'cliedesk' ),
		hour: __( 'Hour of the day', 'cliedesk' ),
	};
	return map[ field ] ?? field;
}

/**
 * Operator label.
 *
 * @param op Operator.
 */
export function arrivalOpLabel( op: string ): string {
	const map: Record< string, string > = {
		is: __( 'is', 'cliedesk' ),
		is_not: __( 'is not', 'cliedesk' ),
		in: __( 'is one of', 'cliedesk' ),
		not_in: __( 'is none of', 'cliedesk' ),
		contains: __( 'contains', 'cliedesk' ),
		not_contains: __( 'does not contain', 'cliedesk' ),
		starts_with: __( 'starts with', 'cliedesk' ),
		wildcard: __( 'matches the pattern', 'cliedesk' ),
		empty: __( 'is empty', 'cliedesk' ),
		not_empty: __( 'is not empty', 'cliedesk' ),
		between: __( 'is between', 'cliedesk' ),
	};
	return map[ op ] ?? op.replace( /_/g, ' ' );
}

/**
 * Source label (from inbox/labels.ts; unknown keys are shown as they are).
 */
export { conversationSourceLabel as sourceLabel } from '../inbox/labels';

/**
 * Weekday names, 0 (Sunday) to 6, in the site language.
 */
export function weekdayNames(): string[] {
	const lang =
		( typeof document !== 'undefined' && document.documentElement.lang ) ||
		undefined;
	const names: string[] = [];
	for ( let d = 0; d < 7; d++ ) {
		// 2023-01-01 was a Sunday.
		const date = new Date( Date.UTC( 2023, 0, 1 + d, 12 ) );
		try {
			names.push(
				new Intl.DateTimeFormat( lang, {
					weekday: 'long',
					timeZone: 'UTC',
				} ).format( date )
			);
		} catch {
			names.push( String( d ) );
		}
	}
	return names;
}

/**
 * "Block: Spam" / "Sort: sets queue, priority".
 *
 * @param actions Actions.
 */
export function actionSummary( actions: unknown ): string {
	const a = ( actions ?? {} ) as Record< string, unknown >;
	if ( a.block === 'drop' ) {
		return __( 'Block: drop without a trace', 'cliedesk' );
	}
	if ( a.block === 'quarantine' ) {
		return __( 'Block: send to Spam', 'cliedesk' );
	}
	const set = ( a.set ?? {} ) as Record< string, unknown >;
	const parts: string[] = [];
	if ( set.queueId !== undefined ) {
		parts.push( __( 'queue', 'cliedesk' ) );
	}
	if ( set.teamId !== undefined ) {
		parts.push( __( 'team', 'cliedesk' ) );
	}
	if ( set.priority !== undefined ) {
		parts.push( __( 'priority', 'cliedesk' ) );
	}
	if ( set.productId !== undefined ) {
		parts.push( __( 'product', 'cliedesk' ) );
	}
	if ( Array.isArray( set.tagIds ) && set.tagIds.length ) {
		parts.push( __( 'tags', 'cliedesk' ) );
	}
	if ( set.fields && typeof set.fields === 'object' ) {
		parts.push( __( 'fields', 'cliedesk' ) );
	}
	return sprintf(
		/* translators: %s: what the rule sets, e.g. "queue, priority". */
		__( 'Sort: sets %s', 'cliedesk' ),
		parts.join( ', ' ) || '—'
	);
}

/**
 * Whether a rule sorts (and so needs cliedesk_manage_sla_routing to change).
 *
 * @param actions Actions.
 */
export const isSortRule = ( actions: unknown ): boolean =>
	!! actions &&
	typeof actions === 'object' &&
	'set' in ( actions as Record< string, unknown > );
