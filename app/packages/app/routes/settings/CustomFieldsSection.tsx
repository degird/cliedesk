/**
 * Settings → Workspace → Custom fields (CNV-26, CNV-27, CNV-30, CNV-34), for cliedesk_manage_settings. Fields of
 * conversations, contacts and organizations: add (17 types; the key is made from the name and can be changed before
 * saving), edit (name, name customers see, description, placeholder, "required to resolve", sensitive, number
 * range, currency, pattern, several values, customer visibility and editing), options for choice fields (label,
 * parent for nested choices, colour, tag added when chosen; CSV import), archive and restore, and delete of an
 * unused field (refused while it has values or references). Who can see a field: Settings → Field access.
 * Endpoints: GET fields?scope&archived, POST fields, PATCH fields/{id} (If-Match), PUT fields/{id}/options,
 * POST fields/{id}/options/import {csv}, POST fields/{id}/archive {restore}, DELETE fields/{id}.
 */
import {
	api,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	ConfirmDestructive,
	IconButton,
	LoadingRegion,
	Modal,
	Select,
	TextField,
	toast,
	EmptyState,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { describeError } from '../../components/RouteError';
import { tagsQuery, type FieldDef } from '../../inbox/api';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	announceResult,
	apiFieldErrors,
} from '../../workspace/forms';
import { moveIn } from './TypesSection';
import { TopicsCard } from './TopicsCard';
import { GuidanceCard } from './GuidanceCard';
import { EntitiesCard } from './EntitiesCard';

type Scope = 'conversation' | 'contact' | 'organization';

export const FIELD_TYPES = [
	'text',
	'long_text',
	'number',
	'decimal',
	'money',
	'date',
	'datetime',
	'boolean',
	'select',
	'multi_select',
	'nested_select',
	'user',
	'contact',
	'record_ref',
	'file',
	'regex_text',
	'url',
] as const;

const OPTION_TYPES = [ 'select', 'multi_select', 'nested_select' ];
const NUMBER_TYPES = [ 'number', 'decimal', 'money' ];
const MULTI_TYPES = [ 'user', 'contact', 'record_ref', 'file' ];

export function fieldTypeLabel( t: string ): string {
	const map: Record< string, string > = {
		text: __( 'Text', 'cliedesk' ),
		long_text: __( 'Long text', 'cliedesk' ),
		number: __( 'Whole number', 'cliedesk' ),
		decimal: __( 'Decimal number', 'cliedesk' ),
		money: __( 'Money', 'cliedesk' ),
		date: __( 'Date', 'cliedesk' ),
		datetime: __( 'Date and time', 'cliedesk' ),
		boolean: __( 'Yes / no', 'cliedesk' ),
		select: __( 'Choice', 'cliedesk' ),
		multi_select: __( 'Several choices', 'cliedesk' ),
		nested_select: __( 'Nested choice', 'cliedesk' ),
		user: __( 'Agent', 'cliedesk' ),
		contact: __( 'Contact', 'cliedesk' ),
		record_ref: __( 'Linked record', 'cliedesk' ),
		file: __( 'File', 'cliedesk' ),
		regex_text: __( 'Text with a pattern', 'cliedesk' ),
		url: __( 'Web address', 'cliedesk' ),
	};
	return map[ t ] ?? t;
}

function scopeLabel( s: Scope ): string {
	switch ( s ) {
		case 'contact':
			return __( 'Contacts', 'cliedesk' );
		case 'organization':
			return __( 'Organizations', 'cliedesk' );
		default:
			return __( 'Conversations', 'cliedesk' );
	}
}

/**
 * Field key from a name: lower case, underscores, starts with a letter, at most 64 characters.
 *
 * @param name Name.
 */
export function keyFromLabel( name: string ): string {
	const k = name
		.toLowerCase()
		.normalize( 'NFKD' )
		.replace( /[̀-ͯ]/g, '' )
		.replace( /[^a-z0-9]+/g, '_' )
		.replace( /^_+|_+$/g, '' )
		.slice( 0, 64 );
	return /^[a-z]/.test( k ) ? k : `field_${ k }`.slice( 0, 64 );
}

const fieldListQuery = ( scope: Scope, archived: boolean ) =>
	queryOptions( {
		queryKey: [ 'fields', scope, 'settings', archived ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< FieldDef[] >( 'fields', {
					query: { scope, ...( archived ? { archived: true } : {} ) },
					signal,
				} )
			).data ?? [],
	} );

