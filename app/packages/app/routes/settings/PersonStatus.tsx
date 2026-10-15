/**
 * RTE-30: a supervisor (for their team members) or an admin switches assign-only mode (no routed conversations;
 * manual assignment still works). Changing someone else's status (RTE-35) is Pro (the `team.person.status` slot).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Switch, toast } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { serverMessage } from '../../team/components';

/**
 * Assign-only switch (RTE-30).
 *
 * @param props        Props.
 * @param props.userId Person.
 */
export function PersonAssignOnly( { userId }: { userId: number } ) {
	const qc = useQueryClient();
	const key = [ 'people', userId, 'routing' ];
	const q = useQuery( {
		queryKey: key,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { assignOnly: boolean } >(
					`people/${ userId }/routing`,
					{ signal }
				)
			).data,
	} );
	const set = useMutation( {
		mutationFn: ( assignOnly: boolean ) =>
			api.put< { assignOnly: boolean } >( `people/${ userId }/routing`, {
				body: { assignOnly },
			} ),
		onSuccess: ( r ) => qc.setQueryData( key, r.data ),
		onError: ( e ) =>
			toast( { tone: 'danger', title: serverMessage( e ) } ),
	} );
	if ( ! q.data ) {
		return null;
	}
	return (
		<Switch
			isSelected={ q.data.assignOnly }
			isDisabled={ set.isPending }
			onChange={ ( on ) => set.mutate( on ) }
		>
			{ __( 'Assign only (no routed conversations)', 'cliedesk' ) }
		</Switch>
	);
}
