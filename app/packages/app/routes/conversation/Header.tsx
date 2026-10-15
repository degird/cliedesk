/**
 * Conversation header (CNV-11…15, CNV-24): subject (inline edit), number, channel, status (Pro: SLA), then the three
 * actions agents use on every conversation (Assign, Snooze, Resolve) and a grouped More menu with the rest. The other
 * properties (priority, queue, type, product, language) are in the side panel's Properties card.
 */
import { api, can, hasModule, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	IconButton,
	Menu,
	MenuGroup,
	MenuItem,
	MenuSeparator,
	Slot,
	TextField,
	toast,
	useSlotHasFills,
} from '@cliedesk/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import {
	AlarmClock,
	ArrowLeft,
	BookPlus,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	FileText,
	Forward,
	GitMerge,
	History,
	Mail,
	Maximize2,
	MessageSquareOff,
	MessagesSquare,
	MoreHorizontal,
	PanelRight,
	Pencil,
	Phone,
	RotateCcw,
	ShieldAlert,
	Split,
	UserRound,
	X,
	Zap,
} from 'lucide-react';
import {
	lazy,
	Suspense,
	useState,
	type FormEvent,
	type Key,
	type ReactNode,
} from 'react';
import { PageHeader } from '../../components/PageHeader';
import { inboxKeys, type Conversation } from '../../inbox/api';
import { StatusBadge, actionMessage } from '../../inbox/components';
import { inboxKit } from '../../inbox/kit';
import { channelLabel, fullTime } from '../../inbox/labels';
import { SentimentMark } from '../../inbox/sentiment';
import { snoozeSummary } from '../../inbox/snooze';
import { useShortcut } from '../../shortcuts';
import { useCaptureArticle } from './CaptureArticle';
import { forwardStore } from './compose';
import { UNASSIGNED, useConversationControls } from './controls';
import { useEndChat } from './EndChat';
import { useManualRules } from './RunRule';
import { usePane } from './shared';
import { conversationEmailKit } from './sideThreads';
import { SpamBanner, canMarkSpam, isInSpam, useSpamToggle } from './Spam';

const CallLogDialog = lazy( () =>
	import( /* webpackChunkName: "conversation-call-log" */ './CallLog' ).then(
		( m ) => ( { default: m.CallLogDialog } )
	)
);
const TranscriptDialog = lazy( () =>
	import(
		/* webpackChunkName: "transcript-dialog" */ '../../inbox/TranscriptDialog'
	).then( ( m ) => ( { default: m.TranscriptDialog } ) )
);
const TrashBanner = lazy(
	() => import( /* webpackChunkName: "conversation-trash" */ './Trash' )
);
const HistoryDialog = lazy(
	() => import( /* webpackChunkName: "conversation-history" */ './History' )
);

export { snoozeValue } from '../../inbox/snooze';

type Dialog = 'call' | 'side' | 'transcript' | 'history';

const ICON = 14;

/**
 * Header.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 * @param props.onMerge      Open the merge dialog.
 * @param props.onSplit      Open the split dialog (CNV-47).
 * @param props.presence     Presence avatars.
 * @param props.detailsOpen  The details slide-over is open (narrow screens).
 * @param props.onDetails    Open or close the details slide-over.
 */
