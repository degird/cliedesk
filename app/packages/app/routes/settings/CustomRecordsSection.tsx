/**
 * Settings → Custom records (CRM-46): record types (Device, Contract, Warranty …) and their fields. Fields are
 * custom fields of scope custom_record tied to one type (POST fields with recordTypeId; options PUT
 * fields/{id}/options). Archiving a type hides it and its records from pickers. Drafting a type from a description
 * is a Pro feature: without Pro the button only shows the Pro badge.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	LoadingRegion,
	Modal,
	ProPill,
	Select,
	TextField,
	EmptyState,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
	recordKeys,
	recordTypesQuery,
	type RecordAccess,
	type RecordType,
} from '../../crm/customRecords';
import { rolesQuery } from '../../team/api';
import type { FieldDef } from '../../inbox/api';
import { ReasonButton, whyDisabled } from '../../components/DisabledReason';
import { ActionError, Muted, QueryFailed } from '../../inbox/components';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

const FIELD_TYPES = [
	'text',
	'long_text',
	'number',
	'decimal',
	'money',
	'date',
	'boolean',
	'select',
	'multi_select',
	'url',
] as const;

/**
 * Name of a field type.
 *
 * @param t Type key.
 */
export function fieldTypeName( t: string ): string {
	return (
		{
			text: __( 'Text', 'cliedesk' ),
			long_text: __( 'Long text', 'cliedesk' ),
			number: __( 'Whole number', 'cliedesk' ),
			decimal: __( 'Decimal number', 'cliedesk' ),
			money: __( 'Money', 'cliedesk' ),
			date: __( 'Date', 'cliedesk' ),
			boolean: __( 'Yes / no', 'cliedesk' ),
			select: __( 'Choice', 'cliedesk' ),
			multi_select: __( 'Several choices', 'cliedesk' ),
			url: __( 'Web address', 'cliedesk' ),
		}[ t ] ?? t
	);
}

function TypeDialog( { onClose }: { onClose: () => void } ) {
	const qc = useQueryClient();
	const [ name, setName ] = useState( '' );
	const [ plural, setPlural ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: () =>
			api.post< RecordType >( 'custom-record-types', {
				body: {
					name: name.trim(),
					...( plural.trim() ? { plural: plural.trim() } : {} ),
				},
			} ),
		onSuccess: () => {
			announceResult( __( 'Record type added.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: recordKeys.types } );
			onClose();
		},
	} );
	const server = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( name.trim() === '' ) {
			setError( __( 'Enter a name.', 'cliedesk' ) );
			return;
		}
		setError( null );
		save.mutate();
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Add a record type', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-record-type"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Add type', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-record-type"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ ! Object.keys( server ).length && (
					<ActionError error={ save.error } />
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					description={ __(
						'For example Warranty or Device.',
						'cliedesk'
					) }
					isRequired
					value={ name }
					onChange={ setName }
					errorMessage={ error ?? server.name ?? server.key ?? null }
				/>
				<TextField
					label={ __( 'Plural', 'cliedesk' ) }
					description={ __( 'For example Warranties.', 'cliedesk' ) }
					value={ plural }
					onChange={ setPlural }
				/>
			</form>
		</Modal>
	);
}

