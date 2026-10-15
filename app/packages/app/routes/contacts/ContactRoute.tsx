/**
 * `/contacts/$contactId` (CRM-01, CRM-05, CRM-06, CRM-10): profile (PATCH contacts/{id} with If-Match),
 * identities (add, make primary, verify, remove), block / unblock, Trash / restore and contact fields.
 * The screen remembers the version it last saved; a change by someone else shows the conflict banner.
 * CRM: notes (CRM-22), possible duplicates banner, "Merge with…" and merge history (CRM-12/13/14),
 * organizations (CRM-30, hidden when the contacts.organizations setting is off) and conversations (CRM-19).
 * Owner (CRM-23): the agent picker saves `ownerId`.
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
	Banner,
	Button,
	Checkbox,
	ConfirmDestructive,
	IconButton,
	LoadingRegion,
	Select,
	TextField,
	toast,
} from '@cliedesk/ui';
import { Link, useParams } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowLeft, Trash2 } from 'lucide-react';
import {
	lazy,
	Suspense,
	useState,
	type FormEvent,
	type ReactNode,
} from 'react';
import { PageHeader } from '../../components/PageHeader';
import {
	IDENTITY_TYPES,
	contactKeys,
	contactQuery,
	normaliseContact,
	type Contact,
} from '../../inbox/api';
import {
	ActionError,
	Avatar,
	Muted,
	Pill,
	QueryFailed,
} from '../../inbox/components';
import { FieldsEditor } from '../../inbox/FieldsEditor';

// DEV-19: panels other plugins registered for contacts.
const AppPanels = lazy(
	() =>
		import(
			/* webpackChunkName: "app-panels" */ '../../components/AppPanels'
		)
);
// COM-36, COM-37, COM-44: account actions and claim counters.
const CustomerAccount = lazy(
	() =>
		import(
			/* webpackChunkName: "customer-account" */ '../../crm/CustomerAccount'
		)
);
import { ConsentPanel } from '../../crm/ConsentPanel';
import { identityLabel } from '../../inbox/labels';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	validateText,
	type SummaryItem,
} from '../../workspace/forms';
import { NotFound } from '../NotFound';
import { organizationsEnabled } from '../../crm/api';
import {
	ContactConversations,
	ContactOrganizations,
	DuplicateBanner,
	MergeHistory,
} from '../../crm/ContactCrm';
import { MergeWithDialog } from '../../crm/MergeWith';
import { ContactOwner } from '../../crm/ContactOwner';
import { NotesCard } from '../../crm/Notes';
import { EntityTags } from '../../crm/EntityTags';
import { contactProfileQuery } from '../../crm/cards';
import { LazyRecordsPanel } from '../../crm/LazyRecordsPanel';
import { BlockContactDialog } from '../../crm/BlockContactDialog';
import { EndSessionsButton } from '../../crm/EndSessionsButton';
import {
	blockKeys,
	setContactBlocked,
	type BlockInput,
} from '../../security/blocks';

type ProfileField =
	'displayName' | 'language' | 'timezone' | 'country' | 'city';
const PROFILE: ProfileField[] = [
	'displayName',
	'language',
	'timezone',
	'country',
	'city',
];
const fid = ( f: string ) => `cd-contact-${ f }`;

export type ProfileValues = Record< ProfileField, string >;

/**
 * Client checks of the profile form.
 *
 * @param v Values.
 */
export function validateProfile(
	v: ProfileValues
): Partial< Record< ProfileField, string > > {
	const out: Partial< Record< ProfileField, string > > = {};
	const name = validateText( v.displayName, 191 );
	if ( name ) {
		out.displayName = name;
	}
	if (
		v.country.trim() !== '' &&
		! /^[A-Za-z]{2}$/.test( v.country.trim() )
	) {
		out.country = __(
			'Use a two-letter country code such as DE or US.',
			'cliedesk'
		);
	}
	if ( v.language.length > 12 ) {
		out.language = __(
			'Use a language code such as en or pt_BR.',
			'cliedesk'
		);
	}
	if ( v.timezone.length > 64 ) {
		out.timezone = __(
			'Use a time zone such as Europe/Berlin.',
			'cliedesk'
		);
	}
	if ( v.city.length > 100 ) {
		out.city = __( 'Enter up to 100 characters.', 'cliedesk' );
	}
	return out;
}

