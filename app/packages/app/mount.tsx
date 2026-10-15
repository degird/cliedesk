/**
 * Mount (plan.frontend-ux.md §4.1): after DOMContentLoaded, so deferred Pro scripts (which depend on
 * cliedesk-app) have registered their routes. Builds the router from the registry, starts the change feed
 * (leader tab) and sets `window.cliedesk.app.mounted = true` for the boot watchdog.
 */
import {
	ChangeFeed,
	getBoot,
	getQueryClient,
	QueryClientProvider,
} from '@cliedesk/data';
import { syncDisplayPrefs } from '@cliedesk/ui';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { lockRegistry } from './registry';
import { buildRouter, type AppRouter } from './router';

let root: Root | null = null;
let feed: ChangeFeed | null = null;
let router: AppRouter | null = null;

/** The running change feed (Pro may switch its mode). */
export const getChangeFeed = (): ChangeFeed | null => feed;

/** The router (after mount). */
export const getRouter = (): AppRouter | null => router;

/**
 * Mount the app into `#cliedesk-root` (replaces the server skeleton). Safe to call twice.
 *
 * @param el Mount node.
 */
export function mount(
	el: HTMLElement | null = document.getElementById( 'cliedesk-root' )
): boolean {
	if ( ! el || root ) {
		return false;
	}
	const boot = getBoot();
	syncDisplayPrefs( boot );
	lockRegistry();
	const queryClient = getQueryClient();
	router = buildRouter();

	if ( boot.user ) {
		feed = new ChangeFeed( { queryClient } );
		feed.start();
		document.addEventListener( 'visibilitychange', () =>
			feed?.onVisibilityChange()
		);
		window.addEventListener( 'pagehide', () => feed?.stop() );
	}

	el.textContent = '';
	root = createRoot( el );
	root.render(
		<StrictMode>
			<AppErrorBoundary>
				<QueryClientProvider client={ queryClient }>
					<RouterProvider router={ router } />
				</QueryClientProvider>
			</AppErrorBoundary>
		</StrictMode>
	);
	const g = ( window.cliedesk = window.cliedesk ?? {} );
	g.app = g.app ?? {};
	g.app.mounted = true;
	return true;
}

/**
 * Run `mount` once DOMContentLoaded fired (deferred scripts run while readyState is "interactive", before
 * DOMContentLoaded, so `@wordpress/dom-ready` would mount before Pro registered).
 */
export function scheduleMount(): void {
	if ( typeof document === 'undefined' ) {
		return;
	}
	if ( document.readyState === 'complete' ) {
		mount();
		return;
	}
	const run = () => {
		document.removeEventListener( 'DOMContentLoaded', run );
		window.removeEventListener( 'load', run );
		mount();
	};
	document.addEventListener( 'DOMContentLoaded', run );
	window.addEventListener( 'load', run ); // If DOMContentLoaded already fired (late injection).
}