function AddField( { type }: { type: RecordType } ) {
	const qc = useQueryClient();
	const [ label, setLabel ] = useState( '' );
	const [ kind, setKind ] = useState< string >( 'text' );
	const [ options, setOptions ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const hasOptions = kind === 'select' || kind === 'multi_select';
	const add = useMutation( {
		mutationFn: async () => {
			const r = await api.post< FieldDef >( 'fields', {
				body: {
					scope: 'custom_record',
					recordTypeId: type.id,
					type: kind,
					label: label.trim(),
				},
			} );
			if ( hasOptions ) {
				await api.put( `fields/${ r.data.id }/options`, {
					body: {
						options: options
							.split( '\n' )
							.map( ( o ) => o.trim() )
							.filter( Boolean )
							.map( ( o ) => ( { label: o } ) ),
					},
				} );
			}
			return r;
		},
		onSuccess: () => {
			announceResult( __( 'Field added.', 'cliedesk' ) );
			setLabel( '' );
			setOptions( '' );
			void qc.invalidateQueries( { queryKey: recordKeys.types } );
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( label.trim() === '' ) {
			setError( __( 'Enter a field name.', 'cliedesk' ) );
			return;
		}
		if ( hasOptions && options.trim() === '' ) {
			setError( __( 'Enter the choices, one per line.', 'cliedesk' ) );
			return;
		}
		setError( null );
		add.mutate();
	};
	return (
		<form
			noValidate
			onSubmit={ submit }
			aria-label={ sprintf(
				/* translators: %s: record type. */
				__( 'Add a field to %s', 'cliedesk' ),
				type.name
			) }
			className="flex flex-col gap-3 rounded-md border border-line p-3"
		>
			<ActionError error={ add.error } />
			<div className="grid gap-3 sm:grid-cols-2">
				<TextField
					label={ __( 'Field name', 'cliedesk' ) }
					value={ label }
					onChange={ setLabel }
					errorMessage={ error }
				/>
				<Select
					label={ __( 'Field type', 'cliedesk' ) }
					value={ kind }
					onChange={ setKind }
					options={ FIELD_TYPES.map( ( t ) => ( {
						id: t,
						label: fieldTypeName( t ),
					} ) ) }
				/>
			</div>
			{ hasOptions && (
				<TextField
					label={ __( 'Choices (one per line)', 'cliedesk' ) }
					multiline
					rows={ 3 }
					value={ options }
					onChange={ setOptions }
				/>
			) }
			<div>
				<Button type="submit" size="sm" isLoading={ add.isPending }>
					{ __( 'Add field', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

const OPERATIONS = [ 'read', 'update', 'delete' ] as const;

const operationName = ( op: string ) =>
	( {
		read: __( 'Who can see records', 'cliedesk' ),
		update: __( 'Who can add and change records', 'cliedesk' ),
		delete: __( 'Who can delete records', 'cliedesk' ),
	} )[ op ] ?? op;

/**
 * TEAM-21: which roles may read, change and delete records of a type, and the record rule.
 *
 * @param props      Props.
 * @param props.type Record type.
 */
function AccessEditor( { type }: { type: RecordType } ) {
	const qc = useQueryClient();
	const roles = useQuery( rolesQuery() );
	const [ access, setAccess ] = useState< RecordAccess >(
		type.access ?? { read: [], update: [], delete: [], rule: 'all' }
	);
	const save = useMutation( {
		mutationFn: () =>
			api.patch( `custom-record-types/${ type.id }`, {
				body: { access },
				ifMatch: `"v${ type.version }"`,
			} ),
		onSuccess: () => {
			announceResult( __( 'Access saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: recordKeys.types } );
		},
	} );
	if ( roles.isError ) {
		return (
			<Muted>
				{ __(
					'Roles could not be loaded; access cannot be changed here.',
					'cliedesk'
				) }
			</Muted>
		);
	}
	const list = roles.data?.roles ?? [];
	return (
		<div className="flex flex-col gap-3 rounded-md border border-line p-3">
			<p className="text-sm text-fg-muted">
				{ __(
					'With no role ticked, everyone who may view or edit contacts can. People who manage settings always can.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ save.error } />
			{ OPERATIONS.map( ( op ) => (
				<fieldset key={ op } className="flex flex-col gap-1">
					<legend className="pb-1 text-sm font-medium">
						{ operationName( op ) }
					</legend>
					<div className="flex flex-wrap gap-x-4 gap-y-1">
						{ list.map( ( r ) => (
							<Checkbox
								key={ r.key }
								isSelected={ access[ op ].includes( r.key ) }
								onChange={ ( on ) =>
									setAccess( ( a ) => ( {
										...a,
										[ op ]: on
											? [ ...a[ op ], r.key ]
											: a[ op ].filter(
													( k ) => k !== r.key
												),
									} ) )
								}
							>
								{ r.name }
							</Checkbox>
						) ) }
					</div>
				</fieldset>
			) ) }
			<Select
				label={ __( 'Which records they see', 'cliedesk' ) }
				value={ access.rule }
				onChange={ ( rule ) =>
					setAccess( ( a ) => ( {
						...a,
						rule: rule as RecordAccess[ 'rule' ],
					} ) )
				}
				options={ [
					{ id: 'all', label: __( 'All records', 'cliedesk' ) },
					{
						id: 'my_products',
						label: __(
							'Records of products they work on',
							'cliedesk'
						),
					},
					{
						id: 'mine',
						label: __( 'Only records they created', 'cliedesk' ),
					},
					{
						id: 'my_organization',
						label: __(
							'Only records of their organization',
							'cliedesk'
						),
					},
				] }
			/>
			<Select
				label={ __( 'In the customer portal', 'cliedesk' ) }
				value={ access.portal ?? 'off' }
				onChange={ ( portal ) =>
					setAccess( ( a ) => ( {
						...a,
						portal: portal as RecordAccess[ 'portal' ],
					} ) )
				}
				options={ [
					{ id: 'off', label: __( 'Not shown', 'cliedesk' ) },
					{
						id: 'own',
						label: __(
							'Customers see their own records',
							'cliedesk'
						),
					},
					{
						id: 'organization',
						label: __(
							'Customers see their own and their organization’s records',
							'cliedesk'
						),
					},
				] }
			/>
			<Muted>
				{ __(
					'Customers can only read records, and see only the fields marked as visible to customers.',
					'cliedesk'
				) }
			</Muted>
			<div>
				<Button
					size="sm"
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save access', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}

function TypeCard( { type }: { type: RecordType } ) {
	const qc = useQueryClient();
	const [ showAccess, setShowAccess ] = useState( false );
	const archive = useMutation( {
		mutationFn: () =>
			api.patch( `custom-record-types/${ type.id }`, {
				body: { archived: true },
				ifMatch: `"v${ type.version }"`,
			} ),
		onSuccess: () => {
			announceResult( __( 'Record type archived.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: recordKeys.types } );
		},
	} );
	const headingId = `cd-record-type-${ type.id }`;
	return (
		<section
			aria-labelledby={ headingId }
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 id={ headingId } className="font-semibold">
					{ type.name }{ ' ' }
					<span className="font-normal text-fg-muted">
						{ sprintf(
							/* translators: %d: number of fields. */
							_n(
								'(%d field)',
								'(%d fields)',
								type.fields.length,
								'cliedesk'
							),
							type.fields.length
						) }
					</span>
				</h3>
				<Button
					size="sm"
					isLoading={ archive.isPending }
					onPress={ () => archive.mutate() }
				>
					{ sprintf(
						/* translators: %s: record type. */
						__( 'Archive %s', 'cliedesk' ),
						type.name
					) }
				</Button>
			</div>
			<ActionError error={ archive.error } />
			{ type.fields.length > 0 ? (
				<ul className="flex flex-col gap-1 text-sm">
					{ type.fields.map( ( f ) => (
						<li key={ f.key } className="flex gap-2">
							<span className="font-medium">{ f.label }</span>
							<span className="text-fg-muted">
								{ fieldTypeName( f.type ) }
							</span>
						</li>
					) ) }
				</ul>
			) : (
				<Muted>{ __( 'No fields yet.', 'cliedesk' ) }</Muted>
			) }
			<AddField type={ type } />
			<div>
				<Button
					size="sm"
					variant="link"
					aria-expanded={ showAccess }
					onPress={ () => setShowAccess( ( v ) => ! v ) }
				>
					{ sprintf(
						/* translators: %s: record type. */
						__( 'Access to %s records', 'cliedesk' ),
						type.name
					) }
				</Button>
			</div>
			{ showAccess && <AccessEditor type={ type } /> }
		</section>
	);
}

/**
 * Section.
 */
export default function CustomRecordsSection() {
	const q = useQuery( recordTypesQuery() );
	const [ adding, setAdding ] = useState( false );
	let body;
	if ( q.isPending ) {
		body = <LoadingRegion />;
	} else if ( q.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the record types', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.length ) {
		body = (
			<EmptyState
				headingLevel={ 3 }
				title={ __( 'No record types yet.', 'cliedesk' ) }
				description={ __(
					'For example “Warranty” with a serial number and an end date, linked to contacts and conversations.',
					'cliedesk'
				) }
				actions={
					// ADM-04: every empty state offers a way to start.
					<Button onPress={ () => setAdding( true ) }>
						{ __( 'Add your first record type', 'cliedesk' ) }
					</Button>
				}
			/>
		);
	} else {
		body = q.data.map( ( t ) => <TypeCard key={ t.id } type={ t } /> );
	}
	return (
		<section
			aria-labelledby="cd-custom-records"
			className="flex flex-col gap-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="cd-custom-records" className="text-lg font-semibold">
					{ __( 'Custom records', 'cliedesk' ) }
				</h2>
				<div className="flex flex-wrap gap-2">
					<ReasonButton
						isDisabled
						reason={ whyDisabled( { pro: true } ) }
					>
						<span className="inline-flex items-center gap-2">
							{ __( 'Describe a type', 'cliedesk' ) }
							<ProPill />
						</span>
					</ReasonButton>
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
						onPress={ () => setAdding( true ) }
					>
						{ __( 'Add record type', 'cliedesk' ) }
					</Button>
				</div>
			</div>
			<p className="text-sm text-fg-muted">
				{ __(
					'Keep things like devices, contracts or warranties for your customers. Records show on the customer and can be linked to conversations.',
					'cliedesk'
				) }
			</p>
			{ body }
			{ adding && <TypeDialog onClose={ () => setAdding( false ) } /> }
		</section>
	);
}
