/**
 * Settings → Workspace → Queues (INB-13): the shared inboxes. List in order (move up / down), add and edit (name,
 * icon, description, who can see it: everyone or the linked teams), archive and restore. A team's own queue follows
 * its team: its name, privacy and archive are changed on the team, and the owning team stays linked. Private queues
 * (RTE-01) are set with Pro (Routing); Free can only make a queue stored as private visible again.
 * Endpoints: GET/POST queues, PATCH queues/{id} (If-Match), POST queues/{id}/archive (cliedesk_manage_settings).
 * Auto-replies and channel accounts per queue arrive with the channel modules (M2).
 */
import {
	api,
	isApiError,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	EmptyState,
	ErrorState,
	IconButton,
	LoadingRegion,
	Modal,
	RadioGroup,
	TextField,
	useSlotHasFills,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Inbox, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { describeError } from '../../components/RouteError';
import { ActionError } from '../../inbox/components';
import { QueueRouting } from './QueueRouting';
import { teamsLookupQuery, type TeamRef } from '../../inbox/api';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	announceResult,
	apiFieldErrors,
} from '../../workspace/forms';

export interface Queue {
	id: number;
	name: string;
	icon: string | null;
	sort: number;
	description: string;
	access: 'all' | 'teams';
	private: boolean;
	ownerTeamId: number | null;
	teamIds: number[];
	archivedAt: string | null;
	version: number;
	/** RTE-07/15/36. */
	assignment?: 'manual' | 'round_robin';
	defaultAssigneeId?: number | null;
	offlineAgents?: boolean;
}

export const queueKeys = {
	all: [ 'queues' ] as const,
	list: ( archived: boolean ) => [ 'queues', 'list', archived ] as const,
};