/**
 * Request body: empty optional fields are sent as null (cleared).
 *
 * @param v Values.
 */
export function profilePayload( v: ProfileValues ) {
	const opt = ( s: string ) => ( s.trim() === '' ? null : s.trim() );
	return {
		displayName: v.displayName.trim(),
		language: opt( v.language ),
		timezone: opt( v.timezone ),
		country: v.country.trim() ? v.country.trim().toUpperCase() : null,
		city: opt( v.city ),
	};
}

/**
 * Contact tags (CRM-01) from contact.profile.
 *
 * @param props           Props.
 * @param props.contactId Contact.
 */
function ContactTags( { contactId }: { contactId: number } ) {
	const qc = useQueryClient();
	const profile = useQuery( contactProfileQuery( contactId ) );
	if ( ! profile.data ) {
		return (
			<Muted>
				{ profile.isError
					? __( 'Could not load the tags.', 'cliedesk' )
					: __( 'Loading…', 'cliedesk' ) }
			</Muted>
		);
	}
	return (
		<EntityTags
			entity="contact"
			entityId={ contactId }
			tags={ profile.data.tags }
			onTags={ ( tags ) =>
				qc.setQueryData(
					contactProfileQuery( contactId ).queryKey,
					( old ) => ( old ? { ...old, tags } : old )
				)
			}
		/>
	);
}

function Section( {
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
} ) {
	return (
		<section
			aria-labelledby={ id }
			className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id={ id } className="text-lg font-semibold">
				{ title }
			</h2>
			{ children }
		</section>
	);
}

function ProfileForm( {
	contact,
	version,
	onSaved,
	onReload,
	canEdit,
}: {
	contact: Contact;
	version: number;
	onSaved: ( c: Contact ) => void;
	onReload: () => void;
	canEdit: boolean;
} ) {
	const [ v, setV ] = useState< ProfileValues >( () => ( {
		displayName: contact.displayName ?? '',
		language: contact.language ?? '',
		timezone: contact.timezone ?? '',
		country: contact.country ?? '',
		city: contact.city ?? '',
	} ) );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ submitted, setSubmitted ] = useState( false );
	const [ saved, setSaved ] = useState( false );
	const save = useMutation( {
		mutationFn: ( body: ReturnType< typeof profilePayload > ) =>
			api.patch< Contact >( `contacts/${ contact.id }`, {
				body,
				ifMatch: versionTag( version ),
			} ),
		onSuccess: ( r ) => {
			setSaved( true );
			onSaved( normaliseContact( r.data ) );
			announceResult( __( 'Contact saved.', 'cliedesk' ) );
		},
		onError: ( e ) =>
			setSummary(
				Object.entries( apiFieldErrors( e ) ).map(
					( [ k, message ] ) => ( {
						fieldId: fid(
							PROFILE.includes( k as ProfileField )
								? k
								: 'displayName'
						),
						message,
					} )
				)
			),
	} );
	const server = apiFieldErrors( save.error );
	const client = submitted ? validateProfile( v ) : {};
	const err = ( f: ProfileField ) => client[ f ] ?? server[ f ] ?? null;
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSubmitted( true );
		setSaved( false );
		const errors = validateProfile( v );
		const items = ( Object.keys( errors ) as ProfileField[] ).map(
			( f ) => ( {
				fieldId: fid( f ),
				message: errors[ f ] as string,
			} )
		);
		setSummary( items );
		if ( ! items.length ) {
			save.mutate( profilePayload( v ) );
		}
	};
	const field = ( f: ProfileField, label: string, description?: string ) => (
		<TextField
			id={ fid( f ) }
			label={ label }
			description={ description }
			value={ v[ f ] }
			isReadOnly={ ! canEdit }
			onChange={ ( x ) => {
				setSaved( false );
				setV( ( o ) => ( { ...o, [ f ]: x } ) );
			} }
			errorMessage={ err( f ) }
		/>
	);
	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-4">
			<ErrorSummary items={ summary } />
			{ isConflict( save.error ) && (
				<ConflictBanner
					message={ __(
						'Someone else changed this contact. Reload to see their changes.',
						'cliedesk'
					) }
					onReload={ onReload }
				/>
			) }
			<SaveError error={ save.error } />
			{ field( 'displayName', __( 'Name', 'cliedesk' ) ) }
			<div className="grid gap-4 sm:grid-cols-2">
				{ field(
					'language',
					__( 'Language', 'cliedesk' ),
					__( 'For example en or pt_BR.', 'cliedesk' )
				) }
				{ field(
					'timezone',
					__( 'Time zone', 'cliedesk' ),
					__( 'For example Europe/Berlin.', 'cliedesk' )
				) }
				{ field(
					'country',
					__( 'Country', 'cliedesk' ),
					__( 'Two-letter code, for example DE.', 'cliedesk' )
				) }
				{ field( 'city', __( 'City', 'cliedesk' ) ) }
			</div>
			{ canEdit && (
				<div className="flex items-center gap-3">
					<Button
						type="submit"
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ isConflict( save.error ) }
					>
						{ __( 'Save contact', 'cliedesk' ) }
					</Button>
					<p role="status" className="text-sm text-success">
						{ saved ? __( 'Saved', 'cliedesk' ) : '' }
					</p>
				</div>
			) }
		</form>
	);
}

