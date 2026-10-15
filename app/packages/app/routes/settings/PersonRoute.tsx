/**
 * `/settings/team/people/$userId`: one person (TEAM-03…05, TEAM-11, TEAM-24): Cliedesk roles (the Owner shown as
 * fixed), the effective permissions, profile (admin edit, locks do not apply), team memberships with the default
 * team, and Deactivate. Permissions given to or taken from the person in WordPress (e.g. by a role plugin) are shown
 * read-only; editing them (TEAM-14) fills `team.person.overrides` and "View as" (TEAM-18) `team.person.view_as`
 * (both Pro).
 */
import {
	api,
	can,
	getBoot,
	isApiError,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	ConfirmDestructive,
	LoadingRegion,
	RadioGroup,
	Tab,
	TabList,
	TabPanel,
	Tabs,
	Slot,
} from '@cliedesk/ui';
import { Link, useParams } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { announceResult } from '../../workspace/forms';
import {
	EMPTY_FILTERS,
	OWNER_ROLE,
	agentsQuery,
	capabilitiesQuery,
	groupByArea,
	permissionsQuery,
	rolesQuery,
	teamDetailQuery,
	teamKeys,
	teamsKeys,
	userProfileQuery,
	type Agent,
	type Capability,
	type Permissions,
	type Role,
} from '../../team/api';
import {
	AgentBadges,
	LockHint,
	QueryError,
	lastLoginText,
	serverMessage,
} from '../../team/components';
import { areaLabel, roleName } from '../../team/labels';
import { PEOPLE_PATH, teamPath } from '../../team/paths';
import { PersonProducts } from '../../team/ProductLimit';
import { ProfileForm } from '../../team/ProfileForm';
import { PersonAssignOnly } from './PersonStatus';
import { statusKit } from '../../components/StatusMenu';
import { NotFound } from '../NotFound';

function Shell( {
	title,
	description,
	actions,
	children,
}: {
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
} ) {
	return (
		<div className="mx-auto flex max-w-3xl flex-col">
			<Link
				to={ PEOPLE_PATH }
				className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				<ArrowLeft
					aria-hidden="true"
					size={ 14 }
					className="rtl:rotate-180"
				/>
				{ __( 'All people', 'cliedesk' ) }
			</Link>
			<PageHeader
				title={ title }
				description={ description }
				actions={ actions }
			/>
			{ children }
		</div>
	);
}

function RolesForm( {
	perms,
	roles,
	isSelf,
}: {
	perms: Permissions;
	roles: Role[];
	isSelf: boolean;
} ) {
	const qc = useQueryClient();
	const [ chosen, setChosen ] = useState< string[] >(
		perms.roles.filter( ( r ) => r !== OWNER_ROLE )
	);
	const save = useMutation( {
		mutationFn: ( list: string[] ) =>
			api.put< Permissions >( `users/${ perms.id }/roles`, {
				body: { roles: list },
			} ),
		onSuccess: ( r ) => {
			qc.setQueryData( teamKeys.permissions( perms.id ), r.data );
			void qc.invalidateQueries( { queryKey: teamKeys.allAgents } );
			void qc.invalidateQueries( { queryKey: teamKeys.roles } );
			announceResult( __( 'Roles saved.', 'cliedesk' ) );
		},
	} );
	const assignable = roles.filter( ( r ) => r.key !== OWNER_ROLE );
	return (
		<section
			aria-labelledby="cd-person-roles"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-person-roles" className="text-lg font-semibold">
				{ __( 'Cliedesk roles', 'cliedesk' ) }
			</h2>
			{ perms.isOwner && (
				<Banner
					tone="info"
					title={ __(
						'Owner (WordPress administrator): always has every permission.',
						'cliedesk'
					) }
				>
					{ __(
						'This cannot be changed here. Change WordPress roles under Users in WordPress.',
						'cliedesk'
					) }
				</Banner>
			) }
			{ isSelf && (
				<Banner
					tone="info"
					title={ __(
						'You cannot change your own roles or permissions. Ask another administrator.',
						'cliedesk'
					) }
				/>
			) }
			<fieldset className="flex flex-col gap-1">
				<legend className="sr-only">
					{ __( 'Cliedesk roles', 'cliedesk' ) }
				</legend>
				{ assignable.map( ( r ) => (
					<Checkbox
						key={ r.key }
						isSelected={ chosen.includes( r.key ) }
						isDisabled={ isSelf }
						onChange={ ( on ) =>
							setChosen( ( old ) =>
								on
									? [ ...old, r.key ]
									: old.filter( ( x ) => x !== r.key )
							)
						}
					>
						<bdi>{ roleName( r.key, roles ) }</bdi>
					</Checkbox>
				) ) }
			</fieldset>
			{ perms.otherRoles.length > 0 && (
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: %s: list of WordPress role keys. */
						__( 'Other WordPress roles: %s', 'cliedesk' ),
						perms.otherRoles.join( ', ' )
					) }
				</p>
			) }
			{ save.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( save.error ) }
				/>
			) }
			{ ! isSelf && (
				<div className="flex items-center gap-3">
					<Button
						variant="primary"
						isLoading={ save.isPending }
						onPress={ () => save.mutate( chosen ) }
					>
						{ __( 'Save roles', 'cliedesk' ) }
					</Button>
					<p role="status" className="text-sm text-success">
						{ save.isSuccess ? __( 'Saved', 'cliedesk' ) : '' }
					</p>
				</div>
			) }
		</section>
	);
}

