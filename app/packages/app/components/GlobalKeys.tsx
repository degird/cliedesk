/**
 * Global keys of the shell (INB-05, INB-07): Ctrl/⌘-K opens the command palette, "?" the shortcut sheet, and
 * `g` sequences go to the main screens. The preference `shortcuts.enabled` turns the single-key ones off and
 * `shortcuts.map` remaps keys (boot prefs, PATCH me/prefs). The palette
 * and the sheet are lazy chunks, loaded the first time they open.
 */
import { can, hasModule } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import { Search } from 'lucide-react';
import { Suspense, lazy, useEffect, useSyncExternalStore } from 'react';
import { flushPrefs, prefsStore, type Prefs } from '../prefs';
import {
	keyLabel,
	shortcutMap,
	shortcutsEnabled,
	useShortcut,
} from '../shortcuts';
import { overlayStore } from '../state';

const CommandPalette = lazy(
	() =>
		import( /* webpackChunkName: "palette" */ '../palette/CommandPalette' )
);
const HelpDialog = lazy(
	() => import( /* webpackChunkName: "help" */ './HelpDialog' )
);
const ShortcutHelp = lazy(
	() => import( /* webpackChunkName: "shortcuts-help" */ './ShortcutHelp' )
);

export const GROUP_GLOBAL = (): string => __( 'Everywhere', 'cliedesk' );

/** Open the palette (top-bar button, Ctrl/⌘-K). */
export const openPalette = () => overlayStore.set( 'palette' );

/**
 * Top-bar button that opens the command palette.
 */
export function PaletteButton() {
	const hint = keyLabel( 'mod+k' ).join( ' ' );
	return (
		<Button
			variant="secondary"
			size="sm"
			iconStart={ <Search aria-hidden="true" size={ 14 } /> }
			onPress={ openPalette }
		>
			{ __( 'Search or jump to…', 'cliedesk' ) }
			<kbd className="ms-2 hidden rounded-sm border border-line px-1 font-sans text-xs text-fg-muted sm:inline">
				{ hint }
			</kbd>
		</Button>
	);
}

/**
 * Registers the global shortcuts and renders the palette and the shortcut sheet when open.
 */
export function GlobalKeys() {
	const navigate = useNavigate();
	const overlay = useSyncExternalStore(
		overlayStore.subscribe,
		overlayStore.get,
		overlayStore.get
	);
	const store = prefsStore();
	const prefs = useSyncExternalStore(
		store.subscribe,
		store.get,
		store.get
	) as Prefs;
	useEffect( () => {
		shortcutsEnabled.set( prefs.shortcuts.enabled !== false );
		shortcutMap.set( prefs.shortcuts.map ?? {} );
	}, [ prefs.shortcuts ] );
	// Do not lose a preference change that is still waiting to be saved.
	useEffect( () => {
		const flush = () => void flushPrefs();
		window.addEventListener( 'pagehide', flush );
		return () => window.removeEventListener( 'pagehide', flush );
	}, [] );

	const group = GROUP_GLOBAL();
	useShortcut( {
		id: 'palette',
		keys: 'mod+k',
		label: __( 'Open the command palette', 'cliedesk' ),
		group,
		allowInInputs: true,
		run: () => overlayStore.set( overlay === 'palette' ? null : 'palette' ),
	} );
	useShortcut( {
		id: 'shortcuts',
		keys: '?',
		label: __( 'Show keyboard shortcuts', 'cliedesk' ),
		group,
		run: () => overlayStore.set( 'shortcuts' ),
	} );
	useShortcut( {
		id: 'go-home',
		keys: 'g h',
		label: __( 'Go to Home', 'cliedesk' ),
		group,
		run: () => void navigate( { to: '/' } ),
	} );
	useShortcut(
		{
			id: 'go-inbox',
			keys: 'g i',
			label: __( 'Go to Inbox', 'cliedesk' ),
			group,
			run: () => void navigate( { to: '/inbox' } ),
		},
		can( 'cliedesk_view_conversations' ) && hasModule( 'inbox' )
	);
	useShortcut(
		{
			id: 'go-contacts',
			keys: 'g c',
			label: __( 'Go to Contacts', 'cliedesk' ),
			group,
			run: () => void navigate( { to: '/contacts' } ),
		},
		can( 'cliedesk_view_contacts' ) && hasModule( 'contacts' )
	);
	useShortcut(
		{
			id: 'go-settings',
			keys: 'g s',
			label: __( 'Go to Settings', 'cliedesk' ),
			group,
			run: () => void navigate( { to: '/settings' } ),
		},
		can( 'cliedesk_manage_settings' )
	);

	const close = () => overlayStore.set( null );
	return (
		<Suspense fallback={ null }>
			{ overlay === 'palette' && <CommandPalette onClose={ close } /> }
			{ overlay === 'shortcuts' && <ShortcutHelp onClose={ close } /> }
			{ overlay === 'help' && <HelpDialog onClose={ close } /> }
		</Suspense>
	);
}
