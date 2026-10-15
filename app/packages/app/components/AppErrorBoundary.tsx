import { __ } from '@wordpress/i18n';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * App-level boundary around the router: full-screen message + Reload (§4.11).
 */
export class AppErrorBoundary extends Component<
	{ children: ReactNode },
	{ error: Error | null }
> {
	override state: { error: Error | null } = { error: null };

	static getDerivedStateFromError( error: Error ) {
		return { error };
	}

	override componentDidCatch( error: Error, info: ErrorInfo ) {
		// eslint-disable-next-line no-console
		console.error( '[cliedesk] app crashed', error, info.componentStack );
	}

	override render() {
		if ( ! this.state.error ) {
			return this.props.children;
		}
		return (
			<main className="mx-auto flex max-w-lg flex-col gap-4 p-8 text-fg">
				<h1 className="text-2xl font-semibold">
					{ __( 'Something went wrong', 'cliedesk' ) }
				</h1>
				<p className="text-fg-muted">
					{ __(
						'Cliedesk stopped because of an unexpected error. Reloading usually fixes it; your drafts are kept.',
						'cliedesk'
					) }
				</p>
				<pre className="overflow-auto rounded-md bg-sunken p-3 font-mono text-sm whitespace-pre-wrap">
					{ String( this.state.error.message ).slice( 0, 500 ) }
				</pre>
				<div>
					<button
						type="button"
						className="h-(--cd-control-h) rounded-md bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
						onClick={ () => window.location.reload() }
					>
						{ __( 'Reload', 'cliedesk' ) }
					</button>
				</div>
			</main>
		);
	}
}
