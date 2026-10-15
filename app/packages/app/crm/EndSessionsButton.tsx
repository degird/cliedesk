/**
 * "End all sessions" on a contact (SEC-10): signs the customer out of the chat widget and the portal on every
 * device and ends their email links at once (e.g. after an account compromise). POST contacts/{id}/sessions/end.
 */
import { api, useMutation } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { announceResult } from '../workspace/forms';

export function EndSessionsButton( { contactId }: { contactId: number } ) {
	const end = useMutation( {
		mutationFn: async () =>
			(
				await api.post< { ended: number } >(
					`contacts/${ contactId }/sessions/end`
				)
			).data,
		onSuccess: ( d ) => {
			const n = d?.ended ?? 0;
			announceResult(
				sprintf(
					/* translators: %d: number of sessions and links ended. */
					_n(
						'%d session ended.',
						'%d sessions ended.',
						n,
						'cliedesk'
					),
					n
				)
			);
		},
		onError: () =>
			announceResult( __( 'Sessions could not be ended.', 'cliedesk' ) ),
	} );
	return (
		<Button isLoading={ end.isPending } onPress={ () => end.mutate() }>
			{ __( 'End all sessions', 'cliedesk' ) }
		</Button>
	);
}
