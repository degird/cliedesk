/**
 * Contact filter builder (CRM-37): nested "all" / "any" groups of conditions (field, operator, value), laid out like
 * the conversation view editor's condition builder. The groups come from the shared ConditionGroup.
 */
import { can, useQuery } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	IconButton,
	Modal,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AgentRef, FieldDef, Tag } from '../inbox/api';
import { fetchOrgsPage } from './api';
import { OrgPicker, type PickedItem } from './components';
import { recordSourcesQuery } from './records';
import {
	BASE_FIELDS,
	WOO_METRIC_FIELDS,
	contactSpec,
	defaultValue,
	fieldLabel,
	newGroup,
	newLeaf,
	opLabel,
	type CGroup,
	type CLeaf,
	type CRaw,
} from './contactConditions';
import { ConditionGroup } from '../components/ConditionGroup';
import type { Segment } from './listApi';

export interface FilterLookups {
	tags: Tag[];
	agents: AgentRef[];
	fields: FieldDef[];
	segments: Segment[];
	meId: number | null;
}

interface Choice {
	id: string;
	label: string;
}

function Checks( {
	legend,
	choices,
	value,
	numeric,
	error,
	onChange,
	extra,
}: {
	legend: string;
	choices: Choice[];
	value: unknown;
	numeric: boolean;
	error: string | null;
	onChange: ( v: unknown ) => void;
	extra?: ReactNode;
} ) {
	const selected = ( Array.isArray( value ) ? value : [] ).map( String );
	const typed = ( id: string ): string | number =>
		numeric && /^\d+$/.test( id ) ? Number( id ) : id;
	return (
		<fieldset className="flex min-w-0 flex-1 flex-col gap-1">
			<legend className="pb-1 text-sm font-medium">{ legend }</legend>
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
								( on
									? [ ...selected, c.id ]
									: selected.filter( ( x ) => x !== c.id )
								).map( typed )
							)
						}
					>
						{ c.label }
					</Checkbox>
				) ) }
			</div>
			{ extra }
			{ error && <p className="text-sm text-danger">{ error }</p> }
		</fieldset>
	);
}

function OrgsValue( {
	leaf,
	error,
	onChange,
}: {
	leaf: CLeaf;
	error: string | null;
	onChange: ( l: CLeaf ) => void;
} ) {
	const [ open, setOpen ] = useState( false );
	const [ picked, setPicked ] = useState< PickedItem | null >( null );
	const [ names, setNames ] = useState< Record< number, string > >( {} );
	const known = useQuery( {
		queryKey: [ 'crm-picker', 'organizations', 'names' ] as const,
		queryFn: ( { signal } ) => fetchOrgsPage( '', null, signal, 100 ),
		staleTime: 60 * 1000,
	} );
	const ids = ( Array.isArray( leaf.value ) ? leaf.value : [] ).map( Number );
	const nameOf = ( id: number ) =>
		names[ id ] ??
		known.data?.items.find( ( o ) => o.id === id )?.name ??
		`#${ id }`;
	return (
		<fieldset className="flex min-w-0 flex-1 flex-col gap-1">
			<legend className="pb-1 text-sm font-medium">
				{ __( 'Organizations', 'cliedesk' ) }
			</legend>
			{ ids.length > 0 && (
				<ul className="flex flex-wrap gap-1">
					{ ids.map( ( id ) => (
						<li
							key={ id }
							className="inline-flex items-center gap-0.5 rounded-full border border-line ps-2 text-sm"
						>
							<bdi>{ nameOf( id ) }</bdi>
							<IconButton
								size="sm"
								label={ sprintf(
									/* translators: %s: organization name. */
									__( 'Remove %s', 'cliedesk' ),
									nameOf( id )
								) }
								icon={ <X size={ 12 } /> }
								onPress={ () =>
									onChange( {
										...leaf,
										value: ids.filter( ( x ) => x !== id ),
									} )
								}
							/>
						</li>
					) ) }
				</ul>
			) }
			<div className="flex flex-wrap items-center gap-3">
				<Button
					size="sm"
					onPress={ () => {
						setPicked( null );
						setOpen( true );
					} }
				>
					{ __( 'Add organization…', 'cliedesk' ) }
				</Button>
				<Checkbox
					isSelected={ !! leaf.extra.children }
					onChange={ ( children ) =>
						onChange( {
							...leaf,
							extra: { ...leaf.extra, children },
						} )
					}
				>
					{ __( 'Include child organizations', 'cliedesk' ) }
				</Checkbox>
			</div>
			{ error && <p className="text-sm text-danger">{ error }</p> }
			{ open && (
				<Modal
					isOpen
					onOpenChange={ setOpen }
					title={ __(
						'Add an organization to the condition',
						'cliedesk'
					) }
					footer={
						<>
							<Button onPress={ () => setOpen( false ) }>
								{ __( 'Cancel', 'cliedesk' ) }
							</Button>
							<Button
								variant="primary"
								isDisabled={ ! picked }
								onPress={ () => {
									if ( picked ) {
										setNames( ( n ) => ( {
											...n,
											[ picked.id ]: picked.label,
										} ) );
										onChange( {
											...leaf,
											value: [ ...ids, picked.id ],
										} );
									}
									setOpen( false );
								} }
							>
								{ __( 'Add', 'cliedesk' ) }
							</Button>
						</>
					}
				>
					<OrgPicker
						exclude={ ids }
						value={ picked }
						onChange={ setPicked }
					/>
				</Modal>
			) }
		</fieldset>
	);
}

