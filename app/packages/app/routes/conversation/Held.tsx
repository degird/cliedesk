/**
 * Held replies (INB-17, INB-60): a reply paused by a collision ('held', meta.heldReason 'collision') waits for its
 * author: Send anyway (POST messages/{id}/send), Edit (POST messages/{id}/undo: the reply goes back to the
 * composer) or Discard (POST messages/{id}/undo {delete: true}). Unresolved holds are listed in Needs attention.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Modal } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	AUTHOR_CONTACT,
	conversationKeys,
	inboxKeys,
	messagesQuery,
	type Message,
} from '../../inbox/api';
import { ActionError, useAgents } from '../../inbox/components';
import { RESTORE_EVENT } from '../../inbox/keys';
import { fullTime, relativeTime } from '../../inbox/labels';
import { announceResult } from '../../workspace/forms';

export type HeldChoice = 'send' | 'edit' | 'discard';

/**
 * Ids of the messages that arrived while the reply was written.
 *
 * @param m Held message.
 */
export function newMessageIds( m: Message ): number[] {
	const ids = m.meta?.newMessageIds;
	return Array.isArray( ids ) ? ids.map( Number ).filter( Boolean ) : [];
}

/**
 * Why a reply of mine is held or failed, in words.
 *
 * @param m Message.
 */
export function heldReason( m: Message ): string {
	if ( m.status === 'held' ) {
		return m.meta?.heldReason === 'collision'
			? __(
					'Not sent: new messages arrived while you were writing.',
					'cliedesk'
				)
			: __( 'Not sent yet: waiting for you.', 'cliedesk' );
	}
	const reason = [ 'error', 'reason', 'failReason', 'bounceReason' ]
		.map( ( k ) => m.meta?.[ k ] )
		.find( ( v ) => typeof v === 'string' && v.trim() ) as
		string | undefined;
	const base =
		m.status === 'bounced'
			? __( 'Bounced: the customer’s server refused it.', 'cliedesk' )
			: __( 'Not delivered.', 'cliedesk' );
	return reason ? `${ base } ${ reason }` : base;
}

/**
 * Send anyway / Edit / Discard for a held reply.
 *
 * @param m              Message.
 * @param conversationId Conversation id.
 * @param onDone         Called after a choice succeeded.
 */
export function useHeldActions(
	m: Message,
	conversationId: number,
	onDone?: ( choice: HeldChoice ) => void
) {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: ( choice: HeldChoice ) =>
			api.post< { draft?: { html: string } | null } >(
				`messages/${ m.id }/${ choice === 'send' ? 'send' : 'undo' }`,
				choice === 'discard' ? { body: { delete: true } } : {}
			),
		onSuccess: ( r, choice ) => {
			void qc.invalidateQueries( {
				queryKey: conversationKeys.all( conversationId ),
			} );
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			if ( choice === 'edit' ) {
				window.dispatchEvent(
					new CustomEvent( RESTORE_EVENT, {
						detail: {
							conversationId,
							html: r.data?.draft?.html ?? m.html ?? '',
						},
					} )
				);
				announceResult(
					__( 'The reply is back in the composer.', 'cliedesk' )
				);
			} else if ( choice === 'discard' ) {
				announceResult( __( 'Reply discarded.', 'cliedesk' ) );
			} else {
				announceResult( __( 'Reply sent.', 'cliedesk' ) );
			}
			onDone?.( choice );
		},
	} );
}

/**
 * Buttons of a held reply.
 *
 * @param props                Props.
 * @param props.message        Message.
 * @param props.conversationId Conversation id.
 * @param props.onDone         After a choice.
 * @param props.autoFocusSend  Focus "Send anyway" first (dialog).
 */
