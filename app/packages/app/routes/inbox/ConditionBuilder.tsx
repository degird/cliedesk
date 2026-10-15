/**
 * Condition builder of the view editor: nested "all" / "any" groups of conditions (field, operator, value). The
 * conditions, their operators and value editors follow the server vocabulary (inbox/conditions setVocabulary).
 */
import { Button, Checkbox, IconButton, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Plus, Trash2 } from 'lucide-react';
import {
	CHANNELS,
	LANES,
	PRIORITIES,
	type AgentRef,
	type ConversationType,
	type FieldDef,
	type QueueRef,
	type Status,
	type Tag,
	type TeamRef,
} from '../../inbox/api';
import {
	conditionFieldLabel,
	defaultValue,
	fieldSpec,
	newGroup,
	newLeaf,
	offeredFields,
	opLabel,
	updateNode,
	type ConditionNode,
	type GroupNode,
	type LeafNode,
	vocabChoices,
} from '../../inbox/conditions';
import {
	channelLabel,
	conversationSourceLabel,
	laneLabel,
	priorityLabel,
} from '../../inbox/labels';

export interface Lookups {
	statuses: Status[];
	tags: Tag[];
	agents: AgentRef[];
	fields: FieldDef[];
	meId: number | null;
	types?: ConversationType[];
	queues?: QueueRef[];
	teams?: TeamRef[];
	products?: Array< { id: number; name: string } >;
}

/** Status categories (keys of the server's StatusCategory). */
const CATEGORIES = [ 'new', 'open', 'waiting', 'resolved', 'closed' ];
/** Where a conversation started (keys of the server's ConversationSource). */
const SOURCES = [
	'widget',
	'portal',
	'form',
	'email',
	'api',
	'ai_agent',
	'agent',
	'import',
	'workflow',
	'cli',
	'channel',
];
/** Value kinds stored as numeric ids ("me" stays a string). */
const NUMERIC = [ 'tags', 'assignees', 'queues', 'teams', 'products' ];

function categoryLabel( c: string ): string {
	switch ( c ) {
		case 'new':
			return __( 'New', 'cliedesk' );
		case 'open':
			return __( 'Open', 'cliedesk' );
		case 'waiting':
			return __( 'Waiting', 'cliedesk' );
		case 'resolved':
			return __( 'Resolved', 'cliedesk' );
		default:
			return __( 'Closed', 'cliedesk' );
	}
}

interface Choice {
	id: string;
	label: string;
}

function choicesFor( kind: string, l: Lookups, field: string ): Choice[] {
	const named = ( items: Array< { id: number; name: string } > = [] ) =>
		items.map( ( x ) => ( { id: String( x.id ), label: x.name } ) );
	switch ( kind ) {
		case 'categories':
			return CATEGORIES.map( ( c ) => ( {
				id: c,
				label: categoryLabel( c ),
			} ) );
		case 'sources':
			return SOURCES.map( ( c ) => ( {
				id: c,
				label: conversationSourceLabel( c ),
			} ) );
		case 'types':
			return ( l.types ?? [] ).map( ( t ) => ( {
				id: t.key,
				label: t.name,
			} ) );
		case 'queues':
			return named( l.queues );
		case 'teams':
			return named( l.teams );
		case 'products':
			return named( l.products );
		case 'field_options': {
			const def = l.fields.find( ( f ) => `field:${ f.key }` === field );
			return ( def?.options ?? [] )
				.filter( ( o ) => ! o.archived )
				.map( ( o ) => ( { id: o.key, label: o.label } ) );
		}
		case 'choices':
			return vocabChoices( field );
		case 'lanes':
			return LANES.map( ( x ) => ( { id: x, label: laneLabel( x ) } ) );
		case 'statuses':
			return l.statuses.map( ( s ) => ( { id: s.key, label: s.label } ) );
		case 'priorities':
		case 'priority':
			return PRIORITIES.map( ( p ) => ( {
				id: p,
				label: priorityLabel( p ),
			} ) );
		case 'channels':
			return CHANNELS.map( ( c ) => ( {
				id: c,
				label: channelLabel( c ),
			} ) );
		case 'tags':
			return l.tags.map( ( t ) => ( {
				id: String( t.id ),
				label: t.name,
			} ) );
		case 'assignees':
			return [
				{ id: 'me', label: __( 'Me', 'cliedesk' ) },
				...l.agents
					.filter( ( a ) => a.userId !== l.meId )
					.map( ( a ) => ( {
						id: String( a.userId ),
						label: a.name,
					} ) ),
			];
	}
	return [];
}

