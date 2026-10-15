/**
 * Trash actions on a trashed conversation (SEC-37), loaded only for conversations in Trash: Restore
 * (POST conversations/{id}/restore) and Delete forever (DELETE conversations/{id} {confirm: true}; a sensitive
 * Action, so the API client may ask for the password first). Both need cliedesk_delete_conversations.
 */
import { api, can, useMutation, useQueryClient } from '@cliedesk/data';
import { Banner, Button, ConfirmDestructive, toast } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { inboxKeys, type Conversation } from '../../inbox/api';
import { ActionError } from '../../inbox/components';
import { afterChange, mergeDetail } from './shared';

/**
 * Banner with the Trash actions.
 *
 * @param props              Props.
 * @param props.conversation Trashed conversation.
 */
export default function TrashBanner( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ confirming, setConfirming ] = useState( false );
	const allowed = can( 'cliedesk_delete_conversations' );
	const restore = useMutation( {
		mutationFn: () =>
			api.post< Conversation >( `conversations/${ c.id }/restore`, {
				body: {},
			} ),
		onSuccess: ( r ) => {
			mergeDetail( qc, c.id, r.data );
			afterChange( qc, c.id );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: conversation number. */
					__( '#%d restored from Trash.', 'cliedesk' ),
					c.number
				),
			} );
		},
	} );
	const purge = useMutation( {
		mutationFn: () =>
			api.del( `conversations/${ c.id }`, { body: { confirm: true } } ),
		onSuccess: () => {
			setConfirming( false );
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: conversation number. */
					__( '#%d deleted permanently.', 'cliedesk' ),
					c.number
				),
			} );
			void navigate( {
				to: '/inbox/$view',
				params: { view: 'trash' },
			} );
		},
	} );
	return (
		<Banner
			tone="warning"
			title={ __( 'This conversation is in Trash', 'cliedesk' ) }
		>
			<div className="flex flex-col gap-2">
				<p>
					{ __(
						'It is deleted for good after the Trash period.',
						'cliedesk'
					) }
				</p>
				<ActionError
					error={ restore.error }
					onDismiss={ () => restore.reset() }
				/>
				{ allowed && (
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							isLoading={ restore.isPending }
							onPress={ () => restore.mutate() }
						>
							{ __( 'Restore', 'cliedesk' ) }
						</Button>
						<Button
							size="sm"
							variant="danger"
							onPress={ () => setConfirming( true ) }
						>
							{ __( 'Delete forever…', 'cliedesk' ) }
						</Button>
					</div>
				) }
			</div>
			<ConfirmDestructive
				isOpen={ confirming }
				onOpenChange={ ( open ) => ! open && setConfirming( false ) }
				title={ sprintf(
					/* translators: %d: conversation number. */
					__( 'Delete #%d forever?', 'cliedesk' ),
					c.number
				) }
				description={ __(
					'The conversation, its messages, notes and attachments are removed and cannot be brought back. It leaves search and exports.',
					'cliedesk'
				) }
				confirmLabel={ sprintf(
					/* translators: %d: conversation number. */
					__( 'Delete #%d forever', 'cliedesk' ),
					c.number
				) }
				isLoading={ purge.isPending }
				onConfirm={ () => purge.mutate() }
			>
				<ActionError
					error={ purge.error }
					onDismiss={ () => purge.reset() }
				/>
			</ConfirmDestructive>
		</Banner>
	);
}