export function HeldButtons( {
	message,
	conversationId,
	onDone,
	autoFocusSend,
}: {
	message: Message;
	conversationId: number;
	onDone?: ( choice: HeldChoice ) => void;
	autoFocusSend?: boolean;
} ) {
	const act = useHeldActions( message, conversationId, onDone );
	const busy = ( c: HeldChoice ) => act.isPending && act.variables === c;
	return (
		<div className="flex flex-col gap-2">
			<ActionError error={ act.error } onDismiss={ () => act.reset() } />
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="primary"
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus={ autoFocusSend }
					isLoading={ busy( 'send' ) }
					isDisabled={ act.isPending }
					onPress={ () => act.mutate( 'send' ) }
				>
					{ __( 'Send anyway', 'cliedesk' ) }
				</Button>
				<Button
					size="sm"
					isLoading={ busy( 'edit' ) }
					isDisabled={ act.isPending }
					onPress={ () => act.mutate( 'edit' ) }
				>
					{ __( 'Edit', 'cliedesk' ) }
				</Button>
				<Button
					size="sm"
					variant="ghost"
					isLoading={ busy( 'discard' ) }
					isDisabled={ act.isPending }
					onPress={ () => act.mutate( 'discard' ) }
				>
					{ __( 'Discard', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}

/**
 * Retry / Discard for a reply of mine that failed or bounced (INB-17): POST messages/{id}/retry sends the email
 * again (the item leaves Needs attention), POST messages/{id}/discard removes it and logs an event.
 *
 * @param props                Props.
 * @param props.message        Message.
 * @param props.conversationId Conversation id.
 */
export function FailedButtons( {
	message,
	conversationId,
}: {
	message: Message;
	conversationId: number;
} ) {
	const qc = useQueryClient();
	const act = useMutation( {
		mutationFn: ( choice: 'retry' | 'discard' ) =>
			api.post( `messages/${ message.id }/${ choice }`, {} ),
		onSuccess: ( _r, choice ) => {
			void qc.invalidateQueries( {
				queryKey: conversationKeys.all( conversationId ),
			} );
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			announceResult(
				choice === 'retry'
					? __( 'Sending again.', 'cliedesk' )
					: __( 'Reply discarded.', 'cliedesk' )
			);
		},
	} );
	return (
		<>
			<ActionError error={ act.error } onDismiss={ () => act.reset() } />
			<Button
				size="sm"
				variant="primary"
				isLoading={ act.isPending && act.variables === 'retry' }
				isDisabled={ act.isPending }
				onPress={ () => act.mutate( 'retry' ) }
			>
				{ __( 'Retry', 'cliedesk' ) }
			</Button>
			<Button
				size="sm"
				variant="ghost"
				isLoading={ act.isPending && act.variables === 'discard' }
				isDisabled={ act.isPending }
				onPress={ () => act.mutate( 'discard' ) }
			>
				{ __( 'Discard', 'cliedesk' ) }
			</Button>
		</>
	);
}

/**
 * Collision pause dialog (INB-60), shown when a reply comes back 'held'.
 *
 * @param props                Props.
 * @param props.message        The held reply.
 * @param props.conversationId Conversation id.
 * @param props.requesterName  Customer name.
 * @param props.onClose        Close (the reply stays held).
 */
export function CollisionDialog( {
	message,
	conversationId,
	requesterName,
	onClose,
}: {
	message: Message;
	conversationId: number;
	requesterName: string;
	onClose: () => void;
} ) {
	const messages = useQuery( messagesQuery( conversationId ) );
	const { nameFor } = useAgents();
	const ids = newMessageIds( message );
	const fresh = ( messages.data ?? [] ).filter( ( m ) =>
		ids.includes( m.id )
	);
	const author = ( m: Message ) =>
		m.authorType === AUTHOR_CONTACT
			? requesterName || __( 'Customer', 'cliedesk' )
			: ( m.authorId && nameFor( m.authorId ) ) ||
				__( 'A teammate', 'cliedesk' );
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			role="alertdialog"
			title={ __( 'Your reply is on hold', 'cliedesk' ) }
		>
			<div className="flex flex-col gap-3">
				<p>
					{ sprintf(
						/* translators: %d: number of new messages. */
						_n(
							'%d new message arrived while you were writing. Read it, then choose what to do with your reply.',
							'%d new messages arrived while you were writing. Read them, then choose what to do with your reply.',
							Math.max( ids.length, 1 ),
							'cliedesk'
						),
						Math.max( ids.length, 1 )
					) }
				</p>
				{ fresh.length > 0 ? (
					<ul
						aria-label={ __( 'New messages', 'cliedesk' ) }
						className="flex flex-col gap-2"
					>
						{ fresh.map( ( m ) => (
							<li
								key={ m.id }
								className="flex flex-col gap-1 rounded-md border border-line bg-surface p-3"
							>
								<span className="flex flex-wrap items-center gap-2 text-sm">
									<bdi className="font-semibold">
										{ author( m ) }
									</bdi>
									{ m.visibility === 'internal' && (
										<span className="text-fg-muted">
											{ __(
												'(internal note)',
												'cliedesk'
											) }
										</span>
									) }
									<time
										dateTime={ m.createdAt }
										title={ fullTime( m.createdAt ) }
										className="ms-auto text-fg-muted"
									>
										{ relativeTime( m.createdAt ) }
									</time>
								</span>
								<p className="text-sm break-words">
									{ m.text.length > 280
										? m.text.slice( 0, 280 ) + '…'
										: m.text }
								</p>
							</li>
						) ) }
					</ul>
				) : (
					<p className="text-sm text-fg-muted">
						{ messages.isPending
							? __( 'Loading the new messages…', 'cliedesk' )
							: __(
									'The new messages are in the conversation above.',
									'cliedesk'
								) }
					</p>
				) }
				<p className="text-sm text-fg-muted">
					{ __(
						'If you close this, the reply stays on hold. You find it in Needs attention.',
						'cliedesk'
					) }
				</p>
				<HeldButtons
					message={ message }
					conversationId={ conversationId }
					onDone={ onClose }
					autoFocusSend
				/>
			</div>
		</Modal>
	);
}
