/**
 * Conversation side panel: customer and organization cards (CRM-18, order and visibility from GET cards/…), tags, fields, linked records (CRM-44/45, hidden without record sources),
 * checklist, links, trackers, tasks, reminders and participants (CCs, follow).
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	Checkbox,
	IconButton,
	Select,
	Slot,
	Switch,
	TextField,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import {
	Suspense,
	lazy,
	useEffect,
	useState,
	useSyncExternalStore,
	type FormEvent,
	type ReactNode,
} from 'react';
import { prefsStore, savePrefs, type Prefs } from '../../prefs';
import {
	arrangePanel,
	myPanelLayoutQuery,
	panelContextQuery,
	type PanelLayout,
} from '../../inbox/panel';
import {
	checklistQuery,
	checklistTemplatesQuery,
	contactQuery,
	conversationKeys,
	linksQuery,
	normaliseChecklist,
	tagsQuery,
	type Checklist,
	type Conversation,
	type Participant,
	type TagRef,
} from '../../inbox/api';
import {
	ActionError,
	Avatar,
	Muted,
	PanelSection,
	PanelSlot,
	Pill,
} from '../../inbox/components';
const PanelCustomizeDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-panel-customize" */ './PanelCustomize'
		)
);
import { needsRole } from '../../components/DisabledReason';
import { LazyRecordsPanel } from '../../crm/LazyRecordsPanel';
import { FieldsEditor } from '../../inbox/FieldsEditor';
import { LINK_TYPES, identityLabel, linkLabel } from '../../inbox/labels';
import { announceResult, validateEmail } from '../../workspace/forms';
import { RemindersPanel } from './Reminders';
import { ManageParticipants } from './ManageParticipants';

const ChangeCustomerDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-change-customer" */ './ChangeCustomer'
		)
);
// DEV-19: panels other plugins registered.
const AppPanels = lazy(
	() =>
		import(
			/* webpackChunkName: "app-panels" */ '../../components/AppPanels'
		)
);
const OrdersCard = lazy(
	() => import( /* webpackChunkName: "conversation-orders" */ './OrdersCard' )
);
// COM-29, COM-35: subscriptions and licences, read-only.
const ShopRecordsCard = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-shop-records" */ './ShopRecordsCard'
		)
);
// COM-36, COM-37, COM-44: customer account actions and claim counters.
const CustomerAccount = lazy(
	() =>
		import(
			/* webpackChunkName: "customer-account" */ '../../crm/CustomerAccount'
		)
);
const ContextCard = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-context-cards" */ './ContextCards'
		)
);
const CustomerChips = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-customer-chips" */ './CustomerChips'
		)
);
import { afterChange, mergeDetail, usePane } from './shared';
import { Properties } from './Properties';
import { TasksSection, TrackerSection, useIsTracker } from './Tasks';
import { organizationsEnabled } from '../../crm/settings';
import {
	ContactCards,
	OrganizationCards,
	useMyCards,
} from '../../crm/CustomerCard';

