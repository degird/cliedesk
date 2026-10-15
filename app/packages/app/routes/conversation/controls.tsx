/**
 * Status, snooze and assignee changes of a conversation (CNV-11…15), shared by the header (Assign, Snooze, Resolve)
 * and the Properties card. Every change sends If-Match with the version on screen; a stale version shows the
 * conflict banner, guard errors (422) the server's message, and a resolve blocked by required fields lists them.
 */
import { can, getBoot, useQuery, useQueryClient } from '@cliedesk/data';
import { Banner, Button, Modal } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { lazy, Suspense, useState, type FormEvent } from 'react';
import {
	conversationKeys,
	fieldsQuery,
	statusesQuery,
	type Conversation,
} from '../../inbox/api';
import { ActionError, useAgents } from '../../inbox/components';
import { focusNextAfterResolve } from '../../inbox/focusNext';
import {
	SnoozeFields,
	defaultSnoozeChoice,
	resolveSnooze,
	type SnoozeMode,
} from '../../inbox/snooze';
import { isTracker, trackerItemsQuery } from '../../inbox/tasks';
import { isConflict } from '../../workspace/api';
import { ConflictBanner, announceResult } from '../../workspace/forms';
import { useConversationAction } from './shared';

const TrackerResolveDialog = lazy( () =>
	import( /* webpackChunkName: "conversation-tasks" */ './Tasks' ).then(
		( m ) => ( { default: m.TrackerResolveDialog } )
	)
);

export const UNASSIGNED = 'none';

