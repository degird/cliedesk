/**
 * Internal tasks (CNV-04) and trackers (CNV-05) on the conversation screen.
 *
 * - Tasks: "Create task" spins off an internal task linked child-of this conversation (POST …/tasks); the linked
 *   tasks are listed with their state.
 * - Trackers: a conversation can be added to an existing tracker (by number, POST trackers/{id}/items) or to a new
 *   one; a tracker lists its items (GET trackers/{id}/items). Tasks and trackers are told apart by `type.key`.
 * - Resolving a tracker with open items asks whether to also resolve them and / or send each customer a reply;
 *   both run as conversation bulk jobs on the open items (the cascade TaskActions documents).
 */
import {
	can,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	Checkbox,
	Modal,
	Select,
	Slot,
	TextField,
	toast,
} from '@cliedesk/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { JobsPanel, trackJob } from '../../crm/jobs';
import {
	conversationKeys,
	inboxKeys,
	linksQuery,
	type Conversation,
	type ConversationLink,
} from '../../inbox/api';
import {
	CONVERSATION_JOB_INVALIDATE,
	conversationItemLabel,
	startConversationBulk,
} from '../../inbox/bulk';
import { ActionError, Muted, Pill, useAgents } from '../../inbox/components';
import { textToHtml } from '../../inbox/html';
import {
	addToTrackerNumber,
	createTask,
	isTask,
	isTracker,
	trackerItemsQuery,
} from '../../inbox/tasks';
import { TrackerDialog } from '../../inbox/TrackerDialog';
import { FeatureDemand } from './FeatureDemand';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

const UNASSIGNED = 'none';

/**
 * Whether a conversation is a tracker (its type key).
 *
 * @param c Conversation.
 */
export function useIsTracker( c: Pick< Conversation, 'type' > ): boolean {
	return isTracker( c );
}

function LinkedList( { links }: { links: ConversationLink[] } ) {
	return (
		<ul className="flex flex-col gap-1 text-sm">
			{ links.map( ( l ) => (
				<li
					key={ `${ l.type }:${ l.conversationId }` }
					className="flex flex-wrap items-center gap-1"
				>
					<Link
						to="/c/$number"
						params={ { number: String( l.number ) } }
						className="text-accent-fg underline-offset-2 hover:underline"
					>
						{ `#${ l.number }` } <bdi>{ l.subject }</bdi>
					</Link>
					<Pill tone={ l.done ? 'success' : 'neutral' }>
						{ l.done
							? __( 'Done', 'cliedesk' )
							: __( 'Open', 'cliedesk' ) }
					</Pill>
				</li>
			) ) }
		</ul>
	);
}