export function Header( {
	conversation: c,
	onMerge,
	onSplit,
	presence,
	detailsOpen = false,
	onDetails,
}: {
	conversation: Conversation;
	onMerge: () => void;
	onSplit?: () => void;
	/** Presence avatars (INB-59). */
	presence?: ReactNode;
	detailsOpen?: boolean;
	onDetails?: () => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const pane = usePane();
	const ctl = useConversationControls( c );
	const [ editing, setEditing ] = useState( false );
	const [ subject, setSubject ] = useState( c.subject );
	const [ dialog, setDialog ] = useState< Dialog | null >( null );
	const spam = isInSpam( c );
	const canFields = can( 'cliedesk_edit_conversation_fields' );
	const canReply = can( 'cliedesk_reply_conversations' );
	const canMerge = can( 'cliedesk_merge_conversations' );
	const rules = useManualRules( c.id, hasModule( 'automation' ) && ! spam );
	const endChat = useEndChat( c.id );
	const article = useCaptureArticle( c.id );
	const spamToggle = useSpamToggle( c );
	const me = ctl.me;

	// INB-68: "Assign to me" is one key.
	useShortcut(
		{
			id: 'conversation-assign-me',
			keys: 'i',
			label: __( 'Assign to me', 'cliedesk' ),
			group: __( 'Conversation', 'cliedesk' ),
			run: () => {
				if ( null !== me && c.assigneeId !== me ) {
					ctl.run(
						'assign',
						{ assigneeId: me },
						__( 'Assigned to you.', 'cliedesk' )
					);
				}
			},
		},
		null !== me && ctl.canAssign && ! spam
	);

	const startEdit = () => {
		setSubject( c.subject );
		setEditing( true );
	};
	const saveSubject = ( e: FormEvent ) => {
		e.preventDefault();
		if ( subject.trim() === '' || subject.trim() === c.subject ) {
			setEditing( false );
			return;
		}
		ctl.run(
			'subject',
			{ subject: subject.trim() },
			__( 'Subject changed.', 'cliedesk' ),
			() => setEditing( false )
		);
	};

	const markUnread = () =>
		void api
			.post( `conversations/${ c.id }/read`, { body: { read: false } } )
			.then( () => {
				void qc.invalidateQueries( { queryKey: inboxKeys.all } );
				toast( {
					tone: 'success',
					title: sprintf(
						/* translators: %d: conversation number. */
						__( '#%d marked as unread.', 'cliedesk' ),
						c.number
					),
				} );
				void navigate( { to: '/inbox' } );
			} )
			.catch( () =>
				toast( {
					tone: 'danger',
					title: __( 'Could not mark as unread.', 'cliedesk' ),
				} )
			);

	const onMore = ( key: Key ) => {
		switch ( key ) {
			case 'subject':
				startEdit();
				break;
			case 'unread':
				markUnread();
				break;
			case 'forward':
				forwardStore.set( { conversationId: c.id, messageId: null } );
				break;
			case 'end-chat':
				endChat.mutate();
				break;
			case 'merge':
				onMerge();
				break;
			case 'split':
				onSplit?.();
				break;
			case 'article':
				article.mutate();
				break;
			case 'rule':
				rules.pick();
				break;
			case 'spam':
				spamToggle.mutate( true, {
					onError: ( e ) =>
						toast( { tone: 'danger', title: actionMessage( e ) } ),
				} );
				break;
			default:
				setDialog( key as Dialog );
		}
	};

	const sideFill = useSlotHasFills( 'conversation.side_thread.dialog' );
	const assigneeName =
		ctl.assigneeOptions.find(
			( o ) =>
				o.id ===
				( c.assigneeId === null ? UNASSIGNED : String( c.assigneeId ) )
		)?.label ?? __( 'Unassigned', 'cliedesk' );
	const assign = ctl.canAssign ? (
		<Menu
			aria-label={ __( 'Assignee', 'cliedesk' ) }
			selectionMode="single"
			selectedKeys={ [
				c.assigneeId === null ? UNASSIGNED : String( c.assigneeId ),
			] }
			onAction={ ( k ) => ctl.assign( String( k ) ) }
			trigger={
				<Button
					aria-label={ sprintf(
						/* translators: %s: assignee name. */
						__( 'Assignee: %s', 'cliedesk' ),
						assigneeName
					) }
					iconStart={ <UserRound aria-hidden="true" size={ ICON } /> }
					iconEnd={ <ChevronDown aria-hidden="true" size={ ICON } /> }
				>
					<span className="max-w-32 truncate">{ assigneeName }</span>
				</Button>
			}
		>
			{ ctl.assigneeOptions.map( ( o ) => (
				<MenuItem key={ o.id } id={ o.id }>
					{ o.label }
				</MenuItem>
			) ) }
		</Menu>
	) : null;

	const primary = ctl.primary;
	const status =
		ctl.canStatus && ! spam && ctl.statusOptions.length ? (
			<div className="inline-flex">
				{ primary && (
					<Button
						variant="primary"
						className="rounded-e-none!"
						isLoading={ ctl.action.isPending }
						iconStart={
							ctl.resolved ? (
								<RotateCcw aria-hidden="true" size={ ICON } />
							) : (
								<Check aria-hidden="true" size={ ICON } />
							)
						}
						onPress={ () => ctl.setStatus( String( primary.id ) ) }
					>
						{ ctl.resolved
							? __( 'Reopen', 'cliedesk' )
							: __( 'Resolve', 'cliedesk' ) }
					</Button>
				) }
				<Menu
					aria-label={ __( 'Status', 'cliedesk' ) }
					selectionMode="single"
					selectedKeys={ c.status ? [ String( c.status.id ) ] : [] }
					onAction={ ( k ) => ctl.setStatus( String( k ) ) }
					trigger={
						<Button
							variant={ primary ? 'primary' : 'secondary' }
							className={
								primary
									? 'rounded-s-none! border-s border-s-on-accent/30 px-2!'
									: undefined
							}
							aria-label={ __(
								'Set another status',
								'cliedesk'
							) }
							iconEnd={
								<ChevronDown aria-hidden="true" size={ ICON } />
							}
						>
							{ primary
								? null
								: ( c.status?.label ??
									__( 'Status', 'cliedesk' ) ) }
						</Button>
					}
				>
					{ ctl.statusOptions.map( ( o ) => (
						<MenuItem key={ o.id } id={ o.id }>
							{ o.label }
						</MenuItem>
					) ) }
				</Menu>
			</div>
		) : null;

	// INB-61: side threads by email are Pro (`conversation.side_thread.dialog`).
	const sideThreads = can( 'cliedesk_add_notes' ) && sideFill;
	const more = (
		<Menu
			aria-label={ __( 'More actions', 'cliedesk' ) }
			onAction={ onMore }
			trigger={
				<Button
					iconStart={
						<MoreHorizontal aria-hidden="true" size={ ICON } />
					}
				>
					{ __( 'More', 'cliedesk' ) }
				</Button>
			}
		>
			<MenuGroup title={ __( 'Conversation', 'cliedesk' ) }>
				{ canFields && (
					<MenuItem id="subject" icon={ <Pencil size={ ICON } /> }>
						{ __( 'Edit subject', 'cliedesk' ) }
					</MenuItem>
				) }
				<MenuItem id="unread" icon={ <Mail size={ ICON } /> }>
					{ __( 'Mark unread', 'cliedesk' ) }
				</MenuItem>
				{ canReply && ! spam && (
					<MenuItem id="forward" icon={ <Forward size={ ICON } /> }>
						{ __( 'Forward…', 'cliedesk' ) }
					</MenuItem>
				) }
				{ sideThreads && ! spam && (
					<MenuItem
						id="side"
						icon={ <MessagesSquare size={ ICON } /> }
					>
						{ __( 'Side thread…', 'cliedesk' ) }
					</MenuItem>
				) }
				{ canReply && (
					<MenuItem id="call" icon={ <Phone size={ ICON } /> }>
						{ __( 'Log call…', 'cliedesk' ) }
					</MenuItem>
				) }
				{ c.currentChannel === 'widget' && canReply && (
					<MenuItem
						id="end-chat"
						icon={ <MessageSquareOff size={ ICON } /> }
					>
						{ __( 'End chat', 'cliedesk' ) }
					</MenuItem>
				) }
			</MenuGroup>
			<MenuSeparator />
			<MenuGroup title={ __( 'Organize', 'cliedesk' ) }>
				{ canMerge && (
					<MenuItem id="merge" icon={ <GitMerge size={ ICON } /> }>
						{ __( 'Merge…', 'cliedesk' ) }
					</MenuItem>
				) }
				{ canMerge && onSplit && (
					<MenuItem id="split" icon={ <Split size={ ICON } /> }>
						{ __( 'Split…', 'cliedesk' ) }
					</MenuItem>
				) }
				{ rules.rules.length > 0 && (
					<MenuItem id="rule" icon={ <Zap size={ ICON } /> }>
						{ __( 'Run rule…', 'cliedesk' ) }
					</MenuItem>
				) }
			</MenuGroup>
			<MenuSeparator />
			<MenuGroup title={ __( 'Records', 'cliedesk' ) }>
				<MenuItem id="transcript" icon={ <FileText size={ ICON } /> }>
					{ __( 'Transcript…', 'cliedesk' ) }
				</MenuItem>
				<MenuItem id="history" icon={ <History size={ ICON } /> }>
					{ __( 'History…', 'cliedesk' ) }
				</MenuItem>
				{ hasModule( 'knowledge' ) && canReply && ! spam && (
					<MenuItem id="article" icon={ <BookPlus size={ ICON } /> }>
						{ __( 'Create article', 'cliedesk' ) }
					</MenuItem>
				) }
			</MenuGroup>
			{ canMarkSpam( c ) && (
				<>
					<MenuSeparator />
					<MenuItem id="spam" icon={ <ShieldAlert size={ ICON } /> }>
						{ __( 'Mark as spam', 'cliedesk' ) }
					</MenuItem>
				</>
			) }
		</Menu>
	);

	return (
		<div className="flex flex-col gap-3">
			{ ! pane.inPane && (
				<Link
					to="/inbox"
					className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
				>
					<ArrowLeft
						aria-hidden="true"
						size={ ICON }
						className="rtl:rotate-180"
					/>
					{ __( 'Inbox', 'cliedesk' ) }
				</Link>
			) }
			<div className="flex items-start gap-1">
				{ pane.onStep && (
					<div className="flex shrink-0 pt-0.5">
						<IconButton
							label={ __( 'Previous conversation', 'cliedesk' ) }
							icon={
								<ChevronLeft
									size={ 16 }
									className="rtl:rotate-180"
								/>
							}
							onPress={ () => pane.onStep?.( -1 ) }
						/>
						<IconButton
							label={ __( 'Next conversation', 'cliedesk' ) }
							icon={
								<ChevronRight
									size={ 16 }
									className="rtl:rotate-180"
								/>
							}
							onPress={ () => pane.onStep?.( 1 ) }
						/>
					</div>
				) }
				<div className="min-w-0 flex-1">
					<PageHeader
						dense
						level={ pane.inPane ? 2 : 1 }
						title={ c.subject }
						titleAddon={
							canFields && ! editing ? (
								<IconButton
									size="sm"
									label={ __( 'Edit subject', 'cliedesk' ) }
									icon={ <Pencil size={ ICON } /> }
									onPress={ startEdit }
								/>
							) : null
						}
						description={
							<span className="flex flex-wrap items-center gap-2">
								<span className="cd-tabular">{ `#${ c.number }` }</span>
								<span aria-hidden="true">·</span>
								<span>
									{ channelLabel( c.currentChannel ) }
								</span>
								{ c.status && (
									<StatusBadge
										label={ c.status.label }
										category={ c.status.category }
									/>
								) }
								<SentimentMark value={ c.sentiment } />
								{ /* SLA-17: Pro's SLA badge with the running clocks. */ }
								<Slot
									name="conversation.header.sla"
									fillProps={ {
										conversationId: c.id,
										version: c.version,
										kit: inboxKit,
									} }
								/>
							</span>
						}
						actions={
							<>
								{ assign }
								{ ctl.canStatus && ! spam && (
									<Button
										iconStart={
											<AlarmClock
												aria-hidden="true"
												size={ ICON }
											/>
										}
										onPress={ ctl.snooze }
									>
										{ __( 'Snooze', 'cliedesk' ) }
									</Button>
								) }
								{ status }
								{ more }
								{ /* INB-34: Translate and Summarise are Pro (badge without Pro). */ }
								<Slot name="conversation.header.ai" />
								{ onDetails && (
									// Only when the details panel does not fit beside the timeline.
									<IconButton
										className="@min-[52rem]:hidden"
										label={ __( 'Details', 'cliedesk' ) }
										aria-expanded={ detailsOpen }
										aria-controls="cd-conversation-details"
										icon={ <PanelRight size={ 16 } /> }
										onPress={ onDetails }
									/>
								) }
								{ pane.inPane && (
									<>
										<Link
											to="/c/$number"
											params={ {
												number: String( c.number ),
											} }
											aria-label={ __(
												'Open full page',
												'cliedesk'
											) }
											title={ __(
												'Open full page',
												'cliedesk'
											) }
											className="inline-flex size-(--cd-control-h) items-center justify-center rounded-md text-fg-muted outline-none hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
										>
											<Maximize2
												aria-hidden="true"
												size={ 16 }
											/>
										</Link>
										{ pane.onClose && (
											<IconButton
												label={ __(
													'Close conversation',
													'cliedesk'
												) }
												icon={ <X size={ 16 } /> }
												onPress={ pane.onClose }
											/>
										) }
									</>
								) }
							</>
						}
					/>
				</div>
			</div>
			{ editing && (
				<form
					noValidate
					onSubmit={ saveSubject }
					className="flex flex-wrap items-end gap-2"
				>
					<TextField
						className="min-w-72 flex-1"
						label={ __( 'Subject', 'cliedesk' ) }
						value={ subject }
						maxLength={ 255 }
						isRequired
						onChange={ setSubject }
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						onKeyDown={ ( e ) => {
							if ( e.key === 'Escape' ) {
								setEditing( false );
							}
						} }
					/>
					<Button
						type="submit"
						variant="primary"
						isLoading={ ctl.action.isPending }
					>
						{ __( 'Save subject', 'cliedesk' ) }
					</Button>
					<Button onPress={ () => setEditing( false ) }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
				</form>
			) }
			<SpamBanner conversation={ c } />
			{ c.lane === 'trash' && (
				<Suspense fallback={ null }>
					<TrashBanner conversation={ c } />
				</Suspense>
			) }
			{ c.snoozedUntil && c.status?.key === 'snoozed' && (
				<p className="text-sm text-fg-muted">
					{ snoozeSummary(
						c.snoozedUntil,
						c.snoozeMode,
						fullTime( c.snoozedUntil )
					) }
				</p>
			) }
			{ c.mergedIntoId && (
				<Banner
					tone="info"
					title={ __(
						'This conversation was merged into another one.',
						'cliedesk'
					) }
				/>
			) }
			{ ctl.feedback }
			{ presence }
			{ ctl.dialogs }
			{ rules.dialog }
			<Suspense fallback={ null }>
				{ dialog === 'call' && (
					<CallLogDialog
						conversationId={ c.id }
						onClose={ () => setDialog( null ) }
					/>
				) }
				{ dialog === 'transcript' && (
					<TranscriptDialog
						conversationId={ c.id }
						onClose={ () => setDialog( null ) }
					/>
				) }
				{ dialog === 'history' && (
					<HistoryDialog
						conversationId={ c.id }
						onClose={ () => setDialog( null ) }
					/>
				) }
			</Suspense>
			{ dialog === 'side' && (
				<Slot
					name="conversation.side_thread.dialog"
					fillProps={ {
						conversationId: c.id,
						onClose: () => setDialog( null ),
						kit: conversationEmailKit,
					} }
				/>
			) }
		</div>
	);
}
