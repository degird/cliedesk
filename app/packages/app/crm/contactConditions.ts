/**
 * Contact filter conditions (CRM-36/37): the editor's tree model and its JSON form, in the same shape as the
 * conversation view conditions (inbox/conditions.ts): groups `{all: [...]}` / `{any: [...]}` (nested) and leaves
 * `{field, op, value, unit?}` plus `children` (organization), `type` and `withinDays` (event). Leaves the editor does
 * not know are kept unchanged ("raw"), so editing a segment never drops conditions.
 */
import { __, sprintf } from '@wordpress/i18n';
import type { FieldDef } from '../inbox/api';

export type GroupMode = 'all' | 'any';

export interface Extra {
	unit?: 'hours' | 'days';
	children?: boolean;
	type?: string;
	withinDays?: number | '';
}

export interface CLeaf {
	kind: 'leaf';
	id: string;
	field: string;
	op: string;
	value: unknown;
	extra: Extra;
}

export interface CRaw {
	kind: 'raw';
	id: string;
	json: unknown;
}

export interface CGroup {
	kind: 'group';
	id: string;
	mode: GroupMode;
	children: CNode[];
}

export type CNode = CLeaf | CGroup | CRaw;

export type ValueKind =
	| 'none'
	| 'text'
	| 'codes'
	| 'kinds'
	| 'bool'
	| 'owners'
	| 'orgs'
	| 'tags'
	| 'segments'
	| 'number'
	| 'range'
	| 'amount'
	| 'date'
	| 'dates'
	| 'options';

export interface Spec {
	ops: string[];
	value: ( op: string ) => ValueKind;
}

const EMPTY = [ 'empty', 'not_empty' ];
const orNone =
	( kind: ValueKind ) =>
	( op: string ): ValueKind =>
		EMPTY.includes( op ) ? 'none' : kind;

const TEXT_OPS = [
	'is',
	'is_not',
	'contains',
	'not_contains',
	'starts_with',
	'empty',
	'not_empty',
];
const NUMBER_OPS = [ 'is', 'gt', 'lt', 'gte', 'lte', 'between' ];
export const DATE_OPS = [
	'older_than',
	'within',
	'before',
	'after',
	'between',
	'empty',
	'not_empty',
];
export const EVENT_COUNT_OPS = [
	'count_gte',
	'count_gt',
	'count_lt',
	'count_is',
	'count_lte',
];
const EVENT_DATE_OPS = [ 'first', 'last' ].flatMap( ( w ) =>
	[ 'within', 'older_than', 'before', 'after', 'between' ].map(
		( d ) => `${ w }_${ d }`
	)
);

/**
 * Value editor of a date operator.
 *
 * @param op Operator (without first_/last_).
 */
function dateKind( op: string ): ValueKind {
	switch ( op ) {
		case 'older_than':
		case 'within':
			return 'amount';
		case 'before':
		case 'after':
			return 'date';
		case 'between':
			return 'dates';
	}
	return 'none';
}

const numberKind = ( op: string ): ValueKind =>
	op === 'between' ? 'range' : 'number';

export const DATE_FIELDS = [ 'created', 'last_conversation', 'last_seen' ];

export const BASE_FIELDS = [
	'name',
	'email',
	'phone',
	'city',
	'country',
	'language',
	'kind',
	'blocked',
	'owner',
	'organization',
	'tags',
	'segment',
	'created',
	'last_conversation',
	'last_seen',
	'conversations',
	'open_conversation',
	'csat_score',
	'csat_average',
	'event',
];

/** CRM-17: live WooCommerce metrics (offered when WooCommerce is connected). */
export const WOO_METRIC_FIELDS = [
	'metric:order_count',
	'metric:lifetime_value',
	'metric:average_order',
	'metric:open_order_value',
	'metric:first_order',
	'metric:last_order',
	'metric:bought_product',
];

/**
 * Operators and value editors of a condition field.
 *
 * @param field Field (custom fields: `field:{key}`).
 * @param defs  Contact field definitions.
 */
