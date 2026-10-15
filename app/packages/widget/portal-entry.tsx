/**
 * Customer portal entry (PRT-02): build/widget/portal.js. The portal page and block render the theme-styled portal;
 * the full-screen portal (PRT-29, `config.app`) loads its shell on its own.
 */
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Portal, PortalClient, type PortalConfig } from './portal';

const PortalApp = lazy(
	() => import( /* webpackChunkName: "portal-app" */ './portal-app' )
);

function start(): void {
	document
		.querySelectorAll< HTMLElement >( '.cliedesk-portal[data-config]' )
		.forEach( ( root ) => {
			try {
				const config = JSON.parse(
					root.dataset.config ?? '{}'
				) as PortalConfig;
				const client = new PortalClient( config );
				createRoot( root ).render(
					config.app ? (
						<Suspense fallback={ null }>
							<PortalApp config={ config } client={ client } />
						</Suspense>
					) : (
						<Portal config={ config } client={ client } />
					)
				);
			} catch {
				// A broken placeholder keeps its <noscript> text.
			}
		} );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', start );
} else {
	start();
}