function Identities( {
	contact,
	canEdit,
	onSaved,
}: {
	contact: Contact;
	canEdit: boolean;
	onSaved: ( c: Contact ) => void;
} ) {
	const [ type, setType ] = useState< string >( 'email' );
	const [ value, setValue ] = useState( '' );
	const [ primary, setPrimary ] = useState( false );
	const [ valueError, setValueError ] = useState< string | null >( null );
	const write = useMutation( {
		mutationFn: ( {
			method,
			path,
			body,
		}: {
			method: 'POST' | 'PATCH' | 'DELETE';
			path: string;
			body?: unknown;
		} ) =>
			api.request< Contact >(
				method,
				`contacts/${ contact.id }/identities${ path }`,
				{ body }
			),
		onSuccess: ( r ) => {
			onSaved( normaliseContact( r.data ) );
			announceResult( __( 'Identities updated.', 'cliedesk' ) );
		},
	} );
	const add = ( e: FormEvent ) => {
		e.preventDefault();
		if ( value.trim() === '' ) {
			setValueError( __( 'Enter a value.', 'cliedesk' ) );
			return;
		}
		write.mutate(
			{
				method: 'POST',
				path: '',
				body: { type, value: value.trim(), primary },
			},
			{
				onSuccess: () => {
					setValue( '' );
					setPrimary( false );
				},
			}
		);
	};
	const fields = apiFieldErrors( write.error );
	return (
		<div className="flex flex-col gap-3">
			{ write.error && ! fields.value && (
				<ActionError
					error={ write.error }
					onDismiss={ () => write.reset() }
				/>
			) }
			{ contact.identities.length ? (
				<ul className="flex flex-col divide-y divide-line rounded-md border border-line">
					{ contact.identities.map( ( i ) => (
						<li
							key={ i.id }
							className="flex flex-wrap items-center gap-2 px-3 py-2"
						>
							<span className="w-24 text-sm text-fg-muted">
								{ identityLabel( i.type ) }
							</span>
							<span className="min-w-0 flex-1 break-all">
								<bdi>{ i.value }</bdi>
							</span>
							{ i.primary && (
								<Pill tone="accent">
									{ __( 'Primary', 'cliedesk' ) }
								</Pill>
							) }
							{ i.verified && (
								<Pill tone="success">
									{ __( 'Verified', 'cliedesk' ) }
								</Pill>
							) }
							{ canEdit && ! i.primary && (
								<Button
									size="sm"
									variant="ghost"
									onPress={ () =>
										write.mutate( {
											method: 'PATCH',
											path: `/${ i.id }`,
											body: { primary: true },
										} )
									}
								>
									{ __( 'Make primary', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ i.value }` }</span>
								</Button>
							) }
							{ canEdit && (
								<Button
									size="sm"
									variant="ghost"
									onPress={ () =>
										write.mutate( {
											method: 'PATCH',
											path: `/${ i.id }`,
											body: { verified: ! i.verified },
										} )
									}
								>
									{ i.verified
										? __( 'Mark unverified', 'cliedesk' )
										: __( 'Mark verified', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ i.value }` }</span>
								</Button>
							) }
							{ canEdit && (
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: email, phone or other identity. */
										__( 'Remove %s', 'cliedesk' ),
										i.value
									) }
									icon={ <Trash2 size={ 14 } /> }
									onPress={ () =>
										write.mutate( {
											method: 'DELETE',
											path: `/${ i.id }`,
										} )
									}
								/>
							) }
						</li>
					) ) }
				</ul>
			) : (
				<p className="text-fg-muted">
					{ __(
						'No email addresses or phone numbers yet.',
						'cliedesk'
					) }
				</p>
			) }
			{ canEdit && (
				<form
					noValidate
					onSubmit={ add }
					className="flex flex-wrap items-end gap-2"
				>
					<Select
						className="min-w-36"
						label={ __( 'Type', 'cliedesk' ) }
						value={ type }
						onChange={ setType }
						options={ IDENTITY_TYPES.map( ( t ) => ( {
							id: t,
							label: identityLabel( t ),
						} ) ) }
					/>
					<TextField
						className="min-w-56 flex-1"
						label={ __( 'Value', 'cliedesk' ) }
						value={ value }
						onChange={ ( x ) => {
							setValue( x );
							setValueError( null );
						} }
						errorMessage={ valueError ?? fields.value ?? null }
					/>
					<Checkbox
						isSelected={ primary }
						onChange={ setPrimary }
						className="mb-2"
					>
						{ __( 'Primary', 'cliedesk' ) }
					</Checkbox>
					<Button type="submit" isLoading={ write.isPending }>
						{ __( 'Add identity', 'cliedesk' ) }
					</Button>
				</form>
			) }
		</div>
	);
}