function Requester( {
	id,
	cards,
}: {
	id: number;
	cards: ReturnType< typeof useMyCards >;
} ) {
	const q = useQuery( {
		...contactQuery( id ),
		enabled: can( 'cliedesk_view_contacts' ),
	} );
	if ( ! can( 'cliedesk_view_contacts' ) ) {
		return (
			<Muted>
				{ __( 'You cannot see contact details.', 'cliedesk' ) }
			</Muted>
		);
	}
	if ( q.isPending ) {
		return <Muted>{ __( 'Loading…', 'cliedesk' ) }</Muted>;
	}
	if ( q.isError ) {
		return (
			<Muted>{ __( 'Could not load the customer.', 'cliedesk' ) }</Muted>
		);
	}
	const c = q.data;
	// Without a layout (still loading, failed or empty) the card shows the contact's identities as before.
	const layout = !! cards.layout?.items.length;
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<Avatar name={ c.displayName } src={ c.avatar } />
				<div className="flex min-w-0 flex-col">
					<Link
						to="/contacts/$contactId"
						params={ { contactId: String( c.id ) } }
						className="truncate font-semibold text-accent-fg underline-offset-2 hover:underline"
					>
						<bdi>
							{ c.displayName ||
								__( 'Unnamed contact', 'cliedesk' ) }
						</bdi>
					</Link>
					{ ! layout && c.email && (
						<span className="truncate text-sm text-fg-muted">
							{ c.email }
						</span>
					) }
					{ ! layout && c.phone && (
						<span className="truncate text-sm text-fg-muted">
							{ c.phone }
						</span>
					) }
				</div>
			</div>
			<Suspense fallback={ null }>
				<CustomerChips contact={ c } />
			</Suspense>
			{ c.blocked && (
				<Pill tone="danger">{ __( 'Blocked', 'cliedesk' ) }</Pill>
			) }
			{ layout && <ContactCards contact={ c } cards={ cards } /> }
			{ ! layout && c.identities.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-sm">
					{ c.identities.map( ( i ) => (
						<li key={ i.id } className="flex gap-1">
							<span className="text-fg-muted">
								{ identityLabel( i.type ) }:
							</span>
							<span className="min-w-0 truncate">
								{ i.value }
							</span>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}

function Tags( { conversation: c }: { conversation: Conversation } ) {
	const qc = useQueryClient();
	const all = useQuery( tagsQuery() );
	const [ name, setName ] = useState( '' );
	const canEdit = can( 'cliedesk_edit_conversation_fields' );
	const apply = useMutation( {
		mutationFn: ( body: {
			add?: number[];
			remove?: number[];
			create?: string[];
		} ) =>
			api.post< { tags: TagRef[] } >( 'tags/apply', {
				body: { entity: 'conversation', entityId: c.id, ...body },
			} ),
		onSuccess: ( r, body ) => {
			if ( r.data?.tags ) {
				mergeDetail( qc, c.id, { tags: r.data.tags } );
			}
			void qc.invalidateQueries( {
				queryKey: conversationKeys.detail( c.id ),
			} );
			if ( body.create?.length ) {
				void qc.invalidateQueries( { queryKey: [ 'tags' ] } );
			}
			afterChange( qc, c.id );
			announceResult( __( 'Tags updated.', 'cliedesk' ) );
		},
	} );
	const available = ( all.data ?? [] ).filter(
		( t ) => ! c.tags.some( ( x ) => x.id === t.id )
	);
	const create = ( e: FormEvent ) => {
		e.preventDefault();
		if ( name.trim() ) {
			apply.mutate(
				{ create: [ name.trim() ] },
				{ onSuccess: () => setName( '' ) }
			);
		}
	};
	return (
		<div className="flex flex-col gap-2">
			<ActionError
				error={ apply.error }
				onDismiss={ () => apply.reset() }
			/>
			{ c.tags.length ? (
				<ul className="flex flex-wrap gap-1">
					{ c.tags.map( ( t ) => (
						<li
							key={ t.id }
							className="inline-flex items-center gap-0.5 rounded-full border border-line ps-2 text-sm"
						>
							<bdi>{ t.name }</bdi>
							{ canEdit && (
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: tag name. */
										__( 'Remove tag %s', 'cliedesk' ),
										t.name
									) }
									icon={ <X size={ 12 } /> }
									onPress={ () =>
										apply.mutate( { remove: [ t.id ] } )
									}
								/>
							) }
						</li>
					) ) }
				</ul>
			) : (
				<Muted>{ __( 'No tags.', 'cliedesk' ) }</Muted>
			) }
			{ canEdit && available.length > 0 && (
				<Select
					label={ __( 'Add a tag', 'cliedesk' ) }
					value={ null }
					options={ available.map( ( t ) => ( {
						id: String( t.id ),
						label: t.name,
					} ) ) }
					onChange={ ( id ) =>
						apply.mutate( { add: [ Number( id ) ] } )
					}
				/>
			) }
			{ canEdit && can( 'cliedesk_create_tags' ) && (
				<form
					noValidate
					onSubmit={ create }
					className="flex items-end gap-2"
				>
					<TextField
						className="flex-1"
						label={ __( 'New tag', 'cliedesk' ) }
						value={ name }
						maxLength={ 64 }
						onChange={ setName }
					/>
					<Button
						type="submit"
						size="sm"
						isDisabled={ ! name.trim() }
					>
						{ __( 'Create', 'cliedesk' ) }
					</Button>
				</form>
			) }
		</div>
	);
}

/** The stored (forward) type of a listed link, and whether it points from the other conversation. */
const INVERSE: Record< string, string > = {
	has_duplicate: 'duplicate_of',
	has_part: 'part_of',
	causes: 'caused_by',
	blocked_by: 'blocks',
	parent_of: 'child_of',
	split_into: 'split_from',
};

/**
 * Where to send the delete for a listed link: links are stored one way, so an incoming link is removed from the
 * other conversation.
 *
 * @param id                  Conversation on screen.
 * @param link                Listed link.
 * @param link.type           Listed type.
 * @param link.conversationId Other conversation.
 */
export function unlinkRequest(
	id: number,
	link: { type: string; conversationId: number }
): { from: number; targetId: number; type: string } {
	const forward = INVERSE[ link.type ];
	return forward
		? { from: link.conversationId, targetId: id, type: forward }
		: { from: id, targetId: link.conversationId, type: link.type };
}

function Links( { id }: { id: number } ) {
	const qc = useQueryClient();
	const q = useQuery( linksQuery( id ) );
	const canEdit = can( 'cliedesk_edit_conversation_fields' );
	const [ type, setType ] = useState( 'related' );
	const [ number, setNumber ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const done = () => {
		void qc.invalidateQueries( { queryKey: conversationKeys.links( id ) } );
		afterChange( qc, id );
	};
	const add = useMutation( {
		mutationFn: async () => {
			const n = Number( number.replace( /^#/, '' ) );
			const target = (
				await api.get< { id: number } >( `conversations/number/${ n }` )
			).data;
			return api.post( `conversations/${ id }/links`, {
				body: { targetId: target.id, type },
			} );
		},
		onSuccess: () => {
			setNumber( '' );
			announceResult( __( 'Conversation linked.', 'cliedesk' ) );
			done();
		},
	} );
	const remove = useMutation( {
		mutationFn: ( link: { type: string; conversationId: number } ) => {
			const r = unlinkRequest( id, link );
			return api.del( `conversations/${ r.from }/links`, {
				body: { targetId: r.targetId, type: r.type },
			} );
		},
		onSuccess: () => {
			announceResult( __( 'Link removed.', 'cliedesk' ) );
			done();
		},
	} );
	if ( ! q.data ) {
		return (
			<Muted>
				{ q.isError
					? __( 'Could not load links.', 'cliedesk' )
					: __( 'Loading…', 'cliedesk' ) }
			</Muted>
		);
	}
	const { links, children } = q.data;
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! /^#?\d+$/.test( number.trim() ) ) {
			setError(
				__( 'Enter a conversation number, such as 1042.', 'cliedesk' )
			);
			return;
		}
		setError( null );
		add.mutate();
	};
	return (
		<div className="flex flex-col gap-2">
			<ActionError
				error={ add.error ?? remove.error }
				onDismiss={ () => {
					add.reset();
					remove.reset();
				} }
			/>
			{ links.length ? (
				<ul className="flex flex-col gap-1 text-sm">
					{ links.map( ( l ) => (
						<li
							key={ `${ l.type }:${ l.conversationId }` }
							className="flex flex-wrap items-center gap-1"
						>
							<span className="text-fg-muted">
								{ linkLabel( l.type ) }
							</span>
							<Link
								to="/c/$number"
								params={ { number: String( l.number ) } }
								className="text-accent-fg underline-offset-2 hover:underline"
							>
								{ `#${ l.number }` } <bdi>{ l.subject }</bdi>
							</Link>
							{ l.done && (
								<Pill tone="success">
									{ __( 'Done', 'cliedesk' ) }
								</Pill>
							) }
							{ canEdit && (
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: 1: link type, 2: conversation number. */
										__(
											'Remove link: %1$s #%2$d',
											'cliedesk'
										),
										linkLabel( l.type ),
										l.number
									) }
									icon={
										<X aria-hidden="true" size={ 14 } />
									}
									onPress={ () => remove.mutate( l ) }
								/>
							) }
						</li>
					) ) }
				</ul>
			) : (
				<Muted>{ __( 'No linked conversations.', 'cliedesk' ) }</Muted>
			) }
			{ children.total > 0 && (
				<Muted>
					{ sprintf(
						/* translators: 1: done child conversations, 2: all child conversations. */
						__(
							'%1$d of %2$d child conversations done',
							'cliedesk'
						),
						children.done,
						children.total
					) }
				</Muted>
			) }
			{ canEdit && (
				<form
					noValidate
					onSubmit={ submit }
					className="flex flex-wrap items-end gap-2"
				>
					<Select
						className="min-w-32"
						label={ __( 'Link type', 'cliedesk' ) }
						value={ type }
						onChange={ setType }
						options={ LINK_TYPES.map( ( t ) => ( {
							id: t,
							label: linkLabel( t ),
						} ) ) }
					/>
					<TextField
						className="w-28"
						label={ __( 'Conversation #', 'cliedesk' ) }
						inputMode="numeric"
						value={ number }
						onChange={ setNumber }
						errorMessage={ error }
					/>
					<Button type="submit" size="sm" isLoading={ add.isPending }>
						{ __( 'Link', 'cliedesk' ) }
					</Button>
				</form>
			) }
		</div>
	);
}

function ChecklistPanel( { id }: { id: number } ) {
	const qc = useQueryClient();
	const q = useQuery( checklistQuery( id ) );
	const [ label, setLabel ] = useState( '' );
	const canEdit = can( 'cliedesk_edit_conversation_fields' );
	const [ templateId, setTemplateId ] = useState( '' );
	const templates = useQuery( {
		...checklistTemplatesQuery(),
		enabled: canEdit,
		select: ( list ) => list.filter( ( t ) => t.active ),
	} );
	const write = useMutation( {
		mutationFn: ( {
			path,
			body,
			remove = false,
		}: {
			path: string;
			body?: unknown;
			remove?: boolean;
		} ) =>
			remove
				? api.del< Checklist >(
						`conversations/${ id }/checklist/${ path }`
					)
				: api.post< Checklist >(
						`conversations/${ id }/checklist/${ path }`,
						{ body }
					),
		onSuccess: ( r ) => {
			qc.setQueryData(
				conversationKeys.checklist( id ),
				normaliseChecklist( r.data )
			);
			afterChange( qc, id );
		},
	} );
	if ( ! q.data ) {
		return (
			<Muted>
				{ q.isError
					? __( 'Could not load the checklist.', 'cliedesk' )
					: __( 'Loading…', 'cliedesk' ) }
			</Muted>
		);
	}
	const add = ( e: FormEvent ) => {
		e.preventDefault();
		if ( label.trim() ) {
			write.mutate(
				{ path: 'items', body: { label: label.trim() } },
				{ onSuccess: () => setLabel( '' ) }
			);
		}
	};
	return (
		<div className="flex flex-col gap-2">
			<ActionError
				error={ write.error }
				onDismiss={ () => write.reset() }
			/>
			{ ! canEdit && q.data.total > 0 && (
				// ADM-04: the disabled ticks say why.
				<Muted>{ needsRole() }</Muted>
			) }
			{ q.data.total > 0 && (
				<Muted>
					{ sprintf(
						/* translators: 1: done items, 2: all items. */
						__( '%1$d of %2$d done', 'cliedesk' ),
						q.data.done,
						q.data.total
					) }
				</Muted>
			) }
			{ q.data.items.length ? (
				<ul className="flex flex-col gap-1">
					{ q.data.items.map( ( i ) => (
						<li
							key={ i.id }
							className="flex flex-wrap items-center gap-2"
						>
							<Checkbox
								isSelected={ i.done }
								isDisabled={ ! canEdit }
								onChange={ ( done ) =>
									write.mutate( {
										path: `items/${ i.id }`,
										body: { done },
									} )
								}
							>
								{ i.label }
							</Checkbox>
							{ i.blocking && ! i.done && (
								<Pill tone="warning">
									{ __( 'Needed to resolve', 'cliedesk' ) }
								</Pill>
							) }
							{ canEdit && null === i.template && (
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: checklist item. */
										__( 'Remove %s', 'cliedesk' ),
										i.label
									) }
									icon={ <X size={ 14 } /> }
									onPress={ () =>
										write.mutate( {
											path: `items/${ i.id }`,
											remove: true,
										} )
									}
								/>
							) }
						</li>
					) ) }
				</ul>
			) : (
				<Muted>{ __( 'No checklist items.', 'cliedesk' ) }</Muted>
			) }
			{ canEdit && (
				<form
					noValidate
					onSubmit={ add }
					className="flex items-end gap-2"
				>
					<TextField
						className="flex-1"
						label={ __( 'New item', 'cliedesk' ) }
						value={ label }
						onChange={ setLabel }
					/>
					<Button
						type="submit"
						size="sm"
						isDisabled={ ! label.trim() }
					>
						{ __( 'Add', 'cliedesk' ) }
					</Button>
				</form>
			) }
			{ canEdit && !! templates.data?.length && (
				<div className="flex items-end gap-2">
					<Select
						className="flex-1"
						label={ __( 'Add a checklist', 'cliedesk' ) }
						value={ templateId }
						onChange={ setTemplateId }
						options={ templates.data.map( ( t ) => ( {
							id: String( t.id ),
							label: t.name,
						} ) ) }
					/>
					<Button
						size="sm"
						isDisabled={ ! templateId }
						onPress={ () =>
							write.mutate(
								{
									path: 'attach',
									body: { templateId: Number( templateId ) },
								},
								{ onSuccess: () => setTemplateId( '' ) }
							)
						}
					>
						{ __( 'Attach', 'cliedesk' ) }
					</Button>
				</div>
			) }
		</div>
	);
}

