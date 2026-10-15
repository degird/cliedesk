/**
 * Bulk actions of the directory (TEAM-03): change role, add to team, deactivate, confirm pending people. The server
 * checks each person separately, so the result lists every person who could not be changed and why.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	ConfirmDestructive,
	Modal,
	Select,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useRef, useEffect, useState } from 'react';
import { announceResult } from '../workspace/forms';
import {
	teamKeys,
	teamsKeys,
	type Agent,
	type BulkOp,
	type BulkResult,
	type Team,
} from './api';
import { serverMessage } from './components';
import { OffboardDialog } from './OffboardDialog';

export interface BulkOutcome {
	op: BulkOp | 'confirm';
	results: BulkResult[];
}

function opDone( op: BulkOutcome[ 'op' ], ok: number, total: number ): string {
	switch ( op ) {
		case 'set_role':
			return sprintf(
				/* translators: 1: people changed, 2: people selected. */
				__( 'Role changed for %1$d of %2$d people.', 'cliedesk' ),
				ok,
				total
			);
		case 'add_to_team':
			return sprintf(
				/* translators: 1: people added, 2: people selected. */
				__( '%1$d of %2$d people added to the team.', 'cliedesk' ),
				ok,
				total
			);
		case 'confirm':
			return sprintf(
				/* translators: 1: people confirmed, 2: people selected. */
				__( '%1$d of %2$d people confirmed.', 'cliedesk' ),
				ok,
				total
			);
		default:
			return sprintf(
				/* translators: 1: people deactivated, 2: people selected. */
				__( '%1$d of %2$d people deactivated.', 'cliedesk' ),
				ok,
				total
			);
	}
}

/**
 * Result of a bulk action: summary and the people it did not change, with the server's reason.
 *
 * @param props           Props.
 * @param props.outcome   Outcome.
 * @param props.people    Rows (for names).
 * @param props.onDismiss Dismiss.
 */
export function BulkResults( {
	outcome,
	people,
	onDismiss,
}: {
	outcome: BulkOutcome;
	people: Agent[];
	onDismiss: () => void;
} ) {
	const ref = useRef< HTMLDivElement >( null );
	const failed = outcome.results.filter( ( r ) => ! r.ok );
	const ok = outcome.results.length - failed.length;
	useEffect( () => {
		ref.current?.focus();
	}, [ outcome ] );
	const name = ( id: number ) =>
		people.find( ( p ) => p.userId === id )?.name ??
		sprintf(
			/* translators: %d: user id. */
			__( 'User #%d', 'cliedesk' ),
			id
		);
	return (
		<div ref={ ref } tabIndex={ -1 } className="outline-none">
			<Banner
				tone={ failed.length ? 'warning' : 'success' }
				title={ opDone( outcome.op, ok, outcome.results.length ) }
				onDismiss={ onDismiss }
			>
				{ failed.length > 0 && (
					<ul
						className="list-disc ps-5"
						aria-label={ __( 'Not changed', 'cliedesk' ) }
					>
						{ failed.map( ( r ) => (
							<li key={ r.userId }>
								{ sprintf(
									/* translators: 1: person name, 2: reason. */
									__( '%1$s: %2$s', 'cliedesk' ),
									name( r.userId ),
									r.error ?? __( 'Not changed.', 'cliedesk' )
								) }
							</li>
						) ) }
					</ul>
				) }
			</Banner>
		</div>
	);
}

export interface BulkBarProps {
	selected: Agent[];
	roles: Array< { key: string; name: string } >;
	teams: Team[];
	onDone: ( outcome: BulkOutcome ) => void;
}

/**
 * Bar shown while people are selected.
 *
 * @param props Props.
 */