/**
 * Permissions given to or taken from this person outside their roles (WordPress user capabilities), read-only.
 *
 * @param props              Props.
 * @param props.perms        Permissions.
 * @param props.capabilities Catalogue.
 */
function IndividualPermissions( {
	perms,
	capabilities,
}: {
	perms: Permissions;
	capabilities: Capability[];
} ) {
	if ( ! perms.granted.length && ! perms.revoked.length ) {
		return null;
	}
	const labels = ( keys: string[] ) =>
		keys
			.map(
				( k ) => capabilities.find( ( c ) => c.key === k )?.label ?? k
			)
			.join( ', ' );
	return (
		<section
			aria-labelledby="cd-person-overrides"
			className="flex flex-col gap-2"
		>
			<h2 id="cd-person-overrides" className="text-lg font-semibold">
				{ __( 'Individual permissions', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Set for this person in WordPress, on top of their roles.',
					'cliedesk'
				) }
			</p>
			<dl className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 text-sm">
				{ perms.granted.length > 0 && (
					<div className="flex flex-col gap-0.5">
						<dt className="font-semibold">
							{ __( 'Given', 'cliedesk' ) }
						</dt>
						<dd className="text-fg-muted">
							{ labels( perms.granted ) }
						</dd>
					</div>
				) }
				{ perms.revoked.length > 0 && (
					<div className="flex flex-col gap-0.5">
						<dt className="font-semibold">
							{ __( 'Taken away', 'cliedesk' ) }
						</dt>
						<dd className="text-fg-muted">
							{ labels( perms.revoked ) }
						</dd>
					</div>
				) }
			</dl>
		</section>
	);
}

function Effective( {
	perms,
	capabilities,
}: {
	perms: Permissions;
	capabilities: Capability[];
} ) {
	const held = capabilities.filter( ( c ) =>
		perms.effective.includes( c.key )
	);
	return (
		<section
			aria-labelledby="cd-person-effective"
			className="flex flex-col gap-2"
		>
			<h2 id="cd-person-effective" className="text-lg font-semibold">
				{ sprintf(
					/* translators: 1: person name, 2: number of permissions. */
					__( 'What %1$s can do (%2$d permissions)', 'cliedesk' ),
					perms.name,
					held.length
				) }
			</h2>
			{ held.length ? (
				<dl className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 text-sm">
					{ groupByArea( held ).map( ( g ) => (
						<div key={ g.area } className="flex flex-col gap-0.5">
							<dt className="font-semibold">
								{ areaLabel( g.area ) }
							</dt>
							<dd className="text-fg-muted">
								{ g.caps.map( ( c ) => c.label ).join( ', ' ) }
							</dd>
						</div>
					) ) }
				</dl>
			) : (
				<p className="text-fg-muted">
					{ __( 'No Cliedesk permissions.', 'cliedesk' ) }
				</p>
			) }
		</section>
	);
}

