/**
 * `/organizations/$orgId` (CRM-30..33, CRM-15, CRM-22): notes, details (PATCH organizations/{id} with If-Match:
 * name, domains, parent, owner, default team, tag propagation), tags (POST tags/apply), members (add, remove),
 * child organizations, "Merge with…" and delete with confirmation. Activity figures, possible duplicates and recent
 * conversations: crm/OrgInsights (CRM-26, CRM-15).
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
	Checkbox,
	ConfirmDestructive,
	LoadingRegion,
	Modal,
	TextField,
	toast,
} from '@cliedesk/ui';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import {
	orgErrors,
	orgKeys,
	orgQuery,
	normaliseOrg,
	type Organization,
	type OrganizationDetail,
} from '../../crm/api';
import { ContactPicker, Section, type PickedItem } from '../../crm/components';
import { LazyRecordsPanel } from '../../crm/LazyRecordsPanel';
import { orgSummary } from '../../crm/CreateOrgDialog';
import { MergeHistory } from '../../crm/ContactCrm';
import { MergeWithDialog } from '../../crm/MergeWith';
import { NotesCard } from '../../crm/Notes';
import { EntityTags } from '../../crm/EntityTags';
import { FieldsEditor } from '../../inbox/FieldsEditor';
import {
	OrgActivity,
	OrgConversations,
	OrgDuplicates,
} from '../../crm/OrgInsights';
import {
	OrgFields,
	orgPayload,
	orgValues,
	validateOrg,
	type OrgErrors,
	type OrgValues,
} from '../../crm/OrgForm';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	type SummaryItem,
} from '../../workspace/forms';
import { NotFound } from '../NotFound';

const PREFIX = 'cd-org';
const linkClass =
	'font-medium text-accent-fg underline-offset-2 hover:underline';

function DetailsForm( {
	org,
	version,
	onSaved,
	onReload,
	canEdit,
}: {
	org: OrganizationDetail;
	version: number;
	onSaved: ( o: Organization ) => void;
	onReload: () => void;
	canEdit: boolean;
} ) {
	const [ v, setV ] = useState< OrgValues >( () => orgValues( org ) );
	const [ submitted, setSubmitted ] = useState( false );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ saved, setSaved ] = useState( false );
	const save = useMutation( {
		mutationFn: ( body: ReturnType< typeof orgPayload > ) =>
			api.patch< Organization >( `organizations/${ org.id }`, {
				body,
				ifMatch: versionTag( version ),
			} ),
		onSuccess: ( r ) => {
			setSaved( true );
			onSaved( normaliseOrg( r.data ) );
			announceResult( __( 'Organization saved.', 'cliedesk' ) );
		},
		onError: ( e, body ) =>
			setSummary(
				orgSummary(
					PREFIX,
					orgErrors( apiFieldErrors( e ), body.domains ),
					body.domains
				)
			),
	} );
	const server = orgErrors(
		apiFieldErrors( save.error ),
		save.variables?.domains ?? []
	);
	const errors: OrgErrors = {
		form: { ...server.form, ...( submitted ? validateOrg( v ) : {} ) },
		domains: server.domains,
	};
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSubmitted( true );
		setSaved( false );
		const items = orgSummary(
			PREFIX,
			{ form: validateOrg( v ), domains: {} },
			v.domains
		);
		setSummary( items );
		if ( ! items.length ) {
			save.mutate( orgPayload( v ) );
		}
	};
	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-4">
			<ErrorSummary items={ summary } />
			{ isConflict( save.error ) && (
				<ConflictBanner
					message={ __(
						'Someone else changed this organization. Reload to see their changes.',
						'cliedesk'
					) }
					onReload={ onReload }
				/>
			) }
			<SaveError error={ save.error } />
			<OrgFields
				prefix={ PREFIX }
				values={ v }
				selfId={ org.id }
				isReadOnly={ ! canEdit }
				onChange={ ( patch ) => {
					setSaved( false );
					setV( ( o ) => ( { ...o, ...patch } ) );
				} }
				errors={ errors }
			/>
			{ canEdit && (
				<div className="flex items-center gap-3">
					<Button
						type="submit"
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ isConflict( save.error ) }
					>
						{ __( 'Save organization', 'cliedesk' ) }
					</Button>
					<p role="status" className="text-sm text-success">
						{ saved ? __( 'Saved', 'cliedesk' ) : '' }
					</p>
				</div>
			) }
		</form>
	);
}

function Tags( { org }: { org: OrganizationDetail } ) {
	const qc = useQueryClient();
	return (
		<EntityTags
			entity="organization"
			entityId={ org.id }
			tags={ org.tags }
			onTags={ ( tags ) =>
				qc.setQueryData< OrganizationDetail >(
					orgKeys.detail( org.id ),
					( old ) => ( old ? { ...old, tags } : old )
				)
			}
		>
			{ org.propagateTags && (
				<Muted>
					{ __(
						'New conversations of members get these tags.',
						'cliedesk'
					) }
				</Muted>
			) }
		</EntityTags>
	);
}

function AddMemberDialog( {
	org,
	onClose,
}: {
	org: OrganizationDetail;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ contact, setContact ] = useState< PickedItem | null >( null );
	const [ role, setRole ] = useState( '' );
	const [ primary, setPrimary ] = useState( false );
	const add = useMutation( {
		mutationFn: ( contactId: number ) =>
			api.post( `organizations/${ org.id }/members`, {
				body: {
					contactId,
					primary,
					...( role.trim() ? { role: role.trim() } : {} ),
				},
			} ),
		onSuccess: ( _r, contactId ) => {
			void qc.invalidateQueries( {
				queryKey: [ 'organization', org.id ],
			} );
			void qc.invalidateQueries( { queryKey: [ 'contact', contactId ] } );
			void qc.invalidateQueries( { queryKey: orgKeys.all } );
			announceResult( __( 'Member added.', 'cliedesk' ) );
			onClose();
		},
	} );
	const fields = apiFieldErrors( add.error );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Add a member', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isDisabled={ ! contact }
						isLoading={ add.isPending }
						onPress={ () => contact && add.mutate( contact.id ) }
					>
						{ __( 'Add member', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<ContactPicker
					exclude={ org.members.map( ( m ) => m.contactId ) }
					value={ contact }
					onChange={ setContact }
				/>
				<TextField
					label={ __( 'Role (optional)', 'cliedesk' ) }
					value={ role }
					maxLength={ 100 }
					onChange={ setRole }
					errorMessage={ fields.role ?? null }
				/>
				<Checkbox isSelected={ primary } onChange={ setPrimary }>
					{ __( 'Make this their primary organization', 'cliedesk' ) }
				</Checkbox>
				{ add.error && ! fields.role && (
					<ActionError
						error={ add.error }
						onDismiss={ () => add.reset() }
					/>
				) }
			</div>
		</Modal>
	);
}

function Members( { org }: { org: OrganizationDetail } ) {
	const qc = useQueryClient();
	const [ adding, setAdding ] = useState( false );
	const canEdit = can( 'cliedesk_edit_contacts' );
	// PRT-18: a member may reply for the organization in the portal.
	const replyFor = useMutation( {
		mutationFn: ( body: { contactId: number; canReply: boolean } ) =>
			api.post( `organizations/${ org.id }/members`, { body } ),
		onSuccess: ( _r, body ) =>
			qc.setQueryData< OrganizationDetail >(
				orgKeys.detail( org.id ),
				( old ) =>
					old && {
						...old,
						members: old.members.map( ( m ) =>
							m.contactId === body.contactId
								? { ...m, canReply: body.canReply }
								: m
						),
					}
			),
	} );
	const remove = useMutation( {
		mutationFn: ( contactId: number ) =>
			api.del( `organizations/${ org.id }/members/${ contactId }` ),
		onSuccess: ( _r, contactId ) => {
			qc.setQueryData< OrganizationDetail >(
				orgKeys.detail( org.id ),
				( old ) =>
					old
						? {
								...old,
								members: old.members.filter(
									( m ) => m.contactId !== contactId
								),
							}
						: old
			);
			void qc.invalidateQueries( {
				queryKey: [ 'organization', org.id ],
			} );
			void qc.invalidateQueries( { queryKey: [ 'contact', contactId ] } );
			announceResult( __( 'Member removed.', 'cliedesk' ) );
		},
	} );
	return (
		<Section
			id="cd-org-members"
			title={ __( 'Members', 'cliedesk' ) }
			actions={
				canEdit && (
					<Button size="sm" onPress={ () => setAdding( true ) }>
						{ __( 'Add member', 'cliedesk' ) }
					</Button>
				)
			}
		>
			<ActionError
				error={ remove.error }
				onDismiss={ () => remove.reset() }
			/>
			{ org.members.length ? (
				<ul className="flex flex-col divide-y divide-line rounded-md border border-line">
					{ org.members.map( ( m ) => {
						const label =
							m.displayName ||
							__( 'Unnamed contact', 'cliedesk' );
						return (
							<li
								key={ m.contactId }
								className="flex flex-wrap items-center gap-2 px-3 py-2"
							>
								<Link
									to="/contacts/$contactId"
									params={ {
										contactId: String( m.contactId ),
									} }
									className={ linkClass }
								>
									<bdi>{ label }</bdi>
								</Link>
								{ m.role && (
									<span className="text-sm text-fg-muted">
										<bdi>{ m.role }</bdi>
									</span>
								) }
								{ m.isPrimary && (
									<Pill tone="accent">
										{ __(
											'Primary organization',
											'cliedesk'
										) }
									</Pill>
								) }
								<span className="flex-1" />
								<Checkbox
									isSelected={ !! m.canReply }
									isReadOnly={ ! canEdit }
									onChange={ ( on ) =>
										replyFor.mutate( {
											contactId: m.contactId,
											canReply: on,
										} )
									}
								>
									{ __(
										'Can reply for the organization',
										'cliedesk'
									) }
									<span className="sr-only">{ ` ${ label }` }</span>
								</Checkbox>
								{ canEdit && (
									<Button
										size="sm"
										variant="ghost"
										isLoading={
											remove.isPending &&
											remove.variables === m.contactId
										}
										onPress={ () =>
											remove.mutate( m.contactId )
										}
									>
										{ __( 'Remove', 'cliedesk' ) }
										<span className="sr-only">{ ` ${ label }` }</span>
									</Button>
								) }
							</li>
						);
					} ) }
				</ul>
			) : (
				<Muted>{ __( 'No members yet.', 'cliedesk' ) }</Muted>
			) }
			{ org.memberCount > org.members.length && (
				<Muted>
					{ sprintf(
						/* translators: 1: members shown, 2: all members. */
						__( 'Showing %1$d of %2$d members.', 'cliedesk' ),
						org.members.length,
						org.memberCount
					) }
				</Muted>
			) }
			{ adding && (
				<AddMemberDialog
					org={ org }
					onClose={ () => setAdding( false ) }
				/>
			) }
		</Section>
	);
}