/**
 * Contact page.
 */
export default function ContactRoute() {
	const params = useParams( { strict: false } ) as { contactId?: string };
	const id = Number( params.contactId );
	const valid = Number.isInteger( id ) && id > 0;
	const qc = useQueryClient();
	const q = useQuery( { ...contactQuery( id ), enabled: valid } );
	const [ known, setKnown ] = useState< number | null >( null );
	const [ rev, setRev ] = useState( 0 );
	const [ confirmTrash, setConfirmTrash ] = useState( false );
	const [ mergeWith, setMergeWith ] = useState( false );
	const canEdit = can( 'cliedesk_edit_contacts' );
	const version = known ?? q.data?.version ?? 0;
	const onSaved = ( c: Contact ) => {
		setKnown( c.version );
		qc.setQueryData( contactKeys.detail( id ), c );
		void qc.invalidateQueries( { queryKey: [ 'contacts' ] } );
	};
	const [ blocking, setBlocking ] = useState( false );
	const block = useMutation( {
		mutationFn: ( {
			blocked,
			details,
		}: {
			blocked: boolean;
			details?: BlockInput;
		} ) => setContactBlocked( id, blocked, version, details ),
		// A conflict closes the dialog so the page's conflict banner (with Reload) shows.
		onError: ( e ) => {
			if ( isConflict( e ) ) {
				setBlocking( false );
			}
		},
		onSuccess: ( r ) => {
			setBlocking( false );
			onSaved( normaliseContact( r ) );
			void qc.invalidateQueries( { queryKey: blockKeys.all } );
			toast( {
				tone: 'success',
				title: r.blocked
					? __( 'Contact blocked.', 'cliedesk' )
					: __( 'Contact unblocked.', 'cliedesk' ),
			} );
		},
	} );
	const trash = useMutation( {
		mutationFn: ( restore: boolean ) =>
			api.post< Contact >( `contacts/${ id }/trash`, {
				body: restore ? { restore: true } : {},
				ifMatch: versionTag( version ),
			} ),
		onSuccess: ( r ) => {
			setConfirmTrash( false );
			onSaved( normaliseContact( r.data ) );
			toast( {
				tone: 'success',
				title: r.data.trashed
					? __( 'Contact moved to Trash.', 'cliedesk' )
					: __( 'Contact restored.', 'cliedesk' ),
			} );
		},
	} );
	const reload = () => {
		setKnown( null );
		block.reset();
		trash.reset();
		void q.refetch().then( () => setRev( ( n ) => n + 1 ) );
	};

	if ( ! valid ) {
		return <NotFound />;
	}
	const back = (
		<Link
			to="/contacts"
			className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
		>
			<ArrowLeft
				aria-hidden="true"
				size={ 14 }
				className="rtl:rotate-180"
			/>
			{ __( 'All contacts', 'cliedesk' ) }
		</Link>
	);
	if ( q.isPending ) {
		return (
			<div className="mx-auto flex max-w-3xl flex-col">
				{ back }
				<PageHeader title={ __( 'Contact', 'cliedesk' ) } />
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
				<PageHeader title={ __( 'Contact', 'cliedesk' ) } />
				<QueryFailed
					title={ __( 'Could not load the contact', 'cliedesk' ) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			</div>
		);
	}
	const c = q.data;
	const name = c.displayName || __( 'Unnamed contact', 'cliedesk' );
	const statusError = block.error ?? trash.error;
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6">
			<div className="flex flex-col">
				{ back }
				<div className="flex items-start gap-4">
					<Avatar name={ name } src={ c.avatar } size={ 56 } />
					<div className="min-w-0 flex-1">
						<PageHeader
							title={ name }
							description={
								<span className="flex flex-wrap items-center gap-2">
									<span>
										{ sprintf(
											/* translators: %d: number of conversations. */
											__(
												'Conversations: %d',
												'cliedesk'
											),
											c.conversationCount
										) }
									</span>
									{ c.blocked && (
										<Pill tone="danger">
											{ __( 'Blocked', 'cliedesk' ) }
										</Pill>
									) }
									{ c.trashed && (
										<Pill tone="warning">
											{ __( 'In Trash', 'cliedesk' ) }
										</Pill>
									) }
								</span>
							}
							actions={
								<>
									{ can( 'cliedesk_merge_contacts' ) &&
										! c.trashed && (
											<Button
												onPress={ () =>
													setMergeWith( true )
												}
											>
												{ __(
													'Merge with…',
													'cliedesk'
												) }
											</Button>
										) }
									{ canEdit && (
										<Button
											isLoading={
												block.isPending && ! blocking
											}
											onPress={ () => {
												if ( c.blocked ) {
													block.mutate( {
														blocked: false,
													} );
												} else {
													block.reset();
													setBlocking( true );
												}
											} }
										>
											{ c.blocked
												? __( 'Unblock', 'cliedesk' )
												: __( 'Block', 'cliedesk' ) }
										</Button>
									) }
									{ canEdit && (
										<EndSessionsButton contactId={ c.id } />
									) }
									{ can( 'cliedesk_delete_contacts' ) &&
										( c.trashed ? (
											<Button
												isLoading={ trash.isPending }
												onPress={ () =>
													trash.mutate( true )
												}
											>
												{ __( 'Restore', 'cliedesk' ) }
											</Button>
										) : (
											<Button
												variant="danger"
												onPress={ () =>
													setConfirmTrash( true )
												}
											>
												{ __(
													'Move to Trash',
													'cliedesk'
												) }
											</Button>
										) ) }
								</>
							}
						/>
					</div>
				</div>
				<DuplicateBanner contactId={ c.id } name={ name } />
				{ c.blocked && (
					<Banner
						tone="warning"
						title={ __( 'This contact is blocked', 'cliedesk' ) }
					>
						{ __(
							'New messages from this contact do not start conversations. Their data is kept.',
							'cliedesk'
						) }
					</Banner>
				) }
				{ isConflict( statusError ) ? (
					<ConflictBanner
						message={ __(
							'Someone else changed this contact. Reload to see their changes.',
							'cliedesk'
						) }
						onReload={ reload }
					/>
				) : (
					<ActionError
						error={ blocking ? trash.error : statusError }
						onDismiss={ () => {
							block.reset();
							trash.reset();
						} }
					/>
				) }
			</div>
			<NotesCard entity="contact" entityId={ c.id } />
			<Section id="cd-contact-tags" title={ __( 'Tags', 'cliedesk' ) }>
				<ContactTags contactId={ c.id } />
			</Section>
			<Section
				id="cd-contact-profile"
				title={ __( 'Profile', 'cliedesk' ) }
			>
				<ProfileForm
					key={ `${ c.id }:${ rev }` }
					contact={ c }
					version={ version }
					onSaved={ onSaved }
					onReload={ reload }
					canEdit={ canEdit }
				/>
			</Section>
			<Section id="cd-contact-owner" title={ __( 'Owner', 'cliedesk' ) }>
				<ContactOwner
					contact={ c }
					version={ version }
					onSaved={ onSaved }
				/>
			</Section>
			<Section
				id="cd-contact-identities"
				title={ __( 'Email, phone and channels', 'cliedesk' ) }
			>
				<Identities
					contact={ c }
					canEdit={ canEdit }
					onSaved={ onSaved }
				/>
			</Section>
			{ organizationsEnabled() && <ContactOrganizations contact={ c } /> }
			{ can( 'cliedesk_view_conversations' ) && (
				<ContactConversations contactId={ c.id } />
			) }
			<Section
				id="cd-contact-fields"
				title={ __( 'Fields', 'cliedesk' ) }
			>
				<FieldsEditor
					entity="contact"
					entityId={ c.id }
					canEdit={ canEdit }
				/>
			</Section>
			<Suspense fallback={ null }>
				<AppPanels entity="contact" entityId={ c.id } />
			</Suspense>
			{ can( 'cliedesk_view_orders' ) && (
				<Suspense fallback={ null }>
					<CustomerAccount contactId={ c.id } />
				</Suspense>
			) }
			<Section
				id="cd-contact-consent"
				title={ __( 'Consent', 'cliedesk' ) }
			>
				<ConsentPanel contactId={ c.id } canEdit={ canEdit } />
			</Section>
			<LazyRecordsPanel
				entity="contact"
				entityId={ c.id }
				contactId={ c.id }
				variant="page"
			/>
			<MergeHistory contactId={ c.id } />
			{ blocking && (
				<BlockContactDialog
					name={ name }
					error={ block.error }
					isLoading={ block.isPending }
					onBlock={ ( details ) =>
						block.mutate( { blocked: true, details } )
					}
					onClose={ () => {
						setBlocking( false );
						block.reset();
					} }
				/>
			) }
			{ mergeWith && (
				<MergeWithDialog
					kind="contact"
					current={ { id: c.id, label: name } }
					onClose={ () => setMergeWith( false ) }
				/>
			) }
			<ConfirmDestructive
				isOpen={ confirmTrash }
				onOpenChange={ setConfirmTrash }
				title={ sprintf(
					/* translators: %s: contact name. */
					__( 'Move “%s” to Trash?', 'cliedesk' ),
					name
				) }
				description={ __(
					'The contact is hidden from lists and search. You can restore it from Trash.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Move to Trash', 'cliedesk' ) }
				isLoading={ trash.isPending }
				onConfirm={ () => trash.mutate( false ) }
			/>
		</div>
	);
}
