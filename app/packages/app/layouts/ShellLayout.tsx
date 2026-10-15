import { getBoot, hasModule, subscribeBoot } from '@cliedesk/data';
import { Slot } from '@cliedesk/ui';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { __, isRTL } from '@wordpress/i18n';
import { lazy, Suspense, useSyncExternalStore } from 'react';
import { Banners } from '../components/Banners';
import { GlobalKeys, PaletteButton } from '../components/GlobalKeys';
import { NotificationBell } from '../components/NotificationBell';
import { Rail } from '../components/Rail';
import { StatusMenu, statusKit } from '../components/StatusMenu';
import { UserMenu } from '../components/UserMenu';

// Loaded on its own: focus mode (INB-28).
// The settings sidebar loads with the first settings page (it is not needed anywhere else).
const SettingsNav = lazy( () =>
	import(
		/* webpackChunkName: "settings-nav" */ '../components/SettingsNav'
	).then( ( m ) => ( { default: m.SettingsNav } ) )
);
const FocusGuard = lazy(
	() => import( /* webpackChunkName: "focus" */ '../components/FocusGuard' )
);

/**
 * App shell (§5.1): skip link, rail (nav), top bar (banner), optional secondary sidebar, main. Re-renders when the
 * boot data changes (permission preview started or ended, session refreshed), so navigation follows the caps.
 */
export function ShellLayout() {
	const boot = useSyncExternalStore( subscribeBoot, getBoot, getBoot );
	const pathname = useRouterState( { select: ( s ) => s.location.pathname } );
	const inSettings = /^\/settings(\/|$)/.test( pathname );
	return (
		// BRD-34: right to left for Arabic, Hebrew… (WordPress sets the direction in wp-i18n; the boot as backup).
		<div
			dir={ isRTL() || boot.i18n.rtl ? 'rtl' : 'ltr' }
			className="flex min-h-screen bg-canvas pb-16 text-fg md:pb-0"
		>
			<a
				href="#cliedesk-main"
				className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[1400] focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:shadow-2"
			>
				{ __( 'Skip to main content', 'cliedesk' ) }
			</a>
			<Rail />
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="sticky top-0 z-10">
					{ /* Pro's permission preview banner (TEAM-18) fills this slot; Free has none. */ }
					<Slot name="shell.banner" />
					<Suspense fallback={ null }>
						<FocusGuard />
					</Suspense>
					<header className="flex h-(--cd-topbar-h) items-center gap-3 border-b border-line bg-surface px-4">
						<p className="truncate font-semibold">
							{ boot.workspace.name ||
								__( 'Cliedesk', 'cliedesk' ) }
						</p>
						<div className="ms-auto flex items-center gap-2">
							<PaletteButton />
							<Slot
								name="app.topbar.end"
								className="flex items-center gap-2"
							/>
							{ /* Pro fills it with the same menu plus custom statuses, Away reasons and channels. */ }
							<Slot
								name="header.status"
								fillProps={ { kit: statusKit } }
								fallback={ <StatusMenu /> }
							/>
							{ hasModule( 'notifications' ) && (
								<NotificationBell />
							) }
							<UserMenu />
						</div>
					</header>
				</div>
				<Banners />
				{ /* Pro: chats offered to me (RTE-17). */ }
				<Slot name="shell.offers" />
				<div className="flex min-h-0 flex-1 flex-col md:flex-row">
					{ inSettings && (
						<aside className="w-full shrink-0 border-b border-line bg-surface md:w-(--cd-sidebar-w) md:border-e md:border-b-0">
							<Suspense fallback={ null }>
								<SettingsNav />
							</Suspense>
						</aside>
					) }
					<main
						id="cliedesk-main"
						tabIndex={ -1 }
						className="min-w-0 flex-1 px-4 py-6 outline-none md:px-8"
					>
						<Outlet />
					</main>
				</div>
			</div>
			<GlobalKeys />
		</div>
	);
}
