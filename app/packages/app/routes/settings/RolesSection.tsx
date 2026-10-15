/**
 * Settings → Team & roles → Roles (TEAM-11, TEAM-12): the roles with their people counts, reset for default roles,
 * the comparison matrix and profile locks. Custom roles (TEAM-13) are Pro: "Create role" fills `team.roles.create`;
 * money limits, approvals and temporary support access are Pro settings pages (their badges at the bottom).
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, ConfirmDestructive, LoadingRegion, Slot } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { announceResult } from '../../workspace/forms';
import {
	capabilitiesQuery,
	rolesQuery,
	teamKeys,
	type Role,
} from '../../team/api';
import { Badge, QueryError, serverMessage } from '../../team/components';
import { roleName, roleTypeLabel } from '../../team/labels';
import { rolePath } from '../../team/paths';
import { RoleMatrix } from '../../team/RoleMatrix';
import { ProfileLocksSettings } from '../../team/TeamSettings';

/**
 * Roles section.
 */
export default function RolesSection() {
	const qc = useQueryClient();
	const [ confirm, setConfirm ] = useState< Role | null >( null );
	const q = useQuery( rolesQuery() );
	const caps = useQuery( capabilitiesQuery() );
	const showLocks =
		can( 'cliedesk_manage_settings' ) && can( 'cliedesk_manage_roles' );

	const act = useMutation( {
		mutationFn: ( role: Role ) =>
			api.post( `roles/${ role.key }/reset`, { body: {} } ),
		onSuccess: ( _r, role ) => {
			setConfirm( null );
			announceResult(
				sprintf(
					/* translators: %s: role name. */
					__( 'Role “%s” reset to its defaults.', 'cliedesk' ),
					role.name
				)
			);
			void qc.invalidateQueries( { queryKey: teamKeys.roles } );
		},
	} );

	if ( q.isPending ) {
		return <LoadingRegion label={ __( 'Loading roles…', 'cliedesk' ) } />;
	}
	if ( q.isError ) {
		return (
			<QueryError
				title={ __( 'Could not load the roles', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const roles = q.data.roles;

	return (
		<div className="flex flex-col gap-6">
			<Slot
				name="team.roles.create"
				fillProps={ { roles } }
				className="flex flex-wrap items-center justify-end gap-2"
			/>
			<div className="overflow-x-auto rounded-lg border border-line bg-surface">
				<table className="w-full text-start text-base">
					<caption className="sr-only">
						{ __( 'Roles', 'cliedesk' ) }
					</caption>
					<thead className="border-b border-line text-sm text-fg-muted">
						<tr>
							<th
								scope="col"
								className="px-4 py-2 text-start font-medium"
							>
								{ __( 'Role', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-4 py-2 text-start font-medium"
							>
								{ __( 'Type', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-4 py-2 text-start font-medium"
							>
								{ __( 'People', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-4 py-2 text-start font-medium"
							>
								{ __( 'Permissions', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-4 py-2 text-end font-medium"
							>
								<span className="sr-only">
									{ __( 'Actions', 'cliedesk' ) }
								</span>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{ roles.map( ( r ) => (
							<tr key={ r.key }>
								<th
									scope="row"
									className="px-4 py-2 text-start font-medium"
								>
									<Link
										to={ rolePath( r.key ) }
										className="text-accent-fg underline-offset-2 hover:underline"
									>
										<bdi>{ roleName( r.key, roles ) }</bdi>
									</Link>
								</th>
								<td className="px-4 py-2">
									<Badge
										tone={
											r.type === 'custom'
												? 'accent'
												: 'neutral'
										}
									>
										{ roleTypeLabel( r.type ) }
									</Badge>
								</td>
								<td className="px-4 py-2 text-fg-muted">
									{ sprintf(
										/* translators: %d: number of people. */
										_n(
											'%d person',
											'%d people',
											r.userCount,
											'cliedesk'
										),
										r.userCount
									) }
								</td>
								<td className="px-4 py-2 text-fg-muted">
									{ r.type === 'owner'
										? __( 'All', 'cliedesk' )
										: r.caps.length }
								</td>
								<td className="px-4 py-2">
									<div className="flex justify-end gap-1">
										{ r.resettable && (
											<Button
												size="sm"
												variant="ghost"
												onPress={ () =>
													setConfirm( r )
												}
												aria-label={ sprintf(
													/* translators: %s: role name. */
													__(
														'Reset %s to defaults',
														'cliedesk'
													),
													r.name
												) }
											>
												{ __( 'Reset', 'cliedesk' ) }
											</Button>
										) }
									</div>
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			</div>

			<section
				aria-labelledby="cd-roles-compare"
				className="flex flex-col gap-2"
			>
				<h2 id="cd-roles-compare" className="text-lg font-semibold">
					{ __( 'Compare roles', 'cliedesk' ) }
				</h2>
				<p className="text-sm text-fg-muted">
					{ __(
						'Use the arrow keys to move through the table.',
						'cliedesk'
					) }
				</p>
				{ caps.isError && (
					<QueryError
						title={ __(
							'Could not load the permissions',
							'cliedesk'
						) }
						error={ caps.error }
						onRetry={ () => void caps.refetch() }
					/>
				) }
				{ caps.data && (
					<RoleMatrix roles={ roles } capabilities={ caps.data } />
				) }
			</section>

			{ showLocks && <ProfileLocksSettings roles={ roles } /> }

			{ /* Pro settings pages under Team & roles; only their PRO badges show here without Pro. */ }
			<Slot name="team.approvals" />
			<Slot name="team.money_limits" />
			<Slot name="team.support_access" />

			<ConfirmDestructive
				isOpen={ !! confirm }
				onOpenChange={ ( open ) => {
					if ( ! open ) {
						setConfirm( null );
						act.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: role name. */
					__( 'Reset “%s” to its defaults?', 'cliedesk' ),
					confirm?.name ?? ''
				) }
				description={ __(
					'Its permissions go back to what Cliedesk ships with. People keep the role.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Reset role', 'cliedesk' ) }
				isLoading={ act.isPending }
				onConfirm={ () => {
					if ( confirm ) {
						act.mutate( confirm );
					}
				} }
			>
				{ act.isError && (
					<p role="alert" className="text-danger">
						{ serverMessage( act.error ) }
					</p>
				) }
			</ConfirmDestructive>
		</div>
	);
}