interface OptionRow {
	key: string;
	label: string;
	parentKey: string;
	color: string;
	tagId: string;
}

function OptionsDialog( {
	field,
	onClose,
}: {
	field: FieldDef;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const tags = useQuery( tagsQuery() );
	const nested = field.type === 'nested_select';
	const [ rows, setRows ] = useState< OptionRow[] >( () => {
		const all = field.options ?? [];
		return all
			.filter( ( o ) => ! o.archived )
			.map( ( o ) => ( {
				key: o.key,
				label: o.label,
				// The API answers with the parent's id and takes its key.
				parentKey: all.find( ( p ) => p.id === o.parentId )?.key ?? '',
				color: o.color ?? '',
				tagId: o.tagId ? String( o.tagId ) : '',
			} ) );
	} );
	const [ csv, setCsv ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const done = ( message: string ) => {
		announceResult( message );
		void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
		onClose();
	};
	const save = useMutation( {
		mutationFn: () =>
			api.put( `fields/${ field.id }/options`, {
				body: {
					options: rows.map( ( r ) => ( {
						...( r.key ? { key: r.key } : {} ),
						label: r.label.trim(),
						...( nested && r.parentKey
							? { parentKey: r.parentKey }
							: {} ),
						...( r.color ? { color: r.color } : {} ),
						...( r.tagId ? { tagId: Number( r.tagId ) } : {} ),
					} ) ),
				},
			} ),
		onSuccess: () =>
			done(
				sprintf(
					/* translators: %s: field name. */
					__( 'Options of “%s” saved.', 'cliedesk' ),
					field.label
				)
			),
	} );
	const importCsv = useMutation( {
		mutationFn: () =>
			api.post( `fields/${ field.id }/options/import`, {
				body: { csv },
			} ),
		onSuccess: () =>
			done(
				sprintf(
					/* translators: %s: field name. */
					__( 'Options of “%s” imported.', 'cliedesk' ),
					field.label
				)
			),
	} );
	const set = ( i: number, patch: Partial< OptionRow > ) =>
		setRows( ( l ) =>
			l.map( ( r, j ) => ( j === i ? { ...r, ...patch } : r ) )
		);
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( rows.some( ( r ) => ! r.label.trim() ) ) {
			setError( __( 'Every option needs a label.', 'cliedesk' ) );
			return;
		}
		setError( null );
		save.mutate();
	};
	const parents = rows.filter( ( r ) => r.key );
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: field name. */
				__( 'Options of %s', 'cliedesk' ),
				field.label
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-field-options"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save options', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-field-options"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ActionError error={ save.error ?? importCsv.error } />
				{ error && (
					<p role="alert" className="text-sm text-danger">
						{ error }
					</p>
				) }
				{ rows.length === 0 && (
					<Muted>{ __( 'No options yet.', 'cliedesk' ) }</Muted>
				) }
				<ol className="flex flex-col gap-3">
					{ rows.map( ( r, i ) => {
						const name =
							r.label ||
							sprintf(
								/* translators: %d: option position. */
								__( 'Option %d', 'cliedesk' ),
								i + 1
							);
						return (
							<li
								key={ i }
								className="flex flex-wrap items-end gap-2 rounded-md border border-line p-3"
							>
								<TextField
									className="min-w-40 flex-1"
									label={ __( 'Label', 'cliedesk' ) }
									value={ r.label }
									onChange={ ( v ) => set( i, { label: v } ) }
									maxLength={ 191 }
								/>
								{ nested && (
									<Select
										className="min-w-36"
										label={ __( 'Under', 'cliedesk' ) }
										value={ r.parentKey }
										onChange={ ( v ) =>
											set( i, { parentKey: v } )
										}
										options={ [
											{
												id: '',
												label: __(
													'Top level',
													'cliedesk'
												),
											},
											...parents
												.filter(
													( p ) => p.key !== r.key
												)
												.map( ( p ) => ( {
													id: p.key,
													label: p.label,
												} ) ),
										] }
									/>
								) }
								<Select
									className="min-w-36"
									label={ __( 'Adds tag', 'cliedesk' ) }
									value={ r.tagId }
									onChange={ ( v ) => set( i, { tagId: v } ) }
									options={ [
										{
											id: '',
											label: __( 'No tag', 'cliedesk' ),
										},
										...( tags.data ?? [] ).map( ( t ) => ( {
											id: String( t.id ),
											label: t.name,
										} ) ),
									] }
								/>
								<IconButton
									label={ sprintf(
										/* translators: %s: option label. */
										__( 'Move %s up', 'cliedesk' ),
										name
									) }
									icon={
										<ArrowUp
											aria-hidden="true"
											size={ 14 }
										/>
									}
									isDisabled={ i === 0 }
									onPress={ () =>
										setRows( ( l ) => moveIn( l, r, -1 ) )
									}
								/>
								<IconButton
									label={ sprintf(
										/* translators: %s: option label. */
										__( 'Move %s down', 'cliedesk' ),
										name
									) }
									icon={
										<ArrowDown
											aria-hidden="true"
											size={ 14 }
										/>
									}
									isDisabled={ i === rows.length - 1 }
									onPress={ () =>
										setRows( ( l ) => moveIn( l, r, 1 ) )
									}
								/>
								<IconButton
									label={ sprintf(
										/* translators: %s: option label. */
										__( 'Remove %s', 'cliedesk' ),
										name
									) }
									icon={
										<Trash2
											aria-hidden="true"
											size={ 14 }
										/>
									}
									onPress={ () =>
										setRows( ( l ) =>
											l.filter( ( _x, j ) => j !== i )
										)
									}
								/>
							</li>
						);
					} ) }
				</ol>
				<div>
					<Button
						size="sm"
						iconStart={ <Plus aria-hidden="true" size={ 14 } /> }
						onPress={ () =>
							setRows( ( l ) => [
								...l,
								{
									key: '',
									label: '',
									parentKey: '',
									color: '',
									tagId: '',
								},
							] )
						}
					>
						{ __( 'Add option', 'cliedesk' ) }
					</Button>
				</div>
				<p className="text-sm text-fg-muted">
					{ __(
						'Removed options are archived: values already saved keep them.',
						'cliedesk'
					) }
				</p>
				<details className="rounded-md border border-line p-3">
					<summary className="cursor-pointer font-medium">
						{ __( 'Import options from CSV', 'cliedesk' ) }
					</summary>
					<div className="mt-3 flex flex-col gap-2">
						<TextField
							label={ __( 'CSV', 'cliedesk' ) }
							description={
								nested
									? __(
											'One option per line. Up to three columns make three levels, for example: Hardware,Laptop,Battery',
											'cliedesk'
										)
									: __( 'One option per line.', 'cliedesk' )
							}
							value={ csv }
							onChange={ setCsv }
							multiline
						/>
						<div>
							<Button
								size="sm"
								isDisabled={ ! csv.trim() }
								isLoading={ importCsv.isPending }
								onPress={ () => importCsv.mutate() }
							>
								{ __( 'Import', 'cliedesk' ) }
							</Button>
						</div>
					</div>
				</details>
			</form>
		</Modal>
	);
}

