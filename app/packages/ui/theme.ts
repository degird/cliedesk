/**
 * Display preferences on <html> (plan.frontend-ux.md §7.8). The PHP pre-paint script sets the first values from
 * the server preferences (boot `prefs`); the app keeps them in sync and saves changes with PATCH me/prefs. The
 * theme is also cached in localStorage `cliedesk.theme` for the pre-paint script (first paint only: the server
 * value wins once the app starts).
 */
import { createStore, type BootPayload, type ThemePref } from '@cliedesk/data';

export const THEME_KEY = 'cliedesk.theme';
export type DensityPref = 'comfortable' | 'compact';
export type MotionPref = 'system' | 'on' | 'off';

/**
 * Apply a density to <html data-density> (INB-08).
 *
 * @param pref Density.
 */
export function applyDensity( pref: DensityPref ): void {
	document.documentElement.setAttribute( 'data-density', pref );
}

/**
 * Apply a font scale (`--cd-font-scale`).
 *
 * @param scale Scale, e.g. 1.1.
 */
export function applyFontScale( scale: number ): void {
	document.documentElement.style.setProperty(
		'--cd-font-scale',
		String( scale || 1 )
	);
}

/**
 * Apply the reduced-motion preference (`data-motion`; system follows the OS).
 *
 * @param pref Preference.
 */
export function applyMotion( pref: MotionPref ): void {
	const html = document.documentElement;
	if ( pref === 'on' ) {
		html.setAttribute( 'data-motion', 'reduce' );
	} else if ( pref === 'off' ) {
		html.setAttribute( 'data-motion', 'no-preference' );
	} else {
		html.removeAttribute( 'data-motion' );
	}
}

function readStored(): ThemePref | null {
	try {
		const v = window.localStorage.getItem( THEME_KEY );
		return v === 'light' || v === 'dark' || v === 'system' ? v : null;
	} catch {
		return null;
	}
}

function systemDark(): boolean {
	return (
		typeof window.matchMedia === 'function' &&
		window.matchMedia( '(prefers-color-scheme: dark)' ).matches
	);
}

/**
 * Resolve a preference to the applied theme.
 *
 * @param pref Preference.
 */
export function resolveTheme( pref: ThemePref ): 'light' | 'dark' {
	if ( pref === 'system' ) {
		return systemDark() ? 'dark' : 'light';
	}
	return pref;
}

export const themeStore = createStore< ThemePref >( 'system' );

let mediaCleanup: ( () => void ) | null = null;

/**
 * Apply a theme preference to <html data-theme> and follow the OS while it is "system".
 *
 * @param pref Preference.
 */
export function applyTheme( pref: ThemePref ): void {
	document.documentElement.setAttribute( 'data-theme', resolveTheme( pref ) );
	mediaCleanup?.();
	mediaCleanup = null;
	if ( pref === 'system' && typeof window.matchMedia === 'function' ) {
		const mq = window.matchMedia( '(prefers-color-scheme: dark)' );
		const onChange = () =>
			document.documentElement.setAttribute(
				'data-theme',
				resolveTheme( 'system' )
			);
		mq.addEventListener?.( 'change', onChange );
		mediaCleanup = () => mq.removeEventListener?.( 'change', onChange );
	}
}

/**
 * Change the theme (user menu): apply, remember in localStorage, notify subscribers.
 *
 * @param pref Preference.
 */
export function setThemePreference( pref: ThemePref ): void {
	try {
		window.localStorage.setItem( THEME_KEY, pref );
	} catch {
		// Private mode: the theme still applies for this page.
	}
	themeStore.set( pref );
	applyTheme( pref );
}

/**
 * Sync every display attribute from the boot (server) preferences.
 *
 * @param boot Boot payload.
 */
export function syncDisplayPrefs( boot: BootPayload ): void {
	const html = document.documentElement;
	const pref = boot.prefs.theme ?? readStored() ?? 'system';
	themeStore.set( pref );
	applyTheme( pref );
	if ( readStored() !== pref ) {
		try {
			window.localStorage.setItem( THEME_KEY, pref );
		} catch {
			// No storage: the server value still applies.
		}
	}
	applyDensity(
		boot.prefs.density === 'compact' ? 'compact' : 'comfortable'
	);
	html.setAttribute( 'data-font', boot.prefs.font );
	html.setAttribute( 'dir', boot.i18n.rtl ? 'rtl' : 'ltr' );
	html.setAttribute( 'lang', boot.i18n.lang );
	applyFontScale( boot.prefs.fontScale || 1 );
	applyMotion( boot.prefs.reducedMotion );
	html.classList.add( 'cliedesk-html' );
}