function TaskDialog( {
	conversation: c,
	onClose,
}: {
	conversation: Conversation;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const { agents } = useAgents();
	const me = getBoot().user?.id ?? null;
	const [ subject, setSubject ] = useState( '' );
	const [ details, setDetails ] = useState( '' );
	const [ assignee, setAssignee ] = useState< string | null >(
		me ? String( me ) : UNASSIGNED
	);
	const [ due, setDue ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const run = useMutation( {
		mutationFn: () =>
			createTask( c.id, {
				subject: subject.trim(),
				...( details.trim() ? { html: textToHtml( details ) } : {} ),
				assigneeId:
					! assignee || assignee === UNASSIGNED
						? null
						: Number( assignee ),
				...( due ? { dueAt: due } : {} ),
			} ),
		onSuccess: ( task ) => {
			void qc.invalidateQueries( {
				queryKey: conversationKeys.links( c.id ),
			} );
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			announceResult( __( 'Task created.', 'cliedesk' ) );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: task number. */
					__( 'Task #%d created.', 'cliedesk' ),
					task?.number ?? 0
				),
				action: task?.number
					? {
							label: __( 'Open task', 'cliedesk' ),
							onAction: () =>
								void navigate( {
									to: '/c/$number',
									params: { number: String( task.number ) },
								} ),
						}
					: undefined,
			} );
			onClose();
		},
	} );
	const server = apiFieldErrors( run.error );
	const options = [
		{ id: UNASSIGNED, label: __( 'Unassigned', 'cliedesk' ) },
		...( me
			? [ { id: String( me ), label: __( 'Me', 'cliedesk' ) } ]
			: [] ),
		...( can( 'cliedesk_assign_others' )
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
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! subject.trim() ) {
			setError( __( 'Enter a subject.', 'cliedesk' ) );
			return;
		}
		setError( null );
		run.mutate();
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Create a task from this conversation', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-task-form"
						variant="primary"
						isLoading={ run.isPending }
					>
						{ __( 'Create task', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-task-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ __(
						'Tasks are internal: the customer never sees them. The task links back to this conversation.',
						'cliedesk'
					) }
				</p>
				<ActionError
					error={ run.error }
					onDismiss={ () => run.reset() }
				/>
				<TextField
					label={ __( 'Subject', 'cliedesk' ) }
					value={ subject }
					onChange={ setSubject }
					isRequired
					maxLength={ 255 }
					errorMessage={ error ?? server.subject ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<TextField
					label={ __( 'Details', 'cliedesk' ) }
					multiline
					rows={ 4 }
					value={ details }
					onChange={ setDetails }
				/>
				<Select
					label={ __( 'Assignee', 'cliedesk' ) }
					value={ assignee }
					onChange={ setAssignee }
					options={ options }
					errorMessage={ server.assigneeId ?? null }
				/>
				<TextField
					label={ __( 'Due date', 'cliedesk' ) }
					description={ __( 'Optional.', 'cliedesk' ) }
					type="date"
					value={ due }
					onChange={ setDue }
					errorMessage={ server.dueAt ?? null }
				/>
			</form>
		</Modal>
	);
}

/**
 * Tasks of a conversation and "Create task".
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function TasksSection( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const links = useQuery( linksQuery( c.id ) );
	const [ creating, setCreating ] = useState( false );
	const children = ( links.data?.links ?? [] ).filter(
		( l ) => l.type === 'parent_of'
	);
	const canCreate = can( 'cliedesk_add_notes' ) && ! isTask( c );
	return (
		<div className="flex flex-col gap-2">
			{ children.length ? (
				<LinkedList links={ children } />
			) : (
				<Muted>{ __( 'No tasks yet.', 'cliedesk' ) }</Muted>
			) }
			{ canCreate && (
				<Button
					size="sm"
					className="self-start"
					onPress={ () => setCreating( true ) }
				>
					{ __( 'Create task from this conversation', 'cliedesk' ) }
				</Button>
			) }
			{ creating && (
				<TaskDialog
					conversation={ c }
					onClose={ () => setCreating( false ) }
				/>
			) }
		</div>
	);
}

function TrackerItemsList( { id }: { id: number } ) {
	const q = useQuery( trackerItemsQuery( id ) );
	if ( ! q.data ) {
		return (
			<Muted>
				{ q.isError
					? __( 'Could not load the tracker items.', 'cliedesk' )
					: __( 'Loading…', 'cliedesk' ) }
			</Muted>
		);
	}
	const { items, openIds, doneIds } = q.data;
	return (
		<div className="flex flex-col gap-2">
			<Muted>
				{ sprintf(
					/* translators: 1: open items, 2: done items. */
					__( '%1$d open, %2$d done', 'cliedesk' ),
					openIds.length,
					doneIds.length
				) }
			</Muted>
			{ items.length ? (
				<LinkedList links={ items } />
			) : (
				<Muted>
					{ __(
						'No conversations are linked to this tracker yet.',
						'cliedesk'
					) }
				</Muted>
			) }
			<JobsPanel scope={ `tracker-${ id }` } />
		</div>
	);
}