/**
 * Organization page.
 */
export default function OrganizationRoute() {
	const params = useParams( { strict: false } ) as { orgId?: string };
	const id = Number( params.orgId );
	const valid = Number.isInteger( id ) && id > 0;
	const qc = useQueryClient();
	const navigate = useNavigate();
	const q = useQuery( { ...orgQuery( id ), enabled: valid } );
	const [ known, setKnown ] = useState< number | null >( null );
	const [ rev, setRev ] = useState( 0 );
	const [ confirmDelete, setConfirmDelete ] = useState( false );
	const [ mergeWith, setMergeWith ] = useState( false );
	const canEdit = can( 'cliedesk_edit_contacts' );
	const version = known ?? q.data?.version ?? 0;
	const onSaved = ( o: Organization ) => {
		setKnown( o.version );
		qc.setQueryData< OrganizationDetail >( orgKeys.detail( id ), ( old ) =>
			old ? { ...old, ...o } : old
		);
		void qc.invalidateQueries( { queryKey: orgKeys.all } );
	};
	const remove = useMutation( {
		mutationFn: () => api.del( `organizations/${ id }` ),
		onSuccess: () => {
			setConfirmDelete( false );
			void qc.invalidateQueries( { queryKey: orgKeys.all } );
			qc.removeQueries( { queryKey: [ 'organization', id ] } );
			toast( {
				tone: 'success',
				title: __( 'Organization deleted.', 'cliedesk' ),
			} );
			void navigate( { to: '/organizations' } );
		},
	} );
	const reload = () => {
		setKnown( null );
		void q.refetch().then( () => setRev( ( n ) => n + 1 ) );
	};

	if ( ! valid ) {
		return <NotFound />;
	}
	const back = (
		<Link
			to="/organizations"
			className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
		>
			<ArrowLeft
				aria-hidden="true"
				size={ 14 }
				className="rtl:rotate-180"
			/>
			{ __( 'All organizations', 'cliedesk' ) }
		</Link>
	);
	if ( q.isPending ) {
		return (
			<div className="mx-auto flex max-w-3xl flex-col">
				{ back }
				<PageHeader title={ __( 'Organization', 'cliedesk' ) } />
				<LoadingRegion />
			</div>
		);
	}
	if ( q.isError ) {
		if ( isApiError( q.error ) && q.error.status === 404 ) {
			return <NotFound />;
		}
		return (
			<div className="mx-auto flex max-w-3xl flex-col">
				{ back }
				<PageHeader title={ __( 'Organization', 'cliedesk' ) } />
				<QueryFailed
					title={ __(
						'Could not load the organization',
						'cliedesk'
					) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			</div>
		);
	}
	const o = q.data;
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6">
			<div className="flex flex-col">
				{ back }
				<PageHeader
					title={ o.name }
					description={
						<span className="flex flex-wrap items-center gap-2">
							<span>
								{ sprintf(
									/* translators: %d: number of members. */
									_n(
										'%d member',
										'%d members',
										o.memberCount,
										'cliedesk'
									),
									o.memberCount
								) }
							</span>
							{ o.parentId && (
								<span>
									{ __( 'Part of', 'cliedesk' ) }{ ' ' }
									<Link
										to="/organizations/$orgId"
										params={ {
											orgId: String( o.parentId ),
										} }
										className={ linkClass }
									>
										<bdi>
											{ o.parentName ??
												`#${ o.parentId }` }
										</bdi>
									</Link>
								</span>
							) }
						</span>
					}
					actions={
						<>
							{ can( 'cliedesk_merge_contacts' ) && (
								<Button onPress={ () => setMergeWith( true ) }>
									{ __( 'Merge with…', 'cliedesk' ) }
								</Button>
							) }
							{ can( 'cliedesk_delete_contacts' ) && (
								<Button
									variant="danger"
									onPress={ () => setConfirmDelete( true ) }
								>
									{ __( 'Delete', 'cliedesk' ) }
								</Button>
							) }
						</>
					}
				/>
			</div>
			<OrgDuplicates org={ o } />
			<NotesCard entity="organization" entityId={ o.id } />
			<OrgActivity orgId={ o.id } />
			<OrgConversations orgId={ o.id } />
			<Section id="cd-org-details" title={ __( 'Details', 'cliedesk' ) }>
				<DetailsForm
					key={ `${ o.id }:${ rev }` }
					org={ o }
					version={ version }
					onSaved={ onSaved }
					onReload={ reload }
					canEdit={ canEdit }
				/>
			</Section>
			<Section id="cd-org-tags" title={ __( 'Tags', 'cliedesk' ) }>
				<Tags org={ o } />
			</Section>
			<Section id="cd-org-fields" title={ __( 'Fields', 'cliedesk' ) }>
				<FieldsEditor
					entity="organization"
					entityId={ o.id }
					canEdit={ can( 'cliedesk_edit_contacts' ) }
				/>
			</Section>
			<Members org={ o } />
			<Section
				id="cd-org-children"
				title={ __( 'Child organizations', 'cliedesk' ) }
			>
				{ o.children.length ? (
					<ul className="flex flex-col gap-1">
						{ o.children.map( ( c ) => (
							<li key={ c.id }>
								<Link
									to="/organizations/$orgId"
									params={ { orgId: String( c.id ) } }
									className={ linkClass }
								>
									<bdi>{ c.name }</bdi>
								</Link>
							</li>
						) ) }
					</ul>
				) : (
					<Muted>
						{ __( 'No child organizations.', 'cliedesk' ) }
					</Muted>
				) }
			</Section>
			<LazyRecordsPanel
				entity="organization"
				entityId={ o.id }
				variant="page"
			/>
			<MergeHistory kind="organization" contactId={ o.id } />
			{ mergeWith && (
				<MergeWithDialog
					kind="organization"
					current={ { id: o.id, label: o.name } }
					onClose={ () => setMergeWith( false ) }
				/>
			) }
			<ConfirmDestructive
				isOpen={ confirmDelete }
				onOpenChange={ ( open ) => {
					setConfirmDelete( open );
					if ( ! open ) {
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: organization name. */
					__( 'Delete “%s”?', 'cliedesk' ),
					o.name
				) }
				description={ __(
					'Its members stay as contacts but leave the organization, and its domains are removed. Child organizations move up to its parent.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete organization', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => remove.mutate() }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</div>
	);
}
