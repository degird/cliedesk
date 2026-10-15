/**
 * Keyboard shortcuts (INB-07, plan.frontend-ux.md §8.2): one registry and one document listener for every screen.
 * Screens register the keys they handle while mounted (`useShortcut`); the "?" sheet lists what is registered.
 *
 * Keys are written like `j`, `?`, `shift+x`, `mod+k` (Ctrl on Windows/Linux, ⌘ on macOS) or sequences `g i` (the
 * second key within 1 s). Single-key shortcuts follow WCAG 2.1.4: they never fire while typing in a field, inside
 * a dialog or menu, or when the user turned shortcuts off (profile `shortcuts`); modifier shortcuts such as
 * `mod+k` stay on.
 *
 * Remapping (INB-07): the user's map (prefs.shortcuts.map, `{actionId: keys}`, saved with PATCH me/prefs) replaces
 * the default keys of an action. Action ids in the map use `_` for `-` (server key pattern).
 */
import { createStore } from '@cliedesk/data';
import { useEffect, useRef } from 'react';
import { isTyping } from './inbox/keys';

export interface ShortcutDef {
	id: string;
	/** Key combination, e.g. `j`, `?`, `shift+x`, `mod+k`, `g i`. */
	keys: string;
	label: string;
	/** Group in the shortcut sheet. */
	group: string;
	run: ( e: KeyboardEvent ) => void;
	/** Also fire while focus is in a text field (modifier shortcuts only). */
	allowInInputs?: boolean;
}

/** Profile switch: single-key shortcuts on or off. */
export const shortcutsEnabled = createStore< boolean >( true );

/** The user's remaps: map key (see mapKey) → keys. */
export const shortcutMap = createStore< Record< string, string > >( {} );

/** Every shortcut seen this session (for conflicts with screens not open now), by id. */
const known = new Map< string, ShortcutDef >();

/**
 * Key of an action in the stored map (`list-next` → `list_next`).
 *
 * @param id Shortcut id.
 */
export function mapKey( id: string ): string {
	return id.toLowerCase().replace( /[^a-z0-9_.]/g, '_' );
}

/**
 * Keys in effect for a shortcut (the user's remap, else the default).
 *
 * @param def Shortcut.
 */
export function effectiveKeys(
	def: Pick< ShortcutDef, 'id' | 'keys' >
): string {
	return shortcutMap.get()[ mapKey( def.id ) ] ?? def.keys;
}

