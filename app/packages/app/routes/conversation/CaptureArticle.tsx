/**
 * "Create article" (KB-53): a help-article draft for review from this conversation, or a proposed update when a
 * similar article exists.
 */
import { api, useMutation } from '@cliedesk/data';
import { toast } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { serverMessage } from '../../team/components';

/**
 * "Create article" action (the conversation's More menu).
 *
 * @param conversationId Conversation.
 */
export function useCaptureArticle( conversationId: number ) {
	return useMutation( {
		mutationFn: () =>
			api.post< { proposal: boolean; editUrl: string } >(
				`conversations/${ conversationId }/article`,
				{ body: {} }
			),
		onSuccess: ( r ) =>
			toast( {
				tone: 'success',
				title: r.data?.proposal
					? __(
							'A similar article exists: a proposed update is waiting for review.',
							'cliedesk'
						)
					: __( 'Article draft created for review.', 'cliedesk' ),
				action: r.data?.editUrl
					? {
							label: __( 'Open draft', 'cliedesk' ),
							onAction: () =>
								window.open(
									r.data?.editUrl,
									'_blank',
									'noopener'
								),
						}
					: undefined,
			} ),
		onError: ( e ) =>
			toast( { tone: 'danger', title: serverMessage( e ) } ),
	} );
}
