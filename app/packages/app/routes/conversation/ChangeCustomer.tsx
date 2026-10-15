/**
 * Change the customer of a conversation (CRM-06, CNV-10): pick another contact, for example when a shared address
 * (a team mailbox, a family phone) wrote and the speaking person is someone else. POST
 * conversations/{id}/requester {contactId, keepAsCc}; audited, one timeline event. Loaded on demand.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, Modal } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ContactPicker, type PickedItem } from '../../crm/components';
import type { Conversation } from '../../inbox/api';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';
import { afterChange, mergeDetail } from './shared';

/**
 * Dialog.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 * @param props.onClose      Close.
 */
export default function ChangeCustomerDialog( {
	conversation: c,
	onClose,
}: {
	conversation: Conversation;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ picked, setPicked ] = useState< PickedItem | null >( null );
	const [ keepAsCc, setKeepAsCc ] = useState( true );
	const save = useMutation( {
		mutationFn: ( contactId: number ) =>
			api.post< Conversation >( `conversations/${ c.id }/requester`, {
				body: { contactId, keepAsCc },
			} ),
		onSuccess: ( r ) => {
			mergeDetail( qc, c.id, r.data );
			afterChange( qc, c.id );
			announceResult(
				sprintf(
					/* translators: %s: contact name. */
					__( 'The customer is now %s.', 'cliedesk' ),
					picked?.label ?? ''
				)
			);
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			size="sm"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Change customer', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isDisabled={ ! picked }
						isLoading={ save.isPending }
						onPress={ () => picked && save.mutate( picked.id ) }
					>
						{ __( 'Change customer', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<ActionError
					error={ save.error }
					onDismiss={ () => save.reset() }
				/>
				<ContactPicker
					exclude={ [ c.requesterId ] }
					value={ picked }
					onChange={ setPicked }
				/>
				<Checkbox isSelected={ keepAsCc } onChange={ setKeepAsCc }>
					{ __( 'Keep the current customer as a CC', 'cliedesk' ) }
				</Checkbox>
			</div>
		</Modal>
	);
}