export function contactSpec(
	field: string,
	defs: FieldDef[] = []
): Spec | null {
	if ( field.startsWith( 'field:' ) ) {
		const def = defs.find( ( d ) => d.key === field.slice( 6 ) );
		if ( ! def ) {
			return null;
		}
		return customSpec( def.type );
	}
	if (
		DATE_FIELDS.includes( field ) ||
		field === 'metric:first_order' ||
		field === 'metric:last_order'
	) {
		return { ops: DATE_OPS, value: dateKind };
	}
	switch ( field ) {
		case 'metric:order_count':
		case 'metric:lifetime_value':
		case 'metric:average_order':
		case 'metric:open_order_value':
			return { ops: NUMBER_OPS, value: numberKind };
		case 'metric:bought_product':
			return { ops: [ 'in', 'not_in' ], value: () => 'text' };
		case 'name':
		case 'email':
		case 'phone':
		case 'city':
			return { ops: TEXT_OPS, value: orNone( 'text' ) };
		case 'country':
		case 'language':
			return {
				ops: [ 'in', 'not_in', 'empty', 'not_empty' ],
				value: orNone( 'codes' ),
			};
		case 'kind':
			return { ops: [ 'in' ], value: () => 'kinds' };
		case 'blocked':
		case 'open_conversation':
			return { ops: [ 'is' ], value: () => 'bool' };
		case 'owner':
			return { ops: [ 'in', 'empty' ], value: orNone( 'owners' ) };
		case 'organization':
			return {
				ops: [ 'in', 'empty', 'not_empty' ],
				value: orNone( 'orgs' ),
			};
		case 'tags':
			return { ops: [ 'any', 'all', 'none' ], value: () => 'tags' };
		case 'segment':
			return { ops: [ 'in', 'not_in' ], value: () => 'segments' };
		case 'conversations':
		case 'csat_score':
		case 'csat_average':
			return { ops: NUMBER_OPS, value: numberKind };
		case 'event':
			return {
				ops: [ ...EVENT_COUNT_OPS, ...EVENT_DATE_OPS ],
				value: ( op ) =>
					op.startsWith( 'count_' )
						? 'number'
						: dateKind( op.replace( /^(first|last)_/, '' ) ),
			};
	}
	return null;
}

/**
 * Operators of a custom field by type (as in the conversation view editor, plus the types' own operators).
 *
 * @param type Field type.
 */
function customSpec( type: string ): Spec {
	if ( [ 'number', 'decimal', 'money' ].includes( type ) ) {
		return {
			ops: [
				'is',
				'is_not',
				'gt',
				'lt',
				'gte',
				'lte',
				'between',
				...EMPTY,
			],
			value: ( op ) =>
				EMPTY.includes( op ) ? 'none' : numberKind( op ),
		};
	}
	if ( type === 'boolean' ) {
		return { ops: [ 'is', ...EMPTY ], value: orNone( 'bool' ) };
	}
	if ( type === 'date' || type === 'datetime' ) {
		return { ops: DATE_OPS, value: dateKind };
	}
	if ( type === 'multi_select' ) {
		return {
			ops: [ 'any', 'all', 'none', ...EMPTY ],
			value: orNone( 'options' ),
		};
	}
	if ( type === 'select' || type === 'nested_select' ) {
		return {
			ops: [ 'in', 'not_in', ...EMPTY ],
			value: orNone( 'options' ),
		};
	}
	if ( [ 'user', 'contact', 'record_ref', 'file' ].includes( type ) ) {
		return { ops: EMPTY, value: () => 'none' };
	}
	return { ops: TEXT_OPS, value: orNone( 'text' ) };
}

let seq = 0;
const nextId = () => `k${ ++seq }`;

/**
 * Default value of a value editor.
 *
 * @param kind Kind.
 */
export function defaultValue( kind: ValueKind ): unknown {
	switch ( kind ) {
		case 'none':
			return undefined;
		case 'text':
		case 'number':
		case 'date':
		case 'codes':
			return '';
		case 'amount':
			return 30;
		case 'bool':
			return true;
		case 'range':
		case 'dates':
			return [ '', '' ];
		default:
			return [];
	}
}

