import { Link, useRouterState } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import { PageHeader } from '../components/PageHeader';

/**
 * Client Not Found page (§3.12). Same page for "no access", so existence is never revealed.
 */
export function NotFound() {
	const path = useRouterState( { select: ( s ) => s.location.pathname } );
	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-4">
			<PageHeader title={ __( 'Not found or no access', 'cliedesk' ) } />
			<p className="text-fg-muted">
				{ __(
					'This page does not exist, or your account cannot open it.',
					'cliedesk'
				) }
			</p>
			<p>
				<code className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-sm break-all">
					{ path }
				</code>
			</p>
			<p>
				<Link
					to="/"
					className="font-medium text-accent-fg underline underline-offset-2"
				>
					{ __( 'Go to Home', 'cliedesk' ) }
				</Link>
			</p>
		</div>
	);
}