function TeamsTab( { agent }: { agent: Agent | undefined } ) {
	const qc = useQueryClient();
	const ids = agent?.teams ?? [];
	const details = useQueries( {
		queries: ids.map( ( id ) => teamDetailQuery( id ) ),
	} );
	const current =
		details.find( ( d ) =>
			d.data?.members.some(
				( m ) => m.userId === agent?.userId && m.isDefault
			)
		)?.data?.id ?? null;
	const setDefault = useMutation( {
		mutationFn: ( teamId: number ) =>
			api.put( `users/${ agent?.userId }/default-team`, {
				body: { teamId },
			} ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: teamsKeys.all } );
			announceResult( __( 'Default team saved.', 'cliedesk' ) );
		},
	} );
	if ( ! agent ) {
		return null;
	}
	if ( ! ids.length ) {
		return (
			<p className="text-fg-muted">
				{ __( 'Not in any team yet.', 'cliedesk' ) }
			</p>
		);
	}
	const loaded = details.every( ( d ) => d.data );
	return (
		<section
			aria-labelledby="cd-person-teams"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-person-teams" className="text-lg font-semibold">
				{ __( 'Teams', 'cliedesk' ) }
			</h2>
			<ul className="flex flex-col gap-1">
				{ details.map( ( d, i ) => (
					<li key={ ids[ i ] }>
						<Link
							to={ teamPath( ids[ i ] as number ) }
							className="text-accent-fg underline-offset-2 hover:underline"
						>
							<bdi>
								{ d.data?.name ??
									sprintf(
										/* translators: %d: team id. */
										__( 'Team #%d', 'cliedesk' ),
										ids[ i ] as number
									) }
							</bdi>
						</Link>
					</li>
				) ) }
			</ul>
			{ loaded && ids.length > 1 && (
				<RadioGroup
					label={ __( 'Default team', 'cliedesk' ) }
					description={ __(
						'New conversations this person starts belong to this team.',
						'cliedesk'
					) }
					value={ String(
						setDefault.isPending
							? setDefault.variables
							: ( current ?? '' )
					) }
					onChange={ ( x ) => setDefault.mutate( Number( x ) ) }
					options={ details.map( ( d ) => ( {
						id: String( d.data?.id ),
						label: d.data?.name ?? '',
					} ) ) }
				/>
			) }
			{ setDefault.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( setDefault.error ) }
				/>
			) }
		</section>
	);
}

/**
 * Person page.
 */