interface FieldValues {
	type: string;
	label: string;
	key: string;
	keyEdited: boolean;
	customerLabel: string;
	description: string;
	placeholder: string;
	requiredResolve: boolean;
	sensitive: boolean;
	min: string;
	max: string;
	currency: string;
	regex: string;
	regexMessage: string;
	multiple: boolean;
	customerVisible: boolean;
	customerEditable: boolean;
}

function initialValues( f: FieldDef | null ): FieldValues {
	const s = ( f?.settings ?? {} ) as Record< string, unknown >;
	const req = ( s.required ?? {} ) as Record< string, unknown >;
	const cust = ( s.customer ?? {} ) as Record< string, unknown >;
	const str = ( v: unknown ) =>
		v === undefined || v === null ? '' : String( v );
	return {
		type: f?.type ?? 'text',
		label: f?.label ?? '',
		key: f?.key ?? '',
		keyEdited: !! f,
		customerLabel: str( f?.customerLabel ),
		description: str( s.description ),
		placeholder: str( s.placeholder ),
		requiredResolve: req.resolve === true,
		sensitive: s.sensitive === true,
		min: str( s.min ),
		max: str( s.max ),
		currency: str( s.currency ),
		regex: str( s.regex ),
		regexMessage: str( s.regexMessage ),
		multiple: s.multiple === true,
		customerVisible: cust.visible === true,
		customerEditable: cust.editable === true,
	};
}

