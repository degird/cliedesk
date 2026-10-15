/**
 * Spam on the conversation screen (CNV-22, SEC-15, SEC-16), for people with cliedesk_manage_spam:
 *
 * - "Mark as spam" (POST conversations/{id}/spam), with Undo (POST …/not-spam).
 * - In Spam: a banner with the reason in plain words and Not spam, Trust sender / Block sender (POST senders with
 *   the requester's email; hidden when the requester has no email) and Move to Trash.
 *
 * Replies are turned off while a conversation is in Spam (the composer explains why); notes stay available.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Banner, Button, ConfirmDestructive, toast } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import {
	contactQuery,
	conversationKeys,
	type Conversation,
} from '../../inbox/api';
import { ActionError, actionMessage } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import {
	QUARANTINE_LANE,
	canManageSpam,
	senderKeys,
	spamReasonText,
	type SenderKind,
	type SenderRule,
} from '../../inbox/spam';
import { versionTag } from '../../workspace/api';
import { announceResult } from '../../workspace/forms';
import { afterChange, mergeDetail } from './shared';

/** Lanes where "Mark as spam" makes no sense. */
const LOCKED = [ QUARANTINE_LANE, 'trash', 'merged' ];

export const isInSpam = ( c: Pick< Conversation, 'lane' > ): boolean =>
	c.lane === QUARANTINE_LANE;

/**
 * Mark as spam / Not spam, with an Undo toast.
 *
 * @param c Conversation.
 */
export function useSpamToggle( c: Conversation ) {
	const qc = useQueryClient();
	const send = ( spam: boolean ) =>
		api.post< Conversation >(
			`conversations/${ c.id }/${ spam ? 'spam' : 'not-spam' }`
		);
	return useMutation( {
		mutationFn: ( spam: boolean ) => send( spam ),
		onSuccess: ( r, spam ) => {
			if ( r.data && typeof r.data.version === 'number' ) {
				mergeDetail( qc, c.id, r.data );
			} else {
				void qc.invalidateQueries( {
					queryKey: conversationKeys.detail( c.id ),
				} );
			}
			afterChange( qc, c.id );
			const undo = () =>
				void send( ! spam )
					.then( ( u ) => {
						if ( u.data && typeof u.data.version === 'number' ) {
							mergeDetail( qc, c.id, u.data );
						}
						afterChange( qc, c.id );
						announceResult( __( 'Undone.', 'cliedesk' ) );
					} )
					.catch( ( e: unknown ) =>
						toast( {
							tone: 'danger',
							title: __( 'Could not undo', 'cliedesk' ),
							description: actionMessage( e ),
						} )
					);
			toast( {
				tone: 'success',
				title: spam
					? sprintf(
							/* translators: %d: conversation number. */
							__( '#%d moved to Spam.', 'cliedesk' ),
							c.number
						)
					: sprintf(
							/* translators: %d: conversation number. */
							__( '#%d is no longer spam.', 'cliedesk' ),
							c.number
						),
				action: { label: __( 'Undo', 'cliedesk' ), onAction: undo },
			} );
		},
	} );
}

/**
 * Whether "Mark as spam" is offered for this conversation.
 *
 * @param c Conversation.
 */
export const canMarkSpam = (
	c: Pick< Conversation, 'lane' | 'mergedIntoId' >
): boolean =>
	canManageSpam() && ! LOCKED.includes( c.lane ) && ! c.mergedIntoId;

