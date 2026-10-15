/**
 * Router (plan.frontend-ux.md §3.12): TanStack Router, built once at mount from the route registry.
 * Browser history under `boot.app.basePath` on pretty permalinks, hash history otherwise.
 */
import { getBoot, type BootPayload } from '@cliedesk/data';
import {
	createBrowserHistory,
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	notFound,
	type AnyRoute,
	type RouterHistory,
} from '@tanstack/react-router';
import { can } from '@cliedesk/data';
import { rewritePlainPermalink } from './history';
import { BareLayout } from './layouts/BareLayout';
import { RootLayout } from './layouts/RootLayout';
import { ShellLayout } from './layouts/ShellLayout';
import { getRoutes, isEnabled, type RouteDef } from './registry';
import { NotFound } from './routes/NotFound';
import { RouteError } from './components/RouteError';

export interface RouteStaticData {
	title?: string;
	routeId?: string;
}

/**
 * Child path for TanStack: registry paths are absolute below the base.
 *
 * @param path Registry path.
 */
function childPath( path: string ): string {
	const p = path.replace( /^\/+/, '' );
	return p === '' ? '/' : p;
}

/**
 * Create the history for the current permalink mode, rewriting `?cliedesk=` deep links first.
 *
 * @param boot Boot payload.
 */
export function createAppHistory(
	boot: BootPayload = getBoot()
): RouterHistory {
	if ( boot.app.pretty ) {
		return createBrowserHistory();
	}
	const next = rewritePlainPermalink(
		window.location.href,
		boot.app.basePath
	);
	if ( next ) {
		window.history.replaceState( window.history.state, '', next );
	}
	return createHashHistory();
}

/**
 * Build the router from the registry.
 *
 * @param opts         Options.
 * @param opts.history History (memory history in tests).
 * @param opts.routes  Route definitions (defaults to the registry).
 */
export function buildRouter(
	opts: { history?: RouterHistory; routes?: RouteDef[] } = {}
) {
	const boot = getBoot();
	const root = createRootRoute( {
		component: RootLayout,
		notFoundComponent: NotFound,
	} );
	const shell = createRoute( {
		getParentRoute: () => root,
		id: 'shell',
		component: ShellLayout,
	} );
	const bare = createRoute( {
		getParentRoute: () => root,
		id: 'bare',
		component: BareLayout,
	} );

	const make = ( parent: AnyRoute, def: RouteDef ) =>
		createRoute( {
			getParentRoute: () => parent,
			path: childPath( def.path ),
			component: lazyRouteComponent( def.component ),
			errorComponent: RouteError,
			notFoundComponent: NotFound,
			staticData: {
				title: def.title,
				routeId: def.id,
			} as RouteStaticData,
			beforeLoad: () => {
				// UI guard only: the server authorises every call. No access looks like not found (§3.12).
				if (
					! can( def.capability ) ||
					( def.module && ! boot.modules.includes( def.module ) ) ||
					! isEnabled( def )
				) {
					throw notFound();
				}
			},
		} );

	const defs = opts.routes ?? getRoutes();
	const shellChildren: AnyRoute[] = defs
		.filter( ( d ) => d.layout !== 'bare' )
		.map( ( d ) => make( shell, d ) );
	const bareChildren: AnyRoute[] = defs
		.filter( ( d ) => d.layout === 'bare' )
		.map( ( d ) => make( bare, d ) );
	shellChildren.push(
		createRoute( {
			getParentRoute: () => shell,
			path: '$',
			component: NotFound,
			staticData: { title: '' } as RouteStaticData,
		} )
	);

	const routeTree = root.addChildren( [
		shell.addChildren( shellChildren ),
		bare.addChildren( bareChildren ),
	] );
	const history = opts.history ?? createAppHistory( boot );
	return createRouter( {
		routeTree,
		history,
		basepath:
			boot.app.pretty && ! opts.history ? boot.app.basePath : undefined,
		defaultPreload: 'intent',
		defaultErrorComponent: RouteError,
		defaultNotFoundComponent: NotFound,
		scrollRestoration: true,
	} );
}

export type AppRouter = ReturnType< typeof buildRouter >;
