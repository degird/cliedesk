/**
 * View conditions (INB-18, INB-19): the editor's tree model and its JSON form. The API stores a tree of groups
 * `{all: [...]}` / `{any: [...]}` (nested) and leaves `{field, op, value}` (ViewCompiler vocabulary). Leaves the
 * editor does not know are kept unchanged ("raw") so editing a view never drops conditions.
 *
 * The editor offers the server's vocabulary (GET views/vocabulary, CNV-11: conditions with their operators and value
 * source, including module and custom-field conditions) once `setVocabulary()` has it; until then, and for sources it
 * has no value editor for (contacts, organizations, segments, records, languages, nested contact conditions), it
 * falls back to the built-in list below.
 */
import { __, sprintf } from '@wordpress/i18n';

/** `none` is stored as `{not: {any: [...]}}` (AUT-23). */
export type GroupMode = 'all' | 'any' | 'none';

export interface LeafNode {
	kind: 'leaf';
	id: string;
	field: string;
	op: string;
	value: unknown;
}

export interface RawNode {
	kind: 'raw';
	id: string;
	json: unknown;
}

export interface GroupNode {
	kind: 'group';
	id: string;
	mode: GroupMode;
	children: ConditionNode[];
}

export type ConditionNode = LeafNode | GroupNode | RawNode;

/** Value editors used by the condition builder. */
export type ValueKind =
	| 'none'
	| 'lanes'
	| 'statuses'
	| 'priorities'
	| 'priority'
	| 'assignees'
	| 'tags'
	| 'channels'
	| 'hours'
	| 'text'
	| 'number'
	| 'categories'
	| 'types'
	| 'sources'
	| 'queues'
	| 'teams'
	| 'products'
	| 'field_options'
	| 'choices';

/** A vocabulary condition (GET views/vocabulary). */
export interface VocabEntry {
	field: string;
	label: string;
	ops: string[];
	/** Value source, e.g. statuses, users, hours, field_options. */
	values: string;
	/** Fixed choices when `values` is `choices` (AUT-25/31). */
	choices?: Array< { id: string; label: string } >;
	/** AUT-32: only meaningful for conversations of this channel (e.g. widget). */
	channel?: string;
	/** DEV-18: a plugin condition that works in rules only. */
	rulesOnly?: boolean;
}

/** Vocabulary value source → value editor. Sources missing here are not offered (existing leaves stay raw). */
const SOURCE_KIND: Record< string, ValueKind > = {
	statuses: 'statuses',
	categories: 'categories',
	lanes: 'lanes',
	types: 'types',
	priorities: 'priorities',
	channels: 'channels',
	sources: 'sources',
	users: 'assignees',
	queues: 'queues',
	teams: 'teams',
	products: 'products',
	tags: 'tags',
	hours: 'hours',
	text: 'text',
	number: 'number',
	none: 'none',
	field_options: 'field_options',
	choices: 'choices',
};

/** Value kinds whose value is a list of choices. */
export const LIST_KINDS: ValueKind[] = [
	'lanes',
	'statuses',
	'priorities',
	'assignees',
	'tags',
	'channels',
	'categories',
	'types',
	'sources',
	'queues',
	'teams',
	'products',
	'field_options',
	'choices',
];

/**
 * Fixed choices of a vocabulary condition (AUT-25/31).
 *
 * @param field Field.
 */
export function vocabChoices(
	field: string
): Array< { id: string; label: string } > {
	const list = vocabulary?.get( field )?.choices;
	return Array.isArray( list ) ? list : [];
}

let vocabulary: Map< string, VocabEntry > | null = null;

/**
 * Use the server's vocabulary (null or empty: the built-in list).
 *
 * @param entries Vocabulary conditions.
 */
export function setVocabulary( entries: VocabEntry[] | null ): void {
	vocabulary = entries?.length
		? new Map( entries.map( ( e ) => [ e.field, e ] ) )
		: null;
}

function specFromEntry( e: VocabEntry ): FieldSpec | null {
	const kind = SOURCE_KIND[ e.values ];
	const ops = e.ops.filter( ( o ) => o !== 'between' );
	if ( ! kind || ! ops.length ) {
		return null;
	}
	return {
		ops,
		value: ( op ) => {
			if (
				kind === 'none' ||
				op === 'empty' ||
				op === 'not_empty' ||
				op === 'overdue'
			) {
				return 'none';
			}
			if ( kind === 'priorities' && ( op === 'gt' || op === 'lt' ) ) {
				return 'priority';
			}
			return kind;
		},
	};
}