function AddToTracker( { conversation: c }: { conversation: Conversation } ) {
	const qc = useQueryClient();
	const [ number, setNumber ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const [ creating, setCreating ] = useState( false );
	const link = useMutation( {
		mutationFn: ( n: number ) => addToTrackerNumber( n, [ c.id ] ),
		onSuccess: ( trackerId ) => {
			setNumber( '' );
			void qc.invalidateQueries( {
				queryKey: conversationKeys.links( c.id ),
			} );
			void qc.invalidateQueries( {
				queryKey: [ 'conversation', trackerId ],
			} );
			announceResult( __( 'Added to the tracker.', 'cliedesk' ) );
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const n = Number( number.replace( /^#/, '' ).trim() );
		if ( ! Number.isInteger( n ) || n <= 0 ) {
			setError(
				__( 'Enter a tracker number, such as 1042.', 'cliedesk' )
			);
			return;
		}
		setError( null );
		link.mutate( n );
	};
	// POST trackers/{id}/items needs cliedesk_add_notes (like creating a tracker).
	if ( ! can( 'cliedesk_add_notes' ) ) {
		return null;
	}
	return (
		<div className="flex flex-col gap-2">
			<form
				noValidate
				onSubmit={ submit }
				className="flex items-end gap-2"
			>
				<TextField
					className="min-w-0 flex-1"
					label={ __( 'Add to tracker number', 'cliedesk' ) }
					inputMode="numeric"
					value={ number }
					onChange={ setNumber }
					errorMessage={ error }
				/>
				<Button type="submit" isLoading={ link.isPending }>
					{ __( 'Add', 'cliedesk' ) }
				</Button>
			</form>
			<ActionError
				error={ link.error }
				onDismiss={ () => link.reset() }
			/>
			<Button
				size="sm"
				className="self-start"
				onPress={ () => setCreating( true ) }
			>
				{ __( 'New tracker…', 'cliedesk' ) }
			</Button>
			{ creating && (
				<TrackerDialog
					conversationIds={ [ c.id ] }
					productId={ c.productId }
					onClose={ () => setCreating( false ) }
				/>
			) }
		</div>
	);
}

/**
 * Trackers: the items of a tracker, or the trackers this conversation is part of and how to add it to one.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function TrackerSection( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const tracker = useIsTracker( c );
	const links = useQuery( { ...linksQuery( c.id ), enabled: ! tracker } );
	if ( tracker ) {
		return (
			<div className="flex flex-col gap-3">
				<TrackerItemsList id={ c.id } />
				<FeatureDemand id={ c.id } />
				{ /* CNV-05: Jira, Linear and GitHub issue links are Pro (badge without Pro). */ }
				<Slot name="tracker.issue_links" />
			</div>
		);
	}
	const partOf = ( links.data?.links ?? [] ).filter(
		( l ) => l.type === 'part_of'
	);
	return (
		<div className="flex flex-col gap-2">
			{ partOf.length ? (
				<LinkedList links={ partOf } />
			) : (
				<Muted>{ __( 'Not part of a tracker.', 'cliedesk' ) }</Muted>
			) }
			<AddToTracker conversation={ c } />
		</div>
	);
}

/**
 * Resolving a tracker with open items: also resolve them and / or reply to each customer.
 *
 * @param props              Props.
 * @param props.conversation Tracker.
 * @param props.status       Status key it is resolved with.
 * @param props.statusLabel  Status label.
 * @param props.openIds      Open items.
 * @param props.onResolve    Resolve the tracker itself (resolves when done).
 * @param props.onClose      Close.
 * @param props.isLoading    The tracker is being resolved.
 */
export function TrackerResolveDialog( {
	conversation: c,
	status,
	statusLabel,
	openIds,
	onResolve,
	onClose,
	isLoading,
}: {
	conversation: Conversation;
	status: string;
	statusLabel: string;
	openIds: number[];
	onResolve: ( after: () => void ) => void;
	onClose: () => void;
	isLoading: boolean;
} ) {
	const qc = useQueryClient();
	const [ cascade, setCascade ] = useState( true );
	const [ notify, setNotify ] = useState( false );
	const [ text, setText ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const [ jobError, setJobError ] = useState< unknown >( null );
	const canReply = can( 'cliedesk_reply_conversations' );
	const selection = { kind: 'ids' as const, ids: openIds };
	const start = async ( body: Record< string, unknown >, label: string ) => {
		const job = await startConversationBulk( selection, body );
		if ( job?.uid ) {
			trackJob( qc, job, label, {
				scope: `tracker-${ c.id }`,
				warning: job.warning,
				invalidate: [
					...CONVERSATION_JOB_INVALIDATE,
					[ 'conversation', c.id, 'tracker-items' ],
				],
				itemLabel: conversationItemLabel,
			} );
		}
	};
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( notify && ! text.trim() ) {
			setError( __( 'Write the reply first.', 'cliedesk' ) );
			return;
		}
		setError( null );
		setJobError( null );
		onResolve( () => {
			const jobs: Array< Promise< void > > = [];
			// The reply first: it goes out on each conversation's own channel.
			if ( notify ) {
				jobs.push(
					start(
						{ op: 'reply', html: textToHtml( text ) },
						__( 'Reply to the tracker’s conversations', 'cliedesk' )
					)
				);
			}
			if ( cascade ) {
				jobs.push(
					start(
						{ op: 'status', status },
						sprintf(
							/* translators: %s: status. */
							__(
								'Set the tracker’s conversations to %s',
								'cliedesk'
							),
							statusLabel
						)
					)
				);
			}
			Promise.all( jobs )
				.then( () => {
					if ( jobs.length ) {
						announceResult(
							__(
								'The linked conversations are being updated.',
								'cliedesk'
							)
						);
					}
					onClose();
				} )
				.catch( ( err: unknown ) => setJobError( err ) );
		} );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Resolve tracker', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-tracker-resolve"
						variant="primary"
						isLoading={ isLoading }
					>
						{ sprintf(
							/* translators: %s: status. */
							__( 'Set tracker to %s', 'cliedesk' ),
							statusLabel
						) }
					</Button>
				</>
			}
		>
			<form
				id="cd-tracker-resolve"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p>
					{ sprintf(
						/* translators: %d: number of open linked conversations. */
						_n(
							'%d linked conversation is still open.',
							'%d linked conversations are still open.',
							openIds.length,
							'cliedesk'
						),
						openIds.length
					) }
				</p>
				<ActionError
					error={ jobError }
					title={ __(
						'The tracker changed, but the linked conversations were not updated',
						'cliedesk'
					) }
					onDismiss={ () => setJobError( null ) }
				/>
				<Checkbox isSelected={ cascade } onChange={ setCascade }>
					{ sprintf(
						/* translators: %s: status. */
						__( 'Also set them to %s', 'cliedesk' ),
						statusLabel
					) }
				</Checkbox>
				{ canReply && (
					<Checkbox isSelected={ notify } onChange={ setNotify }>
						{ __( 'Send each customer a reply', 'cliedesk' ) }
					</Checkbox>
				) }
				{ canReply && notify && (
					<TextField
						label={ __( 'Reply', 'cliedesk' ) }
						description={ __(
							'Each customer gets their own copy, on the channel of their conversation.',
							'cliedesk'
						) }
						multiline
						rows={ 5 }
						isRequired
						value={ text }
						onChange={ setText }
						errorMessage={ error }
					/>
				) }
			</form>
		</Modal>
	);
}
