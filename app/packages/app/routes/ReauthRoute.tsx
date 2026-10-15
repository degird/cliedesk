import { __ } from '@wordpress/i18n';
import { useEffect } from 'react';

/**
 * `_reauth` (bare layout): tells the opener or parent tab (same origin only) that sign-in finished, then closes
 * when it is a pop-up. The server also serves a minimal static page for this path; this route covers the case
 * where the shell itself is served.
 */
export default function ReauthRoute() {
	useEffect( () => {
		const target =
			window.opener ??
			( window.parent !== window ? window.parent : null );
		if ( target ) {
			try {
				target.postMessage(
					{ type: 'cliedesk:reauth' },
					window.location.origin
				);
			} catch {
				// Cross-origin opener: nothing to notify.
			}
			if ( window.opener ) {
				window.close();
			}
		}
	}, [] );
	return (
		<div className="flex max-w-md flex-col gap-2 text-center">
			<h1 tabIndex={ -1 } className="text-2xl font-semibold">
				{ __( 'You are signed in', 'cliedesk' ) }
			</h1>
			<p className="text-fg-muted">
				{ __(
					'You can close this window and continue in Cliedesk.',
					'cliedesk'
				) }
			</p>
		</div>
	);
}