/**
 * Client checks of the field form.
 *
 * @param v Values.
 */
export function validateField( v: FieldValues ): Record< string, string > {
	const out: Record< string, string > = {};
	if ( ! v.label.trim() ) {
		out.label = __( 'Enter a name.', 'cliedesk' );
	}
	if ( ! /^[a-z][a-z0-9_]{0,63}$/.test( v.key ) ) {
		out.key = __(
			'Use lower-case letters, digits and _ , starting with a letter.',
			'cliedesk'
		);
	}
	for ( const k of [ 'min', 'max' ] as const ) {
		if ( v[ k ].trim() !== '' && ! Number.isFinite( Number( v[ k ] ) ) ) {
			out[ k ] = __( 'Enter a number.', 'cliedesk' );
		}
	}
	if ( v.currency && ! /^[A-Z]{3}$/.test( v.currency ) ) {
		out.currency = __( 'Use a three-letter code such as EUR.', 'cliedesk' );
	}
	if ( v.regex ) {
		try {
			new RegExp( v.regex );
		} catch {
			out.regex = __( 'This pattern is not valid.', 'cliedesk' );
		}
	}
	return out;
}

/**
 * Settings payload of the form (only the keys that apply to the type).
 *
 * @param v Values.
 */
export function fieldSettings( v: FieldValues ): Record< string, unknown > {
	const out: Record< string, unknown > = {
		description: v.description.trim(),
		placeholder: v.placeholder.trim(),
		sensitive: v.sensitive,
		customer: { visible: v.customerVisible, editable: v.customerEditable },
	};
	if ( v.requiredResolve !== undefined ) {
		out.required = { resolve: v.requiredResolve };
	}
	if ( NUMBER_TYPES.includes( v.type ) ) {
		if ( v.min.trim() !== '' ) {
			out.min = Number( v.min );
		}
		if ( v.max.trim() !== '' ) {
			out.max = Number( v.max );
		}
	}
	if ( v.type === 'money' && v.currency ) {
		out.currency = v.currency;
	}
	if ( v.type === 'regex_text' ) {
		out.regex = v.regex;
		out.regexMessage = v.regexMessage.trim();
	}
	if ( MULTI_TYPES.includes( v.type ) ) {
		out.multiple = v.multiple;
	}
	return out;
}