function Participants( { conversation: c }: { conversation: Conversation } ) {
	const qc = useQueryClient();
	const me = getBoot().user?.id ?? 0;
	const [ email, setEmail ] = useState( '' );
	const [ emailError, setEmailError ] = useState< string | null >( null );
	const canEdit = can( 'cliedesk_edit_conversation_fields' );
	const ccs = c.participants.filter(
		( p ) => p.role === 'cc' && p.partyType === 'contact'
	);
	const following = c.participants.some(
		( p ) =>
			p.role === 'follower' && p.partyType === 'user' && p.partyId === me
	);
	const names = useQueries( {
		queries: ccs.map( ( p ) => ( {
			...contactQuery( p.partyId ),
			enabled: can( 'cliedesk_view_contacts' ),
		} ) ),
	} );
	const write = useMutation( {
		mutationFn: ( {
			method,
			path,
			body,
		}: {
			method: 'POST' | 'DELETE';
			path: string;
			body?: unknown;
		} ) =>
			api.request< {
				participants: Participant[];
				warning: string | null;
			} >( method, `conversations/${ c.id }/${ path }`, { body } ),
		onSuccess: ( r ) => {
			if ( r.data?.participants ) {
				mergeDetail( qc, c.id, { participants: r.data.participants } );
			}
			afterChange( qc, c.id );
			announceResult( __( 'Participants updated.', 'cliedesk' ) );
		},
	} );
	const add = ( e: FormEvent ) => {
		e.preventDefault();
		const err =
			email.trim() === ''
				? __( 'Enter an email address.', 'cliedesk' )
				: validateEmail( email );
		setEmailError( err );
		if ( ! err ) {
			write.mutate(
				{ method: 'POST', path: 'ccs', body: { email: email.trim() } },
				{ onSuccess: () => setEmail( '' ) }
			);
		}
	};
	return (
		<div className="flex flex-col gap-2">
			<ActionError
				error={ write.error }
				onDismiss={ () => write.reset() }
			/>
			{ write.data?.data?.warning && (
				<p className="text-sm text-warning">
					{ write.data.data.warning }
				</p>
			) }
			<Switch
				isSelected={ following }
				onChange={ ( follow ) =>
					write.mutate( {
						method: 'POST',
						path: 'follow',
						body: { follow },
					} )
				}
			>
				{ __( 'Follow this conversation', 'cliedesk' ) }
			</Switch>
			<h3 className="text-sm font-medium">{ __( 'CC', 'cliedesk' ) }</h3>
			{ ccs.length ? (
				<ul className="flex flex-col gap-1 text-sm">
					{ ccs.map( ( p, i ) => {
						const contact = names[ i ]?.data;
						const label =
							contact?.email ??
							contact?.displayName ??
							sprintf(
								/* translators: %d: contact id. */
								__( 'Contact #%d', 'cliedesk' ),
								p.partyId
							);
						return (
							<li
								key={ p.partyId }
								className="flex items-center gap-1"
							>
								<span className="min-w-0 flex-1 truncate">
									<bdi>{ label }</bdi>
								</span>
								{ canEdit && (
									<IconButton
										size="sm"
										label={ sprintf(
											/* translators: %s: person. */
											__( 'Remove CC %s', 'cliedesk' ),
											label
										) }
										icon={ <X size={ 12 } /> }
										onPress={ () =>
											write.mutate( {
												method: 'DELETE',
												path: `ccs/${ p.partyId }`,
											} )
										}
									/>
								) }
							</li>
						);
					} ) }
				</ul>
			) : (
				<Muted>{ __( 'Nobody is copied.', 'cliedesk' ) }</Muted>
			) }
			{ canEdit && (
				<form
					noValidate
					onSubmit={ add }
					className="flex items-end gap-2"
				>
					<TextField
						className="flex-1"
						label={ __( 'Add CC by email', 'cliedesk' ) }
						inputMode="email"
						value={ email }
						onChange={ ( x ) => {
							setEmail( x );
							setEmailError( null );
						} }
						errorMessage={ emailError }
					/>
					<Button type="submit" size="sm">
						{ __( 'Add', 'cliedesk' ) }
					</Button>
				</form>
			) }
		</div>
	);
}

