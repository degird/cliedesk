/**
 * Settings → Team & roles → People (TEAM-02, TEAM-03): the team directory with filters, status badges, multi-select
 * bulk actions with per-person results, CSV export, invites and confirmation of people waiting to join. Pro adds
 * row actions ("View as", TEAM-18) through the `team.people.row_actions` slot.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	EmptyState,
	LoadingRegion,
	Select,
	Slot,
	TextField,
	useSlotHasFills,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Download, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { announceResult } from '../../workspace/forms';
import {
	EMPTY_FILTERS,
	agentQueryArgs,
	agentsQuery,
	downloadFile,
	rolesQuery,
	teamKeys,
	teamListQuery,
	type AgentFilters,
	type ExportFile,
	type StatusFilter,
} from '../../team/api';
import { BulkBar, BulkResults, type BulkOutcome } from '../../team/BulkActions';
import {
	AgentBadges,
	QueryError,
	lastLoginText,
	serverMessage,
} from '../../team/components';
import { InviteDialog } from '../../team/InviteDialog';
import { DEFAULT_ROLE_KEYS, roleName } from '../../team/labels';
import { personPath } from '../../team/paths';
import { AutoJoinSettings } from '../../team/TeamSettings';

const ANY = '_any';

/**
 * People section.
 */