export const queueListQuery = ( archived: boolean ) =>
	queryOptions( {
		queryKey: queueKeys.list( archived ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: Queue[] } >( 'queues', {
					query: archived ? { archived: true } : {},
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

type QueueInput = Partial<
	Pick<
		Queue,
		| 'name'
		| 'icon'
		| 'description'
		| 'access'
		| 'private'
		| 'teamIds'
		| 'sort'
	>
>;

/**
 * Only what changed (a team's own queue keeps its name and privacy).
 *
 * @param q    Queue being edited (null: new).
 * @param next Form values.
 */
export function queuePayload(
	q: Queue | null,
	next: Required< Omit< QueueInput, 'sort' > >
): QueueInput {
	if ( ! q ) {
		return {
			...next,
			icon: next.icon?.trim() || null,
			teamIds: next.access === 'teams' ? next.teamIds : [],
		};
	}
	const out: QueueInput = {};
	if ( ! q.ownerTeamId && next.name !== q.name ) {
		out.name = next.name;
	}
	if ( ( next.icon?.trim() || null ) !== q.icon ) {
		out.icon = next.icon?.trim() || null;
	}
	if ( next.description !== q.description ) {
		out.description = next.description;
	}
	if ( next.access !== q.access ) {
		out.access = next.access;
	}
	if ( ! q.ownerTeamId && next.private !== q.private ) {
		out.private = next.private;
	}
	const teams = [ ...next.teamIds ].sort( ( a, b ) => a - b );
	if ( teams.join() !== [ ...q.teamIds ].sort( ( a, b ) => a - b ).join() ) {
		out.teamIds = teams;
	}
	return out;
}

function QueueDialog( {
	queue,
	teams,
	onClose,
}: {
	queue: Queue | null;
	teams: TeamRef[];
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const owned = !! queue?.ownerTeamId;
	const [ name, setName ] = useState( queue?.name ?? '' );
	const [ icon, setIcon ] = useState( queue?.icon ?? '' );
	const [ description, setDescription ] = useState(
		queue?.description ?? ''
	);
	const [ access, setAccess ] = useState< 'all' | 'teams' >(
		queue?.access ?? 'all'
	);
	const [ isPrivate, setPrivate ] = useState( queue?.private ?? false );
	// With Pro the privacy is a routing rule; Free only turns off a privacy stored with Pro.
	const proRules = useSlotHasFills( 'queue.routing' );
	const unmark = !! queue?.private && ! owned && ! proRules;
	const [ teamIds, setTeamIds ] = useState< number[] >(
		queue?.teamIds ?? []
	);
	const [ error, setError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: ( body: QueueInput ) =>
			queue
				? api.patch< Queue >( `queues/${ queue.id }`, {
						body,
						ifMatch: versionTag( queue.version ),
					} )
				: api.post< Queue >( 'queues', { body } ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %s: queue name. */
					__( 'Queue “%s” saved.', 'cliedesk' ),
					r.data.name
				)
			);
			void qc.invalidateQueries( { queryKey: queueKeys.all } );
			void qc.invalidateQueries( { queryKey: [ 'inbox' ] } );
			onClose();
		},
	} );
	const fields = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! name.trim() ) {
			setError( __( 'Enter a name.', 'cliedesk' ) );
			return;
		}
		if ( access === 'teams' && ! teamIds.length ) {
			setError( __( 'Choose at least one team.', 'cliedesk' ) );
			return;
		}
		setError( null );
		const body = queuePayload( queue, {
			name: name.trim(),
			icon,
			description: description.trim(),
			access,
			private: isPrivate,
			teamIds,
		} );
		if ( queue && ! Object.keys( body ).length ) {
			onClose();
			return;
		}
		save.mutate( body );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				queue
					? sprintf(
							/* translators: %s: queue name. */
							__( 'Edit queue %s', 'cliedesk' ),
							queue.name
						)
					: __( 'Add queue', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-queue"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save queue', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-queue"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ isConflict( save.error ) ? (
					<ConflictBanner
						onReload={ () => {
							void qc.invalidateQueries( {
								queryKey: queueKeys.all,
							} );
							onClose();
						} }
					/>
				) : (
					<ActionError error={ save.error } />
				) }
				{ owned && (
					<p className="text-sm text-fg-muted">
						{ __(
							'This is a team’s own queue: change its name and privacy on the team. The team always stays linked.',
							'cliedesk'
						) }
					</p>
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					value={ name }
					onChange={ setName }
					maxLength={ 191 }
					isRequired
					isDisabled={ owned }
					errorMessage={
						( error && ! name.trim() ? error : null ) ??
						fields.name ??
						null
					}
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus={ ! owned }
				/>
				<TextField
					label={ __( 'Icon', 'cliedesk' ) }
					description={ __(
						'Optional. An emoji shown next to the name.',
						'cliedesk'
					) }
					value={ icon }
					onChange={ setIcon }
					maxLength={ 64 }
					errorMessage={ fields.icon ?? null }
				/>
				<TextField
					label={ __( 'Description', 'cliedesk' ) }
					value={ description }
					onChange={ setDescription }
					maxLength={ 1000 }
					multiline
					errorMessage={ fields.description ?? null }
				/>
				<RadioGroup
					label={ __( 'Who can see its conversations', 'cliedesk' ) }
					value={ access }
					onChange={ ( v ) => setAccess( v as 'all' | 'teams' ) }
					options={ [
						{
							id: 'all',
							label: __( 'Everyone', 'cliedesk' ),
						},
						{
							id: 'teams',
							label: __( 'Only the linked teams', 'cliedesk' ),
							description: __(
								'Agents outside these teams do not see these conversations at all.',
								'cliedesk'
							),
						},
					] }
					errorMessage={ fields.access ?? null }
				/>
				{ access === 'teams' && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Linked teams', 'cliedesk' ) }
						</legend>
						{ teams.length ? (
							<div className="flex flex-wrap gap-x-4 gap-y-1">
								{ teams.map( ( t ) => (
									<Checkbox
										key={ t.id }
										isSelected={ teamIds.includes( t.id ) }
										isDisabled={
											t.id === queue?.ownerTeamId
										}
										onChange={ ( on ) =>
											setTeamIds( ( l ) =>
												on
													? [ ...l, t.id ]
													: l.filter(
															( x ) => x !== t.id
														)
											)
										}
									>
										{ t.name }
									</Checkbox>
								) ) }
							</div>
						) : (
							<p className="text-sm text-fg-muted">
								{ __( 'There are no teams yet.', 'cliedesk' ) }
							</p>
						) }
						{ ( ( error && access === 'teams' && ! teamIds.length
							? error
							: null ) ??
							fields.teamIds ) && (
							<p role="alert" className="text-sm text-danger">
								{ ( error && ! teamIds.length
									? error
									: null ) ?? fields.teamIds }
							</p>
						) }
					</fieldset>
				) }
				{ unmark && (
					<Checkbox isSelected={ isPrivate } onChange={ setPrivate }>
						{ __(
							'Private: only the linked teams see it. Turn off to show it to everyone with access.',
							'cliedesk'
						) }
					</Checkbox>
				) }
			</form>
		</Modal>
	);
}

/**
 * Queues section.
 */
export default function QueuesSection() {
	const qc = useQueryClient();
	const [ showArchived, setShowArchived ] = useState( false );
	const [ editing, setEditing ] = useState< Queue | 'new' | null >( null );
	const [ routing, setRouting ] = useState< Queue | null >( null );
	const q = useQuery( queueListQuery( showArchived ) );
	const teamsQ = useQuery( teamsLookupQuery() );
	const teams = teamsQ.data ?? [];
	const queues = [ ...( q.data ?? [] ) ].sort(
		( a, b ) => a.sort - b.sort || a.id - b.id
	);
	const teamName = ( id: number ) =>
		teams.find( ( t ) => t.id === id )?.name ??
		sprintf(
			/* translators: %d: team id. */
			__( 'Team %d', 'cliedesk' ),
			id
		);

	const archive = useMutation( {
		mutationFn: ( {
			queue,
			restore,
		}: {
			queue: Queue;
			restore: boolean;
		} ) =>
			api.post< Queue >( `queues/${ queue.id }/archive`, {
				body: restore ? { restore: true } : {},
			} ),
		onSuccess: ( r, { restore } ) => {
			announceResult(
				restore
					? sprintf(
							/* translators: %s: queue name. */
							__( 'Queue “%s” restored.', 'cliedesk' ),
							r.data.name
						)
					: sprintf(
							/* translators: %s: queue name. */
							__( 'Queue “%s” archived.', 'cliedesk' ),
							r.data.name
						)
			);
			void qc.invalidateQueries( { queryKey: queueKeys.all } );
		},
	} );
	// Swap the order numbers of two neighbours (each saved with If-Match).
	const move = useMutation( {
		mutationFn: async ( { a, b }: { a: Queue; b: Queue } ) => {
			const [ sa, sb ] =
				a.sort === b.sort ? [ b.sort + 1, a.sort ] : [ b.sort, a.sort ];
			await api.patch( `queues/${ a.id }`, {
				body: { sort: sa },
				ifMatch: versionTag( a.version ),
			} );
			await api.patch( `queues/${ b.id }`, {
				body: { sort: sb },
				ifMatch: versionTag( b.version ),
			} );
		},
		onSuccess: ( _r, { a } ) =>
			announceResult(
				sprintf(
					/* translators: %s: queue name. */
					__( 'Queue “%s” moved.', 'cliedesk' ),
					a.name
				)
			),
		onSettled: () =>
			void qc.invalidateQueries( { queryKey: queueKeys.all } ),
	} );

	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Loading queues…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<ErrorState
				title={ __( 'Could not load the queues', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! queues.length ) {
		body = (
			<EmptyState
				icon={ <Inbox size={ 32 } strokeWidth={ 1.75 } /> }
				title={ __( 'No queues yet', 'cliedesk' ) }
				description={ __(
					'For example a “Billing” queue that takes conversations of type Billing and shares them round robin.',
					'cliedesk'
				) }
				actions={
					<Button onPress={ () => setEditing( 'new' ) }>
						{ __( 'Add your first queue', 'cliedesk' ) }
					</Button>
				}
			/>
		);
	} else {
		body = (
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ queues.map( ( item, i ) => {
					const archived = item.archivedAt !== null;
					const prev = queues[ i - 1 ];
					const next = queues[ i + 1 ];
					return (
						<li
							key={ item.id }
							className="flex flex-wrap items-center gap-4 p-4"
						>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="text-base font-semibold">
										{ item.icon && (
											<span
												aria-hidden="true"
												className="me-1"
											>
												{ item.icon }
											</span>
										) }
										<bdi>{ item.name }</bdi>
									</h2>
									{ item.private && (
										<span className="rounded-full border border-line px-2 text-xs font-medium text-fg-muted">
											{ __( 'Private', 'cliedesk' ) }
										</span>
									) }
									{ item.ownerTeamId && (
										<span className="rounded-full border border-line px-2 text-xs font-medium text-fg-muted">
											{ sprintf(
												/* translators: %s: team name. */
												__(
													'Team queue: %s',
													'cliedesk'
												),
												teamName( item.ownerTeamId )
											) }
										</span>
									) }
									{ archived && (
										<span className="rounded-full border border-line px-2 text-xs font-medium text-fg-muted">
											{ __( 'Archived', 'cliedesk' ) }
										</span>
									) }
								</div>
								{ item.description && (
									<p className="text-sm">
										{ item.description }
									</p>
								) }
								<p className="text-sm text-fg-muted">
									{ item.access === 'teams'
										? sprintf(
												/* translators: %s: comma-separated team names. */
												__(
													'Visible to: %s',
													'cliedesk'
												),
												item.teamIds
													.map( teamName )
													.join( ', ' )
											)
										: __(
												'Visible to everyone',
												'cliedesk'
											) }
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{ ! archived && (
									<>
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: queue name. */
												__( 'Move %s up', 'cliedesk' ),
												item.name
											) }
											isDisabled={
												! prev || move.isPending
											}
											onPress={ () =>
												prev &&
												move.mutate( {
													a: item,
													b: prev,
												} )
											}
											icon={
												<ArrowUp
													aria-hidden="true"
													size={ 14 }
												/>
											}
										/>
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: queue name. */
												__(
													'Move %s down',
													'cliedesk'
												),
												item.name
											) }
											isDisabled={
												! next || move.isPending
											}
											onPress={ () =>
												next &&
												move.mutate( {
													a: item,
													b: next,
												} )
											}
											icon={
												<ArrowDown
													aria-hidden="true"
													size={ 14 }
												/>
											}
										/>
									</>
								) }
								<Button
									size="sm"
									onPress={ () => setEditing( item ) }
									aria-label={ sprintf(
										/* translators: %s: queue name. */
										__( 'Edit %s', 'cliedesk' ),
										item.name
									) }
								>
									{ __( 'Edit', 'cliedesk' ) }
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onPress={ () => setRouting( item ) }
									aria-label={ sprintf(
										/* translators: %s: queue name. */
										__( 'Routing for %s', 'cliedesk' ),
										item.name
									) }
								>
									{ item.assignment === 'round_robin'
										? __(
												'Routing: round robin',
												'cliedesk'
											)
										: __( 'Routing', 'cliedesk' ) }
								</Button>
								{ ! item.ownerTeamId && (
									<Button
										size="sm"
										variant="ghost"
										isLoading={
											archive.isPending &&
											archive.variables?.queue.id ===
												item.id
										}
										onPress={ () =>
											archive.mutate( {
												queue: item,
												restore: archived,
											} )
										}
										aria-label={
											archived
												? sprintf(
														/* translators: %s: queue name. */
														__(
															'Restore %s',
															'cliedesk'
														),
														item.name
													)
												: sprintf(
														/* translators: %s: queue name. */
														__(
															'Archive %s',
															'cliedesk'
														),
														item.name
													)
										}
									>
										{ archived
											? __( 'Restore', 'cliedesk' )
											: __( 'Archive', 'cliedesk' ) }
									</Button>
								) }
							</div>
						</li>
					);
				} ) }
			</ul>
		);
	}

	const failure = archive.error ?? move.error;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Checkbox
					isSelected={ showArchived }
					onChange={ setShowArchived }
				>
					{ __( 'Show archived queues', 'cliedesk' ) }
				</Checkbox>
				<Button
					variant="primary"
					iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add queue', 'cliedesk' ) }
				</Button>
			</div>
			{ failure && (
				<Banner
					tone="danger"
					role="alert"
					title={ describeError( failure ) }
				/>
			) }
			{ body }
			{ routing && (
				<QueueRouting
					queue={ routing }
					onClose={ () => setRouting( null ) }
				/>
			) }
			{ editing && (
				<QueueDialog
					queue={ editing === 'new' ? null : editing }
					teams={ teams }
					onClose={ () => setEditing( null ) }
				/>
			) }
		</div>
	);
}
