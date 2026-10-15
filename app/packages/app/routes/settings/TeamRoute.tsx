/**
 * `/settings/team/teams/$teamId`: team page (TEAM-24): name, icon, description, supervisor, routing method (Pro: private, RTE-01),
 * capacity, signature, customer-facing alias, products (read-only with "Remove limit"; Pro edits them, BRD-14) and
 * members with the lead flag. Saves send If-Match with the team's version. Supervisors without settings rights
 * change only the members of teams they lead.
 */
import {
	api,
	can,
	getBoot,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	IconButton,
	LoadingRegion,
	Select,
	Slot,
	Switch,
	TextField,
	useSlotHasFills,
} from '@cliedesk/ui';
import { Link, useParams } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowLeft, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { TeamProducts } from '../../team/ProductLimit';
import { TeamShortcuts } from '../../team/TeamShortcuts';
import { productListQuery, versionTag, isConflict } from '../../workspace/api';
import {
	ConflictBanner,
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	validateText,
	type SummaryItem,
} from '../../workspace/forms';
import {
	EMPTY_FILTERS,
	ROUTING_METHODS,
	agentsQuery,
	normaliseTeam,
	teamDetailQuery,
	teamKeys,
	teamsKeys,
	type Agent,
	type RoutingMethod,
	type TeamDetail,
	type TeamInput,
} from '../../team/api';
import { Badge, QueryError } from '../../team/components';
import { routingLabel } from '../../team/labels';
import { TEAMS_PATH } from '../../team/paths';
import { NotFound } from '../NotFound';
import {
	POST_SEND,
	isPostSend,
	postSendLabel,
	type PostSend,
} from '../conversation/compose';

type Field =
	| 'name'
	| 'icon'
	| 'description'
	| 'leadUserId'
	| 'routingMethod'
	| 'capacity'
	| 'signature'
	| 'postSend'
	| 'alias'
	| 'members';

const fid = ( f: Field ) => `cd-team-${ f }`;
const NONE = '_none';

function Shell( {
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
} ) {
	return (
		<div className="mx-auto flex max-w-3xl flex-col">
			<Link
				to={ TEAMS_PATH }
				className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				<ArrowLeft
					aria-hidden="true"
					size={ 14 }
					className="rtl:rotate-180"
				/>
				{ __( 'All teams', 'cliedesk' ) }
			</Link>
			<PageHeader title={ title } description={ description } />
			{ children }
		</div>
	);
}

interface Values {
	name: string;
	icon: string;
	description: string;
	leadUserId: number | null;
	isPrivate: boolean;
	routingMethod: RoutingMethod;
	chat: string;
	email: string;
	signature: string;
	postSend: PostSend;
	alias: string;
	members: Array< { userId: number; name: string; isLead: boolean } >;
}

function initial( t: TeamDetail ): Values {
	return {
		name: t.name,
		icon: t.icon ?? '',
		description: t.description,
		leadUserId: t.leadUserId,
		isPrivate: t.isPrivate,
		routingMethod: t.routingMethod,
		chat: String( t.capacity.chat ?? 0 ),
		email: String( t.capacity.email ?? 0 ),
		signature: t.signature,
		postSend: isPostSend( t.postSend ) ? t.postSend : 'send',
		alias: t.alias,
		members: t.members.map( ( m ) => ( {
			userId: m.userId,
			name: m.name,
			isLead: m.isLead,
		} ) ),
	};
}

function validateCapacity( v: string, max: number ): string | null {
	if ( ! /^\d+$/.test( v.trim() ) || Number( v ) > max ) {
		return sprintf(
			/* translators: %d: maximum. */
			__( 'Enter a whole number from 0 to %d.', 'cliedesk' ),
			max
		);
	}
	return null;
}

/**
 * Client checks of the team form.
 *
 * @param v Values.
 */
export function validateTeam( v: Values ): Partial< Record< Field, string > > {
	const out: Partial< Record< Field, string > > = {};
	const name = validateText( v.name, 191, true );
	if ( name ) {
		out.name = name;
	}
	const icon = validateText( v.icon, 64 );
	if ( icon ) {
		out.icon = icon;
	}
	const cap =
		validateCapacity( v.chat, 1000 ) ?? validateCapacity( v.email, 10000 );
	if ( cap ) {
		out.capacity = cap;
	}
	return out;
}