/**
 * New leaf for a field, with its first operator.
 *
 * @param field Field.
 * @param defs  Contact field definitions.
 */
export function newLeaf( field = 'name', defs: FieldDef[] = [] ): CLeaf {
	const spec = contactSpec( field, defs );
	const op = spec?.ops[ 0 ] ?? 'is';
	const kind = spec?.value( op ) ?? 'none';
	return {
		kind: 'leaf',
		id: nextId(),
		field,
		op,
		value: defaultValue( kind ),
		extra: {
			...( kind === 'amount' ? { unit: 'days' as const } : {} ),
			...( field === 'event' ? { type: '' } : {} ),
		},
	};
}

/**
 * New group.
 *
 * @param mode     All / any.
 * @param children Children.
 */
export function newGroup(
	mode: GroupMode = 'all',
	children: CNode[] = []
): CGroup {
	return { kind: 'group', id: nextId(), mode, children };
}

/**
 * Editor tree from stored conditions (object or JSON string). The root is always a group.
 *
 * @param input Conditions.
 * @param defs  Contact field definitions.
 */
export function fromJson( input: unknown, defs: FieldDef[] = [] ): CGroup {
	let tree = input;
	if ( typeof tree === 'string' ) {
		try {
			tree = tree.trim() === '' ? {} : JSON.parse( tree );
		} catch {
			tree = {};
		}
	}
	const node = parse( tree, defs );
	return node.kind === 'group' ? node : newGroup( 'all', [ node ] );
}

function parse( t: unknown, defs: FieldDef[] ): CNode {
	if ( ! t || typeof t !== 'object' || Array.isArray( t ) ) {
		return newGroup();
	}
	const o = t as Record< string, unknown >;
	for ( const mode of [ 'all', 'any' ] as GroupMode[] ) {
		if ( Array.isArray( o[ mode ] ) ) {
			return newGroup(
				mode,
				( o[ mode ] as unknown[] ).map( ( c ) => parse( c, defs ) )
			);
		}
	}
	if ( Object.keys( o ).length === 0 ) {
		return newGroup();
	}
	const field = typeof o.field === 'string' ? o.field : '';
	const spec = contactSpec( field, defs );
	const op = typeof o.op === 'string' ? o.op : '';
	if ( ! spec || ! spec.ops.includes( op ) ) {
		return { kind: 'raw', id: nextId(), json: t };
	}
	const kind = spec.value( op );
	let value: unknown = o.value;
	if ( kind === 'none' ) {
		value = undefined;
	} else if (
		[ 'kinds', 'owners', 'orgs', 'tags', 'segments', 'options' ].includes(
			kind
		)
	) {
		if ( value === undefined || value === null ) {
			value = [];
		} else {
			value = Array.isArray( value ) ? value : [ value ];
		}
	} else if ( kind === 'codes' ) {
		value = ( Array.isArray( value ) ? value : [ value ] )
			.filter( ( v ) => v !== null && v !== undefined )
			.join( ', ' );
	} else if ( kind === 'range' || kind === 'dates' ) {
		value = Array.isArray( value )
			? [ String( value[ 0 ] ?? '' ), String( value[ 1 ] ?? '' ) ]
			: [ '', '' ];
	} else if ( kind === 'bool' ) {
		value = value !== false && value !== 'false' && value !== 0;
	} else {
		value = value === null || value === undefined ? '' : value;
	}
	const extra: Extra = {};
	if ( kind === 'amount' ) {
		extra.unit = o.unit === 'days' ? 'days' : 'hours';
	}
	if ( field === 'organization' && o.children ) {
		extra.children = true;
	}
	if ( field === 'event' ) {
		extra.type = typeof o.type === 'string' ? o.type : '';
		if ( o.withinDays !== undefined && o.withinDays !== null ) {
			extra.withinDays = Number( o.withinDays );
		}
	}
	return { kind: 'leaf', id: nextId(), field, op, value, extra };
}

/**
 * Stored JSON object of a node.
 *
 * @param node Node.
 * @param defs Contact field definitions.
 */