/** Condition fields the editor offers, in the vocabulary's order (or the built-in list). */
export function offeredFields( customKeys: string[] = [] ): string[] {
	if ( vocabulary ) {
		return [ ...vocabulary.values() ]
			.filter( ( e ) => specFromEntry( e ) !== null )
			.map( ( e ) => e.field );
	}
	return [ ...BASE_FIELDS, ...customKeys.map( ( k ) => `field:${ k }` ) ];
}

export interface FieldSpec {
	ops: string[];
	value: ( op: string ) => ValueKind;
}

const multi =
	( kind: ValueKind ) =>
	( op: string ): ValueKind =>
		op === 'empty' || op === 'not_empty' ? 'none' : kind;

export const DATE_FIELDS = [ 'created', 'updated', 'last_customer' ];

/**
 * Operators and value editors per condition field (custom fields use the `field:` prefix).
 *
 * @param field Field.
 */
export function fieldSpec( field: string ): FieldSpec | null {
	const entry = vocabulary?.get( field );
	if ( entry ) {
		return specFromEntry( entry );
	}
	if ( field.startsWith( 'field:' ) ) {
		return {
			ops: [ 'is', 'contains', 'gt', 'lt', 'empty', 'not_empty' ],
			value: ( op ) => {
				if ( op === 'empty' || op === 'not_empty' ) {
					return 'none';
				}
				return op === 'gt' || op === 'lt' ? 'number' : 'text';
			},
		};
	}
	if ( DATE_FIELDS.includes( field ) ) {
		return { ops: [ 'older_than', 'within' ], value: () => 'hours' };
	}
	switch ( field ) {
		case 'lane':
			return { ops: [ 'in', 'not_in' ], value: () => 'lanes' };
		case 'status':
			return { ops: [ 'in', 'not_in' ], value: () => 'statuses' };
		case 'priority':
			return {
				ops: [ 'in', 'gt', 'lt' ],
				value: ( op ) => ( op === 'in' ? 'priorities' : 'priority' ),
			};
		case 'assignee':
			return {
				ops: [ 'in', 'empty', 'not_empty' ],
				value: multi( 'assignees' ),
			};
		case 'owner':
			// CRM-23: the requester's contact owner ("me" or people).
			return {
				ops: [ 'in', 'not_in', 'empty', 'not_empty' ],
				value: multi( 'assignees' ),
			};
		case 'queue':
			return { ops: [ 'empty', 'not_empty' ], value: () => 'none' };
		case 'tags':
			return { ops: [ 'any', 'all', 'none' ], value: () => 'tags' };
		case 'channel':
			return { ops: [ 'in' ], value: () => 'channels' };
		case 'subject':
			return { ops: [ 'contains' ], value: () => 'text' };
	}
	return null;
}

export const BASE_FIELDS = [
	'lane',
	'status',
	'priority',
	'assignee',
	'owner',
	'queue',
	'tags',
	'channel',
	'created',
	'updated',
	'last_customer',
	'subject',
];

let seq = 0;
const nextId = () => `c${ ++seq }`;

/**
 * Default value for a value editor.
 *
 * @param kind Value kind.
 */
export function defaultValue( kind: ValueKind ): unknown {
	switch ( kind ) {
		case 'none':
			return undefined;
		case 'hours':
			return 24;
		case 'text':
		case 'number':
			return '';
		case 'priority':
			return 'normal';
		default:
			return [];
	}
}

/**
 * A new leaf for a field, with its first operator.
 *
 * @param field Field.
 */
export function newLeaf( field = 'lane' ): LeafNode {
	const spec = fieldSpec( field );
	const op = spec?.ops[ 0 ] ?? 'in';
	return {
		kind: 'leaf',
		id: nextId(),
		field,
		op,
		value: defaultValue( spec?.value( op ) ?? 'none' ),
	};
}

/**
 * A new group.
 *
 * @param mode     All / any.
 * @param children Children.
 */
export function newGroup(
	mode: GroupMode = 'all',
	children: ConditionNode[] = []
): GroupNode {
	return { kind: 'group', id: nextId(), mode, children };
}

/**
 * Editor tree from stored conditions (object or JSON string). The root is always a group.
 *
 * @param input Conditions.
 */
