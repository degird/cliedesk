/**
 * Customer cards in the conversation side panel (CRM-18): the contact card and, when the contact belongs to an
 * organization, the organization card. Each shows its attributes and fields in the order the admin chose for my role
 * (GET cards/{context}); I can collapse or hide single cards and choose which card comes first (PUT
 * cards/{context}/mine). Tags, segments and extension attributes come from GET contacts/{id}/profile (an extension
 * fills its card through a profile section with the same key); attributes without data are left out.
 */
import {
	api,
	can,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
	wpAdminUrl,
} from '@cliedesk/data';
import { Button, IconButton } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { ChevronDown, ChevronRight, EyeOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { fieldValuesQuery, type Contact, type FieldValue } from '../inbox/api';
import { Muted, useAgents } from '../inbox/components';
import { identityLabel } from '../inbox/labels';
import { orgQuery, organizationsEnabled, type OrganizationDetail } from './api';
import {
	cardKeys,
	cardLayoutQuery,
	saveMyCards,
	type CardContext,
	type CardItem,
	type CardLayout,
	contactProfileQuery,
	needsProfile,
} from './cards';
import { ContactOwner } from './ContactOwner';
import { RecentConversations } from './OrgInsights';

/**
 * A field value as text.
 *
 * @param v Value.
 */
export function fieldText( v: unknown ): string {
	if ( v === null || v === undefined || v === '' ) {
		return '';
	}
	if ( typeof v === 'boolean' ) {
		return v ? __( 'Yes', 'cliedesk' ) : __( 'No', 'cliedesk' );
	}
	if ( Array.isArray( v ) ) {
		return v.map( fieldText ).filter( Boolean ).join( ', ' );
	}
	if ( typeof v === 'object' ) {
		const o = v as Record< string, unknown >;
		if ( 'amount' in o ) {
			return [ o.amount, o.currency ].filter( Boolean ).join( ' ' );
		}
		return Object.values( o )
			.map( fieldText )
			.filter( Boolean )
			.join( ', ' );
	}
	return String( v );
}

/**
 * Current time in a time zone, or null for an unknown zone.
 *
 * @param tz  IANA time zone.
 * @param now Now.
 */
export function localTime( tz: string, now = new Date() ): string | null {
	try {
		return new Intl.DateTimeFormat(
			document.documentElement.lang || undefined,
			{ timeZone: tz, hour: 'numeric', minute: '2-digit' }
		).format( now );
	} catch {
		return null;
	}
}

/** Links inside cards: at least 24 px high (WCAG 2.5.8 target size next to the card toggles). */
const CARD_LINK =
	'inline-flex min-h-6 items-center text-accent-fg underline-offset-2 hover:underline';

const orgFieldsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'organization', id, 'fields' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { values?: Record< string, FieldValue > } >(
					'field-values',
					{ query: { entity: 'organization', entityId: id }, signal }
				)
			).data?.values ?? {},
		retry: false,
	} );

/**
 * One collapsible, hideable card.
 *
 * @param props            Props.
 * @param props.id         DOM id prefix.
 * @param props.item       Card.
 * @param props.onCollapse Toggle.
 * @param props.onHide     Hide for me.
 * @param props.children   Value.
 */
function Card( {
	id,
	item,
	onCollapse,
	onHide,
	children,
}: {
	id: string;
	item: CardItem;
	onCollapse: () => void;
	onHide: () => void;
	children: ReactNode;
} ) {
	const region = `${ id }-${ item.key.replace( /[^a-z0-9_-]/gi, '-' ) }`;
	return (
		<li className="flex flex-col">
			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					className="min-w-0 flex-1 justify-start text-fg-muted"
					aria-expanded={ ! item.collapsed }
					aria-controls={ region }
					iconStart={
						item.collapsed ? (
							<ChevronRight
								aria-hidden="true"
								size={ 14 }
								className="rtl:rotate-180"
							/>
						) : (
							<ChevronDown aria-hidden="true" size={ 14 } />
						)
					}
					onPress={ onCollapse }
				>
					<span className="truncate">{ item.label }</span>
				</Button>
				<IconButton
					size="sm"
					label={ sprintf(
						/* translators: %s: card name. */
						__( 'Hide %s', 'cliedesk' ),
						item.label
					) }
					icon={ <EyeOff size={ 14 } /> }
					onPress={ onHide }
				/>
			</div>
			<div
				id={ region }
				hidden={ item.collapsed }
				className="ps-7 pb-1 text-sm break-words"
			>
				{ children }
			</div>
		</li>
	);
}

/**
 * My hidden cards, with "Show".
 *
 * @param props        Props.
 * @param props.id     DOM id prefix.
 * @param props.items  Hidden cards.
 * @param props.onShow Show again.
 */