function SnoozeDialog( {
	onClose,
	onSnooze,
	isLoading,
}: {
	onClose: () => void;
	onSnooze: ( until: string, mode: SnoozeMode ) => void;
	isLoading: boolean;
} ) {
	const [ choice, setChoice ] = useState( defaultSnoozeChoice );
	const [ error, setError ] = useState< string | null >( null );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const r = resolveSnooze( choice );
		if ( r.until === null ) {
			setError( r.error );
			return;
		}
		onSnooze( r.until, r.mode );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Snooze conversation', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-snooze"
						variant="primary"
						isLoading={ isLoading }
					>
						{ __( 'Snooze', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form id="cd-snooze" noValidate onSubmit={ submit }>
				<SnoozeFields
					value={ choice }
					onChange={ ( v ) => {
						setChoice( v );
						setError( null );
					} }
					error={ error }
				/>
			</form>
		</Modal>
	);
}

/**
 * Conversation controls.
 *
 * @param c Conversation.
 */
export function useConversationControls( c: Conversation ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const action = useConversationAction( c );
	const statuses = useQuery( statusesQuery() );
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const { agents, nameFor } = useAgents();
	const me = getBoot().user?.id ?? null;
	const [ snoozing, setSnoozing ] = useState( false );
	const [ resolving, setResolving ] = useState< {
		id: number;
		key: string;
		label: string;
	} | null >( null );
	const [ missing, setMissing ] = useState< string[] >( [] );
	const tracker = isTracker( c );
	const trackerItems = useQuery( {
		...trackerItemsQuery( c.id ),
		enabled: tracker,
	} );
	const canStatus = can( 'cliedesk_change_status' );
	const canOthers = can( 'cliedesk_assign_others' );
	const canSelf = can( 'cliedesk_assign_self' );

	const run = (
		path: string,
		body: Record< string, unknown >,
		message: string,
		after?: () => void
	) =>
		action.mutate(
			{ path, body, versioned: true },
			{
				onSuccess: ( r ) => {
					announceResult( message );
					setMissing( r.data?.missingRequired ?? [] );
					after?.();
				},
			}
		);

	const all = statuses.data ?? [];
	const statusOptions = all
		.filter(
			( s ) =>
				s.id === c.status?.id ||
				( s.active && s.category !== 'closed' && s.category !== 'new' )
		)
		.map( ( s ) => ( { id: String( s.id ), label: s.label } ) );
	if (
		c.status?.id &&
		! statusOptions.some( ( o ) => o.id === String( c.status?.id ) )
	) {
		statusOptions.unshift( {
			id: String( c.status.id ),
			label: c.status.label,
		} );
	}

	/**
	 * Change the status by id (snoozed asks for a time; a tracker with open items asks about them first).
	 *
	 * @param id Status id.
	 */
	const setStatus = ( id: string ) => {
		if ( id === String( c.status?.id ) ) {
			return;
		}
		const s = all.find( ( x ) => String( x.id ) === id );
		if ( s?.key === 'snoozed' ) {
			setSnoozing( true );
			return;
		}
		// CNV-05: resolving a tracker with open items asks about them first.
		if (
			s &&
			tracker &&
			s.category === 'resolved' &&
			can( 'cliedesk_bulk_actions' ) &&
			( trackerItems.data?.openIds.length ?? 0 ) > 0
		) {
			setResolving( { id: s.id, key: s.key, label: s.label } );
			return;
		}
		run(
			'status',
			{ statusId: Number( id ) },
			sprintf(
				/* translators: %s: status. */
				__( 'Status changed to %s.', 'cliedesk' ),
				s?.label ?? ''
			),
			// RTE-22: in focus mode the next conversation opens after resolve.
			s?.category === 'resolved'
				? () =>
						void focusNextAfterResolve( ( n ) =>
							navigate( {
								to: '/c/$number',
								params: { number: String( n ) },
							} )
						)
				: undefined
		);
	};

	// The one-click status of the header: Resolve, or Reopen when it is resolved already.
	const resolved = c.status?.category === 'resolved';
	const pick = ( category: string, key: string ) =>
		all.find( ( s ) => s.active && s.key === key ) ??
		all.find( ( s ) => s.active && s.category === category );
	const primary = resolved
		? pick( 'open', 'open' )
		: pick( 'resolved', 'resolved' );

	const assigneeOptions = [
		{ id: UNASSIGNED, label: __( 'Unassigned', 'cliedesk' ) },
		...( me
			? [ { id: String( me ), label: __( 'Me', 'cliedesk' ) } ]
			: [] ),
		...( canOthers
			? agents
					.filter(
						( a ) => a.userId !== me && a.status !== 'deactivated'
					)
					.map( ( a ) => ( {
						id: String( a.userId ),
						label: a.name,
					} ) )
			: [] ),
	];
	if (
		c.assigneeId !== null &&
		! assigneeOptions.some( ( o ) => o.id === String( c.assigneeId ) )
	) {
		assigneeOptions.push( {
			id: String( c.assigneeId ),
			label:
				nameFor( c.assigneeId ) ??
				sprintf(
					/* translators: %d: user id. */
					__( 'Agent #%d', 'cliedesk' ),
					c.assigneeId
				),
		} );
	}

	/**
	 * Assign (null unassigns).
	 *
	 * @param id Assignee option id.
	 */
	const assign = ( id: string ) => {
		const next = id === UNASSIGNED ? null : Number( id );
		if ( next === c.assigneeId ) {
			return;
		}
		run(
			'assign',
			{ assigneeId: next },
			next === null
				? __( 'Conversation unassigned.', 'cliedesk' )
				: __( 'Assignee changed.', 'cliedesk' )
		);
	};

	const fieldLabels = Object.fromEntries(
		( fields.data ?? [] ).map( ( f ) => [ f.key, f.label ] )
	);

	// Errors, the conflict banner and fields a resolve still needs, shown next to the controls used.
	const feedback = (
		<>
			{ isConflict( action.error ) ? (
				<ConflictBanner
					message={ __(
						'Someone else changed this conversation. Reload to see their changes.',
						'cliedesk'
					) }
					onReload={ () => {
						action.reset();
						void qc.invalidateQueries( {
							queryKey: conversationKeys.all( c.id ),
						} );
					} }
				/>
			) : (
				<ActionError
					error={ action.error }
					labels={ fieldLabels }
					onDismiss={ () => action.reset() }
				/>
			) }
			{ missing.length > 0 && (
				<Banner
					tone="warning"
					title={ __(
						'This type needs more fields before the conversation can be resolved',
						'cliedesk'
					) }
					onDismiss={ () => setMissing( [] ) }
				>
					<ul className="list-disc ps-5">
						{ missing.map( ( k ) => (
							<li key={ k }>{ fieldLabels[ k ] ?? k }</li>
						) ) }
					</ul>
				</Banner>
			) }
		</>
	);

	const dialogs = (
		<>
			{ snoozing && (
				<SnoozeDialog
					isLoading={ action.isPending }
					onClose={ () => setSnoozing( false ) }
					onSnooze={ ( until, mode ) =>
						run(
							'status',
							{
								status: 'snoozed',
								snoozeUntil: until,
								snoozeMode: mode,
							},
							__( 'Conversation snoozed.', 'cliedesk' ),
							() => setSnoozing( false )
						)
					}
				/>
			) }
			{ resolving && (
				<Suspense fallback={ null }>
					<TrackerResolveDialog
						conversation={ c }
						status={ resolving.key }
						statusLabel={ resolving.label }
						openIds={ trackerItems.data?.openIds ?? [] }
						isLoading={ action.isPending }
						onClose={ () => setResolving( null ) }
						onResolve={ ( after ) =>
							run(
								'status',
								{ statusId: resolving.id },
								sprintf(
									/* translators: %s: status. */
									__( 'Status changed to %s.', 'cliedesk' ),
									resolving.label
								),
								after
							)
						}
					/>
				</Suspense>
			) }
		</>
	);

	return {
		action,
		run,
		me,
		canStatus,
		canAssign: canSelf || canOthers,
		statusOptions,
		setStatus,
		primary,
		resolved,
		snooze: () => setSnoozing( true ),
		assigneeOptions,
		assign,
		fieldLabels,
		feedback,
		dialogs,
	};
}
