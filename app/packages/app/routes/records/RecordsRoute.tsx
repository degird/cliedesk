/**
 * Custom records (CRM-46): the records of one type (/records/$typeKey), searchable by title, with add, edit and
 * delete. /records/$typeKey/$recordId opens that record (links from record panels point here). Record fields come
 * from the type and use the same inputs as other custom fields.
 */
import {
	api,
	can,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	ConfirmDestructive,
	LoadingRegion,
	Modal,
	Select,
	TextField,
	EmptyState,
} from '@cliedesk/ui';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ContactPicker, type PickedItem } from '../../crm/components';
import {
	recordKeys,
	recordTypesQuery,
	recordsQuery,
	type CustomRecord,
	type RecordType,
} from '../../crm/customRecords';
import { contactQuery } from '../../inbox/api';
import { ActionError, Muted, QueryFailed } from '../../inbox/components';
import { FieldInput, fromDraft, toDraft } from '../../inbox/FieldInput';
import { relativeTime } from '../../inbox/labels';

function OwnerName( { id }: { id: number } ) {
	const q = useQuery( contactQuery( id ) );
	return (
		<Link
			to="/contacts/$contactId"
			params={ { contactId: String( id ) } }
			className="text-accent-fg underline-offset-2 hover:underline"
		>
			{ q.data?.displayName || `#${ id }` }
		</Link>
	);
}

function RecordDialog( {
	type,
	record,
	onClose,
}: {
	type: RecordType;
	record: CustomRecord | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ title, setTitle ] = useState( record?.title ?? '' );
	const [ owner, setOwner ] = useState< PickedItem | null >(
		record?.contactId
			? { id: record.contactId, label: `#${ record.contactId }` }
			: null
	);
	const [ drafts, setDrafts ] = useState< Record< string, unknown > >( () =>
		Object.fromEntries(
			type.fields.map( ( f ) => [
				f.key,
				toDraft( f, record?.values[ f.key ] ?? null ),
			] )
		)
	);
	const [ titleError, setTitleError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: () => {
			const values = Object.fromEntries(
				type.fields
					.map( ( f ) => [
						f.key,
						fromDraft(
							f,
							drafts[ f.key ],
							record?.values[ f.key ] ?? null
						),
					] )
					.filter( ( [ , v ] ) => record || v !== null )
			);
			const body = {
				title: title.trim(),
				contactId: owner?.id ?? null,
				values: JSON.stringify( values ),
			};
			return record
				? api.patch< CustomRecord >( `custom-records/${ record.id }`, {
						body,
						ifMatch: `"v${ record.version }"`,
					} )
				: api.post< CustomRecord >( 'custom-records', {
						body: { typeId: type.id, ...body },
					} );
		},
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: recordKeys.all } );
			onClose();
		},
	} );
	const fieldErrors = isApiError( save.error ) ? save.error.fields : {};
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( title.trim() === '' ) {
			setTitleError( __( 'Enter a title.', 'cliedesk' ) );
			return;
		}
		setTitleError( null );
		save.mutate();
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={
				record
					? sprintf(
							/* translators: %s: record type, e.g. Warranty. */
							__( 'Edit %s', 'cliedesk' ),
							type.name
						)
					: sprintf(
							/* translators: %s: record type, e.g. Warranty. */
							__( 'New %s', 'cliedesk' ),
							type.name
						)
			}
			size="lg"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-record-form"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-record-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ ! Object.keys( fieldErrors ).length && (
					<ActionError error={ save.error } />
				) }
				<TextField
					label={ __( 'Title', 'cliedesk' ) }
					isRequired
					value={ title }
					onChange={ setTitle }
					errorMessage={ titleError ?? fieldErrors.title ?? null }
				/>
				<div className="flex flex-col gap-1">
					<span className="text-sm font-medium">
						{ __( 'Customer', 'cliedesk' ) }
					</span>
					<ContactPicker value={ owner } onChange={ setOwner } />
					{ owner && (
						<div>
							<Button
								size="sm"
								variant="link"
								onPress={ () => setOwner( null ) }
							>
								{ __( 'No customer', 'cliedesk' ) }
							</Button>
						</div>
					) }
				</div>
				{ type.fields.map( ( f ) => (
					<FieldInput
						key={ f.key }
						def={ f }
						id={ `cd-record-field-${ f.key }` }
						draft={ drafts[ f.key ] }
						onChange={ ( v ) =>
							setDrafts( ( d ) => ( { ...d, [ f.key ]: v } ) )
						}
						required={ false }
						error={
							fieldErrors[ `values.${ f.key }` ] ??
							fieldErrors[ f.key ] ??
							null
						}
						currency={
							typeof f.settings?.currency === 'string'
								? f.settings.currency
								: undefined
						}
					/>
				) ) }
			</form>
		</Modal>
	);
}