function Pair( {
	leaf,
	labels,
	inputMode,
	error,
	onChange,
}: {
	leaf: CLeaf;
	labels: [ string, string ];
	inputMode?: 'decimal';
	error: string | null;
	onChange: ( v: unknown ) => void;
} ) {
	const [ a, b ] = (
		Array.isArray( leaf.value ) ? leaf.value : [ '', '' ]
	).map( ( x ) => String( x ?? '' ) );
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-1">
			<div className="flex flex-wrap gap-2">
				<TextField
					className="min-w-32 flex-1"
					label={ labels[ 0 ] }
					inputMode={ inputMode }
					value={ a }
					onChange={ ( x ) => onChange( [ x, b ] ) }
				/>
				<TextField
					className="min-w-32 flex-1"
					label={ labels[ 1 ] }
					inputMode={ inputMode }
					value={ b }
					onChange={ ( x ) => onChange( [ a, x ] ) }
				/>
			</div>
			{ error && <p className="text-sm text-danger">{ error }</p> }
		</div>
	);
}

function ValueEditor( {
	leaf,
	lookups,
	error,
	onChange,
}: {
	leaf: CLeaf;
	lookups: FilterLookups;
	error: string | null;
	onChange: ( l: CLeaf ) => void;
} ) {
	const kind =
		contactSpec( leaf.field, lookups.fields )?.value( leaf.op ) ?? 'none';
	const set = ( value: unknown ) => onChange( { ...leaf, value } );
	switch ( kind ) {
		case 'none':
			return null;
		case 'text':
		case 'number':
		case 'date':
		case 'codes': {
			let label: string = __( 'Text', 'cliedesk' );
			let description: string | undefined;
			if ( kind === 'number' ) {
				label =
					leaf.field === 'event'
						? __( 'Times', 'cliedesk' )
						: __( 'Number', 'cliedesk' );
			} else if ( kind === 'date' ) {
				label = __( 'Date', 'cliedesk' );
				description = __( 'YYYY-MM-DD', 'cliedesk' );
			} else if ( kind === 'codes' ) {
				label = __( 'Codes', 'cliedesk' );
				description =
					leaf.field === 'country'
						? __(
								'Two-letter codes, separated by commas: DE, PT',
								'cliedesk'
							)
						: __(
								'Language codes, separated by commas: en, pt_BR',
								'cliedesk'
							);
			}
			return (
				<TextField
					className="min-w-40 flex-1"
					label={ label }
					description={ description }
					inputMode={ kind === 'number' ? 'decimal' : undefined }
					value={ String( leaf.value ?? '' ) }
					onChange={ set }
					errorMessage={ error }
				/>
			);
		}
		case 'amount':
			return (
				<div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
					<TextField
						className="min-w-24 flex-1"
						label={ __( 'Amount', 'cliedesk' ) }
						inputMode="decimal"
						value={ String( leaf.value ?? '' ) }
						onChange={ set }
						errorMessage={ error }
					/>
					<Select
						className="min-w-28"
						label={ __( 'Unit', 'cliedesk' ) }
						value={ leaf.extra.unit ?? 'hours' }
						onChange={ ( u ) =>
							onChange( {
								...leaf,
								extra: {
									...leaf.extra,
									unit: u as 'hours' | 'days',
								},
							} )
						}
						options={ [
							{ id: 'hours', label: __( 'hours', 'cliedesk' ) },
							{ id: 'days', label: __( 'days', 'cliedesk' ) },
						] }
					/>
				</div>
			);
		case 'range':
			return (
				<Pair
					leaf={ leaf }
					labels={ [
						__( 'From', 'cliedesk' ),
						__( 'To', 'cliedesk' ),
					] }
					inputMode="decimal"
					error={ error }
					onChange={ set }
				/>
			);
		case 'dates':
			return (
				<Pair
					leaf={ leaf }
					labels={ [
						__( 'From (YYYY-MM-DD)', 'cliedesk' ),
						__( 'To (YYYY-MM-DD)', 'cliedesk' ),
					] }
					error={ error }
					onChange={ set }
				/>
			);
		case 'bool':
			return (
				<Select
					className="min-w-28"
					label={ __( 'Value', 'cliedesk' ) }
					value={ leaf.value === false ? 'no' : 'yes' }
					onChange={ ( v ) => set( v === 'yes' ) }
					options={ [
						{ id: 'yes', label: __( 'Yes', 'cliedesk' ) },
						{ id: 'no', label: __( 'No', 'cliedesk' ) },
					] }
				/>
			);
		case 'orgs':
			return (
				<OrgsValue
					leaf={ leaf }
					error={ error }
					onChange={ onChange }
				/>
			);
		case 'kinds':
			return (
				<Checks
					legend={ __( 'Values', 'cliedesk' ) }
					numeric={ false }
					value={ leaf.value }
					error={ error }
					onChange={ set }
					choices={ [
						{ id: 'customer', label: __( 'Customer', 'cliedesk' ) },
						{ id: 'guest', label: __( 'Guest', 'cliedesk' ) },
					] }
				/>
			);
		case 'owners':
			return (
				<Checks
					legend={ __( 'Owners', 'cliedesk' ) }
					numeric
					value={ leaf.value }
					error={ error }
					onChange={ set }
					choices={ [
						{ id: 'me', label: __( 'Me', 'cliedesk' ) },
						...lookups.agents
							.filter( ( a ) => a.userId !== lookups.meId )
							.map( ( a ) => ( {
								id: String( a.userId ),
								label: a.name,
							} ) ),
					] }
				/>
			);
		case 'tags':
			return (
				<Checks
					legend={ __( 'Tags', 'cliedesk' ) }
					numeric
					value={ leaf.value }
					error={ error }
					onChange={ set }
					choices={ lookups.tags.map( ( t ) => ( {
						id: String( t.id ),
						label: t.name,
					} ) ) }
				/>
			);
		case 'segments':
			return (
				<Checks
					legend={ __( 'Segments', 'cliedesk' ) }
					numeric
					value={ leaf.value }
					error={ error }
					onChange={ set }
					choices={ lookups.segments.map( ( s ) => ( {
						id: String( s.id ),
						label: s.name,
					} ) ) }
				/>
			);
		case 'options': {
			const def = lookups.fields.find(
				( d ) => d.key === leaf.field.slice( 6 )
			);
			return (
				<Checks
					legend={ __( 'Options', 'cliedesk' ) }
					numeric={ false }
					value={ leaf.value }
					error={ error }
					onChange={ set }
					choices={ ( def?.options ?? [] )
						.filter( ( o ) => ! o.archived )
						.map( ( o ) => ( { id: o.key, label: o.label } ) ) }
				/>
			);
		}
	}
	return null;
}