/**
 * Request body: every field for full managers; only members for a Supervisor (the server refuses other fields).
 *
 * @param v           Values.
 * @param membersOnly Supervisor edit.
 */
export function teamPayload( v: Values, membersOnly: boolean ): TeamInput {
	const members = v.members.map( ( m ) => ( {
		userId: m.userId,
		isLead: m.isLead,
	} ) );
	if ( membersOnly ) {
		return { members };
	}
	return {
		name: v.name.trim(),
		icon: v.icon.trim(),
		description: v.description.trim(),
		leadUserId: v.leadUserId,
		// RTE-01 is Pro: Free only makes a private team visible again.
		...( v.isPrivate ? {} : { isPrivate: false } ),
		routingMethod: v.routingMethod,
		capacity: { chat: Number( v.chat ), email: Number( v.email ) },
		signature: v.signature,
		postSend: v.postSend,
		alias: v.alias.trim(),
		members,
	};
}

function TeamForm( {
	team,
	people,
	onReload,
}: {
	team: TeamDetail;
	people: Agent[];
	onReload: () => void;
} ) {
	const qc = useQueryClient();
	const [ v, setV ] = useState< Values >( () => initial( team ) );
	const [ version, setVersion ] = useState( team.version );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ server, setServer ] = useState<
		Partial< Record< Field, string > >
	>( {} );
	const [ adding, setAdding ] = useState< string | null >( null );
	const [ saved, setSaved ] = useState( false );
	const products = useQuery( productListQuery( 'active' ) );
	const full = can( 'cliedesk_manage_settings' );
	const me = getBoot().user?.id ?? 0;
	const leads =
		team.leadUserId === me ||
		team.members.some( ( m ) => m.userId === me && m.isLead );
	const canMembers = full || leads;
	const readOnly = ! full;
	const hasPrivate = useSlotHasFills( 'team.team.private' );

	const save = useMutation( {
		mutationFn: ( body: TeamInput ) =>
			api.patch< TeamDetail >( `teams/${ team.id }`, {
				body,
				ifMatch: versionTag( version ),
			} ),
		onSuccess: ( r ) => {
			const next = normaliseTeam( r.data );
			setVersion( next.version );
			setServer( {} );
			setSummary( [] );
			setSaved( true );
			qc.setQueryData( teamsKeys.detail( team.id ), next );
			void qc.invalidateQueries( { queryKey: teamsKeys.all } );
			void qc.invalidateQueries( { queryKey: teamKeys.allAgents } );
			announceResult(
				sprintf(
					/* translators: %s: team name. */
					__( 'Team “%s” saved.', 'cliedesk' ),
					next.name
				)
			);
		},
		onError: ( e ) => {
			const fields = apiFieldErrors( e );
			const next: Partial< Record< Field, string > > = {};
			const items: SummaryItem[] = [];
			const keys: Field[] = [
				'name',
				'icon',
				'description',
				'leadUserId',
				'routingMethod',
				'capacity',
				'signature',
				'postSend',
				'alias',
				'members',
			];
			for ( const f of keys ) {
				const msg = Object.entries( fields ).find(
					( [ k ] ) => k === f || k.startsWith( `${ f }.` )
				)?.[ 1 ];
				if ( msg ) {
					next[ f ] = msg;
					items.push( { fieldId: fid( f ), message: msg } );
				}
			}
			setServer( next );
			setSummary( items );
		},
	} );

	const client = validateTeam( v );
	const err = ( f: Field ) => client[ f ] ?? server[ f ] ?? null;
	const upd = < K extends keyof Values >( k: K, value: Values[ K ] ) => {
		setSaved( false );
		setV( ( o ) => ( { ...o, [ k ]: value } ) );
	};
	const candidates = people.filter(
		( p ) =>
			p.status !== 'deactivated' &&
			! v.members.some( ( m ) => m.userId === p.userId )
	);
	const leadOptions = [
		{ id: NONE, label: __( 'No supervisor', 'cliedesk' ) },
		...people
			.filter( ( p ) => p.status !== 'deactivated' )
			.map( ( p ) => ( { id: String( p.userId ), label: p.name } ) ),
	];
	if (
		v.leadUserId &&
		! leadOptions.some( ( o ) => o.id === String( v.leadUserId ) )
	) {
		leadOptions.push( {
			id: String( v.leadUserId ),
			label: sprintf(
				/* translators: %d: user id. */
				__( 'User #%d', 'cliedesk' ),
				v.leadUserId
			),
		} );
	}

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSaved( false );
		const errors = full ? validateTeam( v ) : {};
		const items = ( Object.keys( errors ) as Field[] ).map( ( f ) => ( {
			fieldId: fid( f ),
			message: errors[ f ] as string,
		} ) );
		setSummary( items );
		if ( items.length ) {
			return;
		}
		save.mutate( teamPayload( v, ! full ) );
	};

	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-6">
			<ErrorSummary items={ summary } />
			{ isConflict( save.error ) && (
				<ConflictBanner
					message={ __(
						'Someone else changed this team. Reload to see their changes.',
						'cliedesk'
					) }
					onReload={ onReload }
				/>
			) }
			<SaveError error={ save.error } />
			{ ! full && (
				<Banner
					tone="info"
					title={
						leads
							? __(
									'You lead this team, so you can change its members. Other settings need an administrator.',
									'cliedesk'
								)
							: __(
									'Only administrators and the team’s supervisor can change this team.',
									'cliedesk'
								)
					}
				/>
			) }
			<section
				aria-labelledby="cd-team-about"
				className="flex flex-col gap-4"
			>
				<h2 id="cd-team-about" className="text-lg font-semibold">
					{ __( 'About the team', 'cliedesk' ) }
				</h2>
				<TextField
					id={ fid( 'name' ) }
					label={ __( 'Team name', 'cliedesk' ) }
					value={ v.name }
					onChange={ ( x ) => upd( 'name', x ) }
					isReadOnly={ readOnly }
					isRequired
					errorMessage={ err( 'name' ) }
				/>
				<TextField
					id={ fid( 'icon' ) }
					label={ __( 'Icon', 'cliedesk' ) }
					description={ __(
						'A short symbol shown next to the team name.',
						'cliedesk'
					) }
					value={ v.icon }
					onChange={ ( x ) => upd( 'icon', x ) }
					isReadOnly={ readOnly }
					errorMessage={ err( 'icon' ) }
				/>
				<TextField
					id={ fid( 'description' ) }
					label={ __( 'Description', 'cliedesk' ) }
					multiline
					rows={ 2 }
					value={ v.description }
					onChange={ ( x ) => upd( 'description', x ) }
					isReadOnly={ readOnly }
					errorMessage={ err( 'description' ) }
				/>
				<Select
					id={ fid( 'leadUserId' ) }
					label={ __( 'Supervisor', 'cliedesk' ) }
					value={ v.leadUserId ? String( v.leadUserId ) : NONE }
					onChange={ ( x ) =>
						upd( 'leadUserId', x === NONE ? null : Number( x ) )
					}
					isDisabled={ readOnly }
					errorMessage={ err( 'leadUserId' ) }
					options={ leadOptions }
				/>
				{ /* RTE-01 (Pro) makes a team private; Free can only make a team stored as private visible again. */ }
				{ hasPrivate ? (
					<Slot
						name="team.team.private"
						fillProps={ {
							teamId: team.id,
							isPrivate: team.isPrivate,
							onSaved: onReload,
						} }
					/>
				) : (
					team.isPrivate && (
						<Switch
							isSelected={ v.isPrivate }
							onChange={ ( x ) => upd( 'isPrivate', x ) }
							isReadOnly={ readOnly }
						>
							{ __(
								'Private team (only members see its queue and views). Turn off to show it to everyone.',
								'cliedesk'
							) }
						</Switch>
					)
				) }
			</section>

			<section
				aria-labelledby="cd-team-work"
				className="flex flex-col gap-4"
			>
				<h2 id="cd-team-work" className="text-lg font-semibold">
					{ __( 'Routing and replies', 'cliedesk' ) }
				</h2>
				<Select
					id={ fid( 'routingMethod' ) }
					label={ __( 'Routing method', 'cliedesk' ) }
					value={ v.routingMethod }
					onChange={ ( x ) =>
						upd( 'routingMethod', x as RoutingMethod )
					}
					isDisabled={ readOnly }
					errorMessage={ err( 'routingMethod' ) }
					options={ ROUTING_METHODS.map( ( m ) => ( {
						id: m,
						label: routingLabel( m ),
					} ) ) }
				/>
				<Slot name="routing.methods.pro" />
				<fieldset
					id={ fid( 'capacity' ) }
					className="flex flex-col gap-2"
				>
					<legend className="pb-1 text-sm font-medium">
						{ __( 'Capacity per person', 'cliedesk' ) }
					</legend>
					<div className="grid gap-3 sm:grid-cols-2">
						<TextField
							label={ __( 'Chats at the same time', 'cliedesk' ) }
							inputMode="numeric"
							value={ v.chat }
							onChange={ ( x ) => upd( 'chat', x ) }
							isReadOnly={ readOnly }
							errorMessage={
								validateCapacity( v.chat, 1000 )
									? err( 'capacity' )
									: null
							}
						/>
						<TextField
							label={ __(
								'Open email conversations',
								'cliedesk'
							) }
							inputMode="numeric"
							value={ v.email }
							onChange={ ( x ) => upd( 'email', x ) }
							isReadOnly={ readOnly }
							errorMessage={
								validateCapacity( v.email, 10000 )
									? err( 'capacity' )
									: null
							}
						/>
					</div>
					<p className="text-sm text-fg-subtle">
						{ __( '0 means no limit.', 'cliedesk' ) }
					</p>
				</fieldset>
				<TextField
					id={ fid( 'signature' ) }
					label={ __( 'Team signature', 'cliedesk' ) }
					description={ __(
						'HTML is allowed; unsafe code is removed when you save.',
						'cliedesk'
					) }
					multiline
					rows={ 3 }
					value={ v.signature }
					onChange={ ( x ) => upd( 'signature', x ) }
					isReadOnly={ readOnly }
					errorMessage={ err( 'signature' ) }
				/>
				<Select
					id={ fid( 'postSend' ) }
					label={ __( 'Default send action', 'cliedesk' ) }
					description={ __(
						'What the send button does for members by default. The other choices stay in its menu.',
						'cliedesk'
					) }
					value={ v.postSend }
					onChange={ ( x ) => upd( 'postSend', x as PostSend ) }
					isDisabled={ readOnly }
					errorMessage={ err( 'postSend' ) }
					options={ POST_SEND.map( ( a ) => ( {
						id: a,
						label: postSendLabel( a ),
					} ) ) }
				/>
				<TextField
					id={ fid( 'alias' ) }
					label={ __( 'Name shown to customers', 'cliedesk' ) }
					description={ __(
						'For example “Support Team”. Leave empty to show the person’s own name.',
						'cliedesk'
					) }
					value={ v.alias }
					onChange={ ( x ) => upd( 'alias', x ) }
					isReadOnly={ readOnly }
					errorMessage={ err( 'alias' ) }
				/>
				{ ( products.data?.items ?? [] ).length > 1 && (
					<TeamProducts teamId={ team.id } ids={ team.productIds } />
				) }
			</section>

			<section
				aria-labelledby="cd-team-members"
				className="flex flex-col gap-3"
			>
				<h2 id="cd-team-members" className="text-lg font-semibold">
					{ __( 'Members', 'cliedesk' ) }
				</h2>
				<div id={ fid( 'members' ) }>
					{ v.members.length ? (
						<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
							{ v.members.map( ( m ) => {
								const original = team.members.find(
									( x ) => x.userId === m.userId
								);
								return (
									<li
										key={ m.userId }
										className="flex flex-wrap items-center gap-3 px-4 py-2"
									>
										<span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
											<bdi>
												{ m.name ||
													people.find(
														( p ) =>
															p.userId ===
															m.userId
													)?.name }
											</bdi>
											{ original?.isDefault && (
												<Badge>
													{ __(
														'Default team',
														'cliedesk'
													) }
												</Badge>
											) }
											{ original && ! original.agent && (
												<Badge>
													{ __(
														'Mentions only',
														'cliedesk'
													) }
												</Badge>
											) }
										</span>
										<Checkbox
											isSelected={ m.isLead }
											isReadOnly={ ! canMembers }
											onChange={ ( on ) =>
												upd(
													'members',
													v.members.map( ( x ) =>
														x.userId === m.userId
															? {
																	...x,
																	isLead: on,
																}
															: x
													)
												)
											}
										>
											{ __( 'Lead', 'cliedesk' ) }
											<span className="sr-only">
												{ ` ${ m.name }` }
											</span>
										</Checkbox>
										{ canMembers && (
											<IconButton
												size="sm"
												label={ sprintf(
													/* translators: %s: person name. */
													__(
														'Remove %s from the team',
														'cliedesk'
													),
													m.name
												) }
												icon={ <X size={ 14 } /> }
												onPress={ () =>
													upd(
														'members',
														v.members.filter(
															( x ) =>
																x.userId !==
																m.userId
														)
													)
												}
											/>
										) }
									</li>
								);
							} ) }
						</ul>
					) : (
						<p className="text-fg-muted">
							{ __( 'No members yet.', 'cliedesk' ) }
						</p>
					) }
				</div>
				{ err( 'members' ) && (
					<p className="text-sm text-danger">{ err( 'members' ) }</p>
				) }
				{ canMembers && candidates.length > 0 && (
					<div className="flex flex-wrap items-end gap-2">
						<Select
							className="min-w-60"
							label={ __( 'Add a member', 'cliedesk' ) }
							value={ adding }
							onChange={ setAdding }
							options={ candidates.map( ( p ) => ( {
								id: String( p.userId ),
								label: p.name,
							} ) ) }
						/>
						<Button
							isDisabled={ ! adding }
							onPress={ () => {
								const p = candidates.find(
									( x ) => String( x.userId ) === adding
								);
								if ( p ) {
									upd( 'members', [
										...v.members,
										{
											userId: p.userId,
											name: p.name,
											isLead: false,
										},
									] );
									announceResult(
										sprintf(
											/* translators: %s: person name. */
											__(
												'%s added. Save to keep the change.',
												'cliedesk'
											),
											p.name
										)
									);
								}
								setAdding( null );
							} }
						>
							{ __( 'Add', 'cliedesk' ) }
						</Button>
					</div>
				) }
			</section>

			{ canMembers && (
				<div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-canvas py-3">
					<Button
						type="submit"
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ isConflict( save.error ) }
					>
						{ __( 'Save team', 'cliedesk' ) }
					</Button>
					<p role="status" className="text-sm text-success">
						{ saved ? __( 'Saved', 'cliedesk' ) : '' }
					</p>
				</div>
			) }
		</form>
	);
}

