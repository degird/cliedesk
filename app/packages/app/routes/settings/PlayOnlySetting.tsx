/**
 * Role screen: "Works through Play mode only" (INB-26). Adds or removes the role in the workspace setting
 * `inbox.play_only_roles` (PATCH settings/inbox, cliedesk_manage_roles). People with the role see the Play card
 * instead of the conversation list.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Switch, announce } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';

// Reading and saving settings needs cliedesk_manage_settings; this setting also needs cliedesk_manage_roles.
const allowed = () =>
	can( 'cliedesk_manage_settings' ) && can( 'cliedesk_manage_roles' );

/**
 * Switch for one role.
 *
 * @param props         Props.
 * @param props.roleKey Role.
 */
export function PlayOnlySetting( { roleKey }: { roleKey: string } ) {
	const qc = useQueryClient();
	const q = useQuery( {
		...settingsQuery( 'inbox' ),
		enabled: allowed(),
	} );
	const value = q.data?.values?.play_only_roles?.value;
	const roles = Array.isArray( value ) ? value.map( String ) : [];
	const save = useMutation( {
		mutationFn: ( next: string[] ) =>
			api.patch( 'settings/inbox', {
				body: { values: { play_only_roles: next } },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: ( _r, next ) => {
			announce(
				next.includes( roleKey )
					? __(
							'This role now works through Play mode only.',
							'cliedesk'
						)
					: __(
							'This role can use the conversation list again.',
							'cliedesk'
						)
			);
			void qc.invalidateQueries( { queryKey: [ 'settings', 'inbox' ] } );
		},
	} );
	if ( ! allowed() || ! q.data ) {
		return null;
	}
	const on = roles.includes( roleKey );
	return (
		<section
			aria-labelledby="cd-role-play"
			className="flex flex-col gap-2 border-t border-line pt-6"
		>
			<h2 id="cd-role-play" className="text-base font-semibold">
				{ __( 'Play mode', 'cliedesk' ) }
			</h2>
			<ActionError error={ save.error } />
			<Switch
				isSelected={ on }
				isDisabled={ save.isPending }
				onChange={ ( v ) =>
					save.mutate(
						v
							? [ ...roles, roleKey ]
							: roles.filter( ( r ) => r !== roleKey )
					)
				}
			>
				{ __( 'Works through Play mode only', 'cliedesk' ) }
			</Switch>
			<p className="text-sm text-fg-muted">
				{ __(
					'People with this role take conversations one at a time in the order of the view, without the list. Use it for guided work with no cherry-picking.',
					'cliedesk'
				) }
			</p>
		</section>
	);
}
