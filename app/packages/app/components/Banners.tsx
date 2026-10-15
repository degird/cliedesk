import { can, getBoot } from '@cliedesk/data';
import { Banner, SafeModeBanner } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState, useSyncExternalStore } from 'react';
import { safeModeStore } from '../state';
import { wpProfileUrl } from './TwoFactorRequired';

/**
 * Local date of an ISO / UTC timestamp.
 *
 * @param value Timestamp.
 */
function dateOf( value: string ): string {
	let iso = value.trim().replace( ' ', 'T' );
	if ( /^\d{4}-\d{2}-\d{2}$/.test( iso ) ) {
		iso += 'T00:00:00Z';
	} else if ( /T\d{2}:\d{2}(:\d{2})?$/.test( iso ) ) {
		iso += 'Z';
	}
	const d = new Date( iso );
	return Number.isNaN( d.getTime() ) ? value : d.toLocaleDateString();
}

/**
 * Kill-switch and emergency banners under the top bar (§5.1): shown to all users, not dismissible, stacked.
 */
export function Banners() {
	const boot = getBoot();
	const store = safeModeStore();
	const safeMode = useSyncExternalStore(
		store.subscribe,
		store.get,
		store.get
	);
	const isAdmin = can( 'cliedesk_manage_settings' );
	const tf = boot.emergency.twoFactor;
	const [ hide2fa, setHide2fa ] = useState( false );
	const [ hideUpdate, setHideUpdate ] = useState( false );
	const items = [];
	// The server sends this only to people who can update plugins (boot caps list Cliedesk caps only).
	const update = boot.emergency.securityUpdate;
	if ( update && ! hideUpdate ) {
		items.push(
			<Banner
				key="security-update"
				tone="danger"
				role="alert"
				title={ sprintf(
					/* translators: 1: version, 2: notice from the release. */
					__(
						'Cliedesk %1$s is a security release. %2$s',
						'cliedesk'
					),
					update.version,
					update.notice
				) }
				onDismiss={ () => setHideUpdate( true ) }
				actions={
					<a
						href={
							window.location.origin + '/wp-admin/plugins.php'
						}
						className="font-medium text-accent-fg underline underline-offset-2"
					>
						{ __( 'Update on the Plugins page', 'cliedesk' ) }
					</a>
				}
			/>
		);
	}
	// `required` in the boot payload already means "required and not set up yet".
	if ( tf?.required && tf.configured !== true && ! tf.blocked && ! hide2fa ) {
		const grace = tf.graceUntil;
		items.push(
			<Banner
				key="2fa"
				tone="warning"
				title={ __( 'Set up two-factor authentication', 'cliedesk' ) }
				onDismiss={ () => setHide2fa( true ) }
				actions={
					<a
						href={ wpProfileUrl() }
						className="font-medium text-accent-fg underline underline-offset-2"
					>
						{ __( 'Open my WordPress profile', 'cliedesk' ) }
					</a>
				}
			>
				{ grace
					? sprintf(
							/* translators: %s: date. */
							__(
								'Your workspace requires it. Set it up before %s or you will not be able to use the helpdesk.',
								'cliedesk'
							),
							dateOf( grace )
						)
					: __( 'Your workspace requires it.', 'cliedesk' ) }
			</Banner>
		);
	}
	if ( safeMode ) {
		items.push(
			<SafeModeBanner
				key="safe"
				action={
					isAdmin ? (
						<Link
							to="/settings/developer/health"
							className="font-medium text-accent-fg underline underline-offset-2"
						>
							{ __( 'Review in Setup Health', 'cliedesk' ) }
						</Link>
					) : undefined
				}
			/>
		);
	}
	if ( boot.emergency.automationPaused ) {
		items.push(
			<Banner
				key="auto"
				tone="warning"
				title={ __( 'Automation paused', 'cliedesk' ) }
			>
				{ __(
					'Automations and scheduled actions are not running.',
					'cliedesk'
				) }
			</Banner>
		);
	}
	if ( boot.emergency.lockdown ) {
		items.push(
			<Banner
				key="lock"
				tone="danger"
				title={ __( 'Lockdown on', 'cliedesk' ) }
			>
				{ __(
					'An administrator turned on emergency lockdown. Only Owners and Admins can use the helpdesk until it is turned off.',
					'cliedesk'
				) }
				{ boot.emergency.lockdownReason ? (
					<span className="mt-1 block">
						{ sprintf(
							/* translators: %s: reason given for the lockdown. */
							__( 'Reason: %s', 'cliedesk' ),
							boot.emergency.lockdownReason
						) }
					</span>
				) : null }
			</Banner>
		);
	}
	for ( const constant of boot.emergency.constants ) {
		items.push(
			<Banner
				key={ constant }
				tone="warning"
				title={ sprintf(
					/* translators: %s: PHP constant name. */
					__(
						'Emergency setting active: %s in wp-config.php',
						'cliedesk'
					),
					constant
				) }
			>
				{ __(
					'Remove the constant from wp-config.php to return to normal operation.',
					'cliedesk'
				) }
			</Banner>
		);
	}
	if ( ! items.length ) {
		return null;
	}
	return (
		<section
			aria-label={ __( 'Site status', 'cliedesk' ) }
			className="flex flex-col gap-2 px-4 pt-3"
		>
			{ items }
		</section>
	);
}