/**
 * Team page.
 */
export default function TeamRoute() {
	const params = useParams( { strict: false } ) as { teamId?: string };
	const id = Number( params.teamId );
	const valid = Number.isInteger( id ) && id > 0;
	const q = useQuery( { ...teamDetailQuery( id ), enabled: valid } );
	const people = useQuery(
		agentsQuery( { ...EMPTY_FILTERS, status: 'all' } )
	);
	const [ rev, setRev ] = useState( 0 );

	if ( ! valid ) {
		return <NotFound />;
	}
	if ( q.isPending ) {
		return (
			<Shell title={ __( 'Team', 'cliedesk' ) }>
				<LoadingRegion />
			</Shell>
		);
	}
	if ( q.isError ) {
		if ( isApiError( q.error ) && q.error.status === 404 ) {
			return <NotFound />;
		}
		return (
			<Shell title={ __( 'Team', 'cliedesk' ) }>
				<QueryError
					title={ __( 'Could not load the team', 'cliedesk' ) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			</Shell>
		);
	}
	const team = q.data;
	return (
		<Shell
			title={ team.name }
			description={
				team.archived ? __( 'Archived', 'cliedesk' ) : undefined
			}
		>
			<TeamForm
				key={ `${ team.id }:${ rev }` }
				team={ team }
				people={ people.data ?? [] }
				onReload={ () => {
					void q.refetch().then( () => setRev( ( n ) => n + 1 ) );
				} }
			/>
			<TeamShortcuts team={ team } />
		</Shell>
	);
}