/**
 * Customer and organization cards (CRM-18), in the order I chose (`first`).
 *
 * @param props              Props.
 * @param props.id           Requester (contact) id.
 * @param props.conversation Conversation (Change customer).
 */
function CustomerSections( {
	id,
	conversation,
}: {
	id: number;
	conversation: Conversation;
} ) {
	const [ changing, setChanging ] = useState( false );
	const contact = useQuery( {
		...contactQuery( id ),
		enabled: can( 'cliedesk_view_contacts' ),
	} );
	const orgs = contact.data?.organizations ?? [];
	const org = organizationsEnabled()
		? ( orgs.find( ( o ) => o.isPrimary ) ?? orgs[ 0 ] ?? null )
		: null;
	const contactCards = useMyCards( 'contact' );
	const orgCards = useMyCards( 'organization', !! org );
	const orgFirst = !! org && contactCards.layout?.first === 'organization';
	const customer = (
		<PanelSection
			key="contact"
			id="cd-side-customer"
			title={ __( 'Customer', 'cliedesk' ) }
			actions={
				orgFirst ? (
					<Button
						variant="link"
						size="sm"
						onPress={ () => contactCards.setFirst( 'contact' ) }
					>
						{ __( 'Show first', 'cliedesk' ) }
					</Button>
				) : undefined
			}
		>
			<Requester id={ id } cards={ contactCards } />
			{ can( 'cliedesk_edit_conversation_fields' ) &&
				can( 'cliedesk_view_contacts' ) && (
					<div>
						<Button
							size="sm"
							variant="ghost"
							onPress={ () => setChanging( true ) }
						>
							{ __( 'Change customer…', 'cliedesk' ) }
						</Button>
					</div>
				) }
			{ changing && (
				<Suspense fallback={ null }>
					<ChangeCustomerDialog
						conversation={ conversation }
						onClose={ () => setChanging( false ) }
					/>
				</Suspense>
			) }
		</PanelSection>
	);
	if ( ! org ) {
		return customer;
	}
	const organization = (
		<PanelSection
			key="organization"
			id="cd-side-organization"
			title={ __( 'Organization', 'cliedesk' ) }
			actions={
				orgFirst ? undefined : (
					<Button
						variant="link"
						size="sm"
						onPress={ () =>
							contactCards.setFirst( 'organization' )
						}
					>
						{ __( 'Show first', 'cliedesk' ) }
					</Button>
				)
			}
		>
			<OrganizationCards orgId={ org.id } cards={ orgCards } />
		</PanelSection>
	);
	return orgFirst ? (
		<>
			{ organization }
			{ customer }
		</>
	) : (
		<>
			{ customer }
			{ organization }
		</>
	);
}