export function fromJson( input: unknown ): GroupNode {
	let tree = input;
	if ( typeof tree === 'string' ) {
		try {
			tree = tree.trim() === '' ? {} : JSON.parse( tree );
		} catch {
			tree = {};
		}
	}
	const node = parse( tree );
	return node.kind === 'group' ? node : newGroup( 'all', [ node ] );
}

function parse( t: unknown ): ConditionNode {
	if ( ! t || typeof t !== 'object' || Array.isArray( t ) ) {
		return newGroup();
	}
	const o = t as Record< string, unknown >;
	const not = o.not as Record< string, unknown > | undefined;
	if ( not && typeof not === 'object' && Array.isArray( not.any ) ) {
		return newGroup(
			'none',
			( not.any as unknown[] ).map( ( c ) => parse( c ) )
		);
	}
	for ( const mode of [ 'all', 'any' ] as const ) {
		if ( Array.isArray( o[ mode ] ) ) {
			return newGroup(
				mode,
				( o[ mode ] as unknown[] ).map( ( c ) => parse( c ) )
			);
		}
	}
	if ( Object.keys( o ).length === 0 ) {
		return newGroup();
	}
	const field = typeof o.field === 'string' ? o.field : '';
	const spec = fieldSpec( field );
	const op = typeof o.op === 'string' ? o.op : 'in';
	if ( ! spec || ! spec.ops.includes( op ) ) {
		return { kind: 'raw', id: nextId(), json: t };
	}
	const kind = spec.value( op );
	let value = o.value;
	if ( kind === 'none' ) {
		value = undefined;
	} else if ( LIST_KINDS.includes( kind ) ) {
		if ( value === undefined || value === null ) {
			value = [];
		} else {
			value = Array.isArray( value ) ? value : [ value ];
		}
	} else if ( kind === 'priority' && Array.isArray( value ) ) {
		value = value[ 0 ] ?? 'normal';
	} else if ( kind === 'text' && Array.isArray( value ) ) {
		value = String( value[ 0 ] ?? '' );
	}
	return { kind: 'leaf', id: nextId(), field, op, value };
}

/**
 * Stored JSON object of a tree.
 *
 * @param node Node.
 */
export function toObject( node: ConditionNode ): unknown {
	if ( node.kind === 'raw' ) {
		return node.json;
	}
	if ( node.kind === 'group' ) {
		return node.mode === 'none'
			? { not: { any: node.children.map( toObject ) } }
			: { [ node.mode ]: node.children.map( toObject ) };
	}
	const kind = fieldSpec( node.field )?.value( node.op ) ?? 'none';
	const out: Record< string, unknown > = { field: node.field, op: node.op };
	if ( kind === 'hours' || kind === 'number' ) {
		const n = Number( node.value );
		out.value = Number.isFinite( n ) ? n : node.value;
	} else if ( kind === 'text' ) {
		out.value = String( node.value ?? '' );
	} else if ( kind !== 'none' ) {
		out.value = node.value;
	}
	return out;
}

/**
 * JSON string for the API (`conditions` is a JSON string).
 *
 * @param root Root group.
 */
export function toJson( root: GroupNode ): string {
	return JSON.stringify( toObject( root ) );
}

/**
 * Client checks: leaf id → message.
 *
 * @param node Node.
 * @param out  Accumulator.
 */