function Leaf( {
	leaf,
	lookups,
	error,
	typeError,
	onChange,
	onRemove,
}: {
	leaf: CLeaf;
	lookups: FilterLookups;
	error: string | null;
	typeError: string | null;
	onChange: ( n: CLeaf ) => void;
	onRemove: () => void;
} ) {
	const defs = lookups.fields;
	// CRM-17: WooCommerce metrics when WooCommerce is connected.
	const sources = useQuery( {
		...recordSourcesQuery(),
		enabled: can( 'cliedesk_view_orders' ),
	} );
	const woo = !! sources.data?.some( ( src ) => src.key === 'woo_order' );
	const fields = [
		...BASE_FIELDS,
		...( woo ? WOO_METRIC_FIELDS : [] ),
		...defs.map( ( f ) => `field:${ f.key }` ),
	];
	if ( ! fields.includes( leaf.field ) ) {
		fields.push( leaf.field );
	}
	const spec = contactSpec( leaf.field, defs );
	return (
		<li className="flex flex-wrap items-start gap-3 rounded-md border border-line bg-surface p-3">
			<Select
				className="min-w-44"
				label={ __( 'Condition', 'cliedesk' ) }
				value={ leaf.field }
				onChange={ ( f ) =>
					onChange( { ...newLeaf( f, defs ), id: leaf.id } )
				}
				options={ fields.map( ( f ) => ( {
					id: f,
					label: fieldLabel( f, defs ),
				} ) ) }
			/>
			{ leaf.field === 'event' && (
				<TextField
					className="min-w-40"
					label={ __( 'Event type', 'cliedesk' ) }
					placeholder="order.failed"
					value={ String( leaf.extra.type ?? '' ) }
					onChange={ ( type ) =>
						onChange( { ...leaf, extra: { ...leaf.extra, type } } )
					}
					errorMessage={ typeError }
				/>
			) }
			{ spec && spec.ops.length > 1 && (
				<Select
					className="min-w-44"
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
							extra: {
								...leaf.extra,
								...( after === 'amount' && ! leaf.extra.unit
									? { unit: 'days' as const }
									: {} ),
							},
						} );
					} }
					options={ spec.ops.map( ( o ) => ( {
						id: o,
						label: opLabel( o ),
					} ) ) }
				/>
			) }
			{ spec && spec.ops.length === 1 && (
				<p className="self-end pb-2 text-sm text-fg-muted">
					{ opLabel( leaf.op ) }
				</p>
			) }
			<ValueEditor
				leaf={ leaf }
				lookups={ lookups }
				error={ error }
				onChange={ onChange }
			/>
			{ leaf.field === 'event' && leaf.op.startsWith( 'count_' ) && (
				<TextField
					className="min-w-32"
					label={ __( 'Within days (optional)', 'cliedesk' ) }
					inputMode="numeric"
					value={ String( leaf.extra.withinDays ?? '' ) }
					onChange={ ( d ) =>
						onChange( {
							...leaf,
							extra: {
								...leaf.extra,
								withinDays: d.trim() === '' ? '' : Number( d ),
							},
						} )
					}
				/>
			) }
			<IconButton
				className="mt-6"
				label={ sprintf(
					/* translators: %s: condition name. */
					__( 'Remove condition “%s”', 'cliedesk' ),
					fieldLabel( leaf.field, defs )
				) }
				icon={ <Trash2 size={ 16 } /> }
				onPress={ onRemove }
			/>
		</li>
	);
}