function ValueEditor( {
	leaf,
	lookups,
	error,
	onChange,
}: {
	leaf: LeafNode;
	lookups: Lookups;
	error: string | null;
	onChange: ( v: unknown ) => void;
} ) {
	const kind = fieldSpec( leaf.field )?.value( leaf.op ) ?? 'none';
	if ( kind === 'none' ) {
		return null;
	}
	if ( kind === 'hours' || kind === 'number' || kind === 'text' ) {
		let label: string = __( 'Text', 'cliedesk' );
		if ( kind === 'hours' ) {
			label = __( 'Hours', 'cliedesk' );
		} else if ( kind === 'number' ) {
			label = __( 'Number', 'cliedesk' );
		}
		return (
			<TextField
				className="min-w-32 flex-1"
				label={ label }
				inputMode={ kind === 'text' ? undefined : 'decimal' }
				value={ String( leaf.value ?? '' ) }
				onChange={ onChange }
				errorMessage={ error }
			/>
		);
	}
	const choices = choicesFor( kind, lookups, leaf.field );
	if ( kind === 'priority' ) {
		return (
			<Select
				className="min-w-40"
				label={ __( 'Priority', 'cliedesk' ) }
				value={ String( leaf.value ?? 'normal' ) }
				onChange={ onChange }
				options={ choices }
			/>
		);
	}
	const selected = ( Array.isArray( leaf.value ) ? leaf.value : [] ).map(
		String
	);
	// Tag, user, queue, team and product ids are numbers in the stored JSON; "me" stays a string.
	const typed = ( id: string ): string | number =>
		NUMERIC.includes( kind ) && /^\d+$/.test( id ) ? Number( id ) : id;
	return (
		<fieldset className="flex min-w-0 flex-1 flex-col gap-1">
			<legend className="pb-1 text-sm font-medium">
				{ __( 'Values', 'cliedesk' ) }
			</legend>
			{ choices.length === 0 && (
				<p className="text-sm text-fg-muted">
					{ __( 'Nothing to choose from yet.', 'cliedesk' ) }
				</p>
			) }
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{ choices.map( ( c ) => (
					<Checkbox
						key={ c.id }
						isSelected={ selected.includes( c.id ) }
						onChange={ ( on ) =>
							onChange(
								on
									? [ ...selected, c.id ].map( typed )
									: selected
											.filter( ( x ) => x !== c.id )
											.map( typed )
							)
						}
					>
						{ c.label }
					</Checkbox>
				) ) }
			</div>
			{ error && <p className="text-sm text-danger">{ error }</p> }
		</fieldset>
	);
}

function Leaf( {
	leaf,
	lookups,
	error,
	onChange,
	onRemove,
}: {
	leaf: LeafNode;
	lookups: Lookups;
	error: string | null;
	onChange: ( n: LeafNode ) => void;
	onRemove: () => void;
} ) {
	const fieldLabels = Object.fromEntries(
		lookups.fields.map( ( f ) => [ f.key, f.label ] )
	);
	const fields = offeredFields( lookups.fields.map( ( f ) => f.key ) );
	if ( ! fields.includes( leaf.field ) ) {
		fields.push( leaf.field );
	}
	const spec = fieldSpec( leaf.field );
	return (
		<li className="flex flex-wrap items-start gap-3 rounded-md border border-line bg-surface p-3">
			<Select
				className="min-w-44"
				label={ __( 'Condition', 'cliedesk' ) }
				value={ leaf.field }
				onChange={ ( f ) =>
					onChange( { ...newLeaf( f ), id: leaf.id } )
				}
				options={ fields.map( ( f ) => ( {
					id: f,
					label: conditionFieldLabel( f, fieldLabels ),
				} ) ) }
			/>
			{ spec && spec.ops.length > 1 && (
				<Select
					className="min-w-40"
					label={ __( 'Operator', 'cliedesk' ) }
					value={ leaf.op }
					onChange={ ( op ) => {
						const before = spec.value( leaf.op );
						const after = spec.value( op );
						onChange( {
							...leaf,
							op,
							value:
								before === after
									? leaf.value
									: defaultValue( after ),
						} );
					} }
					options={ spec.ops.map( ( o ) => ( {
						id: o,
						label: opLabel( o, leaf.field ),
					} ) ) }
				/>
			) }
			{ spec && spec.ops.length === 1 && (
				<p className="self-end pb-2 text-sm text-fg-muted">
					{ opLabel( leaf.op, leaf.field ) }
				</p>
			) }
			<ValueEditor
				leaf={ leaf }
				lookups={ lookups }
				error={ error }
				onChange={ ( value ) => onChange( { ...leaf, value } ) }
			/>
			<IconButton
				className="mt-6"
				label={ sprintf(
					/* translators: %s: condition name. */
					__( 'Remove condition “%s”', 'cliedesk' ),
					conditionFieldLabel( leaf.field, fieldLabels )
				) }
				icon={ <Trash2 size={ 16 } /> }
				onPress={ onRemove }
			/>
		</li>
	);
}

