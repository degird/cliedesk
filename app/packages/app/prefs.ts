/**
 * Server display preferences (INB-02, INB-07, INB-08): theme, density, font scale, reduced motion, shortcut switch
 * and map, and the inbox layout. They start from the boot payload (`prefs`) and follow the agent across devices:
 * a change applies at once and is saved with PATCH me/prefs, debounced (several quick changes, such as dragging
 * the splitter, become one request). The response carries the full preferences.
 */
import {
	api,
	createStore,
	getBoot,
	type BootPayload,
	type ThemePref,
} from '@cliedesk/data';
import {
	applyDensity,
	applyFontScale,
	applyMotion,
	setThemePreference,
	type DensityPref,
	type MotionPref,
} from '@cliedesk/ui';

export type Prefs = BootPayload[ 'prefs' ];

export interface PrefsPatch {
	theme?: ThemePref;
	density?: DensityPref;
	fontScale?: number;
	reducedMotion?: MotionPref;
	shortcuts?: boolean;
	shortcutMap?: Record< string, string >;
	layout?: Partial< Prefs[ 'layout' ] >;
}

export const SAVE_DELAY_MS = 400;

let source: BootPayload | null = null;
const store = createStore< Prefs | null >( null );

/** The preferences store (reset when the boot payload changes, e.g. in tests). */
export function prefsStore() {
	const boot = getBoot();
	if ( source !== boot ) {
		source = boot;
		store.set( boot.prefs );
	}
	return store;
}

/** Current preferences. */
export const getPrefs = (): Prefs => prefsStore().get() as Prefs;

/**
 * Preferences with a patch applied (layout merged, map replaced).
 *
 * @param p     Preferences.
 * @param patch Patch.
 */
export function mergePrefs( p: Prefs, patch: PrefsPatch ): Prefs {
	return {
		...p,
		...( patch.theme ? { theme: patch.theme } : {} ),
		...( patch.density ? { density: patch.density } : {} ),
		...( patch.fontScale ? { fontScale: patch.fontScale } : {} ),
		...( patch.reducedMotion
			? { reducedMotion: patch.reducedMotion }
			: {} ),
		shortcuts: {
			enabled: patch.shortcuts ?? p.shortcuts.enabled,
			map: patch.shortcutMap ?? p.shortcuts.map,
		},
		layout: { ...p.layout, ...( patch.layout ?? {} ) },
	};
}

/**
 * Apply a patch here only (another screen already saved it, e.g. the profile form's shortcut switch).
 *
 * @param patch Patch.
 */
export function setLocalPrefs( patch: PrefsPatch ): void {
	prefsStore().set( ( p ) => mergePrefs( p as Prefs, patch ) );
}

let pending: PrefsPatch | null = null;
let timer: number | undefined;
// Number of the latest save sent: an older answer arriving late never undoes a newer change.
let sent = 0;

/** Send the waiting changes now. */
export async function flushPrefs(): Promise< void > {
	window.clearTimeout( timer );
	const body = pending;
	pending = null;
	if ( ! body ) {
		return;
	}
	const seq = ++sent;
	try {
		const r = await api.patch< Prefs >( 'me/prefs', { body } );
		// Take the server's values unless newer changes are waiting or a newer save went out meanwhile.
		if (
			r.data &&
			! pending &&
			seq === sent &&
			typeof r.data === 'object'
		) {
			const cur = getPrefs();
			store.set( {
				...cur,
				...r.data,
				shortcuts: { ...cur.shortcuts, ...( r.data.shortcuts ?? {} ) },
				layout: { ...cur.layout, ...( r.data.layout ?? {} ) },
			} );
		}
	} catch {
		// Kept for this page; the next change tries again.
	}
}

/**
 * Change preferences: applied now, saved shortly after.
 *
 * @param patch Patch.
 */
export function savePrefs( patch: PrefsPatch ): void {
	setLocalPrefs( patch );
	if ( patch.theme ) {
		setThemePreference( patch.theme );
	}
	if ( patch.density ) {
		applyDensity( patch.density );
	}
	if ( patch.fontScale ) {
		applyFontScale( patch.fontScale );
	}
	if ( patch.reducedMotion ) {
		applyMotion( patch.reducedMotion );
	}
	pending = {
		...( pending ?? {} ),
		...patch,
		...( patch.layout || pending?.layout
			? {
					layout: {
						...( pending?.layout ?? {} ),
						...( patch.layout ?? {} ),
					},
				}
			: {} ),
	};
	window.clearTimeout( timer );
	timer = window.setTimeout( () => void flushPrefs(), SAVE_DELAY_MS );
}