const STEP =
	/^((mod|alt|shift)\+){0,3}([a-z0-9]|[^\sa-z0-9+]|F([1-9]|1[0-2])|Escape|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;

/**
 * Whether a key combination is well formed: one or two steps ("y", "mod+y", "g y"), at most 32 characters.
 *
 * @param keys Keys.
 */
export function validKeys( keys: string ): boolean {
	const steps = keys.trim().split( ' ' );
	return (
		keys.length > 0 &&
		keys.length <= 32 &&
		steps.length <= 2 &&
		steps.every( ( st ) => STEP.test( st ) ) &&
		// A second step needs a plain first key ("g i"), as sequences work.
		( steps.length === 1 || ! hasModifier( steps[ 0 ]! + '+' ) )
	);
}

/**
 * The shortcut that already uses these keys (or that one of them would shadow as a sequence), if any.
 *
 * @param id   Shortcut being changed.
 * @param keys Proposed keys.
 */
export function findConflict( id: string, keys: string ): ShortcutDef | null {
	for ( const d of known.values() ) {
		if ( d.id === id ) {
			continue;
		}
		const other = effectiveKeys( d );
		if (
			other === keys ||
			other.startsWith( keys + ' ' ) ||
			keys.startsWith( other + ' ' )
		) {
			return d;
		}
	}
	return null;
}

const registered: ShortcutDef[] = [];
const listeners = new Set< () => void >();
let version = 0;
let pending: { key: string; at: number } | null = null;
let installed = false;

export const SEQUENCE_MS = 1000;

const changed = () => {
	version++;
	listeners.forEach( ( l ) => l() );
};

/**
 * Whether a key combination uses a modifier (these stay on when single-key shortcuts are off).
 *
 * @param keys Keys.
 */
export function hasModifier( keys: string ): boolean {
	return /(^|\+)(mod|ctrl|alt|meta)\+/.test( keys );
}

/**
 * The combination of one key event: `mod+k`, `shift+x`, `j`, `?`.
 *
 * @param e Event.
 */
export function comboOf( e: KeyboardEvent ): string {
	const raw = e.key;
	const letter = raw.length === 1 && /[a-z]/i.test( raw );
	const key = letter ? raw.toLowerCase() : raw;
	const parts: string[] = [];
	if ( e.ctrlKey || e.metaKey ) {
		parts.push( 'mod' );
	}
	if ( e.altKey ) {
		parts.push( 'alt' );
	}
	// Shift only counts for letters and named keys: "?" already is Shift+/ on most layouts.
	if ( e.shiftKey && ( letter || raw.length > 1 ) ) {
		parts.push( 'shift' );
	}
	parts.push( key );
	return parts.join( '+' );
}

function onKeyDown( e: KeyboardEvent ): void {
	if ( e.defaultPrevented || e.isComposing ) {
		return;
	}
	const combo = comboOf( e );
	const typing = isTyping( e );
	const enabled = shortcutsEnabled.get();
	const now = Date.now();
	const seq =
		pending && now - pending.at <= SEQUENCE_MS
			? `${ pending.key } ${ combo }`
			: null;
	pending = null;
	const usable = ( d: ShortcutDef ) => {
		if ( hasModifier( effectiveKeys( d ) ) ) {
			return ! typing || !! d.allowInInputs;
		}
		return enabled && ! typing;
	};
	// The newest registration wins (a dialog's keys over the screen's).
	for ( let i = registered.length - 1; i >= 0; i-- ) {
		const d = registered[ i ]!;
		const keys = effectiveKeys( d );
		if ( ( keys === combo || keys === seq ) && usable( d ) ) {
			e.preventDefault();
			d.run( e );
			return;
		}
	}
	if (
		! typing &&
		enabled &&
		registered.some( ( d ) => effectiveKeys( d ).startsWith( combo + ' ' ) )
	) {
		pending = { key: combo, at: now };
	}
}

/**
 * Register a shortcut. Returns the function that removes it.
 *
 * @param def Shortcut.
 */
export function registerShortcut( def: ShortcutDef ): () => void {
	if ( ! installed && typeof document !== 'undefined' ) {
		document.addEventListener( 'keydown', onKeyDown );
		installed = true;
	}
	registered.push( def );
	known.set( def.id, def );
	changed();
	return () => {
		const i = registered.indexOf( def );
		if ( i >= 0 ) {
			registered.splice( i, 1 );
			changed();
		}
	};
}

/** Registered shortcuts, one per id (the newest), in registration order. */
export function getShortcuts(): ShortcutDef[] {
	const byId = new Map< string, ShortcutDef >();
	for ( const d of registered ) {
		byId.delete( d.id );
		byId.set( d.id, d );
	}
	return [ ...byId.values() ];
}

shortcutMap.subscribe( changed );

export const subscribeShortcuts = ( l: () => void ) => {
	listeners.add( l );
	return () => {
		listeners.delete( l );
	};
};
export const getShortcutsVersion = () => version;

/**
 * Register a shortcut while the component is mounted. `run` may change on every render.
 *
 * @param def     Shortcut (`run` is read from the latest render).
 * @param enabled Register only while true.
 */
export function useShortcut( def: ShortcutDef, enabled = true ): void {
	const run = useRef( def.run );
	run.current = def.run;
	const { id, keys, label, group, allowInInputs } = def;
	useEffect( () => {
		if ( ! enabled ) {
			return undefined;
		}
		return registerShortcut( {
			id,
			keys,
			label,
			group,
			allowInInputs,
			run: ( e ) => run.current( e ),
		} );
	}, [ id, keys, label, group, allowInInputs, enabled ] );
}

/**
 * Readable form of a key combination for the sheet and tooltips ("Ctrl K", "⌘ K", "G then I").
 *
 * @param keys Keys.
 * @param mac  Apple platform.
 */
export function keyLabel(
	keys: string,
	mac: boolean = typeof navigator !== 'undefined' &&
		/Mac|iPhone|iPad/.test( navigator.platform || navigator.userAgent )
): string[] {
	return keys.split( ' ' ).map( ( step ) =>
		step
			.split( '+' )
			.map( ( p ) => {
				if ( p === 'mod' ) {
					return mac ? '⌘' : 'Ctrl';
				}
				if ( p === 'shift' ) {
					return 'Shift';
				}
				if ( p === 'alt' ) {
					return mac ? '⌥' : 'Alt';
				}
				return p.length === 1 ? p.toUpperCase() : p;
			} )
			.join( ' ' )
	);
}

/** Tests only. */
export function resetShortcutsForTests(): void {
	registered.length = 0;
	known.clear();
	pending = null;
	shortcutsEnabled.set( true );
	shortcutMap.set( {} );
	changed();
}