export function validateTree(
	node: ConditionNode,
	out: Record< string, string > = {}
): Record< string, string > {
	if ( node.kind === 'group' ) {
		node.children.forEach( ( c ) => validateTree( c, out ) );
		return out;
	}
	if ( node.kind === 'raw' ) {
		return out;
	}
	const kind = fieldSpec( node.field )?.value( node.op ) ?? 'none';
	if ( Array.isArray( node.value ) && node.value.length === 0 ) {
		out[ node.id ] = __( 'Choose at least one value.', 'cliedesk' );
	} else if ( kind === 'hours' || kind === 'number' ) {
		const n = Number( node.value );
		if (
			String( node.value ?? '' ).trim() === '' ||
			! Number.isFinite( n ) ||
			( kind === 'hours' && n < 0 )
		) {
			out[ node.id ] =
				kind === 'hours'
					? __( 'Enter a number of hours.', 'cliedesk' )
					: __( 'Enter a number.', 'cliedesk' );
		}
	} else if (
		kind === 'text' &&
		String( node.value ?? '' ).trim() === '' &&
		node.op !== 'is'
	) {
		out[ node.id ] = __( 'Enter the text to look for.', 'cliedesk' );
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
	root: GroupNode,
	id: string,
	fn: ( n: ConditionNode ) => ConditionNode | null
): GroupNode {
	const walk = ( n: ConditionNode ): ConditionNode | null => {
		if ( n.id === id ) {
			return fn( n );
		}
		if ( n.kind === 'group' ) {
			return {
				...n,
				children: n.children
					.map( walk )
					.filter( ( c ): c is ConditionNode => c !== null ),
			};
		}
		return n;
	};
	return ( walk( root ) as GroupNode | null ) ?? newGroup();
}

/**
 * Operator label.
 *
 * @param op Operator.
 */
export function opLabel( op: string, field = '' ): string {
	if (
		[ 'children', 'checklist', 'linked' ].includes( field ) &&
		op === 'none'
	) {
		return __( 'has none', 'cliedesk' );
	}
	const map: Record< string, string > = {
		is_not: __( 'is not', 'cliedesk' ),
		not_contains: __( 'does not contain', 'cliedesk' ),
		starts_with: __( 'starts with', 'cliedesk' ),
		ends_with: __( 'ends with', 'cliedesk' ),
		regex: __( 'matches the pattern', 'cliedesk' ),
		contains_any: __( 'contains any of (comma separated)', 'cliedesk' ),
		contains_all: __( 'contains all of (comma separated)', 'cliedesk' ),
		contains_none: __( 'contains none of (comma separated)', 'cliedesk' ),
		within_next: __( 'within the next … hours', 'cliedesk' ),
		in_hours: __( 'is open', 'cliedesk' ),
		outside_hours: __( 'is closed', 'cliedesk' ),
		before: __( 'is before', 'cliedesk' ),
		after: __( 'is after', 'cliedesk' ),
		gte: __( 'is at least', 'cliedesk' ),
		lte: __( 'is at most', 'cliedesk' ),
		matches: __( 'matches', 'cliedesk' ),
		all_done: __( 'are all done', 'cliedesk' ),
		any_open: __( 'has any open', 'cliedesk' ),
		in: __( 'is any of', 'cliedesk' ),
		not_in: __( 'is none of', 'cliedesk' ),
		gt: __( 'is higher than', 'cliedesk' ),
		lt: __( 'is lower than', 'cliedesk' ),
		empty: __( 'is empty', 'cliedesk' ),
		not_empty: __( 'is not empty', 'cliedesk' ),
		any: __( 'has any of', 'cliedesk' ),
		all: __( 'has all of', 'cliedesk' ),
		none: __( 'has none of', 'cliedesk' ),
		older_than: __( 'more than … hours ago', 'cliedesk' ),
		within: __( 'within the last … hours', 'cliedesk' ),
		due_within: __( 'is due within … hours', 'cliedesk' ),
		overdue: __( 'is overdue', 'cliedesk' ),
		contains: __( 'contains', 'cliedesk' ),
		is: __( 'is', 'cliedesk' ),
	};
	return map[ op ] ?? op;
}

/**
 * Condition field label.
 *
 * @param field       Field.
 * @param fieldLabels Custom field labels by key.
 */
export function conditionFieldLabel(
	field: string,
	fieldLabels: Record< string, string > = {}
): string {
	const entry = vocabulary?.get( field );
	if ( entry ) {
		return entry.label;
	}
	if ( field.startsWith( 'field:' ) ) {
		const key = field.slice( 6 );
		return sprintf(
			/* translators: %s: custom field name. */
			__( 'Field: %s', 'cliedesk' ),
			fieldLabels[ key ] ?? key
		);
	}
	const map: Record< string, string > = {
		lane: __( 'Lane', 'cliedesk' ),
		status: __( 'Status', 'cliedesk' ),
		priority: __( 'Priority', 'cliedesk' ),
		assignee: __( 'Assignee', 'cliedesk' ),
		owner: __( 'Customer owner', 'cliedesk' ),
		queue: __( 'Queue', 'cliedesk' ),
		tags: __( 'Tags', 'cliedesk' ),
		channel: __( 'Channel', 'cliedesk' ),
		created: __( 'Created', 'cliedesk' ),
		updated: __( 'Updated', 'cliedesk' ),
		last_customer: __( 'Last customer message', 'cliedesk' ),
		subject: __( 'Subject', 'cliedesk' ),
	};
	return map[ field ] ?? field;
}