function Group( {
	group,
	depth,
	lookups,
	errors,
	onChange,
	onRemove,
}: {
	group: GroupNode;
	depth: number;
	lookups: Lookups;
	errors: Record< string, string >;
	onChange: ( g: GroupNode ) => void;
	onRemove?: () => void;
} ) {
	const setChild = ( id: string, next: ConditionNode | null ) =>
		onChange( updateNode( group, id, () => next ) );
	return (
		<fieldset className="flex flex-col gap-3 rounded-lg border border-line-strong p-3">
			<legend className="px-1 text-sm font-semibold">
				{ depth === 0
					? __( 'Conditions', 'cliedesk' )
					: __( 'Group', 'cliedesk' ) }
			</legend>
			<div className="flex flex-wrap items-end gap-2">
				<Select
					className="min-w-60"
					label={ __( 'Match', 'cliedesk' ) }
					value={ group.mode }
					onChange={ ( m ) =>
						onChange( { ...group, mode: m as GroupNode[ 'mode' ] } )
					}
					options={ [
						{
							id: 'all',
							label: __( 'All of these conditions', 'cliedesk' ),
						},
						{
							id: 'any',
							label: __( 'Any of these conditions', 'cliedesk' ),
						},
						{
							id: 'none',
							label: __( 'None of these conditions', 'cliedesk' ),
						},
					] }
				/>
				{ onRemove && (
					<Button
						variant="ghost"
						iconStart={ <Trash2 aria-hidden="true" size={ 14 } /> }
						onPress={ onRemove }
					>
						{ __( 'Remove group', 'cliedesk' ) }
					</Button>
				) }
			</div>
			{ group.children.length > 0 ? (
				<ul className="flex flex-col gap-2">
					{ group.children.map( ( c ) => {
						if ( c.kind === 'group' ) {
							return (
								<li key={ c.id }>
									<Group
										group={ c }
										depth={ depth + 1 }
										lookups={ lookups }
										errors={ errors }
										onChange={ ( g ) =>
											setChild( c.id, g )
										}
										onRemove={ () =>
											setChild( c.id, null )
										}
									/>
								</li>
							);
						}
						if ( c.kind === 'raw' ) {
							return (
								<li
									key={ c.id }
									className="flex items-center gap-2 rounded-md border border-line bg-sunken p-3 text-sm"
								>
									<span className="min-w-0 flex-1 font-mono break-all">
										{ JSON.stringify( c.json ) }
									</span>
									<IconButton
										label={ __(
											'Remove this condition',
											'cliedesk'
										) }
										icon={ <Trash2 size={ 16 } /> }
										onPress={ () => setChild( c.id, null ) }
									/>
								</li>
							);
						}
						return (
							<Leaf
								key={ c.id }
								leaf={ c }
								lookups={ lookups }
								error={ errors[ c.id ] ?? null }
								onChange={ ( n ) => setChild( c.id, n ) }
								onRemove={ () => setChild( c.id, null ) }
							/>
						);
					} ) }
				</ul>
			) : (
				<p className="text-sm text-fg-muted">
					{ depth === 0
						? __(
								'No conditions: the view shows every conversation you can see.',
								'cliedesk'
							)
						: __( 'This group is empty.', 'cliedesk' ) }
				</p>
			) }
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					iconStart={ <Plus aria-hidden="true" size={ 14 } /> }
					onPress={ () =>
						onChange( {
							...group,
							children: [ ...group.children, newLeaf() ],
						} )
					}
				>
					{ __( 'Add condition', 'cliedesk' ) }
				</Button>
				{ depth < 4 && (
					<Button
						size="sm"
						variant="ghost"
						iconStart={ <Plus aria-hidden="true" size={ 14 } /> }
						onPress={ () =>
							onChange( {
								...group,
								children: [
									...group.children,
									newGroup(
										group.mode === 'all' ? 'any' : 'all',
										[ newLeaf() ]
									),
								],
							} )
						}
					>
						{ __( 'Add group', 'cliedesk' ) }
					</Button>
				) }
			</div>
		</fieldset>
	);
}

/**
 * Condition builder.
 *
 * @param props          Props.
 * @param props.root     Root group.
 * @param props.lookups  Statuses, tags, agents and fields.
 * @param props.errors   Client errors by leaf id.
 * @param props.onChange Change.
 */
export function ConditionBuilder( {
	root,
	lookups,
	errors,
	onChange,
}: {
	root: GroupNode;
	lookups: Lookups;
	errors: Record< string, string >;
	onChange: ( g: GroupNode ) => void;
} ) {
	return (
		<Group
			group={ root }
			depth={ 0 }
			lookups={ lookups }
			errors={ errors }
			onChange={ onChange }
		/>
	);
}