function FieldDialog( {
	scope,
	field,
	onClose,
	onCreated,
}: {
	scope: Scope;
	field: FieldDef | null;
	onClose: () => void;
	onCreated: ( f: FieldDef ) => void;
} ) {
	const qc = useQueryClient();
	const [ v, setV ] = useState< FieldValues >( () => initialValues( field ) );
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const upd = ( patch: Partial< FieldValues > ) =>
		setV( ( c ) => ( { ...c, ...patch } ) );
	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			field
				? api.patch< FieldDef >( `fields/${ field.id }`, {
						body,
						ifMatch: versionTag( field.version ?? 0 ),
					} )
				: api.post< FieldDef & { warning?: string | null } >(
						'fields',
						{ body }
					),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %s: field name. */
					__( 'Field “%s” saved.', 'cliedesk' ),
					r.data.label
				)
			);
			const warning = ( r.data as { warning?: string | null } ).warning;
			if ( warning ) {
				toast( { tone: 'warning', title: warning } );
			}
			void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
			onClose();
			if ( ! field && OPTION_TYPES.includes( r.data.type ) ) {
				onCreated( r.data );
			}
		},
	} );
	const server = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next = validateField( v );
		setErrors( next );
		if ( Object.keys( next ).length ) {
			return;
		}
		save.mutate( {
			...( field ? {} : { scope, type: v.type, key: v.key } ),
			label: v.label.trim(),
			customerLabel: v.customerLabel.trim(),
			settings: fieldSettings( v ),
		} );
	};
	const err = ( k: string ) =>
		errors[ k ] ?? server[ k ] ?? server[ `settings.${ k }` ] ?? null;
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				field
					? sprintf(
							/* translators: %s: field name. */
							__( 'Edit field %s', 'cliedesk' ),
							field.label
						)
					: sprintf(
							/* translators: %s: where the field is used, e.g. "Contacts". */
							__( 'Add a field to %s', 'cliedesk' ),
							scopeLabel( scope )
						)
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-field"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save field', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-field"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ isConflict( save.error ) ? (
					<ConflictBanner
						onReload={ () => {
							void qc.invalidateQueries( {
								queryKey: [ 'fields' ],
							} );
							onClose();
						} }
					/>
				) : (
					<ActionError error={ save.error } />
				) }
				<div className="grid gap-4 sm:grid-cols-2">
					<Select
						label={ __( 'Type', 'cliedesk' ) }
						value={ v.type }
						onChange={ ( t ) => upd( { type: t } ) }
						isDisabled={ !! field }
						options={ FIELD_TYPES.map( ( t ) => ( {
							id: t,
							label: fieldTypeLabel( t ),
						} ) ) }
					/>
					<TextField
						label={ __( 'Name', 'cliedesk' ) }
						value={ v.label }
						onChange={ ( label ) =>
							upd( {
								label,
								...( v.keyEdited
									? {}
									: { key: keyFromLabel( label ) } ),
							} )
						}
						maxLength={ 191 }
						isRequired
						errorMessage={ err( 'label' ) }
					/>
					<TextField
						label={ __( 'Key', 'cliedesk' ) }
						description={
							field
								? __( 'The key cannot change.', 'cliedesk' )
								: __(
										'Used in the API, views and tokens such as {field.key}.',
										'cliedesk'
									)
						}
						value={ v.key }
						onChange={ ( key ) => upd( { key, keyEdited: true } ) }
						isDisabled={ !! field }
						maxLength={ 64 }
						errorMessage={ err( 'key' ) }
					/>
					<TextField
						label={ __( 'Name customers see', 'cliedesk' ) }
						value={ v.customerLabel }
						onChange={ ( customerLabel ) =>
							upd( { customerLabel } )
						}
						maxLength={ 191 }
						errorMessage={ err( 'customerLabel' ) }
					/>
				</div>
				<TextField
					label={ __( 'Description', 'cliedesk' ) }
					value={ v.description }
					onChange={ ( description ) => upd( { description } ) }
					maxLength={ 2000 }
					multiline
					errorMessage={ err( 'description' ) }
				/>
				<TextField
					label={ __( 'Placeholder', 'cliedesk' ) }
					value={ v.placeholder }
					onChange={ ( placeholder ) => upd( { placeholder } ) }
					maxLength={ 191 }
					errorMessage={ err( 'placeholder' ) }
				/>
				{ NUMBER_TYPES.includes( v.type ) && (
					<div className="grid gap-4 sm:grid-cols-3">
						<TextField
							label={ __( 'Lowest value', 'cliedesk' ) }
							inputMode="decimal"
							value={ v.min }
							onChange={ ( min ) => upd( { min } ) }
							errorMessage={ err( 'min' ) }
						/>
						<TextField
							label={ __( 'Highest value', 'cliedesk' ) }
							inputMode="decimal"
							value={ v.max }
							onChange={ ( max ) => upd( { max } ) }
							errorMessage={ err( 'max' ) }
						/>
						{ v.type === 'money' && (
							<TextField
								label={ __( 'Currency', 'cliedesk' ) }
								value={ v.currency }
								onChange={ ( c ) =>
									upd( { currency: c.toUpperCase() } )
								}
								maxLength={ 3 }
								errorMessage={ err( 'currency' ) }
							/>
						) }
					</div>
				) }
				{ v.type === 'regex_text' && (
					<div className="grid gap-4 sm:grid-cols-2">
						<TextField
							label={ __( 'Pattern', 'cliedesk' ) }
							description={ __(
								'A regular expression the value must match.',
								'cliedesk'
							) }
							value={ v.regex }
							onChange={ ( regex ) => upd( { regex } ) }
							maxLength={ 500 }
							errorMessage={ err( 'regex' ) }
						/>
						<TextField
							label={ __(
								'Message when it does not match',
								'cliedesk'
							) }
							value={ v.regexMessage }
							onChange={ ( regexMessage ) =>
								upd( { regexMessage } )
							}
							maxLength={ 191 }
							errorMessage={ err( 'regexMessage' ) }
						/>
					</div>
				) }
				{ MULTI_TYPES.includes( v.type ) && (
					<Checkbox
						isSelected={ v.multiple }
						onChange={ ( multiple ) => upd( { multiple } ) }
					>
						{ __( 'Allow several values', 'cliedesk' ) }
					</Checkbox>
				) }
				{ scope === 'conversation' && (
					<Checkbox
						isSelected={ v.requiredResolve }
						onChange={ ( requiredResolve ) =>
							upd( { requiredResolve } )
						}
					>
						{ __(
							'Required to resolve a conversation',
							'cliedesk'
						) }
					</Checkbox>
				) }
				<Checkbox
					isSelected={ v.sensitive }
					onChange={ ( sensitive ) => upd( { sensitive } ) }
				>
					{ __(
						'Sensitive: masked in lists and exports',
						'cliedesk'
					) }
				</Checkbox>
				<fieldset className="flex flex-col gap-1">
					<legend className="pb-1 text-sm font-medium">
						{ __( 'Customers', 'cliedesk' ) }
					</legend>
					<Checkbox
						isSelected={ v.customerVisible }
						onChange={ ( customerVisible ) =>
							upd( {
								customerVisible,
								...( customerVisible
									? {}
									: { customerEditable: false } ),
							} )
						}
					>
						{ __( 'Customers can see it', 'cliedesk' ) }
					</Checkbox>
					<Checkbox
						isSelected={ v.customerEditable }
						isDisabled={ ! v.customerVisible }
						onChange={ ( customerEditable ) =>
							upd( { customerEditable } )
						}
					>
						{ __( 'Customers can change it', 'cliedesk' ) }
					</Checkbox>
				</fieldset>
			</form>
		</Modal>
	);
}