export function BulkBar( { selected, roles, teams, onDone }: BulkBarProps ) {
	const qc = useQueryClient();
	const [ dialog, setDialog ] = useState< BulkOp | null >( null );
	// TEAM-04: one person gets the offboarding dialog (preview and reassignment).
	const [ offboard, setOffboard ] = useState( false );
	const [ role, setRole ] = useState< string | null >( null );
	const [ team, setTeam ] = useState< string | null >( null );
	const ids = selected.map( ( a ) => a.userId );
	const pending = selected.filter( ( a ) => a.status === 'pending' );

	const run = useMutation( {
		mutationFn: async ( body: {
			op: BulkOp;
			role?: string;
			teamId?: number;
		} ) =>
			(
				await api.post< BulkResult[] >( 'agents/bulk', {
					body: { userIds: ids, ...body },
				} )
			).data ?? [],
		onSuccess: ( results, body ) => {
			setDialog( null );
			const ok = results.filter( ( r ) => r.ok ).length;
			announceResult( opDone( body.op, ok, results.length ) );
			void qc.invalidateQueries( { queryKey: teamKeys.all } );
			void qc.invalidateQueries( { queryKey: teamsKeys.all } );
			onDone( { op: body.op, results } );
		},
	} );

	const confirm = useMutation( {
		mutationFn: async () =>
			(
				await api.post< Array< { userId: number; status: string } > >(
					'invites/confirm',
					{ body: { userIds: pending.map( ( a ) => a.userId ) } }
				)
			).data ?? [],
		onSuccess: ( list ) => {
			const results: BulkResult[] = list.map( ( r ) => ( {
				userId: r.userId,
				ok: r.status === 'confirmed',
				error:
					r.status === 'confirmed'
						? undefined
						: __(
								'This person is not waiting for approval.',
								'cliedesk'
							),
			} ) );
			announceResult(
				opDone(
					'confirm',
					results.filter( ( r ) => r.ok ).length,
					results.length
				)
			);
			void qc.invalidateQueries( { queryKey: teamKeys.all } );
			onDone( { op: 'confirm', results } );
		},
	} );

	const count = sprintf(
		/* translators: %d: number of selected people. */
		_n( '%d selected', '%d selected', ids.length, 'cliedesk' ),
		ids.length
	);
	const assignable = roles.filter( ( r ) => r.key !== 'administrator' );
	const close = ( open: boolean ) => {
		if ( ! open ) {
			setDialog( null );
			run.reset();
		}
	};

	return (
		<div
			role="region"
			aria-label={ __( 'Bulk actions', 'cliedesk' ) }
			className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-subtle px-3 py-2"
		>
			<p className="me-2 font-medium" aria-live="polite">
				{ count }
			</p>
			<Button size="sm" onPress={ () => setDialog( 'set_role' ) }>
				{ __( 'Change role', 'cliedesk' ) }
			</Button>
			{ teams.length > 0 && (
				<Button size="sm" onPress={ () => setDialog( 'add_to_team' ) }>
					{ __( 'Add to team', 'cliedesk' ) }
				</Button>
			) }
			{ pending.length > 0 && (
				<Button
					size="sm"
					isLoading={ confirm.isPending }
					onPress={ () => confirm.mutate() }
				>
					{ sprintf(
						/* translators: %d: number of people waiting for approval. */
						__( 'Approve %d waiting', 'cliedesk' ),
						pending.length
					) }
				</Button>
			) }
			<Button
				size="sm"
				variant="danger"
				onPress={ () =>
					ids.length === 1
						? setOffboard( true )
						: setDialog( 'deactivate' )
				}
			>
				{ __( 'Deactivate', 'cliedesk' ) }
			</Button>
			{ confirm.isError && (
				<p role="alert" className="text-sm text-danger">
					{ serverMessage( confirm.error ) }
				</p>
			) }

			<Modal
				isOpen={ dialog === 'set_role' }
				onOpenChange={ close }
				title={ sprintf(
					/* translators: %d: number of people. */
					_n(
						'Change the role of %d person',
						'Change the role of %d people',
						ids.length,
						'cliedesk'
					),
					ids.length
				) }
				footer={
					<>
						<Button onPress={ () => close( false ) }>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
						<Button
							variant="primary"
							isDisabled={ ! role }
							isLoading={ run.isPending }
							onPress={ () =>
								role && run.mutate( { op: 'set_role', role } )
							}
						>
							{ __( 'Change role', 'cliedesk' ) }
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<p className="text-fg-muted">
						{ __(
							'Their current Cliedesk roles are replaced with this one. Other WordPress roles stay.',
							'cliedesk'
						) }
					</p>
					<Select
						label={ __( 'New role', 'cliedesk' ) }
						value={ role }
						onChange={ setRole }
						options={ assignable.map( ( r ) => ( {
							id: r.key,
							label: r.name,
						} ) ) }
					/>
					{ run.isError && (
						<Banner
							tone="danger"
							role="alert"
							title={ serverMessage( run.error ) }
						/>
					) }
				</div>
			</Modal>

			<Modal
				isOpen={ dialog === 'add_to_team' }
				onOpenChange={ close }
				title={ sprintf(
					/* translators: %d: number of people. */
					_n(
						'Add %d person to a team',
						'Add %d people to a team',
						ids.length,
						'cliedesk'
					),
					ids.length
				) }
				footer={
					<>
						<Button onPress={ () => close( false ) }>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
						<Button
							variant="primary"
							isDisabled={ ! team }
							isLoading={ run.isPending }
							onPress={ () =>
								team &&
								run.mutate( {
									op: 'add_to_team',
									teamId: Number( team ),
								} )
							}
						>
							{ __( 'Add to team', 'cliedesk' ) }
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<Select
						label={ __( 'Team', 'cliedesk' ) }
						value={ team }
						onChange={ setTeam }
						options={ teams.map( ( t ) => ( {
							id: String( t.id ),
							label: t.name,
						} ) ) }
					/>
					{ run.isError && (
						<Banner
							tone="danger"
							role="alert"
							title={ serverMessage( run.error ) }
						/>
					) }
				</div>
			</Modal>

			{ offboard && selected[ 0 ] && (
				<OffboardDialog
					userId={ selected[ 0 ].userId }
					name={ selected[ 0 ].name }
					onClose={ () => setOffboard( false ) }
					onDone={ () => {
						setOffboard( false );
						void qc.invalidateQueries( { queryKey: teamKeys.all } );
						onDone( {
							op: 'deactivate',
							results: [ { userId: ids[ 0 ] ?? 0, ok: true } ],
						} );
					} }
				/>
			) }
			<ConfirmDestructive
				isOpen={ dialog === 'deactivate' }
				onOpenChange={ close }
				title={ sprintf(
					/* translators: %d: number of people. */
					_n(
						'Deactivate %d person?',
						'Deactivate %d people?',
						ids.length,
						'cliedesk'
					),
					ids.length
				) }
				description={ __(
					'They lose access to Cliedesk. Their WordPress accounts, messages and history stay. People with open conversations are skipped until those are reassigned.',
					'cliedesk'
				) }
				confirmLabel={ sprintf(
					/* translators: %d: number of people. */
					_n(
						'Deactivate %d person',
						'Deactivate %d people',
						ids.length,
						'cliedesk'
					),
					ids.length
				) }
				isLoading={ run.isPending }
				onConfirm={ () => run.mutate( { op: 'deactivate' } ) }
			>
				{ run.isError && (
					<p role="alert" className="text-danger">
						{ serverMessage( run.error ) }
					</p>
				) }
			</ConfirmDestructive>
		</div>
	);
}
