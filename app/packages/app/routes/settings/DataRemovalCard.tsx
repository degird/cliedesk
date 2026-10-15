/**
 * Settings → Privacy & security → Security → Export or delete all data (ADM-20, ADM-13): an admin can export
 * everything (a ZIP link by email). Deactivating or deleting the plugin keeps all
 * data. Deleting it needs a WordPress administrator to type the site name; it happens after 14 days, with reminders,
 * and can be cancelled until then. Or the admin chooses "when the plugin is deleted": nothing is deleted now, and
 * deleting the plugin later removes all data (cliedesk_data_removal = on_uninstall).
 *
 * - GET data-removal → {scheduled, dueAt, onUninstall, siteName}; POST data-removal {confirm, when}; DELETE data-removal.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	ConfirmDestructive,
	RadioGroup,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface State {
	scheduled: boolean;
	dueAt: string | null;
	onUninstall: boolean;
	siteName: string;
}

const KEY = [ 'data-removal' ];

export function DataRemovalCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< State >( 'data-removal', { signal } ) ).data,
	} );
	const [ asking, setAsking ] = useState( false );
	const [ typed, setTyped ] = useState( '' );
	const [ when, setWhen ] = useState< 'after_wait' | 'on_uninstall' >(
		'after_wait'
	);
	const done = ( message: string ) => {
		announceResult( message );
		void qc.invalidateQueries( { queryKey: KEY } );
	};
	const schedule = useMutation( {
		mutationFn: () =>
			api.post( 'data-removal', { body: { confirm: typed, when } } ),
		onSuccess: () => {
			setAsking( false );
			setTyped( '' );
			done( __( 'Deletion scheduled.', 'cliedesk' ) );
		},
	} );
	const exportAll = useMutation( {
		mutationFn: () => api.post( 'data-export' ),
		onSuccess: () =>
			announceResult(
				__(
					'Export started. You will get an email with a download link.',
					'cliedesk'
				)
			),
	} );
	const cancel = useMutation( {
		mutationFn: () => api.del( 'data-removal' ),
		onSuccess: () => done( __( 'Deletion cancelled.', 'cliedesk' ) ),
	} );
	const s = q.data;
	if ( ! s ) {
		return null;
	}
	return (
		<section
			aria-labelledby="cd-data-removal"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-data-removal" className="font-semibold">
				{ __( 'Delete all data', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Deactivating or deleting the plugin keeps all data. To delete every conversation, contact, setting and file, a WordPress administrator types the site name; deletion happens after 14 days and can be cancelled until then.',
					'cliedesk'
				) }
			</Muted>
			<Button
				className="self-start"
				isLoading={ exportAll.isPending }
				onPress={ () => exportAll.mutate() }
			>
				{ __( 'Export all data', 'cliedesk' ) }
			</Button>
			<ActionError error={ exportAll.error ?? cancel.error } />
			{ s.onUninstall && (
				<Banner
					tone="warning"
					title={ __(
						'All data will be deleted when the plugin is deleted',
						'cliedesk'
					) }
				>
					<Button
						variant="primary"
						isLoading={ cancel.isPending }
						onPress={ () => cancel.mutate() }
					>
						{ __( 'Cancel deletion', 'cliedesk' ) }
					</Button>
				</Banner>
			) }
			{ ! s.onUninstall &&
				( s.scheduled ? (
					<Banner
						tone="danger"
						title={ sprintf(
							/* translators: %s: date. */
							__( 'All data will be deleted on %s', 'cliedesk' ),
							( s.dueAt ?? '' ).slice( 0, 10 )
						) }
					>
						<Button
							variant="primary"
							isLoading={ cancel.isPending }
							onPress={ () => cancel.mutate() }
						>
							{ __( 'Cancel deletion', 'cliedesk' ) }
						</Button>
					</Banner>
				) : (
					<Button
						variant="danger"
						className="self-start"
						onPress={ () => setAsking( true ) }
					>
						{ __( 'Delete all data…', 'cliedesk' ) }
					</Button>
				) ) }
			<ConfirmDestructive
				isOpen={ asking }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setAsking( false );
						schedule.reset();
					}
				} }
				title={ __( 'Delete all Cliedesk data?', 'cliedesk' ) }
				description={ __(
					'Choose when. Admins get an email and can cancel until the data is gone.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Confirm', 'cliedesk' ) }
				isLoading={ schedule.isPending }
				onConfirm={ () => schedule.mutate() }
			>
				<RadioGroup
					label={ __( 'Delete the data', 'cliedesk' ) }
					value={ when }
					onChange={ ( v ) =>
						setWhen(
							v === 'on_uninstall' ? 'on_uninstall' : 'after_wait'
						)
					}
					options={ [
						{
							id: 'after_wait',
							label: __(
								'In 14 days (with reminders)',
								'cliedesk'
							),
						},
						{
							id: 'on_uninstall',
							label: __(
								'When the plugin is deleted (deactivating still keeps it)',
								'cliedesk'
							),
						},
					] }
				/>
				<TextField
					label={ sprintf(
						/* translators: %s: site name. */
						__( 'Type “%s” to confirm', 'cliedesk' ),
						s.siteName
					) }
					value={ typed }
					onChange={ setTyped }
				/>
				<ActionError error={ schedule.error } />
			</ConfirmDestructive>
		</section>
	);
}
