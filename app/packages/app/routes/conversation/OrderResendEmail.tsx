/**
 * "Resend email" on an order in the Orders card (COM-11, COM-34 Free): choose the order confirmation, invoice,
 * shipped or download email, see the preview (which email, to whom) and confirm. WooCommerce sends it; the order
 * gets a private note and the conversation an event. Lazy: loaded when an agent opens it.
 *
 * - POST orders/emails {orderId, conversationId, email, preview?}; needs `cliedesk_run_commerce_actions`.
 */
import { useQueryClient } from '@cliedesk/data';
import { Button, Select } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { PreviewAction } from '../../crm/CommercePreview';

/**
 * Resend form.
 *
 * @param props                Props.
 * @param props.orderId        Order id.
 * @param props.conversationId Conversation.
 * @param props.onClose        Close the form.
 */
export default function OrderResendEmail( {
	orderId,
	conversationId,
	onClose,
}: {
	orderId: string;
	conversationId: number;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ email, setEmail ] = useState( 'confirmation' );
	return (
		<div className="flex flex-col gap-2 pt-2">
			<Select
				label={ __( 'Email to resend', 'cliedesk' ) }
				value={ email }
				onChange={ setEmail }
				options={ [
					{
						id: 'confirmation',
						label: __( 'Order confirmation', 'cliedesk' ),
					},
					{ id: 'invoice', label: __( 'Invoice', 'cliedesk' ) },
					{
						id: 'shipped',
						label: __( 'Shipped (order complete)', 'cliedesk' ),
					},
					{
						id: 'download',
						label: __( 'Download links', 'cliedesk' ),
					},
				] }
			/>
			<PreviewAction
				key={ email }
				label={ __( 'Preview', 'cliedesk' ) }
				path="orders/emails"
				body={ {
					orderId: Number( orderId ),
					conversationId,
					email,
				} }
				done={ __( 'Email resent.', 'cliedesk' ) }
				onDone={ () => {
					void qc.invalidateQueries( {
						queryKey: [ 'conversation', conversationId ],
					} );
					onClose();
				} }
			/>
			<div>
				<Button size="sm" variant="ghost" onPress={ onClose }>
					{ __( 'Close', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}