/**
 * Contact filter builder.
 *
 * @param props          Props.
 * @param props.root     Root group.
 * @param props.lookups  Tags, agents, fields and segments.
 * @param props.errors   Client errors by leaf id.
 * @param props.onChange Change.
 */
export function ContactFilterBuilder( {
	root,
	lookups,
	errors,
	onChange,
}: {
	root: CGroup;
	lookups: FilterLookups;
	errors: Record< string, string >;
	onChange: ( g: CGroup ) => void;
} ) {
	return (
		<ConditionGroup< CLeaf | CRaw >
			group={ root }
			depth={ 0 }
			maxDepth={ 4 }
			text={ {
				rootLegend: __( 'Filter', 'cliedesk' ),
				rootEmpty: __(
					'No conditions: every contact you can see.',
					'cliedesk'
				),
			} }
			newLeaf={ () => newLeaf( 'name', lookups.fields ) }
			newGroup={ ( mode, children ) => newGroup( mode, children ) }
			onChange={ ( g ) => onChange( g as CGroup ) }
			renderNode={ ( c, setNode ) =>
				c.kind === 'raw' ? (
					<li className="flex items-center gap-2 rounded-md border border-line bg-sunken p-3 text-sm">
						<span className="min-w-0 flex-1 font-mono break-all">
							{ JSON.stringify( c.json ) }
						</span>
						<IconButton
							label={ __( 'Remove this condition', 'cliedesk' ) }
							icon={ <Trash2 size={ 16 } /> }
							onPress={ () => setNode( null ) }
						/>
					</li>
				) : (
					<Leaf
						leaf={ c }
						lookups={ lookups }
						error={ errors[ c.id ] ?? null }
						typeError={ errors[ `${ c.id }:type` ] ?? null }
						onChange={ ( n ) => setNode( n ) }
						onRemove={ () => setNode( null ) }
					/>
				)
			}
		/>
	);
}
