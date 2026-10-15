/**
 * Organizations from B2B plugins (CRM-35): the sources (WooCommerce billing company and plugin adapters), whether
 * their plugin is active, how many organizations each brought, and "Sync now" (a daily job also syncs).
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, Modal } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ReasonButton, whyDisabled } from '../components/DisabledReason';
import { ActionError, Muted } from '../inbox/components';
import { announceResult } from '../workspace/forms';
import { orgKeys } from './api';

interface OrgSource {
	key: string;
	label: string;
	active: boolean;
	organizations: number;
}

const KEY = [ 'organizations', 'sources' ] as const;

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.onClose Close.
 */
export default function OrgSourcesDialog( {
	onClose,
}: {
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: OrgSource[] } >(
					'organizations/sources',
					{ signal }
				)
			).data?.items ?? [],
	} );
	const sync = useMutation( {
		mutationFn: async () =>
			(
				await api.post< {
					organizations: number;
					members: number;
				} >( 'organizations/sources/sync' )
			).data,
		onSuccess: ( d ) => {
			announceResult(
				sprintf(
					/* translators: 1: organizations, 2: members. */
					__(
						'Synced %1$d organizations and %2$d members.',
						'cliedesk'
					),
					d?.organizations ?? 0,
					d?.members ?? 0
				)
			);
			void qc.invalidateQueries( { queryKey: orgKeys.all } );
		},
	} );
	const anyActive = ( q.data ?? [] ).some( ( s ) => s.active );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Organizations from plugins', 'cliedesk' ) }
			size="md"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Close', 'cliedesk' ) }
					</Button>
					{ can( 'cliedesk_edit_contacts' ) && (
						<ReasonButton
							variant="primary"
							// ADM-04: say which plugin is missing.
							reason={
								q.isSuccess
									? whyDisabled( {
											plugin: {
												name:
													q.data
														.map( ( s ) => s.label )
														.join( ' / ' ) ||
													'WooCommerce',
												active: anyActive,
											},
										} )
									: undefined
							}
							isDisabled={ ! anyActive }
							isLoading={ sync.isPending }
							onPress={ () => sync.mutate() }
						>
							{ __( 'Sync now', 'cliedesk' ) }
						</ReasonButton>
					) }
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<Muted>
					{ __(
						'Companies from B2B and shop plugins become organizations, with their customers as members. They sync every day. When a plugin is turned off, its organizations are hidden, not deleted.',
						'cliedesk'
					) }
				</Muted>
				<ActionError error={ sync.error } />
				<ul className="flex flex-col divide-y divide-line">
					{ ( q.data ?? [] ).map( ( s ) => (
						<li
							key={ s.key }
							className="flex items-center gap-2 py-2"
						>
							<span className="flex-1">{ s.label }</span>
							<span className="text-sm text-fg-muted">
								{ s.active
									? sprintf(
											/* translators: %d: number of organizations. */
											__(
												'Active · %d organizations',
												'cliedesk'
											),
											s.organizations
										)
									: __( 'Plugin not active', 'cliedesk' ) }
							</span>
						</li>
					) ) }
				</ul>
			</div>
		</Modal>
	);
}
