/**
 * Conversation bulk bar (INB-72): actions on the selected conversations, or on every conversation of the current
 * view (and search). Each action starts a bulk job (POST conversations/bulk) that the jobs panel follows, with
 * Undo when the job can be undone and a report of the items it skipped.
 *
 * Actions follow the person's permissions: assign, status (with snooze time and mode), priority, add / remove
 * tags, mark read / unread, Spam (Not spam only in the Spam view, both with cliedesk_manage_spam), Move to Trash
 * (confirmed when the workspace asks for it: 409 cliedesk_confirm_required), a reply or a note to each, and a new
 * or an existing tracker for the selected conversations, and the manual rules the person may run (AUT-20).
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
	ConfirmDestructive,
	Modal,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Suspense, lazy, useState, type FormEvent } from 'react';
import { trackJob } from '../../crm/jobs';
import { BulkLinkDialog } from '../../inbox/BulkLinkDialog';
import { BulkMergeDialog, MAX_BULK_MERGE } from '../../inbox/BulkMergeDialog';
import {
	ExportTranscriptsDialog,
	MAX_EXPORT,
} from '../../inbox/TranscriptDialog';
import {
	PRIORITIES,
	statusesQuery,
	tagsQuery,
	type InboxItem,
	type Priority,
} from '../../inbox/api';
import {
	CONVERSATION_JOB_INVALIDATE,
	conversationItemLabel,
	conversationOpName,
	conversationSelectionText,
	isConfirmRequired,
	startConversationBulk,
	type ConversationBulkOp,
	type ConversationSelection,
} from '../../inbox/bulk';
import { ActionError, Muted, useAgents } from '../../inbox/components';
import { textToHtml } from '../../inbox/html';
import { priorityLabel } from '../../inbox/labels';
import {
	SnoozeFields,
	defaultSnoozeChoice,
	resolveSnooze,
} from '../../inbox/snooze';
import { SPAM_VIEW, canManageSpam } from '../../inbox/spam';
import { SavedReplyPicker } from '../../inbox/SavedReplyPicker';
import { AddToTrackerDialog, TrackerDialog } from '../../inbox/TrackerDialog';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

type DialogOp = Extract<
	ConversationBulkOp,
	| 'assign'
	| 'status'
	| 'priority'
	| 'tag_add'
	| 'tag_remove'
	| 'reply'
	| 'note'
	| 'macro'
>;

const UNASSIGNED = 'none';

/**
 * Start a bulk job and follow it in the inbox jobs panel.
 *
 * @param selection Selection.
 * @param onDone    After the job started.
 */
function useConversationBulk(
	selection: ConversationSelection,
	onDone: () => void
) {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			startConversationBulk( selection, body ),
		onSuccess: ( job, body ) => {
			if ( job?.uid ) {
				trackJob(
					qc,
					job,
					`${ conversationOpName(
						String( body.op )
					) } · ${ conversationSelectionText( selection ) }`,
					{
						scope: 'inbox',
						warning: job.warning,
						invalidate: CONVERSATION_JOB_INVALIDATE,
						itemLabel: conversationItemLabel,
					}
				);
			}
			announceResult( __( 'Bulk action started.', 'cliedesk' ) );
			onDone();
		},
	} );
}