/**
 * Section.
 */
export default function CustomFieldsSection() {
	const qc = useQueryClient();
	const [ scope, setScope ] = useState< Scope >( 'conversation' );
	const [ showArchived, setShowArchived ] = useState( false );
	const [ editing, setEditing ] = useState< FieldDef | 'new' | null >( null );
	const [ options, setOptions ] = useState< FieldDef | null >( null );
	const [ deleting, setDeleting ] = useState< FieldDef | null >( null );
	const q = useQuery( fieldListQuery( scope, showArchived ) );
	const archive = useMutation( {
		mutationFn: ( f: FieldDef ) =>
			api.post< FieldDef >( `fields/${ f.id }/archive`, {
				body: f.archived ? { restore: true } : {},
			} ),
		onSuccess: ( r ) => {
			announceResult(
				r.data.archived
					? sprintf(
							/* translators: %s: field name. */
							__( 'Field “%s” archived.', 'cliedesk' ),
							r.data.label
						)
					: sprintf(
							/* translators: %s: field name. */
							__( 'Field “%s” restored.', 'cliedesk' ),
							r.data.label
						)
			);
			void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( f: FieldDef ) => api.del( `fields/${ f.id }` ),
		onSuccess: ( _r, f ) => {
			announceResult(
				sprintf(
					/* translators: %s: field name. */
					__( 'Field “%s” deleted.', 'cliedesk' ),
					f.label
				)
			);
			setDeleting( null );
			void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
		},
	} );
	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Loading fields…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the fields', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.length ) {
		body = (
			<EmptyState
				headingLevel={ 3 }
				title={ __( 'No fields yet.', 'cliedesk' ) }
				description={ __(
					'A common first field: “Order number” on conversations, so agents can find the order in one click.',
					'cliedesk'
				) }
				actions={
					// ADM-04: every empty state offers a way to start.
					<Button onPress={ () => setEditing( 'new' ) }>
						{ __( 'Add your first field', 'cliedesk' ) }
					</Button>
				}
			/>
		);
	} else {
		body = (
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ q.data.map( ( f ) => {
					const s = ( f.settings ?? {} ) as Record< string, unknown >;
					return (
						<li
							key={ f.id }
							className="flex flex-wrap items-center gap-4 p-4"
						>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
									<bdi>{ f.label }</bdi>
									<code className="text-xs font-normal text-fg-muted">
										{ f.key }
									</code>
									{ f.system && (
										<Pill>
											{ __( 'Built in', 'cliedesk' ) }
										</Pill>
									) }
									{ (
										s.required as
											{ resolve?: boolean } | undefined
									 )?.resolve && (
										<Pill>
											{ __(
												'Required to resolve',
												'cliedesk'
											) }
										</Pill>
									) }
									{ s.sensitive === true && (
										<Pill>
											{ __( 'Sensitive', 'cliedesk' ) }
										</Pill>
									) }
									{ f.archived && (
										<Pill tone="warning">
											{ __( 'Archived', 'cliedesk' ) }
										</Pill>
									) }
								</h2>
								<p className="text-sm text-fg-muted">
									{ fieldTypeLabel( f.type ) }
									{ OPTION_TYPES.includes( f.type ) &&
										` · ${ sprintf(
											/* translators: %d: number of options. */
											__( '%d options', 'cliedesk' ),
											( f.options ?? [] ).filter(
												( o ) => ! o.archived
											).length
										) }` }
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									onPress={ () => setEditing( f ) }
									aria-label={ sprintf(
										/* translators: %s: field name. */
										__( 'Edit %s', 'cliedesk' ),
										f.label
									) }
								>
									{ __( 'Edit', 'cliedesk' ) }
								</Button>
								{ OPTION_TYPES.includes( f.type ) &&
									! f.archived && (
										<Button
											size="sm"
											onPress={ () => setOptions( f ) }
											aria-label={ sprintf(
												/* translators: %s: field name. */
												__(
													'Options of %s',
													'cliedesk'
												),
												f.label
											) }
										>
											{ __( 'Options', 'cliedesk' ) }
										</Button>
									) }
								<Button
									size="sm"
									variant="ghost"
									isLoading={
										archive.isPending &&
										archive.variables?.id === f.id
									}
									onPress={ () => archive.mutate( f ) }
									aria-label={
										f.archived
											? sprintf(
													/* translators: %s: field name. */
													__(
														'Restore %s',
														'cliedesk'
													),
													f.label
												)
											: sprintf(
													/* translators: %s: field name. */
													__(
														'Archive %s',
														'cliedesk'
													),
													f.label
												)
									}
								>
									{ f.archived
										? __( 'Restore', 'cliedesk' )
										: __( 'Archive', 'cliedesk' ) }
								</Button>
								{ f.archived && (
									<Button
										size="sm"
										variant="ghost"
										onPress={ () => {
											remove.reset();
											setDeleting( f );
										} }
										aria-label={ sprintf(
											/* translators: %s: field name. */
											__( 'Delete %s', 'cliedesk' ),
											f.label
										) }
									>
										{ __( 'Delete', 'cliedesk' ) }
									</Button>
								) }
							</div>
						</li>
					);
				} ) }
			</ul>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			{ scope === 'conversation' && <TopicsCard /> }
			{ scope === 'conversation' && <GuidanceCard /> }
			{ scope === 'conversation' && <EntitiesCard /> }
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-wrap items-end gap-4">
					<Select
						label={ __( 'Fields of', 'cliedesk' ) }
						value={ scope }
						onChange={ ( s ) => setScope( s as Scope ) }
						options={ (
							[
								'conversation',
								'contact',
								'organization',
							] as Scope[]
						 ).map( ( s ) => ( {
							id: s,
							label: scopeLabel( s ),
						} ) ) }
					/>
					<Checkbox
						isSelected={ showArchived }
						onChange={ setShowArchived }
					>
						{ __( 'Show archived fields', 'cliedesk' ) }
					</Checkbox>
				</div>
				<Button
					variant="primary"
					iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add field', 'cliedesk' ) }
				</Button>
			</div>
			{ archive.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ describeError( archive.error ) }
				/>
			) }
			{ body }
			{ editing && (
				<FieldDialog
					scope={ scope }
					field={ editing === 'new' ? null : editing }
					onClose={ () => setEditing( null ) }
					onCreated={ setOptions }
				/>
			) }
			{ options && (
				<OptionsDialog
					field={ options }
					onClose={ () => setOptions( null ) }
				/>
			) }
			<ConfirmDestructive
				isOpen={ deleting !== null }
				onOpenChange={ ( o ) => ! o && setDeleting( null ) }
				title={ sprintf(
					/* translators: %s: field name. */
					__( 'Delete “%s”?', 'cliedesk' ),
					deleting?.label ?? ''
				) }
				description={ __(
					'Only a field without values or references can be deleted. Otherwise keep it archived.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete field', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( deleting ) {
						remove.mutate( deleting );
					}
				} }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</div>
	);
}
