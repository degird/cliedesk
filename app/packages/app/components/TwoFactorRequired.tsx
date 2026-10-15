/**
 * Full-screen "Set up two-factor authentication" (SEC-01): shown when the boot payload says the user is blocked
 * (emergency.twoFactor.blocked) or any request answered 403 `cliedesk_2fa_required`. Cliedesk does not run 2FA
 * itself: the user sets it up with the site's 2FA plugin on their WordPress profile page.
 */
import { __ } from '@wordpress/i18n';
import { ShieldAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** The WordPress profile page (admin_url is not in the boot payload). */
export function wpProfileUrl(): string {
	return window.location.origin + '/wp-admin/profile.php';
}

/**
 * Page.
 */
export function TwoFactorRequired() {
	const heading = useRef< HTMLHeadingElement >( null );
	useEffect( () => {
		heading.current?.focus();
		document.title = __( 'Set up two-factor authentication', 'cliedesk' );
	}, [] );
	return (
		<main
			id="cliedesk-main"
			className="flex min-h-screen items-center justify-center bg-canvas p-6 text-fg"
		>
			<div className="flex max-w-lg flex-col items-center gap-4 rounded-xl border border-line bg-surface p-8 text-center shadow-1">
				<span
					aria-hidden="true"
					className="flex size-16 items-center justify-center rounded-full bg-warning-subtle text-warning"
				>
					<ShieldAlert size={ 32 } strokeWidth={ 1.75 } />
				</span>
				<h1
					ref={ heading }
					tabIndex={ -1 }
					className="text-2xl font-semibold outline-none"
				>
					{ __( 'Set up two-factor authentication', 'cliedesk' ) }
				</h1>
				<p className="text-fg-muted">
					{ __(
						'Your workspace requires two-factor authentication, and the time to set it up has run out. Set it up on your WordPress profile page with the site’s two-factor plugin, then come back and reload this page.',
						'cliedesk'
					) }
				</p>
				<div className="flex flex-wrap justify-center gap-3">
					<a
						href={ wpProfileUrl() }
						className="inline-flex h-(--cd-control-h) items-center rounded-md bg-accent px-(--cd-control-px) font-medium text-on-accent hover:bg-accent-hover"
					>
						{ __( 'Open my WordPress profile', 'cliedesk' ) }
					</a>
					<button
						type="button"
						onClick={ () => window.location.reload() }
						className="inline-flex h-(--cd-control-h) items-center rounded-md border border-line-strong bg-surface px-(--cd-control-px) font-medium text-fg hover:bg-sunken"
					>
						{ __( 'Reload', 'cliedesk' ) }
					</button>
				</div>
			</div>
		</main>
	);
}