export default function PeopleSection() {
	const qc = useQueryClient();
	const rowActions = useSlotHasFills( 'team.people.row_actions' );
	const [ filters, setFilters ] = useState< AgentFilters >( EMPTY_FILTERS );
	const [ search, setSearch ] = useState( '' );
	const [ selected, setSelected ] = useState< Set< number > >(
		() => new Set()
	);
	const [ outcome, setOutcome ] = useState< BulkOutcome | null >( null );
	const [ inviting, setInviting ] = useState( false );
	const canRoles = can( 'cliedesk_manage_roles' );
	const isAdmin = can( 'cliedesk_manage_settings' );

	// Search is sent 300 ms after typing stops.
	useEffect( () => {
		const t = window.setTimeout(
			() =>
				setFilters( ( f ) =>
					f.search === search ? f : { ...f, search }
				),
			300
		);
		return () => window.clearTimeout( t );
	}, [ search ] );

	const q = useQuery( agentsQuery( filters ) );
	const rolesQ = useQuery( { ...rolesQuery(), enabled: canRoles } );
	const teamsQ = useQuery( teamListQuery( false ) );
	const teams = teamsQ.data ?? [];
	const people = useMemo( () => q.data ?? [], [ q.data ] );

	const roleOptions = useMemo( () => {
		const list = rolesQ.data?.roles;
		if ( list ) {
			return list.map( ( r ) => ( {
				key: r.key,
				name: roleName( r.key, list ),
			} ) );
		}
		return DEFAULT_ROLE_KEYS.map( ( k ) => ( {
			key: k,
			name: roleName( k ),
		} ) );
	}, [ rolesQ.data ] );
	// Supervisors invite Agents and Collaborators only (security §3.4).
	const invitable = isAdmin
		? roleOptions.filter( ( r ) => r.key !== 'administrator' )
		: roleOptions.filter( ( r ) =>
				[ 'cliedesk_agent', 'cliedesk_collaborator' ].includes( r.key )
			);

	// Keep the selection to rows that are still listed.
	useEffect( () => {
		setSelected( ( old ) => {
			const ids = new Set( people.map( ( p ) => p.userId ) );
			const next = new Set(
				[ ...old ].filter( ( id ) => ids.has( id ) )
			);
			return next.size === old.size ? old : next;
		} );
	}, [ people ] );

	const exportCsv = useMutation( {
		mutationFn: async () =>
			(
				await api.get< ExportFile >( 'agents/export', {
					query: agentQueryArgs( filters ),
				} )
			).data,
		onSuccess: ( file ) => {
			downloadFile( file.filename, file.csv );
			announceResult(
				sprintf(
					/* translators: %d: number of people exported. */
					_n(
						'Exported %d person.',
						'Exported %d people.',
						file.rows,
						'cliedesk'
					),
					file.rows
				)
			);
		},
	} );

	const confirmOne = useMutation( {
		mutationFn: ( id: number ) =>
			api.post( 'invites/confirm', { body: { userIds: [ id ] } } ),
		onSuccess: () => {
			announceResult( __( 'Person confirmed.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: teamKeys.all } );
		},
	} );

	const set = < K extends keyof AgentFilters >(
		k: K,
		v: AgentFilters[ K ]
	) => setFilters( ( f ) => ( { ...f, [ k ]: v } ) );
	const filtered =
		filters.role !== '' ||
		filters.team !== null ||
		filters.status !== '' ||
		filters.inactive ||
		filters.hasOverrides ||
		filters.search !== '';
	const teamName = ( id: number ) =>
		teams.find( ( t ) => t.id === id )?.name ?? `#${ id }`;
	const allSelected =
		people.length > 0 && people.every( ( p ) => selected.has( p.userId ) );

	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Loading people…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<QueryError
				title={ __( 'Could not load the team', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! people.length ) {
		body = (
			<EmptyState
				icon={ <Users size={ 32 } strokeWidth={ 1.75 } /> }
				title={
					filtered
						? __( 'Nobody matches these filters', 'cliedesk' )
						: __( 'No people yet', 'cliedesk' )
				}
				description={
					filtered
						? __( 'Clear the filters to see everyone.', 'cliedesk' )
						: __(
								'Invite your colleagues by email. They sign in with their WordPress account.',
								'cliedesk'
							)
				}
				actions={
					filtered ? (
						<Button
							onPress={ () => {
								setSearch( '' );
								setFilters( EMPTY_FILTERS );
							} }
						>
							{ __( 'Clear filters', 'cliedesk' ) }
						</Button>
					) : (
						// ADM-04: every empty state offers a way to start.
						<Button
							variant="primary"
							onPress={ () => setInviting( true ) }
						>
							{ __( 'Invite people', 'cliedesk' ) }
						</Button>
					)
				}
			/>
		);
	} else {
		body = (
			<div className="overflow-x-auto rounded-lg border border-line bg-surface">
				<table className="w-full text-start text-base">
					<caption className="sr-only">
						{ __( 'People', 'cliedesk' ) }
					</caption>
					<thead className="border-b border-line text-sm text-fg-muted">
						<tr>
							<th scope="col" className="w-10 px-3 py-2">
								<Checkbox
									isSelected={ allSelected }
									isIndeterminate={
										! allSelected && selected.size > 0
									}
									onChange={ ( on ) =>
										setSelected(
											on
												? new Set(
														people.map(
															( p ) => p.userId
														)
													)
												: new Set()
										)
									}
								>
									<span className="sr-only">
										{ __(
											'Select everyone listed',
											'cliedesk'
										) }
									</span>
								</Checkbox>
							</th>
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Name', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Roles', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Teams', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Status', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Last login', 'cliedesk' ) }
							</th>
							{ rowActions && (
								<th scope="col" className="px-3 py-2">
									<span className="sr-only">
										{ __( 'Actions', 'cliedesk' ) }
									</span>
								</th>
							) }
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{ people.map( ( p ) => (
							<tr key={ p.userId } data-user-row={ p.userId }>
								<td className="px-3 py-2">
									<Checkbox
										isSelected={ selected.has( p.userId ) }
										onChange={ ( on ) =>
											setSelected( ( old ) => {
												const next = new Set( old );
												if ( on ) {
													next.add( p.userId );
												} else {
													next.delete( p.userId );
												}
												return next;
											} )
										}
									>
										<span className="sr-only">
											{ sprintf(
												/* translators: %s: person name. */
												__( 'Select %s', 'cliedesk' ),
												p.name
											) }
										</span>
									</Checkbox>
								</td>
								<th
									scope="row"
									className="px-3 py-2 text-start font-normal"
								>
									<span className="flex items-center gap-2">
										{ p.avatar && (
											<img
												src={ p.avatar }
												alt=""
												className="size-8 shrink-0 rounded-full"
											/>
										) }
										<span className="flex min-w-0 flex-col">
											<Link
												to={ personPath( p.userId ) }
												className="font-medium text-accent-fg underline-offset-2 hover:underline"
											>
												<bdi>{ p.name }</bdi>
											</Link>
											<span className="text-sm break-all text-fg-muted">
												<bdi>{ p.email }</bdi>
											</span>
										</span>
									</span>
								</th>
								<td className="px-3 py-2 text-sm">
									{ p.roles.length
										? p.roles
												.map( ( r ) =>
													roleName(
														r,
														rolesQ.data?.roles
													)
												)
												.join( ', ' )
										: '—' }
								</td>
								<td className="px-3 py-2 text-sm">
									<bdi>
										{ p.teams.length
											? p.teams
													.map( teamName )
													.join( ', ' )
											: '—' }
									</bdi>
								</td>
								<td className="px-3 py-2">
									<span className="flex flex-col items-start gap-1">
										<AgentBadges agent={ p } />
										{ p.status === 'pending' && (
											<Button
												size="sm"
												isLoading={
													confirmOne.isPending &&
													confirmOne.variables ===
														p.userId
												}
												onPress={ () =>
													confirmOne.mutate(
														p.userId
													)
												}
												aria-label={ sprintf(
													/* translators: %s: person name. */
													__(
														'Approve %s',
														'cliedesk'
													),
													p.name
												) }
											>
												{ __( 'Approve', 'cliedesk' ) }
											</Button>
										) }
									</span>
								</td>
								<td className="px-3 py-2 text-sm whitespace-nowrap text-fg-muted">
									{ lastLoginText( p.lastLogin ) }
								</td>
								{ rowActions && (
									<td className="px-3 py-2 text-end">
										{ p.status !== 'deactivated' && (
											<Slot
												name="team.people.row_actions"
												fillProps={ {
													userId: p.userId,
													name: p.name,
												} }
											/>
										) }
									</td>
								) }
							</tr>
						) ) }
					</tbody>
				</table>
			</div>
		);
	}

	const selectedPeople = people.filter( ( p ) => selected.has( p.userId ) );

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-end gap-2">
				<Button
					iconStart={ <Download aria-hidden="true" size={ 16 } /> }
					isLoading={ exportCsv.isPending }
					onPress={ () => exportCsv.mutate() }
				>
					{ __( 'Export CSV', 'cliedesk' ) }
				</Button>
				<Button
					variant="primary"
					iconStart={ <UserPlus aria-hidden="true" size={ 16 } /> }
					onPress={ () => setInviting( true ) }
				>
					{ __( 'Invite people', 'cliedesk' ) }
				</Button>
			</div>
			<div
				role="search"
				aria-label={ __( 'Filter people', 'cliedesk' ) }
				className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
			>
				<TextField
					label={ __( 'Search by name or email', 'cliedesk' ) }
					type="search"
					value={ search }
					onChange={ setSearch }
				/>
				<Select
					label={ __( 'Role', 'cliedesk' ) }
					value={ filters.role || ANY }
					onChange={ ( v ) => set( 'role', v === ANY ? '' : v ) }
					options={ [
						{ id: ANY, label: __( 'Any role', 'cliedesk' ) },
						...roleOptions.map( ( r ) => ( {
							id: r.key,
							label: r.name,
						} ) ),
					] }
				/>
				<Select
					label={ __( 'Team', 'cliedesk' ) }
					value={ filters.team ? String( filters.team ) : ANY }
					onChange={ ( v ) =>
						set( 'team', v === ANY ? null : Number( v ) )
					}
					options={ [
						{ id: ANY, label: __( 'Any team', 'cliedesk' ) },
						...teams.map( ( t ) => ( {
							id: String( t.id ),
							label: t.name,
						} ) ),
					] }
				/>
				<Select
					label={ __( 'Status', 'cliedesk' ) }
					value={ filters.status || ANY }
					onChange={ ( v ) =>
						set( 'status', ( v === ANY ? '' : v ) as StatusFilter )
					}
					options={ [
						{
							id: ANY,
							label: __(
								'Active, invited and waiting',
								'cliedesk'
							),
						},
						{ id: 'active', label: __( 'Active', 'cliedesk' ) },
						{ id: 'invited', label: __( 'Invited', 'cliedesk' ) },
						{
							id: 'pending',
							label: __( 'Pending approval', 'cliedesk' ),
						},
						{
							id: 'deactivated',
							label: __( 'Deactivated', 'cliedesk' ),
						},
						{ id: 'all', label: __( 'Everyone', 'cliedesk' ) },
					] }
				/>
				<Checkbox
					isSelected={ filters.inactive }
					onChange={ ( v ) => set( 'inactive', v ) }
				>
					{ __( 'No login for 30+ days', 'cliedesk' ) }
				</Checkbox>
				<Checkbox
					isSelected={ filters.hasOverrides }
					onChange={ ( v ) => set( 'hasOverrides', v ) }
				>
					{ __( 'Has individual permissions', 'cliedesk' ) }
				</Checkbox>
			</div>
			{ exportCsv.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( exportCsv.error ) }
				/>
			) }
			{ confirmOne.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( confirmOne.error ) }
				/>
			) }
			{ outcome && (
				<BulkResults
					outcome={ outcome }
					people={ people }
					onDismiss={ () => setOutcome( null ) }
				/>
			) }
			{ selectedPeople.length > 0 && (
				<BulkBar
					selected={ selectedPeople }
					roles={ roleOptions }
					teams={ teams }
					onDone={ ( o ) => {
						setOutcome( o );
						const failed = new Set(
							o.results
								.filter( ( r ) => ! r.ok )
								.map( ( r ) => r.userId )
						);
						setSelected( failed );
					} }
				/>
			) }
			{ q.isSuccess && people.length > 0 && (
				<p className="text-sm text-fg-muted" aria-live="polite">
					{ sprintf(
						/* translators: %d: number of people listed. */
						_n(
							'%d person',
							'%d people',
							people.length,
							'cliedesk'
						),
						people.length
					) }
				</p>
			) }
			{ body }
			{ isAdmin && <AutoJoinSettings /> }
			<InviteDialog
				isOpen={ inviting }
				onOpenChange={ setInviting }
				roles={ invitable }
				teams={ teams }
			/>
		</div>
	);
}
