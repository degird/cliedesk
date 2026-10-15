/**
 * CRM sections of the contact page:
 * - Organizations (CRM-30): memberships with Make primary, Remove and "Add to organization" (org picker).
 * - Possible duplicates banner (CRM-12): GET contacts/duplicates?contactId=, with Merge… and Not a duplicate.
 * - Merge history (CRM-14): GET contacts/{id}/merges with Undo while canUndo.
 * - Conversations (CRM-19): the 5 most recent, then "Show all (total)" with the cursor.
 */
import {
	api,
	can,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Banner, Button, Checkbox, Modal, TextField } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { contactKeys, type Contact } from '../inbox/api';
import { ActionError, Muted, Pill, StatusBadge } from '../inbox/components';
import { channelLabel, fullTime, relativeTime } from '../inbox/labels';
import { announceResult, apiFieldErrors } from '../workspace/forms';
import {
	RECENT_CONVERSATIONS,
	duplicatesQuery,
	fetchContactConversations,
	mergesQuery,
	reasonLabel,
	type DuplicatePair,
	type Membership,
} from './api';
import { OrgPicker, Section, type PickedItem } from './components';
import MergeDialog, { undoMerge } from './MergeDialog';

const linkClass =
	'font-medium text-accent-fg underline-offset-2 hover:underline';

// ------------------------------------------------------------------ Organizations.