function HiddenCards( {
	id,
	items,
	onShow,
}: {
	id: string;
	items: CardItem[];
	onShow: ( key: string ) => void;
} ) {
	const [ open, setOpen ] = useState( false );
	if ( ! items.length ) {
		return null;
	}
	return (
		<div className="flex flex-col gap-1">
			<Button
				variant="link"
				size="sm"
				className="self-start"
				aria-expanded={ open }
				aria-controls={ `${ id }-hidden` }
				onPress={ () => setOpen( ( x ) => ! x ) }
			>
				{ sprintf(
					/* translators: %d: number of hidden cards. */
					_n(
						'%d hidden card',
						'%d hidden cards',
						items.length,
						'cliedesk'
					),
					items.length
				) }
			</Button>
			<ul
				id={ `${ id }-hidden` }
				hidden={ ! open }
				className="flex flex-col"
			>
				{ items.map( ( i ) => (
					<li
						key={ i.key }
						className="flex items-center gap-2 text-sm"
					>
						<span className="min-w-0 flex-1 truncate text-fg-muted">
							{ i.label }
						</span>
						<Button
							size="sm"
							variant="ghost"
							aria-label={ sprintf(
								/* translators: %s: card name. */
								__( 'Show %s', 'cliedesk' ),
								i.label
							) }
							onPress={ () => onShow( i.key ) }
						>
							{ __( 'Show', 'cliedesk' ) }
						</Button>
					</li>
				) ) }
			</ul>
		</div>
	);
}

/**
 * My layout of a context, with collapse / hide / show saved for me.
 *
 * @param context Context.
 * @param enabled Load it.
 */
export function useMyCards( context: CardContext, enabled = true ) {
	const qc = useQueryClient();
	const q = useQuery( {
		...cardLayoutQuery( context ),
		enabled: enabled && can( 'cliedesk_view_contacts' ),
	} );
	const save = useMutation( {
		mutationFn: ( body: Parameters< typeof saveMyCards >[ 1 ] ) =>
			saveMyCards( context, body ),
		onMutate: ( body ) => {
			qc.setQueryData< CardLayout >(
				cardKeys.layout( context ),
				( old ) =>
					old && {
						...old,
						hidden: body.hidden ?? old.hidden,
						first: body.first ?? old.first,
						items: body.collapsed
							? old.items.map( ( i ) => ( {
									...i,
									collapsed: body.collapsed!.includes(
										i.key
									),
								} ) )
							: old.items,
					}
			);
		},
		onSuccess: ( next, body ) => {
			qc.setQueryData( cardKeys.layout( context ), next );
			if ( body.first ) {
				void qc.invalidateQueries( { queryKey: cardKeys.all } );
			}
		},
		onError: () =>
			void qc.invalidateQueries( {
				queryKey: cardKeys.layout( context ),
			} ),
	} );
	const layout = q.data;
	const collapsedKeys = ( layout?.items ?? [] )
		.filter( ( i ) => i.collapsed )
		.map( ( i ) => i.key );
	return {
		query: q,
		layout,
		toggle: ( key: string ) =>
			save.mutate( {
				collapsed: collapsedKeys.includes( key )
					? collapsedKeys.filter( ( k ) => k !== key )
					: [ ...collapsedKeys, key ],
			} ),
		hide: ( key: string ) =>
			save.mutate( { hidden: [ ...( layout?.hidden ?? [] ), key ] } ),
		show: ( key: string ) =>
			save.mutate( {
				hidden: ( layout?.hidden ?? [] ).filter( ( k ) => k !== key ),
			} ),
		setFirst: ( first: CardContext ) => save.mutate( { first } ),
	};
}

/**
 * The cards of a layout (visible ones that have something to show) and the hidden ones.
 *
 * @param props        Props.
 * @param props.id     DOM id prefix.
 * @param props.cards  useMyCards() result.
 * @param props.render Value of a card, or null when it cannot be shown here.
 */
function CardList( {
	id,
	cards,
	render,
}: {
	id: string;
	cards: ReturnType< typeof useMyCards >;
	render: ( key: string ) => ReactNode | null;
} ) {
	const layout = cards.layout;
	if ( ! layout ) {
		return null;
	}
	const visible = layout.items.filter(
		( i ) => ! layout.hidden.includes( i.key )
	);
	const hidden = layout.items.filter( ( i ) =>
		layout.hidden.includes( i.key )
	);
	const shown = visible
		.map( ( i ) => ( { item: i, value: render( i.key ) } ) )
		.filter( ( x ) => x.value !== null );
	return (
		<div className="flex flex-col gap-1">
			{ shown.length > 0 && (
				<ul className="flex flex-col">
					{ shown.map( ( { item, value } ) => (
						<Card
							key={ item.key }
							id={ id }
							item={ item }
							onCollapse={ () => cards.toggle( item.key ) }
							onHide={ () => cards.hide( item.key ) }
						>
							{ value }
						</Card>
					) ) }
				</ul>
			) }
			<HiddenCards id={ id } items={ hidden } onShow={ cards.show } />
		</div>
	);
}

