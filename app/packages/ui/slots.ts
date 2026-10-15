/**
 * Slot-fill registry (plan.frontend-ux.md §4.2). Lives in @cliedesk/ui so <Slot> has no dependency on the app
 * bundle; @cliedesk/app re-exports `registerSlotFill` on window.cliedesk.app. Reactive: fills may be added
 * after mount.
 */
import { useSyncExternalStore, type ComponentType } from 'react';

export interface SlotFill< P = Record< string, unknown > > {
	id: string;
	component: ComponentType< P >;
	order?: number;
	/** Module id; the fill renders only while the module is active. */
	module?: string;
	/** Capability; the fill renders only for users with it. */
	capability?: string;
}

const fills = new Map< string, SlotFill< any >[] >();
const listeners = new Set< () => void >();
let version = 0;
const EMPTY: SlotFill[] = [];

/**
 * Register a fill for a slot. Re-registering the same id replaces it.
 *
 * @param slot Slot name, e.g. `conversation.composer.ai`.
 * @param fill Fill.
 * @return Unregister function.
 */
export function registerSlotFill< P = Record< string, unknown > >(
	slot: string,
	fill: SlotFill< P >
): () => void {
	const list = ( fills.get( slot ) ?? [] ).filter(
		( f ) => f.id !== fill.id
	);
	list.push( fill );
	list.sort( ( a, b ) => ( a.order ?? 100 ) - ( b.order ?? 100 ) );
	fills.set( slot, list );
	version++;
	listeners.forEach( ( l ) => l() );
	return () => {
		fills.set(
			slot,
			( fills.get( slot ) ?? [] ).filter( ( f ) => f !== fill )
		);
		version++;
		listeners.forEach( ( l ) => l() );
	};
}

/**
 * Fills registered for a slot (unfiltered).
 *
 * @param slot Slot name.
 */
export function getSlotFills( slot: string ): SlotFill[] {
	return fills.get( slot ) ?? EMPTY;
}

/**
 * Subscribe to registry changes.
 *
 * @param l Listener.
 */
export function subscribeSlots( l: () => void ): () => void {
	listeners.add( l );
	return () => {
		listeners.delete( l );
	};
}

/** Registry version (changes on every registration). */
export function getSlotsVersion(): number {
	return version;
}

/**
 * React hook: fills for a slot, re-rendering on registration.
 *
 * @param slot Slot name.
 */
export function useSlotFills( slot: string ): SlotFill[] {
	useSyncExternalStore( subscribeSlots, getSlotsVersion, getSlotsVersion );
	return getSlotFills( slot );
}