function AddToOrgDialog( {
	contact,
	onClose,
}: {
	contact: Contact;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ org, setOrg ] = useState< PickedItem | null >( null );
	const [ role, setRole ] = useState( '' );
	const [ primary, setPrimary ] = useState(
		contact.organizations.length === 0
	);
	const add = useMutation( {
		mutationFn: ( orgId: number ) =>
			api.post< { organizations: Membership[] } >(
				`organizations/${ orgId }/members`,
				{
					body: {
						contactId: contact.id,
						primary,
						...( role.trim() ? { role: role.trim() } : {} ),
					},
				}
			),
		onSuccess: ( r, orgId ) => {
			setMemberships( qc, contact.id, r.data?.organizations );
			void qc.invalidateQueries( {
				queryKey: [ 'organization', orgId ],
			} );
			void qc.invalidateQueries( { queryKey: [ 'organizations' ] } );
			announceResult( __( 'Added to the organization.', 'cliedesk' ) );
			onClose();
		},
	} );
	const fields = apiFieldErrors( add.error );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Add to organization', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isDisabled={ ! org }
						isLoading={ add.isPending }
						onPress={ () => org && add.mutate( org.id ) }
					>
						{ __( 'Add', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<OrgPicker
					exclude={ contact.organizations.map( ( o ) => o.id ) }
					value={ org }
					onChange={ setOrg }
				/>
				<TextField
					label={ __( 'Role (optional)', 'cliedesk' ) }
					description={ __(
						'For example Buyer or CTO.',
						'cliedesk'
					) }
					value={ role }
					maxLength={ 100 }
					onChange={ setRole }
					errorMessage={ fields.role ?? null }
				/>
				<Checkbox isSelected={ primary } onChange={ setPrimary }>
					{ __( 'Primary organization', 'cliedesk' ) }
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

function setMemberships(
	qc: ReturnType< typeof useQueryClient >,
	contactId: number,
	organizations: Membership[] | undefined
) {
	if ( Array.isArray( organizations ) ) {
		qc.setQueryData< Contact >( contactKeys.detail( contactId ), ( old ) =>
			old ? { ...old, organizations } : old
		);
	}
	void qc.invalidateQueries( { queryKey: contactKeys.detail( contactId ) } );
}

/**
 * Organizations of a contact.
 *
 * @param props         Props.
 * @param props.contact Contact.
 */
export function ContactOrganizations( { contact }: { contact: Contact } ) {
	const qc = useQueryClient();
	const [ adding, setAdding ] = useState( false );
	const canEdit = can( 'cliedesk_edit_contacts' );
	const write = useMutation( {
		mutationFn: ( {
			orgId,
			action,
		}: {
			orgId: number;
			action: 'primary' | 'remove';
		} ) =>
			action === 'primary'
				? api.post< { organizations: Membership[] } >(
						`organizations/${ orgId }/members/${ contact.id }/primary`
					)
				: api.del< { organizations: Membership[] } >(
						`organizations/${ orgId }/members/${ contact.id }`
					),
		onSuccess: ( r, v ) => {
			setMemberships( qc, contact.id, r.data?.organizations );
			void qc.invalidateQueries( {
				queryKey: [ 'organization', v.orgId ],
			} );
			announceResult(
				v.action === 'primary'
					? __( 'Primary organization changed.', 'cliedesk' )
					: __( 'Removed from the organization.', 'cliedesk' )
			);
		},
	} );
	return (
		<Section
			id="cd-contact-orgs"
			title={ __( 'Organizations', 'cliedesk' ) }
			actions={
				canEdit && (
					<Button size="sm" onPress={ () => setAdding( true ) }>
						{ __( 'Add to organization', 'cliedesk' ) }
					</Button>
				)
			}
		>
			<ActionError
				error={ write.error }
				onDismiss={ () => write.reset() }
			/>
			{ contact.organizations.length ? (
				<ul className="flex flex-col divide-y divide-line rounded-md border border-line">
					{ contact.organizations.map( ( o ) => (
						<li
							key={ o.id }
							className="flex flex-wrap items-center gap-2 px-3 py-2"
						>
							<Link
								to="/organizations/$orgId"
								params={ { orgId: String( o.id ) } }
								className={ linkClass }
							>
								<bdi>{ o.name }</bdi>
							</Link>
							{ o.role && (
								<span className="text-sm text-fg-muted">
									<bdi>{ o.role }</bdi>
								</span>
							) }
							{ o.isPrimary && (
								<Pill tone="accent">
									{ __( 'Primary', 'cliedesk' ) }
								</Pill>
							) }
							<span className="flex-1" />
							{ canEdit && ! o.isPrimary && (
								<Button
									size="sm"
									variant="ghost"
									isLoading={
										write.isPending &&
										write.variables?.orgId === o.id &&
										write.variables.action === 'primary'
									}
									onPress={ () =>
										write.mutate( {
											orgId: o.id,
											action: 'primary',
										} )
									}
								>
									{ __( 'Make primary', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ o.name }` }</span>
								</Button>
							) }
							{ canEdit && (
								<Button
									size="sm"
									variant="ghost"
									isLoading={
										write.isPending &&
										write.variables?.orgId === o.id &&
										write.variables.action === 'remove'
									}
									onPress={ () =>
										write.mutate( {
											orgId: o.id,
											action: 'remove',
										} )
									}
								>
									{ __( 'Remove', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ o.name }` }</span>
								</Button>
							) }
						</li>
					) ) }
				</ul>
			) : (
				<Muted>
					{ __( 'Not a member of any organization.', 'cliedesk' ) }
				</Muted>
			) }
			{ adding && (
				<AddToOrgDialog
					contact={ contact }
					onClose={ () => setAdding( false ) }
				/>
			) }
		</Section>
	);
}

// ------------------------------------------------------------------ Duplicates.

/**
 * Dismiss a duplicate pair ("Not a duplicate").
 */
export function useDismissDuplicate() {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: ( pairId: number ) =>
			api.post( `contacts/duplicates/${ pairId }/dismiss` ),
		onSuccess: () => {
			void qc.invalidateQueries( {
				queryKey: [ 'contacts', 'duplicates' ],
			} );
			announceResult( __( 'Marked as not a duplicate.', 'cliedesk' ) );
		},
	} );
}

/**
 * Banner on the contact page when duplicate.list for the contact is not empty.
 *
 * @param props           Props.
 * @param props.contactId Contact.
 * @param props.name      Contact name.
 */
export function DuplicateBanner( {
	contactId,
	name,
}: {
	contactId: number;
	name: string;
} ) {
	const q = useQuery( duplicatesQuery( contactId, 10 ) );
	const dismiss = useDismissDuplicate();
	const [ merging, setMerging ] = useState< DuplicatePair | null >( null );
	const pairs = q.data ?? [];
	if ( ! pairs.length ) {
		return null;
	}
	const other = ( p: DuplicatePair ) =>
		p.contacts.find( ( c ) => c.id !== contactId ) ?? p.contacts[ 1 ];
	return (
		<Banner
			tone="warning"
			title={ _n(
				'This contact may have a duplicate',
				'This contact may have duplicates',
				pairs.length,
				'cliedesk'
			) }
		>
			<ul className="flex flex-col gap-2">
				{ pairs.map( ( p ) => {
					const o = other( p );
					const label =
						o.displayName || __( 'Unnamed contact', 'cliedesk' );
					return (
						<li
							key={ p.id }
							className="flex flex-wrap items-center gap-2"
						>
							<Link
								to="/contacts/$contactId"
								params={ { contactId: String( o.id ) } }
								className={ linkClass }
							>
								<bdi>{ label }</bdi>
							</Link>
							<span>{ reasonLabel( p.reason ) }</span>
							{ can( 'cliedesk_merge_contacts' ) && (
								<Button
									size="sm"
									onPress={ () => setMerging( p ) }
								>
									{ __( 'Merge…', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ label }` }</span>
								</Button>
							) }
							{ can( 'cliedesk_edit_contacts' ) && (
								<Button
									size="sm"
									variant="ghost"
									isLoading={
										dismiss.isPending &&
										dismiss.variables === p.id
									}
									onPress={ () => dismiss.mutate( p.id ) }
								>
									{ __( 'Not a duplicate', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ label }` }</span>
								</Button>
							) }
						</li>
					);
				} ) }
			</ul>
			<ActionError
				error={ dismiss.error }
				onDismiss={ () => dismiss.reset() }
			/>
			<Link
				to="/contacts/duplicates"
				className={ `${ linkClass } mt-2 inline-block` }
			>
				{ __( 'All possible duplicates', 'cliedesk' ) }
			</Link>
			{ merging && (
				<MergeDialog
					kind="contact"
					first={ { id: contactId, label: name } }
					second={ {
						id: other( merging ).id,
						label: other( merging ).displayName,
					} }
					onClose={ () => setMerging( null ) }
				/>
			) }
		</Banner>
	);
}

// ------------------------------------------------------------------ Merge history.

/**
 * Merges into this contact or organization, with Undo while it is allowed.
 *
 * @param props           Props.
 * @param props.contactId Contact or organization id.
 * @param props.kind      contact | organization.
 */
export function MergeHistory( {
	contactId,
	kind = 'contact',
}: {
	contactId: number;
	kind?: 'contact' | 'organization';
} ) {
	const qc = useQueryClient();
	const q = useQuery( mergesQuery( contactId, kind ) );
	const [ undoing, setUndoing ] = useState< number | null >( null );
	const items = q.data ?? [];
	if ( ! items.length ) {
		return null;
	}
	return (
		<Section
			id={ `cd-${ kind }-merges` }
			title={ __( 'Merge history', 'cliedesk' ) }
		>
			<ul className="flex flex-col divide-y divide-line rounded-md border border-line">
				{ items.map( ( m ) => (
					<li
						key={ m.id }
						className="flex flex-wrap items-center gap-2 px-3 py-2"
					>
						<span className="min-w-0 flex-1">
							{ kind === 'contact'
								? sprintf(
										/* translators: 1: contact ids such as #12, #13; 2: date and time. */
										_n(
											'Contact %1$s merged in on %2$s',
											'Contacts %1$s merged in on %2$s',
											m.sourceIds.length,
											'cliedesk'
										),
										m.sourceIds
											.map( ( id ) => `#${ id }` )
											.join( ', ' ),
										fullTime( m.createdAt )
									)
								: sprintf(
										/* translators: 1: organization ids such as #12, #13; 2: date and time. */
										_n(
											'Organization %1$s merged in on %2$s',
											'Organizations %1$s merged in on %2$s',
											m.sourceIds.length,
											'cliedesk'
										),
										m.sourceIds
											.map( ( id ) => `#${ id }` )
											.join( ', ' ),
										fullTime( m.createdAt )
									) }
						</span>
						{ m.undoneAt && (
							<Pill>{ __( 'Undone', 'cliedesk' ) }</Pill>
						) }
						{ ! m.undoneAt && m.canUndo && (
							<>
								{ m.undoUntil && (
									<span className="text-sm text-fg-muted">
										{ sprintf(
											/* translators: %s: date and time. */
											__( 'Undo until %s', 'cliedesk' ),
											fullTime( m.undoUntil )
										) }
									</span>
								) }
								{ can( 'cliedesk_merge_contacts' ) && (
									<Button
										size="sm"
										isLoading={ undoing === m.id }
										onPress={ () => {
											setUndoing( m.id );
											void undoMerge( qc, kind, m.id, [
												contactId,
												...m.sourceIds,
											] ).finally( () =>
												setUndoing( null )
											);
										} }
									>
										{ __( 'Undo', 'cliedesk' ) }
									</Button>
								) }
							</>
						) }
						{ ! m.undoneAt && ! m.canUndo && (
							<span className="text-sm text-fg-muted">
								{ __( 'Can no longer be undone', 'cliedesk' ) }
							</span>
						) }
					</li>
				) ) }
			</ul>
		</Section>
	);
}

// ------------------------------------------------------------------ Conversations (CRM-19).

/**
 * The contact's conversations: 5 most recent, then the rest on request.
 *
 * @param props           Props.
 * @param props.contactId Contact.
 */
export function ContactConversations( { contactId }: { contactId: number } ) {
	const list = useInfiniteQuery( {
		queryKey: [ 'contact', contactId, 'conversations' ] as const,
		queryFn: ( { pageParam, signal } ) =>
			fetchContactConversations(
				contactId,
				pageParam.cursor,
				pageParam.limit,
				signal
			),
		initialPageParam: {
			cursor: null as string | null,
			limit: RECENT_CONVERSATIONS,
		},
		getNextPageParam: ( last ) =>
			last.nextCursor
				? { cursor: last.nextCursor, limit: 50 }
				: undefined,
	} );
	const pages = list.data?.pages ?? [];
	const items = pages.flatMap( ( p ) => p.items );
	const total = pages[ 0 ]?.total ?? 0;
	return (
		<Section
			id="cd-contact-conversations"
			title={ __( 'Conversations', 'cliedesk' ) }
		>
			{ list.isPending && (
				<Muted>{ __( 'Loading conversations…', 'cliedesk' ) }</Muted>
			) }
			{ list.isError && (
				<div className="flex items-center gap-2">
					<Muted>
						{ __(
							'Could not load the conversations.',
							'cliedesk'
						) }
					</Muted>
					<Button size="sm" onPress={ () => void list.refetch() }>
						{ __( 'Retry', 'cliedesk' ) }
					</Button>
				</div>
			) }
			{ list.isSuccess && ! items.length && (
				<Muted>{ __( 'No conversations yet.', 'cliedesk' ) }</Muted>
			) }
			{ items.length > 0 && (
				<ul className="flex flex-col divide-y divide-line rounded-md border border-line">
					{ items.map( ( c ) => (
						<li
							key={ c.id }
							className="flex flex-wrap items-center gap-2 px-3 py-2"
						>
							<Link
								to="/c/$number"
								params={ { number: String( c.number ) } }
								className={ `${ linkClass } min-w-0 flex-1` }
							>
								<span className="cd-tabular">{ `#${ c.number }` }</span>{ ' ' }
								<bdi>
									{ c.subject ||
										__( '(no subject)', 'cliedesk' ) }
								</bdi>
							</Link>
							{ c.role === 'cc' && (
								<Pill>{ __( 'CC', 'cliedesk' ) }</Pill>
							) }
							{ c.status && (
								<StatusBadge
									label={ c.status.label }
									category={ c.status.category }
								/>
							) }
							<span className="text-sm text-fg-muted">
								{ channelLabel( c.currentChannel ) }
							</span>
							<time
								className="text-sm text-fg-muted"
								dateTime={ c.updatedAt }
								title={ fullTime( c.updatedAt ) }
							>
								{ relativeTime( c.updatedAt ) }
							</time>
						</li>
					) ) }
				</ul>
			) }
			{ list.hasNextPage && (
				<Button
					className="self-start"
					isLoading={ list.isFetchingNextPage }
					onPress={ () => void list.fetchNextPage() }
				>
					{ pages.length === 1
						? sprintf(
								/* translators: %d: number of conversations. */
								__( 'Show all (%d)', 'cliedesk' ),
								total
							)
						: __( 'Load more', 'cliedesk' ) }
				</Button>
			) }
		</Section>
	);
}