const notSet = () => <Muted>{ __( 'Not set', 'cliedesk' ) }</Muted>;

/**
 * Contact attributes and fields in the configured order.
 *
 * @param props         Props.
 * @param props.contact Contact.
 * @param props.cards   useMyCards( 'contact' ) result.
 */
export function ContactCards( {
	contact: c,
	cards,
}: {
	contact: Contact;
	cards: ReturnType< typeof useMyCards >;
} ) {
	const wantsFields = !! cards.layout?.items.some( ( i ) =>
		i.key.startsWith( 'field:' )
	);
	const fields = useQuery( {
		...fieldValuesQuery( 'contact', c.id ),
		enabled: wantsFields,
	} );
	const profile = useQuery( {
		...contactProfileQuery( c.id ),
		enabled: !! cards.layout?.items.some( ( i ) => needsProfile( i.key ) ),
	} );
	const identities = ( type: string, fallback: string | null ) => {
		const list = c.identities
			.filter( ( i ) => i.type === type )
			.map( ( i ) => i.value );
		const all = list.length ? list : [ fallback ].filter( Boolean );
		return all.length ? (
			<ul>
				{ all.map( ( v ) => (
					<li key={ v } className="truncate">
						<bdi>{ v }</bdi>
					</li>
				) ) }
			</ul>
		) : (
			notSet()
		);
	};
	const render = ( key: string ): ReactNode | null => {
		if ( key.startsWith( 'field:' ) ) {
			const v = fields.data?.[ key.slice( 6 ) ];
			if ( ! v || v.visible === false ) {
				return null;
			}
			const text = fieldText( v.value );
			return text ? <bdi>{ text }</bdi> : notSet();
		}
		switch ( key ) {
			case 'email':
				return identities( 'email', c.email );
			case 'phone':
				return identities( 'phone', c.phone );
			case 'organization': {
				const org =
					c.organizations.find( ( o ) => o.isPrimary ) ??
					c.organizations[ 0 ];
				if ( ! org ) {
					return notSet();
				}
				return organizationsEnabled() ? (
					<Link
						to="/organizations/$orgId"
						params={ { orgId: String( org.id ) } }
						className={ CARD_LINK }
					>
						<bdi>{ org.name }</bdi>
					</Link>
				) : (
					<bdi>{ org.name }</bdi>
				);
			}
			case 'owner':
				return <ContactOwner contact={ c } compact />;
			case 'language':
				return c.language ? <span>{ c.language }</span> : notSet();
			case 'timezone': {
				if ( ! c.timezone ) {
					return notSet();
				}
				const time = localTime( c.timezone );
				return (
					<span>
						{ time
							? sprintf(
									/* translators: 1: local time, 2: time zone. */
									__( '%1$s (%2$s)', 'cliedesk' ),
									time,
									c.timezone
								)
							: c.timezone }
					</span>
				);
			}
			case 'location': {
				const place = [ c.city, c.country ]
					.filter( Boolean )
					.join( ', ' );
				return place ? <bdi>{ place }</bdi> : notSet();
			}
			case 'wordpress': {
				const wp = profile.data?.wordpress;
				if ( c.wpUserId && wp ) {
					// INB-65: login and roles, linked to the user's admin screen.
					const admin = wpAdminUrl();
					return (
						<span>
							<a
								href={ `${ admin }user-edit.php?user_id=${ wp.userId }` }
								className={ CARD_LINK }
							>
								<bdi>{ wp.login }</bdi>
							</a>
							{ wp.roles.length > 0 &&
								` · ${ wp.roles.join( ', ' ) }` }
						</span>
					);
				}
				return c.wpUserId ? (
					<span>
						{ sprintf(
							/* translators: %d: WordPress user id. */
							__( 'Linked to WordPress user #%d', 'cliedesk' ),
							c.wpUserId
						) }
					</span>
				) : (
					<Muted>{ __( 'Not linked', 'cliedesk' ) }</Muted>
				);
			}
			case 'conversations':
				return (
					<Link
						to="/contacts/$contactId"
						params={ { contactId: String( c.id ) } }
						className={ CARD_LINK }
					>
						{ sprintf(
							/* translators: %d: number of conversations. */
							_n(
								'%d conversation',
								'%d conversations',
								c.conversationCount,
								'cliedesk'
							),
							c.conversationCount
						) }
					</Link>
				);
		}
		const p = profile.data;
		if ( ! p ) {
			return null;
		}
		if ( key === 'tags' ) {
			return p.tags.length ? (
				<bdi>{ p.tags.map( ( t ) => t.name ).join( ', ' ) }</bdi>
			) : (
				<Muted>{ __( 'No tags.', 'cliedesk' ) }</Muted>
			);
		}
		if ( key === 'segments' ) {
			return p.segments.length ? (
				<bdi>{ p.segments.map( ( g ) => g.name ).join( ', ' ) }</bdi>
			) : (
				<Muted>{ __( 'In no segment.', 'cliedesk' ) }</Muted>
			);
		}
		// Extension attribute: its profile section.
		const section = p.sections.find( ( x ) => x.key === key );
		if ( ! section ) {
			return null;
		}
		return section.items.length ? (
			<dl className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
				{ section.items.map( ( it, n ) => (
					<div key={ n } className="contents">
						<dt className="text-fg-muted">{ it.label }</dt>
						<dd className="min-w-0 truncate">
							<bdi>{ it.value ?? '' }</bdi>
						</dd>
					</div>
				) ) }
			</dl>
		) : (
			notSet()
		);
	};
	const other = c.identities.filter(
		( i ) => i.type !== 'email' && i.type !== 'phone'
	);
	return (
		<div className="flex flex-col gap-2">
			{ other.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-sm">
					{ other.map( ( i ) => (
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
			<CardList
				id={ `cd-card-contact-${ c.id }` }
				cards={ cards }
				render={ render }
			/>
		</div>
	);
}

/**
 * Organization card: the attributes of the contact's primary organization in the configured order.
 *
 * @param props       Props.
 * @param props.orgId Organization.
 * @param props.cards useMyCards( 'organization' ) result.
 */
export function OrganizationCards( {
	orgId,
	cards,
}: {
	orgId: number;
	cards: ReturnType< typeof useMyCards >;
} ) {
	const q = useQuery( orgQuery( orgId ) );
	const { nameFor } = useAgents();
	const wantsFields = !! cards.layout?.items.some( ( i ) =>
		i.key.startsWith( 'field:' )
	);
	const fields = useQuery( {
		...orgFieldsQuery( orgId ),
		enabled: wantsFields,
	} );
	if ( q.isPending ) {
		return <Muted>{ __( 'Loading…', 'cliedesk' ) }</Muted>;
	}
	if ( q.isError ) {
		return (
			<Muted>
				{ __( 'Could not load the organization.', 'cliedesk' ) }
			</Muted>
		);
	}
	const o: OrganizationDetail = q.data;
	const render = ( key: string ): ReactNode | null => {
		if ( key.startsWith( 'field:' ) ) {
			const v = fields.data?.[ key.slice( 6 ) ];
			if ( ! v || v.visible === false ) {
				return null;
			}
			const text = fieldText( v.value );
			return text ? <bdi>{ text }</bdi> : notSet();
		}
		switch ( key ) {
			case 'domains':
				return o.domains.length ? (
					<bdi>{ o.domains.join( ', ' ) }</bdi>
				) : (
					notSet()
				);
			case 'owner':
				return o.ownerId ? (
					<span>
						{ nameFor( o.ownerId ) ??
							sprintf(
								/* translators: %d: user id. */
								__( 'Agent #%d', 'cliedesk' ),
								o.ownerId
							) }
					</span>
				) : (
					notSet()
				);
			case 'members':
				return (
					<span>
						{ sprintf(
							/* translators: %d: number of people. */
							_n(
								'%d person',
								'%d people',
								o.memberCount,
								'cliedesk'
							),
							o.memberCount
						) }
					</span>
				);
			case 'parent':
				return o.parentId && o.parentName ? (
					<Link
						to="/organizations/$orgId"
						params={ { orgId: String( o.parentId ) } }
						className={ CARD_LINK }
					>
						<bdi>{ o.parentName }</bdi>
					</Link>
				) : (
					notSet()
				);
			case 'tags':
				return o.tags.length ? (
					<bdi>{ o.tags.map( ( t ) => t.name ).join( ', ' ) }</bdi>
				) : (
					<Muted>{ __( 'No tags.', 'cliedesk' ) }</Muted>
				);
			case 'conversations':
				return <RecentConversations orgId={ o.id } limit={ 5 } />;
		}
		return null;
	};
	return (
		<div className="flex flex-col gap-2">
			<Link
				to="/organizations/$orgId"
				params={ { orgId: String( o.id ) } }
				className="font-semibold text-accent-fg underline-offset-2 hover:underline"
			>
				<bdi>{ o.name }</bdi>
			</Link>
			<CardList
				id={ `cd-card-org-${ o.id }` }
				cards={ cards }
				render={ render }
			/>
		</div>
	);
}