/**
 * Banner of a conversation in Spam.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function SpamBanner( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const manage = canManageSpam();
	const requester = useQuery( {
		...contactQuery( c.requesterId ),
		enabled: manage && isInSpam( c ) && can( 'cliedesk_view_contacts' ),
	} );
	const email = requester.data?.email ?? '';
	const [ trashing, setTrashing ] = useState( false );
	const release = useSpamToggle( c );
	const sender = useMutation( {
		mutationFn: ( kind: SenderKind ) =>
			api.post< SenderRule >( 'senders', {
				body: {
					pattern: email,
					kind,
					note: sprintf(
						/* translators: %d: conversation number. */
						__( 'From conversation #%d', 'cliedesk' ),
						c.number
					),
				},
			} ),
		onSuccess: ( _r, kind ) => {
			void qc.invalidateQueries( { queryKey: senderKeys.all } );
			toast( {
				tone: 'success',
				title:
					kind === 'trust'
						? sprintf(
								/* translators: %s: email address. */
								__(
									'Mail from %s is now trusted.',
									'cliedesk'
								),
								email
							)
						: sprintf(
								/* translators: %s: email address. */
								__(
									'New mail from %s now goes to Spam.',
									'cliedesk'
								),
								email
							),
			} );
		},
	} );
	const trash = useMutation( {
		mutationFn: () =>
			api.post< Conversation >( `conversations/${ c.id }/trash`, {
				ifMatch: versionTag(
					qc.getQueryData< Conversation >(
						conversationKeys.detail( c.id )
					)?.version ?? c.version
				),
			} ),
		onSuccess: ( r ) => {
			if ( r.data && typeof r.data.version === 'number' ) {
				mergeDetail( qc, c.id, r.data );
			}
			afterChange( qc, c.id );
			setTrashing( false );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: conversation number. */
					__( '#%d moved to Trash.', 'cliedesk' ),
					c.number
				),
			} );
			void navigate( { to: '/inbox/$view', params: { view: 'spam' } } );
		},
	} );
	if ( ! manage || ! isInSpam( c ) ) {
		return null;
	}
	return (
		<Banner
			tone="warning"
			title={ __( 'This conversation is in Spam', 'cliedesk' ) }
			actions={
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="primary"
						isLoading={ release.isPending }
						onPress={ () => release.mutate( false ) }
					>
						{ __( 'Not spam', 'cliedesk' ) }
					</Button>
					{ email && (
						<>
							<Button
								size="sm"
								isLoading={
									sender.isPending &&
									sender.variables === 'trust'
								}
								onPress={ () => sender.mutate( 'trust' ) }
							>
								{ __( 'Trust sender', 'cliedesk' ) }
							</Button>
							<Button
								size="sm"
								isLoading={
									sender.isPending &&
									sender.variables === 'quarantine'
								}
								onPress={ () => sender.mutate( 'quarantine' ) }
							>
								{ __( 'Block sender', 'cliedesk' ) }
							</Button>
						</>
					) }
					{ can( 'cliedesk_trash_conversations' ) && (
						<Button
							size="sm"
							variant="danger"
							onPress={ () => setTrashing( true ) }
						>
							{ __( 'Move to Trash', 'cliedesk' ) }
						</Button>
					) }
				</div>
			}
		>
			<p>
				{ spamReasonText( c.spam ) }
				{ c.spam?.at ? ` · ${ fullTime( c.spam.at ) }` : '' }
			</p>
			{ email && (
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: %s: email address. */
						__(
							'Trust or block applies to every message from %s.',
							'cliedesk'
						),
						email
					) }
				</p>
			) }
			<ActionError
				error={ release.error ?? sender.error }
				onDismiss={ () => {
					release.reset();
					sender.reset();
				} }
			/>
			<ConfirmDestructive
				isOpen={ trashing }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setTrashing( false );
						trash.reset();
					}
				} }
				title={ sprintf(
					/* translators: %d: conversation number. */
					__( 'Move #%d to Trash?', 'cliedesk' ),
					c.number
				) }
				description={ __(
					'It leaves Spam and is deleted for good after the Trash retention period. You can restore it from Trash until then.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Move to Trash', 'cliedesk' ) }
				isLoading={ trash.isPending }
				onConfirm={ () => trash.mutate() }
			>
				<ActionError error={ trash.error } />
			</ConfirmDestructive>
		</Banner>
	);
}
