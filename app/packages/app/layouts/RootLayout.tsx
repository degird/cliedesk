import {
	getBoot,
	reauthStore,
	sudoStore,
	twoFactorBlockedStore,
} from '@cliedesk/data';
import { ToastRegion } from '@cliedesk/ui';
import { Outlet, useRouter } from '@tanstack/react-router';
import { Suspense, lazy, useEffect, useSyncExternalStore } from 'react';
import { TwoFactorRequired } from '../components/TwoFactorRequired';

// The sign-in-again and password dialogs load only when one opens (they are rare; start-up JS stays small).
const ReauthDialog = lazy( () =>
	import(
		/* webpackChunkName: "reauth-dialog" */ '../components/ReauthDialog'
	).then( ( m ) => ( { default: m.ReauthDialog } ) )
);
const SudoDialog = lazy( () =>
	import(
		/* webpackChunkName: "sudo-dialog" */ '../components/SudoDialog'
	).then( ( m ) => ( { default: m.SudoDialog } ) )
);

/**
 * Render a lazy dialog only while its store says it is open.
 *
 * @param props          Props.
 * @param props.store    Store with an open flag.
 * @param props.children The dialog.
 */
function WhenOpen( {
	store,
	children,
}: {
	store: typeof sudoStore | typeof reauthStore;
	children: JSX.Element;
} ) {
	const state = useSyncExternalStore( store.subscribe, store.get, store.get );
	return state.open ? (
		<Suspense fallback={ null }>{ children }</Suspense>
	) : null;
}

/**
 * Move focus to the page h1 after a client navigation (§8.3); the first load keeps the browser's focus.
 */
function useFocusOnNavigate() {
	const router = useRouter();
	useEffect( () => {
		let first = true;
		return router.subscribe( 'onResolved', ( e ) => {
			if ( first ) {
				first = false;
				return;
			}
			if ( ! e.pathChanged ) {
				return;
			}
			window.requestAnimationFrame( () => {
				window.setTimeout( () => {
					const h1 =
						document.querySelector< HTMLElement >(
							'#cliedesk-main h1'
						);
					( h1 ?? document.getElementById( 'cliedesk-main' ) )?.focus(
						{ preventScroll: false }
					);
				}, 0 );
			} );
		} );
	}, [ router ] );
}

/** Root: active layout + global overlays (re-authenticate and password dialogs, toasts). */
export function RootLayout() {
	useFocusOnNavigate();
	const blockedNow = useSyncExternalStore(
		twoFactorBlockedStore.subscribe,
		twoFactorBlockedStore.get,
		twoFactorBlockedStore.get
	);
	const blocked = blockedNow || !! getBoot().emergency.twoFactor?.blocked;
	return (
		<>
			{ blocked ? <TwoFactorRequired /> : <Outlet /> }
			<WhenOpen store={ reauthStore }>
				<ReauthDialog />
			</WhenOpen>
			<WhenOpen store={ sudoStore }>
				<SudoDialog />
			</WhenOpen>
			<ToastRegion />
		</>
	);
}