export function toObject( node: CNode, defs: FieldDef[] = [] ): unknown {
	if ( node.kind === 'raw' ) {
		return node.json;
	}
	if ( node.kind === 'group' ) {
		return {
			[ node.mode ]: node.children.map( ( c ) => toObject( c, defs ) ),
		};
	}
	const kind = contactSpec( node.field, defs )?.value( node.op ) ?? 'none';
	const out: Record< string, unknown > = { field: node.field, op: node.op };
	if ( node.field === 'event' ) {
		out.type = String( node.extra.type ?? '' ).trim();
	}
	const num = ( v: unknown ) => {
		const n = Number( v );
		return String( v ?? '' ).trim() !== '' && Number.isFinite( n ) ? n : v;
	};
	switch ( kind ) {
		case 'none':
			break;
		case 'number':
		case 'amount':
			out.value = num( node.value );
			break;
		case 'range':
			out.value = ( node.value as unknown[] ).map( num );
			break;
		case 'codes':
			out.value = String( node.value ?? '' )
				.split( /[\s,]+/ )
				.map( ( s ) => s.trim() )
				.filter( Boolean );
			break;
		case 'text':
		case 'date':
			out.value = String( node.value ?? '' ).trim();
			break;
		default:
			out.value = node.value;
	}
	if ( kind === 'amount' ) {
		out.unit = node.extra.unit ?? 'hours';
	}
	if ( node.field === 'organization' && node.extra.children ) {
		out.children = true;
	}
	if (
		node.field === 'event' &&
		node.op.startsWith( 'count_' ) &&
		node.extra.withinDays !== undefined &&
		node.extra.withinDays !== ''
	) {
		out.withinDays = Number( node.extra.withinDays );
	}
	return out;
}

/**
 * Conditions JSON string for the API, or null when there are no conditions.
 *
 * @param root Root group.
 * @param defs Contact field definitions.
 */
