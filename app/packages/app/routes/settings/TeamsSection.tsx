/**
 * Settings → Team & roles → Teams (TEAM-24): teams with member counts and supervisor, "Add team" (name and
 * description, then the team page; RTE-24: optionally auto-assign by round robin), archive and restore. Creating and archiving need settings rights; Supervisors
 * open the teams they lead to manage members.
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
	Modal,
	Slot,
	TextField,
} from '@cliedesk/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Plus, UsersRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
	announceResult,
	apiFieldErrors,
	pickError,
	validateText,
} from '../../workspace/forms';
import {
	EMPTY_FILTERS,
	agentsQuery,
	teamListQuery,
	teamsKeys,
	type Team,
	type TeamDetail,
} from '../../team/api';
import { Badge, QueryError, serverMessage } from '../../team/components';
import { teamPath } from '../../team/paths';

function AddTeamForm( { onDone }: { onDone: () => void } ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ name, setName ] = useState( '' );
	const [ description, setDescription ] = useState( '' );
	const [ autoAssign, setAutoAssign ] = useState( false );
	const [ touched, setTouched ] = useState( false );
	const create = useMutation( {
		mutationFn: ( body: {
			name: string;
			description: string;
			autoAssign: boolean;
		} ) => api.post< TeamDetail >( 'teams', { body } ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: teamsKeys.all } );
			announceResult(
				sprintf(
					/* translators: %s: team name. */
					__( 'Team “%s” added.', 'cliedesk' ),
					r.data.name
				)
			);
			onDone();
			void navigate( { to: teamPath( r.data.id ) } );
		},
	} );
	const fields = apiFieldErrors( create.error );
	const nameError =
		( touched ? validateText( name, 191, true ) : null ) ??
		pickError( fields, 'name' );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setTouched( true );
		if ( validateText( name, 191, true ) ) {
			return;
		}
		create.mutate( {
			name: name.trim(),
			description: description.trim(),
			autoAssign,
		} );
	};
	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-4">
			<TextField
				id="cd-team-new-name"
				label={ __( 'Team name', 'cliedesk' ) }
				value={ name }
				onChange={ setName }
				onBlur={ () => setTouched( true ) }
				errorMessage={ nameError }
				isRequired
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus
			/>
			<TextField
				label={ __( 'Description', 'cliedesk' ) }
				multiline
				rows={ 2 }
				value={ description }
				onChange={ setDescription }
				errorMessage={ pickError( fields, 'description' ) }
			/>
			<Checkbox isSelected={ autoAssign } onChange={ setAutoAssign }>
				{ __(
					'Assign new conversations automatically (round robin among Online members)',
					'cliedesk'
				) }
			</Checkbox>
			{ create.isError && ! Object.keys( fields ).length && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( create.error ) }
				/>
			) }
			<div className="flex justify-end gap-2 border-t border-line pt-3">
				<Button onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
				<Button
					type="submit"
					variant="primary"
					isLoading={ create.isPending }
				>
					{ __( 'Add team', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

/**
 * Teams section.
 */
export default function TeamsSection() {
	const qc = useQueryClient();
	const [ archived, setArchived ] = useState( false );
	const [ adding, setAdding ] = useState( false );
	const full = can( 'cliedesk_manage_settings' );
	const q = useQuery( teamListQuery( archived ) );
	const people = useQuery(
		agentsQuery( { ...EMPTY_FILTERS, status: 'all' } )
	);
	const personName = ( id: number | null ) =>
		id ? ( people.data?.find( ( p ) => p.userId === id )?.name ?? '' ) : '';

	const archive = useMutation( {
		mutationFn: ( { team, restore }: { team: Team; restore: boolean } ) =>
			api.post< TeamDetail >(
				`teams/${ team.id }/${ restore ? 'restore' : 'archive' }`,
				{ body: {} }
			),
		onSuccess: ( r, { restore } ) => {
			announceResult(
				restore
					? sprintf(
							/* translators: %s: team name. */
							__( 'Team “%s” restored.', 'cliedesk' ),
							r.data.name
						)
					: sprintf(
							/* translators: %s: team name. */
							__( 'Team “%s” archived.', 'cliedesk' ),
							r.data.name
						)
			);
			void qc.invalidateQueries( { queryKey: teamsKeys.all } );
		},
	} );

	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Loading teams…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<QueryError
				title={ __( 'Could not load the teams', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.length ) {
		body = (
			<EmptyState
				icon={ <UsersRound size={ 32 } strokeWidth={ 1.75 } /> }
				title={ __( 'No teams yet', 'cliedesk' ) }
				description={ __(
					'Teams group people for routing, views, mentions and reports. There is no limit on teams or members.',
					'cliedesk'
				) }
				actions={
					// ADM-04: every empty state offers a way to start.
					full &&
					! archived && (
						<Button
							variant="primary"
							onPress={ () => setAdding( true ) }
						>
							{ __( 'Add your first team', 'cliedesk' ) }
						</Button>
					)
				}
			/>
		);
	} else {
		body = (
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ q.data.map( ( t ) => (
					<li
						key={ t.id }
						className="flex flex-wrap items-center gap-4 p-4"
					>
						<span
							aria-hidden="true"
							className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-lg"
						>
							{ t.icon || t.name.slice( 0, 1 ).toUpperCase() }
						</span>
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-base font-semibold">
									<Link
										to={ teamPath( t.id ) }
										className="text-accent-fg underline-offset-2 hover:underline"
									>
										<bdi>{ t.name }</bdi>
									</Link>
								</h2>
								{ t.isPrivate && (
									<Badge>
										{ __( 'Private', 'cliedesk' ) }
									</Badge>
								) }
								{ t.archived && (
									<Badge>
										{ __( 'Archived', 'cliedesk' ) }
									</Badge>
								) }
							</div>
							<p className="text-sm text-fg-muted">
								{ sprintf(
									/* translators: %d: number of members. */
									_n(
										'%d member',
										'%d members',
										t.memberCount ?? 0,
										'cliedesk'
									),
									t.memberCount ?? 0
								) }
								{ t.leadUserId && personName( t.leadUserId )
									? ` · ${ sprintf(
											/* translators: %s: supervisor name. */
											__( 'Supervisor: %s', 'cliedesk' ),
											personName( t.leadUserId )
										) }`
									: '' }
							</p>
							{ t.description && (
								<p className="text-sm text-fg-muted">
									<bdi>{ t.description }</bdi>
								</p>
							) }
						</div>
						{ full && (
							<Button
								size="sm"
								variant="ghost"
								isLoading={
									archive.isPending &&
									archive.variables?.team.id === t.id
								}
								onPress={ () =>
									archive.mutate( {
										team: t,
										restore: t.archived,
									} )
								}
								aria-label={
									t.archived
										? sprintf(
												/* translators: %s: team name. */
												__( 'Restore %s', 'cliedesk' ),
												t.name
											)
										: sprintf(
												/* translators: %s: team name. */
												__( 'Archive %s', 'cliedesk' ),
												t.name
											)
								}
							>
								{ t.archived
									? __( 'Restore', 'cliedesk' )
									: __( 'Archive', 'cliedesk' ) }
							</Button>
						) }
					</li>
				) ) }
			</ul>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Checkbox isSelected={ archived } onChange={ setArchived }>
					{ __( 'Show archived teams', 'cliedesk' ) }
				</Checkbox>
				{ full && (
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
						onPress={ () => setAdding( true ) }
					>
						{ __( 'Add team', 'cliedesk' ) }
					</Button>
				) }
			</div>
			{ archive.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( archive.error ) }
				/>
			) }
			{ body }
			{ /* Pro settings pages for teams (FPS-07); only their PRO badges show here without Pro. */ }
			<Slot name="team.statuses" />
			<Slot name="team.private" />
			<Modal
				isOpen={ adding }
				onOpenChange={ setAdding }
				title={ __( 'Add team', 'cliedesk' ) }
			>
				<AddTeamForm onDone={ () => setAdding( false ) } />
			</Modal>
		</div>
	);
}
