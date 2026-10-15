/**
 * The bell's panel (APP-10), loaded on first open: All / Unread, "Mark all as read", the list, and the switch for
 * desktop notifications (APP-08).
 */
import { Button, Select, Switch, UnstyledButton, cx } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { fullTime, relativeTime } from '../inbox/labels';
import {
	isMuted,
	setMuted,
	setSoundChoice,
	soundChoice,
	type SoundChoice,
} from './alerts';
import type { NotificationItem } from './NotificationBell';

/**
 * APP-08: sound on this device (assigned chats, everything, off) and mute.
 */
export function SoundControls() {
	const [ choice, setChoice ] = useState< SoundChoice >( soundChoice );
	const [ muted, setMute ] = useState( isMuted );
	return (
		<div className="flex flex-wrap items-end gap-3">
			<Select
				label={ __( 'Sound on this device', 'cliedesk' ) }
				value={ choice }
				onChange={ ( v ) => {
					setSoundChoice( v as SoundChoice );
					setChoice( v as SoundChoice );
				} }
				options={ [
					{
						id: 'assigned',
						label: __( 'For chats assigned to me', 'cliedesk' ),
					},
					{
						id: 'all',
						label: __( 'For every notification', 'cliedesk' ),
					},
					{ id: 'off', label: __( 'Off', 'cliedesk' ) },
				] }
			/>
			<Switch
				isSelected={ muted }
				onChange={ ( on ) => {
					setMuted( on );
					setMute( on );
				} }
			>
				{ __( 'Mute', 'cliedesk' ) }
			</Switch>
		</div>
	);
}

export interface NotificationPanelProps {
	items: NotificationItem[];
	unread: number;
	onMarkAll: () => void;
	onOpen: ( n: NotificationItem ) => void;
	/** Shown while the browser has not been asked yet. */
	onAskPermission?: () => void;
}

/**
 * Panel.
 *
 * @param props Props.
 */
export default function NotificationPanel( {
	items,
	unread,
	onMarkAll,
	onOpen,
	onAskPermission,
}: NotificationPanelProps ) {
	const [ unreadOnly, setUnreadOnly ] = useState( false );
	const shown = items.filter( ( n ) => ! unreadOnly || ! n.read );
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<h2 className="me-auto font-semibold">
					{ __( 'Notifications', 'cliedesk' ) }
				</h2>
				<Button
					size="sm"
					variant="ghost"
					aria-pressed={ unreadOnly }
					onPress={ () => setUnreadOnly( ( x ) => ! x ) }
				>
					{ __( 'Unread only', 'cliedesk' ) }
				</Button>
				<Button
					size="sm"
					variant="ghost"
					isDisabled={ unread === 0 }
					onPress={ onMarkAll }
				>
					{ __( 'Mark all as read', 'cliedesk' ) }
				</Button>
			</div>
			<SoundControls />
			{ onAskPermission && (
				<Button
					size="sm"
					variant="secondary"
					onPress={ onAskPermission }
				>
					{ __( 'Show desktop notifications', 'cliedesk' ) }
				</Button>
			) }
			{ shown.length === 0 ? (
				<p className="py-6 text-center text-sm text-fg-muted">
					{ unreadOnly
						? __( 'No unread notifications.', 'cliedesk' )
						: __( 'No notifications yet.', 'cliedesk' ) }
				</p>
			) : (
				<ul className="-mx-2 flex max-h-[60vh] flex-col overflow-y-auto">
					{ shown.map( ( n ) => (
						<li key={ n.id }>
							<UnstyledButton
								className={ cx(
									'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-start outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus',
									! n.read && 'bg-accent-subtle'
								) }
								onPress={ () => onOpen( n ) }
							>
								<span className="text-sm font-medium">
									{ ! n.read && (
										<span className="sr-only">
											{ __(
												'Unread:',
												'cliedesk'
											) }{ ' ' }
										</span>
									) }
									{ n.title }
								</span>
								{ n.excerpt && (
									<span className="line-clamp-2 text-sm text-fg-muted">
										{ n.excerpt }
									</span>
								) }
								<time
									dateTime={ n.createdAt }
									title={ fullTime( n.createdAt ) }
									className="text-xs text-fg-muted"
								>
									{ relativeTime( n.createdAt ) }
								</time>
							</UnstyledButton>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}
