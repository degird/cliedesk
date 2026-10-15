/**
 * Settings → Team → Notifications: defaults for people who have not chosen, per event (in the app, by email, only
 * their own conversations), events locked to those defaults (APP-07), and the minutes before an unopened customer
 * message escalates (APP-13).
 *
 * - GET settings/notifications; PATCH settings/notifications {values: {defaults, locked_events, escalate_minutes}}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, LoadingRegion, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import {
	NOTIFY_CHANNELS,
	NOTIFY_EVENTS,
	normaliseNotifications,
	type Notifications,
	type NotifyEvent,
} from '../../team/api';
import { notifyChannelLabel, notifyEventLabel } from '../../team/labels';
import { announceResult } from '../../workspace/forms';

interface Draft {
	defaults: Notifications;
	locked: NotifyEvent[];
	minutes: string;
}

export default function NotificationsSection() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'notifications' ) );
	const [ draft, setDraft ] = useState< Draft | null >( null );
	const values = q.data?.values;
	const save = useMutation( {
		mutationFn: ( d: Draft ) =>
			api.patch( 'settings/notifications', {
				body: {
					values: {
						defaults: d.defaults,
						locked_events: d.locked,
						escalate_minutes: Number( d.minutes ) || 0,
					},
				},
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( null );
			announceResult( __( 'Notification settings saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'notifications' ],
			} );
		},
	} );
	if ( ! values ) {
		return <LoadingRegion />;
	}
	const d: Draft = draft ?? {
		defaults: normaliseNotifications(
			( values.defaults?.value ?? null ) as Parameters<
				typeof normaliseNotifications
			>[ 0 ]
		),
		locked: ( values.locked_events?.value ?? [] ) as NotifyEvent[],
		minutes: String( values.escalate_minutes?.value ?? 3 ),
	};
	const setEvent = (
		ev: NotifyEvent,
		patch: Partial< Notifications[ NotifyEvent ] >
	) =>
		setDraft( {
			...d,
			defaults: {
				...d.defaults,
				[ ev ]: { ...d.defaults[ ev ], ...patch },
			},
		} );
	return (
		<div className="flex flex-col gap-5">
			<ActionError error={ save.error } />
			<section
				aria-labelledby="cd-notify-defaults"
				className="flex flex-col gap-2"
			>
				<h2 id="cd-notify-defaults" className="font-semibold">
					{ __( 'Defaults for everyone', 'cliedesk' ) }
				</h2>
				<p className="text-sm text-fg-muted">
					{ __(
						'People who have not changed their own preferences get these. A locked event uses these values for everyone and cannot be changed in profiles.',
						'cliedesk'
					) }
				</p>
				<div className="overflow-x-auto rounded-lg border border-line bg-surface">
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ __( 'Notification defaults', 'cliedesk' ) }
						</caption>
						<thead className="border-b border-line text-fg-muted">
							<tr>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									{ __( 'Event', 'cliedesk' ) }
								</th>
								{ NOTIFY_CHANNELS.map( ( c ) => (
									<th
										key={ c }
										scope="col"
										className="px-3 py-2 text-center font-medium"
									>
										{ notifyChannelLabel( c ) }
									</th>
								) ) }
								<th
									scope="col"
									className="px-3 py-2 text-center font-medium"
								>
									{ __(
										'Only their conversations',
										'cliedesk'
									) }
								</th>
								<th
									scope="col"
									className="px-3 py-2 text-center font-medium"
								>
									{ __( 'Locked', 'cliedesk' ) }
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-line">
							{ NOTIFY_EVENTS.map( ( ev ) => (
								<tr key={ ev }>
									<th
										scope="row"
										className="px-3 py-2 text-start font-normal"
									>
										{ notifyEventLabel( ev ) }
									</th>
									{ NOTIFY_CHANNELS.map( ( c ) => (
										<td
											key={ c }
											className="px-3 py-2 text-center"
										>
											<Checkbox
												isSelected={
													d.defaults[ ev ][ c ]
												}
												onChange={ ( on ) =>
													setEvent( ev, {
														[ c ]: on,
													} )
												}
											>
												<span className="sr-only">
													{ sprintf(
														/* translators: 1: event, 2: channel. */
														__(
															'%1$s: %2$s',
															'cliedesk'
														),
														notifyEventLabel( ev ),
														notifyChannelLabel( c )
													) }
												</span>
											</Checkbox>
										</td>
									) ) }
									<td className="px-3 py-2 text-center">
										<Checkbox
											isSelected={
												d.defaults[ ev ].scope ===
												'mine'
											}
											onChange={ ( on ) =>
												setEvent( ev, {
													scope: on ? 'mine' : 'all',
												} )
											}
										>
											<span className="sr-only">
												{ sprintf(
													/* translators: %s: event. */
													__(
														'%s: only conversations assigned to the person',
														'cliedesk'
													),
													notifyEventLabel( ev )
												) }
											</span>
										</Checkbox>
									</td>
									<td className="px-3 py-2 text-center">
										<Checkbox
											isSelected={ d.locked.includes(
												ev
											) }
											onChange={ ( on ) =>
												setDraft( {
													...d,
													locked: on
														? [ ...d.locked, ev ]
														: d.locked.filter(
																( x ) =>
																	x !== ev
															),
												} )
											}
										>
											<span className="sr-only">
												{ sprintf(
													/* translators: %s: event. */
													__( 'Lock %s', 'cliedesk' ),
													notifyEventLabel( ev )
												) }
											</span>
										</Checkbox>
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
			</section>
			<TextField
				label={ __(
					'Escalate unopened customer messages after (minutes)',
					'cliedesk'
				) }
				description={ __(
					'The assignee is notified first, then the online team, then every online agent. 0 turns it off.',
					'cliedesk'
				) }
				type="number"
				value={ d.minutes }
				onChange={ ( minutes ) => setDraft( { ...d, minutes } ) }
				className="max-w-xs"
			/>
			<div>
				<Button
					variant="primary"
					isDisabled={ ! draft }
					isLoading={ save.isPending }
					onPress={ () => draft && save.mutate( draft ) }
				>
					{ __( 'Save', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}