export function toJson( root: CGroup, defs: FieldDef[] = [] ): string | null {
	return root.children.length
		? JSON.stringify( toObject( root, defs ) )
		: null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Client checks: leaf id → message.
 *
 * @param node Node.
 * @param defs Contact field definitions.
 * @param out  Accumulator.
 */
export function validateTree(
	node: CNode,
	defs: FieldDef[] = [],
	out: Record< string, string > = {}
): Record< string, string > {
	if ( node.kind === 'group' ) {
		node.children.forEach( ( c ) => validateTree( c, defs, out ) );
		return out;
	}
	if ( node.kind === 'raw' ) {
		return out;
	}
	if (
		node.field === 'event' &&
		! /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(
			String( node.extra.type ?? '' ).trim()
		)
	) {
		// Shown on the event type field.
		out[ `${ node.id }:type` ] = __(
			'Enter an event type such as order.failed.',
			'cliedesk'
		);
	}
	const kind = contactSpec( node.field, defs )?.value( node.op ) ?? 'none';
	const isNum = ( v: unknown ) =>
		String( v ?? '' ).trim() !== '' && Number.isFinite( Number( v ) );
	switch ( kind ) {
		case 'text':
			if ( String( node.value ?? '' ).trim() === '' ) {
				out[ node.id ] = __(
					'Enter the text to look for.',
					'cliedesk'
				);
			}
			break;
		case 'codes':
			if ( String( node.value ?? '' ).trim() === '' ) {
				out[ node.id ] = __( 'Enter at least one code.', 'cliedesk' );
			}
			break;
		case 'number':
			if ( ! isNum( node.value ) ) {
				out[ node.id ] = __( 'Enter a number.', 'cliedesk' );
			}
			break;
		case 'amount':
			if ( ! isNum( node.value ) || Number( node.value ) < 0 ) {
				out[ node.id ] = __(
					'Enter a number of hours or days.',
					'cliedesk'
				);
			}
			break;
		case 'range': {
			const [ a, b ] = node.value as unknown[];
			if ( ! isNum( a ) || ! isNum( b ) ) {
				out[ node.id ] = __( 'Enter two numbers.', 'cliedesk' );
			}
			break;
		}
		case 'date':
			if ( ! DATE_RE.test( String( node.value ?? '' ) ) ) {
				out[ node.id ] = __(
					'Enter a date as YYYY-MM-DD.',
					'cliedesk'
				);
			}
			break;
		case 'dates': {
			const [ a, b ] = node.value as unknown[];
			if (
				! DATE_RE.test( String( a ) ) ||
				! DATE_RE.test( String( b ) )
			) {
				out[ node.id ] = __(
					'Enter two dates as YYYY-MM-DD.',
					'cliedesk'
				);
			}
			break;
		}
		case 'kinds':
		case 'owners':
		case 'orgs':
		case 'tags':
		case 'segments':
		case 'options':
			if ( ! Array.isArray( node.value ) || node.value.length === 0 ) {
				out[ node.id ] = __( 'Choose at least one value.', 'cliedesk' );
			}
			break;
	}
	if (
		node.field === 'event' &&
		node.extra.withinDays !== undefined &&
		node.extra.withinDays !== '' &&
		! ( Number( node.extra.withinDays ) >= 0 )
	) {
		out[ node.id ] = __( 'Enter a number of days.', 'cliedesk' );
	}
	return out;
}

/**
 * Replace a node anywhere in the tree (immutable).
 *
 * @param root Root.
 * @param id   Node id.
 * @param fn   Returns the new node, or null to remove it.
 */
export function updateNode(
	root: CGroup,
	id: string,
	fn: ( n: CNode ) => CNode | null
): CGroup {
	const walk = ( n: CNode ): CNode | null => {
		if ( n.id === id ) {
			return fn( n );
		}
		if ( n.kind === 'group' ) {
			return {
				...n,
				children: n.children
					.map( walk )
					.filter( ( c ): c is CNode => c !== null ),
			};
		}
		return n;
	};
	return ( walk( root ) as CGroup | null ) ?? newGroup();
}

/**
 * Number of leaves (conditions) in a tree.
 *
 * @param node Node.
 */
export function countLeaves( node: CNode ): number {
	return node.kind === 'group'
		? node.children.reduce( ( n, c ) => n + countLeaves( c ), 0 )
		: 1;
}

/**
 * Operator label.
 *
 * @param op Operator.
 */
export function opLabel( op: string ): string {
	const map: Record< string, string > = {
		is: __( 'is', 'cliedesk' ),
		is_not: __( 'is not', 'cliedesk' ),
		contains: __( 'contains', 'cliedesk' ),
		not_contains: __( 'does not contain', 'cliedesk' ),
		starts_with: __( 'starts with', 'cliedesk' ),
		empty: __( 'is empty', 'cliedesk' ),
		not_empty: __( 'is not empty', 'cliedesk' ),
		in: __( 'is any of', 'cliedesk' ),
		not_in: __( 'is none of', 'cliedesk' ),
		any: __( 'has any of', 'cliedesk' ),
		all: __( 'has all of', 'cliedesk' ),
		none: __( 'has none of', 'cliedesk' ),
		gt: __( 'is more than', 'cliedesk' ),
		lt: __( 'is less than', 'cliedesk' ),
		gte: __( 'is at least', 'cliedesk' ),
		lte: __( 'is at most', 'cliedesk' ),
		between: __( 'is between', 'cliedesk' ),
		older_than: __( 'is more than … ago', 'cliedesk' ),
		within: __( 'is within the last …', 'cliedesk' ),
		before: __( 'is before', 'cliedesk' ),
		after: __( 'is on or after', 'cliedesk' ),
		count_gte: __( 'happened at least … times', 'cliedesk' ),
		count_gt: __( 'happened more than … times', 'cliedesk' ),
		count_lt: __( 'happened fewer than … times', 'cliedesk' ),
		count_is: __( 'happened exactly … times', 'cliedesk' ),
		count_lte: __( 'happened at most … times', 'cliedesk' ),
		first_within: __( 'first happened within the last …', 'cliedesk' ),
		first_older_than: __( 'first happened more than … ago', 'cliedesk' ),
		first_before: __( 'first happened before', 'cliedesk' ),
		first_after: __( 'first happened on or after', 'cliedesk' ),
		first_between: __( 'first happened between', 'cliedesk' ),
		last_within: __( 'last happened within the last …', 'cliedesk' ),
		last_older_than: __( 'last happened more than … ago', 'cliedesk' ),
		last_before: __( 'last happened before', 'cliedesk' ),
		last_after: __( 'last happened on or after', 'cliedesk' ),
		last_between: __( 'last happened between', 'cliedesk' ),
	};
	return map[ op ] ?? op;
}

/**
 * Condition field label.
 *
 * @param field Field.
 * @param defs  Contact field definitions.
 */
export function fieldLabel( field: string, defs: FieldDef[] = [] ): string {
	if ( field.startsWith( 'field:' ) ) {
		const key = field.slice( 6 );
		return sprintf(
			/* translators: %s: custom field name. */
			__( 'Field: %s', 'cliedesk' ),
			defs.find( ( d ) => d.key === key )?.label ?? key
		);
	}
	const map: Record< string, string > = {
		name: __( 'Name', 'cliedesk' ),
		email: __( 'Email', 'cliedesk' ),
		phone: __( 'Phone', 'cliedesk' ),
		city: __( 'City', 'cliedesk' ),
		country: __( 'Country', 'cliedesk' ),
		language: __( 'Language', 'cliedesk' ),
		kind: __( 'Kind', 'cliedesk' ),
		blocked: __( 'Blocked', 'cliedesk' ),
		owner: __( 'Owner', 'cliedesk' ),
		organization: __( 'Organization', 'cliedesk' ),
		tags: __( 'Tags', 'cliedesk' ),
		segment: __( 'Segment', 'cliedesk' ),
		created: __( 'Created', 'cliedesk' ),
		last_conversation: __( 'Last conversation', 'cliedesk' ),
		last_seen: __( 'Last seen', 'cliedesk' ),
		conversations: __( 'Number of conversations', 'cliedesk' ),
		open_conversation: __( 'Has an open conversation', 'cliedesk' ),
		csat_score: __(
			'Satisfaction: positive share, last 12 months (0–100)',
			'cliedesk'
		),
		// CSX-14: average rating mapped onto 1–5.
		csat_average: __(
			'Satisfaction: average rating, last 12 months (1–5)',
			'cliedesk'
		),
		event: __( 'Event', 'cliedesk' ),
		'metric:order_count': __( 'WooCommerce: paid orders', 'cliedesk' ),
		'metric:lifetime_value': __( 'WooCommerce: total spent', 'cliedesk' ),
		'metric:average_order': __(
			'WooCommerce: average order value',
			'cliedesk'
		),
		'metric:open_order_value': __(
			'WooCommerce: value of open orders',
			'cliedesk'
		),
		'metric:first_order': __( 'WooCommerce: first order', 'cliedesk' ),
		'metric:last_order': __( 'WooCommerce: last order', 'cliedesk' ),
		'metric:bought_product': __(
			'WooCommerce: bought product (IDs)',
			'cliedesk'
		),
	};
	return map[ field ] ?? field;
}

/**
 * Labels of condition error keys, for ActionError (`conditions.field` → "Condition").
 */
export function conditionLabels(): Record< string, string > {
	return {
		'conditions.field': __( 'Condition', 'cliedesk' ),
		'conditions.op': __( 'Operator', 'cliedesk' ),
		'conditions.value': __( 'Value', 'cliedesk' ),
		'conditions.type': __( 'Event type', 'cliedesk' ),
		conditions: __( 'Filter', 'cliedesk' ),
	};
}

/**
 * Whether an error carries condition errors (keys conditions / conditions.*).
 *
 * @param fields Field errors from the API.
 */
export const hasConditionErrors = (
	fields: Record< string, string >
): boolean =>
	Object.keys( fields ).some(
		( k ) => k === 'conditions' || k.startsWith( 'conditions.' )
	);