// Beside the timeline (screen at least 52rem wide) it stays in view and scrolls on its own; narrower, it is a
// slide-over from the end edge, opened with the header's Details button (plan.frontend-ux §7.9).
const NARROW =
	'fixed end-0 top-(--cd-topbar-h) bottom-0 z-30 w-80 max-w-full overflow-y-auto border-s border-line bg-surface px-4 shadow-2';
const WIDE =
	'@min-[52rem]:sticky @min-[52rem]:end-auto @min-[52rem]:bottom-auto @min-[52rem]:z-auto @min-[52rem]:flex @min-[52rem]:w-auto @min-[52rem]:self-start @min-[52rem]:border-0 @min-[52rem]:bg-transparent @min-[52rem]:px-0 @min-[52rem]:pe-1 @min-[52rem]:shadow-none';

/**
 * Side panel (INB-66: sections in my layout's order, hidden and collapsed ones applied).
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 * @param props.open         Shown as the slide-over (narrow screens).
 * @param props.onClose      Close the slide-over.
 */
export function SidePanel( {
	conversation: c,
	open = false,
	onClose,
}: {
	conversation: Conversation;
	open?: boolean;
	onClose?: () => void;
} ) {
	const tracker = useIsTracker( c );
	const pane = usePane();
	// The slide-over takes focus when it opens and gives it back to the Details button when it closes.
	useEffect( () => {
		if ( open ) {
			document
				.querySelector< HTMLElement >(
					'#cd-conversation-details button'
				)
				?.focus();
		}
	}, [ open ] );
	const close = () => {
		onClose?.();
		document
			.querySelector< HTMLElement >(
				'[aria-controls="cd-conversation-details"]'
			)
			?.focus();
	};
	const prefs = useSyncExternalStore(
		prefsStore().subscribe,
		prefsStore().get,
		prefsStore().get
	) as Prefs | null;
	const admin = useQuery( myPanelLayoutQuery( c.typeId ) );
	const [ customizing, setCustomizing ] = useState( false );
	const mine = prefs?.layout.panel ?? null;
	// INB-67: a context rule's cards (first match) come before the team or type layout; my own layout first.
	const context = useQuery( panelContextQuery( c.id ) );
	const layout: PanelLayout | null =
		mine ?? context.data?.cards ?? admin.data ?? null;
	const toggle = ( key: string ) => {
		const base = layout ?? { order: [], collapsed: [], hidden: [] };
		savePrefs( {
			layout: {
				panel: {
					order: base.order,
					hidden: base.hidden,
					collapsed: base.collapsed.includes( key )
						? base.collapsed.filter( ( k ) => k !== key )
						: [ ...base.collapsed, key ],
				},
			},
		} );
	};
	const sections: Record< string, ReactNode > = {
		customer: <CustomerSections id={ c.requesterId } conversation={ c } />,
		// Pro's approvals asked on this conversation (TEAM-26); PanelSection lets the section collapse like the others.
		approvals: (
			<Slot
				name="conversation.approvals"
				fillProps={ { conversationId: c.id, PanelSection } }
			/>
		),
		tags: (
			<PanelSection id="cd-side-tags" title={ __( 'Tags', 'cliedesk' ) }>
				<Tags conversation={ c } />
			</PanelSection>
		),
		fields: (
			<PanelSection
				id="cd-side-fields"
				title={ __( 'Fields', 'cliedesk' ) }
			>
				<FieldsEditor
					entity="conversation"
					entityId={ c.id }
					canEdit={ can( 'cliedesk_edit_conversation_fields' ) }
				/>
			</PanelSection>
		),
		orders: (
			<Suspense fallback={ null }>
				<OrdersCard conversation={ c } />
				<ShopRecordsCard contactId={ c.requesterId } />
				{ c.requesterId > 0 && can( 'cliedesk_view_orders' ) && (
					<Suspense fallback={ null }>
						<CustomerAccount
							contactId={ c.requesterId }
							conversationId={ c.id }
						/>
					</Suspense>
				) }
			</Suspense>
		),
		records: (
			<LazyRecordsPanel
				entity="conversation"
				entityId={ c.id }
				contactId={ c.requesterId }
			/>
		),
		checklist: (
			<PanelSection
				id="cd-side-checklist"
				title={ __( 'Checklist', 'cliedesk' ) }
			>
				<ChecklistPanel id={ c.id } />
			</PanelSection>
		),
		links: (
			<PanelSection
				id="cd-side-links"
				title={ __( 'Linked conversations', 'cliedesk' ) }
			>
				<Links id={ c.id } />
			</PanelSection>
		),
		tracker: (
			<PanelSection
				id="cd-side-tracker"
				title={
					tracker
						? __( 'Tracker items', 'cliedesk' )
						: __( 'Trackers', 'cliedesk' )
				}
			>
				<TrackerSection conversation={ c } />
			</PanelSection>
		),
		tasks: (
			<PanelSection
				id="cd-side-tasks"
				title={ __( 'Tasks', 'cliedesk' ) }
			>
				<TasksSection conversation={ c } />
			</PanelSection>
		),
		reminders: (
			<PanelSection
				id="cd-side-reminders"
				title={ __( 'My reminders', 'cliedesk' ) }
			>
				<RemindersPanel conversationId={ c.id } />
			</PanelSection>
		),
		apps: (
			<Suspense fallback={ null }>
				<AppPanels entity="conversation" entityId={ c.id } />
			</Suspense>
		),
		people: (
			<PanelSection
				id="cd-side-people"
				title={ __( 'People', 'cliedesk' ) }
			>
				<Participants conversation={ c } />
				<ManageParticipants conversation={ c } />
			</PanelSection>
		),
	};
	// INB-65: more cards, each loading on its own.
	for ( const key of [
		'summary',
		'visit',
		'side_threads',
		'history',
		'activity',
		'notepad',
	] ) {
		sections[ key ] = (
			<Suspense fallback={ null }>
				<ContextCard name={ key } conversation={ c } />
			</Suspense>
		);
	}
	return (
		// Escape closes the slide-over (narrow screens); the panel's own controls handle their keys first.
		// eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
		<aside
			id="cd-conversation-details"
			aria-label={ __( 'Conversation details', 'cliedesk' ) }
			onKeyDown={ ( e ) => {
				if ( e.key === 'Escape' && open && onClose ) {
					close();
				}
			} }
			className={ `flex-col ${ open ? 'flex' : 'hidden' } ${ NARROW } ${ WIDE } ${
				pane.inPane
					? '@min-[52rem]:top-0 @min-[52rem]:max-h-[calc(100dvh-var(--cd-topbar-h)-3rem)]'
					: '@min-[52rem]:top-(--cd-topbar-h) @min-[52rem]:max-h-[calc(100dvh-var(--cd-topbar-h))]'
			}` }
		>
			{ onClose && (
				<div className="flex justify-end pt-2 @min-[52rem]:hidden">
					<IconButton
						label={ __( 'Close details', 'cliedesk' ) }
						icon={ <X size={ 16 } /> }
						onPress={ close }
					/>
				</div>
			) }
			<Properties conversation={ c } />
			{ arrangePanel( layout ).map( ( { key, collapsed } ) => (
				<PanelSlot.Provider
					key={ key }
					value={ { collapsed, onToggle: () => toggle( key ) } }
				>
					{ sections[ key ] }
				</PanelSlot.Provider>
			) ) }
			<div className="py-3">
				<Button
					variant="link"
					size="sm"
					onPress={ () => setCustomizing( true ) }
				>
					{ __( 'Customize panel…', 'cliedesk' ) }
				</Button>
			</div>
			{ customizing && (
				<Suspense fallback={ null }>
					<PanelCustomizeDialog
						layout={ layout }
						own={ !! mine }
						onClose={ () => setCustomizing( false ) }
					/>
				</Suspense>
			) }
		</aside>
	);
}