/**
 * Route.
 */
export default function RecordsRoute() {
	const params = useParams( { strict: false } ) as {
		typeKey?: string;
		recordId?: string;
	};
	const navigate = useNavigate();
	const qc = useQueryClient();
	const types = useQuery( recordTypesQuery() );
	const type =
		types.data?.find( ( t ) => t.key === params.typeKey ) ??
		types.data?.[ 0 ];
	const [ input, setInput ] = useState( '' );
	const [ q, setQ ] = useState( '' );
	const [ editing, setEditing ] = useState< CustomRecord | 'new' | null >(
		null
	);
	const [ deleting, setDeleting ] = useState< CustomRecord | null >( null );
	const list = useQuery( {
		...recordsQuery( type?.id ?? 0, q ),
		enabled: !! type,
	} );
	const linked = params.recordId
		? list.data?.find( ( r ) => r.id === Number( params.recordId ) )
		: undefined;
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `custom-records/${ id }` ),
		onSuccess: () => {
			setDeleting( null );
			void qc.invalidateQueries( { queryKey: recordKeys.all } );
		},
	} );
	const canEdit = can( 'cliedesk_edit_contacts' );
	if ( types.isPending ) {
		return <LoadingRegion />;
	}
	if ( types.isError ) {
		return (
			<QueryFailed
				title={ __( 'Could not load the record types', 'cliedesk' ) }
				error={ types.error }
				onRetry={ () => void types.refetch() }
			/>
		);
	}
	if ( ! type ) {
		return (
			<div className="mx-auto flex max-w-5xl flex-col">
				<PageHeader title={ __( 'Records', 'cliedesk' ) } />
				<EmptyState
					title={ __( 'No record types yet', 'cliedesk' ) }
					description={ __(
						'There are no record types yet. An admin adds them in Settings → Custom records, for example “Warranty” with a serial number and an end date.',
						'cliedesk'
					) }
					actions={
						// ADM-04: every empty state offers a way to start.
						can( 'cliedesk_manage_settings' ) && (
							<Link
								to="/settings/$area/$section"
								params={ {
									area: 'conversations',
									section: 'custom-records',
								} }
								className="inline-flex h-(--cd-control-h) items-center rounded-md bg-accent px-(--cd-control-px) font-medium text-on-accent hover:bg-accent-hover"
							>
								{ __( 'Add a record type', 'cliedesk' ) }
							</Link>
						)
					}
				/>
			</div>
		);
	}
	const open = editing ?? linked ?? null;
	let body;
	if ( list.isPending ) {
		body = <LoadingRegion />;
	} else if ( list.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 2 }
				title={ __( 'Could not load the records', 'cliedesk' ) }
				error={ list.error }
				onRetry={ () => void list.refetch() }
			/>
		);
	} else if ( ! list.data.length && q ) {
		body = <Muted>{ __( 'No records match.', 'cliedesk' ) }</Muted>;
	} else if ( ! list.data.length ) {
		body = (
			<EmptyState
				headingLevel={ 2 }
				title={ __( 'No records yet.', 'cliedesk' ) }
				actions={
					// ADM-04: every empty state offers a way to start.
					canEdit && (
						<Button
							variant="primary"
							onPress={ () => setEditing( 'new' ) }
						>
							{ sprintf(
								/* translators: %s: record type, e.g. Warranty. */
								__( 'Add your first %s', 'cliedesk' ),
								type.name
							) }
						</Button>
					)
				}
			/>
		);
	} else {
		body = (
			<table className="w-full text-sm">
				<caption className="sr-only">{ type.plural }</caption>
				<thead>
					<tr className="text-start text-fg-muted">
						<th scope="col" className="py-2 text-start font-medium">
							{ __( 'Title', 'cliedesk' ) }
						</th>
						<th scope="col" className="py-2 text-start font-medium">
							{ __( 'Customer', 'cliedesk' ) }
						</th>
						<th scope="col" className="py-2 text-start font-medium">
							{ __( 'Updated', 'cliedesk' ) }
						</th>
						{ canEdit && (
							<th scope="col" className="sr-only">
								{ __( 'Actions', 'cliedesk' ) }
							</th>
						) }
					</tr>
				</thead>
				<tbody>
					{ list.data.map( ( r ) => (
						<tr key={ r.id } className="border-t border-line">
							<th
								scope="row"
								className="py-2 pe-3 text-start font-medium"
							>
								{ r.title }
							</th>
							<td className="py-2 pe-3">
								{ r.contactId ? (
									<OwnerName id={ r.contactId } />
								) : (
									<span className="text-fg-muted">—</span>
								) }
							</td>
							<td className="py-2 pe-3 text-fg-muted">
								{ relativeTime( r.updatedAt ) }
							</td>
							{ canEdit && (
								<td className="py-2 text-end">
									<span className="inline-flex gap-2">
										<Button
											size="sm"
											onPress={ () => setEditing( r ) }
										>
											{ sprintf(
												/* translators: %s: record title. */
												__( 'Edit %s', 'cliedesk' ),
												r.title
											) }
										</Button>
										<Button
											size="sm"
											variant="danger"
											onPress={ () => setDeleting( r ) }
										>
											{ sprintf(
												/* translators: %s: record title. */
												__( 'Delete %s', 'cliedesk' ),
												r.title
											) }
										</Button>
									</span>
								</td>
							) }
						</tr>
					) ) }
				</tbody>
			</table>
		);
	}
	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-4">
			<PageHeader
				title={ type.plural }
				description={ __(
					'Records your team keeps about customers, such as devices or contracts.',
					'cliedesk'
				) }
				actions={
					canEdit ? (
						<Button
							variant="primary"
							iconStart={
								<Plus aria-hidden="true" size={ 16 } />
							}
							onPress={ () => setEditing( 'new' ) }
						>
							{ sprintf(
								/* translators: %s: record type, e.g. Warranty. */
								__( 'New %s', 'cliedesk' ),
								type.name
							) }
						</Button>
					) : undefined
				}
			/>
			<div className="flex flex-wrap items-end gap-3">
				{ ( types.data?.length ?? 0 ) > 1 && (
					<Select
						label={ __( 'Record type', 'cliedesk' ) }
						value={ type.key }
						onChange={ ( key ) =>
							void navigate( {
								to: '/records/$typeKey',
								params: { typeKey: key },
							} )
						}
						options={ ( types.data ?? [] ).map( ( t ) => ( {
							id: t.key,
							label: t.plural,
						} ) ) }
					/>
				) }
				<form
					role="search"
					noValidate
					onSubmit={ ( e ) => {
						e.preventDefault();
						setQ( input.trim() );
					} }
					className="flex items-end gap-2"
				>
					<TextField
						label={ __( 'Search by title', 'cliedesk' ) }
						value={ input }
						onChange={ setInput }
					/>
					<Button type="submit">
						{ __( 'Search', 'cliedesk' ) }
					</Button>
				</form>
			</div>
			{ body }
			{ open && (
				<RecordDialog
					type={ type }
					record={ open === 'new' ? null : open }
					onClose={ () => {
						setEditing( null );
						if ( params.recordId ) {
							void navigate( {
								to: '/records/$typeKey',
								params: { typeKey: type.key },
							} );
						}
					} }
				/>
			) }
			<ConfirmDestructive
				isOpen={ deleting !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setDeleting( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: record title. */
					__( 'Delete “%s”?', 'cliedesk' ),
					deleting?.title ?? ''
				) }
				description={ __(
					'Links to it from conversations stay, marked as unavailable.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete record', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( deleting ) {
						remove.mutate( deleting.id );
					}
				} }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</div>
	);
}
