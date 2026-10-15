/**
 * End a chat (RTE-39): the conversation continues by email (when the visitor's email is known) and is routed again.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { toast } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { conversationKeys } from '../../inbox/api';
import { serverMessage } from '../../team/components';

/**
 * "End chat" action (the conversation's More menu).
 *
 * @param conversationId Conversation.
 */
export function useEndChat( conversationId: number ) {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: () =>
			api.post( `conversations/${ conversationId }/end-chat`, {
				body: {},
			} ),
		onSuccess: () => {
			toast( {
				tone: 'success',
				title: __( 'Chat ended. It continues by email.', 'cliedesk' ),
			} );
			void qc.invalidateQueries( {
				queryKey: conversationKeys.all( conversationId ),
			} );
		},
		onError: ( e ) =>
			toast( { tone: 'danger', title: serverMessage( e ) } ),
	} );
}