export default function PersonRoute() {
	const params = useParams( { strict: false } ) as { userId?: string };
	const id = Number( params.userId );
	const valid = Number.isInteger( id ) && id > 0;
	const qc = useQueryClient();
	const canRoles = can( 'cliedesk_manage_roles' );
	const isSelf = getBoot().user?.id === id;
	const [ tab, setTab ] = useState< string >(
		canRoles ? 'permissions' : 'profile'
	);
	const [ deactivating, setDeactivating ] = useState( false );
	const people = useQuery( {
		...agentsQuery( { ...EMPTY_FILTERS, status: 'all' } ),
		enabled: valid,
	} );
	const perms = useQuery( {
		...permissionsQuery( id ),
		enabled: valid && canRoles,
	} );
	const roles = useQuery( { ...rolesQuery(), enabled: canRoles } );
	const caps = useQuery( { ...capabilitiesQuery(), enabled: canRoles } );
	const profile = useQuery( { ...userProfileQuery( id ), enabled: valid } );
	const agent = people.data?.find( ( p ) => p.userId === id );

	const deactivate = useMutation( {
		mutationFn: () => api.post( `agents/${ id }/deactivate`, { body: {} } ),
		onSuccess: () => {
			setDeactivating( false );
			announceResult( __( 'Person deactivated.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: teamKeys.all } );
		},
	} );

	if ( ! valid ) {
		return <NotFound />;
	}
	if ( people.isPending || profile.isPending ) {
		return (
			<Shell title={ __( 'Person', 'cliedesk' ) }>
				<LoadingRegion />
			</Shell>
		);
	}
	if ( profile.isError ) {
		if ( isApiError( profile.error ) && profile.error.status === 404 ) {
			return <NotFound />;
		}
		return (
			<Shell title={ __( 'Person', 'cliedesk' ) }>
				<QueryError
					title={ __( 'Could not load this person', 'cliedesk' ) }
					error={ profile.error }
					onRetry={ () => void profile.refetch() }
				/>
			</Shell>
		);
	}
	const name = profile.data.displayName;
	const canDeactivate =
		!! agent && agent.status !== 'deactivated' && ! isSelf;

	let permissionsBody: ReactNode = null;
	if ( canRoles ) {
		if ( perms.isPending || roles.isPending || caps.isPending ) {
			permissionsBody = <LoadingRegion />;
		} else if ( perms.isError || roles.isError || caps.isError ) {
			const failed = [ perms, roles, caps ].find( ( x ) => x.isError );
			permissionsBody = (
				<QueryError
					title={ __( 'Could not load the permissions', 'cliedesk' ) }
					error={ failed?.error }
					onRetry={ () => void failed?.refetch() }
				/>
			);
		} else {
			permissionsBody = (
				<div className="flex flex-col gap-8">
					<RolesForm
						key={ perms.data.roles.join( ',' ) }
						perms={ perms.data }
						roles={ roles.data.roles }
						isSelf={ isSelf }
					/>
					{ /* Pro edits them; areaLabel and LockHint are passed so it needs no extra @cliedesk/app exports. */ }
					<Slot
						name="team.person.overrides"
						fillProps={ {
							permissions: perms.data,
							roles: roles.data.roles,
							capabilities: caps.data,
							isSelf,
							areaLabel,
							LockHint,
						} }
						fallback={
							<IndividualPermissions
								perms={ perms.data }
								capabilities={ caps.data }
							/>
						}
					/>
					<Effective
						perms={ perms.data }
						capabilities={ caps.data }
					/>
				</div>
			);
		}
	}

	return (
		<Shell
			title={ name }
			description={
				agent ? (
					<span className="flex flex-col gap-1">
						<bdi>{ agent.email }</bdi>
						<span className="flex flex-wrap items-center gap-2 text-sm">
							<AgentBadges agent={ agent } />
							<span>
								{ sprintf(
									/* translators: %s: date of last login, or "Never". */
									__( 'Last login: %s', 'cliedesk' ),
									lastLoginText( agent.lastLogin )
								) }
							</span>
						</span>
					</span>
				) : undefined
			}
			actions={
				<>
					{ agent?.status !== 'deactivated' && (
						<Slot
							name="team.person.view_as"
							fillProps={ { userId: id, name } }
						/>
					) }
					{ canDeactivate && can( 'cliedesk_manage_team' ) && (
						<>
							{ /* RTE-35 (Pro): set this person's status. */ }
							<Slot
								name="team.person.status"
								fillProps={ {
									userId: id,
									name,
									kit: statusKit,
								} }
							/>
							<PersonAssignOnly userId={ id } />
						</>
					) }
					{ canDeactivate ? (
						<Button
							variant="danger"
							onPress={ () => setDeactivating( true ) }
						>
							{ __( 'Deactivate', 'cliedesk' ) }
						</Button>
					) : null }
				</>
			}
		>
			{ deactivate.isSuccess && (
				<Banner
					tone="success"
					title={ sprintf(
						/* translators: %s: person name. */
						__(
							'%s was deactivated. Their WordPress account and history stay.',
							'cliedesk'
						),
						name
					) }
				/>
			) }
			<Tabs
				selectedKey={ tab }
				onSelectionChange={ ( k ) => setTab( String( k ) ) }
			>
				<TabList label={ __( 'Person', 'cliedesk' ) }>
					{ canRoles ? (
						<Tab id="permissions">
							{ __( 'Roles & permissions', 'cliedesk' ) }
						</Tab>
					) : null }
					<Tab id="profile">{ __( 'Profile', 'cliedesk' ) }</Tab>
					<Tab id="teams">{ __( 'Teams', 'cliedesk' ) }</Tab>
				</TabList>
				{ canRoles ? (
					<TabPanel id="permissions">{ permissionsBody }</TabPanel>
				) : null }
				<TabPanel id="profile">
					<ProfileForm
						key={ profile.data.userId }
						profile={ profile.data }
						mode={ isSelf ? 'self' : 'admin' }
					/>
				</TabPanel>
				<TabPanel id="teams">
					<div className="flex flex-col gap-8">
						<TeamsTab agent={ agent } />
						{ can( 'cliedesk_manage_team' ) && (
							<PersonProducts userId={ id } />
						) }
					</div>
				</TabPanel>
			</Tabs>
			<ConfirmDestructive
				isOpen={ deactivating }
				onOpenChange={ ( open ) => {
					setDeactivating( open );
					if ( ! open ) {
						deactivate.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: person name. */
					__( 'Deactivate %s?', 'cliedesk' ),
					name
				) }
				description={ __(
					'They lose access to Cliedesk and their individual permissions are removed. Their WordPress account, messages and history stay.',
					'cliedesk'
				) }
				confirmLabel={ sprintf(
					/* translators: %s: person name. */
					__( 'Deactivate %s', 'cliedesk' ),
					name
				) }
				isLoading={ deactivate.isPending }
				onConfirm={ () => deactivate.mutate() }
			>
				{ deactivate.isError && (
					<p role="alert" className="text-danger">
						{ serverMessage( deactivate.error ) }
					</p>
				) }
			</ConfirmDestructive>
		</Shell>
	);
}