function OpDialog( {
	op,
	selection,
	onClose,
	onStarted,
}: {
	op: DialogOp;
	selection: ConversationSelection;
	onClose: () => void;
	onStarted: () => void;
} ) {
	const bulk = useConversationBulk( selection, () => {
		onClose();
		onStarted();
	} );
	const tags = useQuery( {
		...tagsQuery(),
		enabled: op === 'tag_add' || op === 'tag_remove',
	} );
	const statuses = useQuery( {
		...statusesQuery(),
		enabled: op === 'status',
	} );
	const { agents } = useAgents();
	const me = getBoot().user?.id ?? null;
	const [ assignee, setAssignee ] = useState< string | null >(
		me ? String( me ) : UNASSIGNED
	);
	const [ status, setStatus ] = useState< string | null >( null );
	const [ snooze, setSnooze ] = useState( defaultSnoozeChoice );
	const [ priority, setPriority ] = useState< string | null >( null );
	const [ tagIds, setTagIds ] = useState< number[] >( [] );
	const [ text, setText ] = useState( '' );
	const [ replyIds, setReplyIds ] = useState< number[] >( [] );
	const [ error, setError ] = useState< string | null >( null );
	const server = apiFieldErrors( bulk.error );

	const statusOptions = (
		Array.isArray( statuses.data ) ? statuses.data : []
	)
		.filter(
			( s ) => s.active && s.category !== 'closed' && s.category !== 'new'
		)
		.map( ( s ) => ( { id: s.key, label: s.label } ) );
	const assigneeOptions = [
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
		setError( null );
		switch ( op ) {
			case 'assign':
				bulk.mutate( {
					op,
					assigneeId:
						! assignee || assignee === UNASSIGNED
							? null
							: Number( assignee ),
				} );
				return;
			case 'status': {
				if ( ! status ) {
					setError( __( 'Choose a status.', 'cliedesk' ) );
					return;
				}
				if ( status === 'snoozed' ) {
					const r = resolveSnooze( snooze );
					if ( r.until === null ) {
						setError( r.error );
						return;
					}
					bulk.mutate( {
						op,
						status,
						snoozeUntil: r.until,
						snoozeMode: r.mode,
					} );
					return;
				}
				bulk.mutate( { op, status } );
				return;
			}
			case 'priority':
				if ( ! priority ) {
					setError( __( 'Choose a priority.', 'cliedesk' ) );
					return;
				}
				bulk.mutate( { op, priority } );
				return;
			case 'tag_add':
			case 'tag_remove':
				if ( ! tagIds.length ) {
					setError( __( 'Choose at least one tag.', 'cliedesk' ) );
					return;
				}
				bulk.mutate( { op, tagIds } );
				return;
			case 'reply':
			case 'note':
				if ( ! text.trim() ) {
					setError(
						op === 'reply'
							? __( 'Write the reply first.', 'cliedesk' )
							: __( 'Write the note first.', 'cliedesk' )
					);
					return;
				}
				bulk.mutate( { op, html: textToHtml( text ) } );
				return;
			case 'macro':
				if ( ! replyIds.length ) {
					setError(
						__( 'Choose at least one saved reply.', 'cliedesk' )
					);
					return;
				}
				bulk.mutate( { op, savedReplyIds: replyIds } );
		}
	};

	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ conversationOpName( op ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-conversation-bulk"
						variant="primary"
						isLoading={ bulk.isPending }
					>
						{ op === 'reply' || op === 'note' || op === 'macro'
							? __( 'Send to each', 'cliedesk' )
							: __( 'Apply', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-conversation-bulk"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p>{ conversationSelectionText( selection ) }</p>
				<ActionError
					error={ bulk.error }
					onDismiss={ () => bulk.reset() }
				/>
				{ op === 'assign' && (
					<Select
						label={ __( 'Assign to', 'cliedesk' ) }
						value={ assignee }
						onChange={ setAssignee }
						options={ assigneeOptions }
						errorMessage={ server.assigneeId ?? null }
					/>
				) }
				{ op === 'status' && (
					<>
						<Select
							label={ __( 'Status', 'cliedesk' ) }
							value={ status }
							onChange={ ( s ) => {
								setStatus( s );
								setError( null );
							} }
							options={ statusOptions }
							errorMessage={
								status === 'snoozed'
									? null
									: ( error ?? server.status ?? null )
							}
						/>
						{ status === 'snoozed' && (
							<SnoozeFields
								idPrefix="cd-bulk-snooze"
								value={ snooze }
								onChange={ ( v ) => {
									setSnooze( v );
									setError( null );
								} }
								error={ error ?? server.snoozeUntil ?? null }
							/>
						) }
					</>
				) }
				{ op === 'priority' && (
					<Select
						label={ __( 'Priority', 'cliedesk' ) }
						value={ priority }
						onChange={ setPriority }
						options={ PRIORITIES.map( ( p ) => ( {
							id: p,
							label: priorityLabel( p as Priority ),
						} ) ) }
						errorMessage={ error ?? server.priority ?? null }
					/>
				) }
				{ ( op === 'tag_add' || op === 'tag_remove' ) && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Tags', 'cliedesk' ) }
						</legend>
						{ ! tags.data?.length && (
							<Muted>{ __( 'No tags yet.', 'cliedesk' ) }</Muted>
						) }
						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{ ( Array.isArray( tags.data )
								? tags.data
								: []
							).map( ( t ) => (
								<Checkbox
									key={ t.id }
									isSelected={ tagIds.includes( t.id ) }
									onChange={ ( on ) =>
										setTagIds( ( ids ) =>
											on
												? [ ...ids, t.id ]
												: ids.filter(
														( x ) => x !== t.id
													)
										)
									}
								>
									{ t.name }
								</Checkbox>
							) ) }
						</div>
						{ error && (
							<p role="alert" className="text-sm text-danger">
								{ error }
							</p>
						) }
					</fieldset>
				) }
				{ op === 'macro' && (
					<>
						<p className="text-sm text-fg-muted">
							{ __(
								'Each conversation gets the saved reply with its own values filled in, and the saved reply’s actions run. A conversation with a missing value is skipped and listed in the report. This cannot be undone.',
								'cliedesk'
							) }
						</p>
						<SavedReplyPicker
							value={ replyIds }
							onChange={ ( ids ) => {
								setReplyIds( ids );
								setError( null );
							} }
							error={ error ?? server.savedReplyIds ?? null }
						/>
					</>
				) }
				{ ( op === 'reply' || op === 'note' ) && (
					<TextField
						label={
							op === 'reply'
								? __( 'Reply', 'cliedesk' )
								: __( 'Note', 'cliedesk' )
						}
						description={
							op === 'reply'
								? __(
										'Each customer gets their own copy, on the channel of their conversation.',
										'cliedesk'
									)
								: __(
										'Added as an internal note to each conversation.',
										'cliedesk'
									)
						}
						multiline
						rows={ 6 }
						isRequired
						value={ text }
						onChange={ setText }
						errorMessage={ error ?? server.html ?? null }
					/>
				) }
			</form>
		</Modal>
	);
}

/**
 * Bar with the bulk actions.
 *
 * @param props            Props.
 * @param props.selection  Selection.
 * @param props.view       Current view key.
 * @param props.productIds Products of the selected conversations (tracker default).
 * @param props.items      Loaded list rows (bulk merge reads the selected ones).
 * @param props.onClear    Clear the selection.
 */
// AUT-20: manual rules on the selected conversations (loaded when a selection exists).
const BulkRunRule = lazy(
	() =>
		import(
			/* webpackChunkName: "run-rule" */ '../conversation/ManualRules'
		)
);

export function ConversationBulkBar( {
	selection,
	view,
	productIds = [],
	items = [],
	onClear,
}: {
	selection: ConversationSelection;
	view: string;
	productIds?: number[];
	items?: InboxItem[];
	onClear: () => void;
} ) {
	const [ dialog, setDialog ] = useState<
		| DialogOp
		| 'tracker'
		| 'tracker-add'
		| 'export'
		| 'link'
		| 'merge'
		| null
	>( null );
	const [ confirming, setConfirming ] = useState< string | null >( null );
	const direct = useConversationBulk( selection, () => {
		setConfirming( null );
		onClear();
	} );
	if ( ! can( 'cliedesk_bulk_actions' ) ) {
		return null;
	}
	const assign =
		can( 'cliedesk_assign_others' ) || can( 'cliedesk_assign_self' );
	const status = can( 'cliedesk_change_status' );
	const fields = can( 'cliedesk_edit_conversation_fields' );
	const spam = canManageSpam();
	const inSpam = view === SPAM_VIEW;
	const trash = can( 'cliedesk_trash_conversations' );
	const reply = can( 'cliedesk_reply_conversations' ) && ! inSpam;
	const note = can( 'cliedesk_add_notes' );
	const tracker = note && selection.kind === 'ids';
	const exportIds =
		can( 'cliedesk_export_conversations' ) &&
		selection.kind === 'ids' &&
		selection.ids.length <= MAX_EXPORT
			? selection.ids
			: null;
	const mergeItems =
		can( 'cliedesk_merge_conversations' ) && selection.kind === 'ids'
			? items.filter( ( i ) => selection.ids.includes( i.id ) )
			: [];
	const canMerge =
		mergeItems.length >= 2 &&
		mergeItems.length <= MAX_BULK_MERGE &&
		selection.kind === 'ids' &&
		mergeItems.length === selection.ids.length;
	const run = ( op: ConversationBulkOp, extra = {} ) =>
		direct.mutate( { op, ...extra } );
	const trashNow = () =>
		direct.mutate(
			{ op: 'trash' },
			{
				onError: ( e ) => {
					if ( isConfirmRequired( e ) ) {
						direct.reset();
						setConfirming(
							e instanceof Error && e.message
								? e.message
								: __(
										'Confirm to move these conversations to Trash.',
										'cliedesk'
									)
						);
					}
				},
			}
		);
	const busy = direct.isPending;
	return (
		<div
			role="region"
			aria-label={ __( 'Bulk actions', 'cliedesk' ) }
			className="flex flex-col gap-2 rounded-lg border border-accent bg-accent-subtle px-3 py-2"
		>
			<div className="flex flex-wrap items-center gap-2">
				<p className="me-2 font-medium">
					{ conversationSelectionText( selection ) }
				</p>
				{ assign && (
					<Button size="sm" onPress={ () => setDialog( 'assign' ) }>
						{ __( 'Assign…', 'cliedesk' ) }
					</Button>
				) }
				{ status && (
					<Button size="sm" onPress={ () => setDialog( 'status' ) }>
						{ __( 'Status…', 'cliedesk' ) }
					</Button>
				) }
				{ selection.kind === 'ids' && (
					<Suspense fallback={ null }>
						<BulkRunRule ids={ selection.ids } />
					</Suspense>
				) }
				{ fields && (
					<>
						<Button
							size="sm"
							onPress={ () => setDialog( 'priority' ) }
						>
							{ __( 'Priority…', 'cliedesk' ) }
						</Button>
						<Button
							size="sm"
							onPress={ () => setDialog( 'tag_add' ) }
						>
							{ __( 'Add tags…', 'cliedesk' ) }
						</Button>
						<Button
							size="sm"
							onPress={ () => setDialog( 'tag_remove' ) }
						>
							{ __( 'Remove tags…', 'cliedesk' ) }
						</Button>
					</>
				) }
				<Button
					size="sm"
					isDisabled={ busy }
					onPress={ () => run( 'read' ) }
				>
					{ conversationOpName( 'read' ) }
				</Button>
				<Button
					size="sm"
					isDisabled={ busy }
					onPress={ () => run( 'unread' ) }
				>
					{ conversationOpName( 'unread' ) }
				</Button>
				{ spam && ! inSpam && (
					<Button
						size="sm"
						isDisabled={ busy }
						onPress={ () => run( 'spam' ) }
					>
						{ conversationOpName( 'spam' ) }
					</Button>
				) }
				{ spam && inSpam && (
					<Button
						size="sm"
						isDisabled={ busy }
						onPress={ () => run( 'not_spam' ) }
					>
						{ conversationOpName( 'not_spam' ) }
					</Button>
				) }
				{ reply && (
					<Button size="sm" onPress={ () => setDialog( 'reply' ) }>
						{ __( 'Reply to each…', 'cliedesk' ) }
					</Button>
				) }
				{ reply && (
					<Button size="sm" onPress={ () => setDialog( 'macro' ) }>
						{ __( 'Apply saved reply…', 'cliedesk' ) }
					</Button>
				) }
				{ note && (
					<Button size="sm" onPress={ () => setDialog( 'note' ) }>
						{ __( 'Add a note to each…', 'cliedesk' ) }
					</Button>
				) }
				{ tracker && (
					<Button size="sm" onPress={ () => setDialog( 'tracker' ) }>
						{ __( 'Create tracker…', 'cliedesk' ) }
					</Button>
				) }
				{ tracker && (
					<Button
						size="sm"
						onPress={ () => setDialog( 'tracker-add' ) }
					>
						{ __( 'Add to existing tracker…', 'cliedesk' ) }
					</Button>
				) }
				{ selection.kind === 'ids' && fields && (
					<Button size="sm" onPress={ () => setDialog( 'link' ) }>
						{ __( 'Link to…', 'cliedesk' ) }
					</Button>
				) }
				{ canMerge && (
					<Button size="sm" onPress={ () => setDialog( 'merge' ) }>
						{ __( 'Merge…', 'cliedesk' ) }
					</Button>
				) }
				{ exportIds && (
					<Button size="sm" onPress={ () => setDialog( 'export' ) }>
						{ __( 'Export transcripts…', 'cliedesk' ) }
					</Button>
				) }
				{ trash && (
					<Button
						size="sm"
						variant="danger"
						isDisabled={ busy }
						onPress={ trashNow }
					>
						{ conversationOpName( 'trash' ) }
					</Button>
				) }
				<Button size="sm" variant="ghost" onPress={ onClear }>
					{ __( 'Clear selection', 'cliedesk' ) }
				</Button>
			</div>
			{ ! confirming && (
				<ActionError
					error={ direct.error }
					onDismiss={ () => direct.reset() }
				/>
			) }
			{ dialog === 'link' && selection.kind === 'ids' && (
				<BulkLinkDialog
					ids={ selection.ids }
					onClose={ () => setDialog( null ) }
					onDone={ onClear }
				/>
			) }
			{ dialog === 'merge' && canMerge && (
				<BulkMergeDialog
					items={ mergeItems }
					onClose={ () => setDialog( null ) }
				/>
			) }
			{ dialog === 'export' && exportIds && (
				<ExportTranscriptsDialog
					ids={ exportIds }
					onClose={ () => setDialog( null ) }
					onStarted={ onClear }
				/>
			) }
			{ dialog &&
				dialog !== 'tracker' &&
				dialog !== 'tracker-add' &&
				dialog !== 'export' &&
				dialog !== 'link' &&
				dialog !== 'merge' && (
					<OpDialog
						op={ dialog }
						selection={ selection }
						onClose={ () => setDialog( null ) }
						onStarted={ onClear }
					/>
				) }
			{ dialog === 'tracker' && selection.kind === 'ids' && (
				<TrackerDialog
					conversationIds={ selection.ids }
					productId={ productIds[ 0 ] ?? null }
					onClose={ () => setDialog( null ) }
					onCreated={ onClear }
				/>
			) }
			{ dialog === 'tracker-add' && selection.kind === 'ids' && (
				<AddToTrackerDialog
					conversationIds={ selection.ids }
					onClose={ () => setDialog( null ) }
					onAdded={ onClear }
				/>
			) }
			<ConfirmDestructive
				isOpen={ confirming !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setConfirming( null );
						direct.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: "3 conversations selected" or "All conversations in this view". */
					__( 'Move to Trash: %s?', 'cliedesk' ),
					conversationSelectionText( selection )
				) }
				description={
					confirming ??
					__(
						'Confirm to move these conversations to Trash.',
						'cliedesk'
					)
				}
				confirmLabel={ conversationOpName( 'trash' ) }
				isLoading={ direct.isPending }
				onConfirm={ () => run( 'trash', { confirm: true } ) }
			>
				<p>
					{ __(
						'You can undo this when the job finishes, or restore them from Trash.',
						'cliedesk'
					) }
				</p>
				<ActionError error={ direct.error } />
			</ConfirmDestructive>
		</div>
	);
}
