/**
 * Tiny external store for `useSyncExternalStore` (plan.frontend-ux.md §4.9: no Zustand).
 */
export interface Store< T > {
	get: () => T;
	set: ( next: T | ( ( prev: T ) => T ) ) => void;
	subscribe: ( listener: () => void ) => () => void;
}

/**
 * Create a store.
 *
 * @param initial Initial value.
 */
export function createStore< T >( initial: T ): Store< T > {
	let value = initial;
	const listeners = new Set< () => void >();
	return {
		get: () => value,
		set( next ) {
			const v =
				typeof next === 'function'
					? ( next as ( p: T ) => T )( value )
					: next;
			if ( ! Object.is( v, value ) ) {
				value = v;
				listeners.forEach( ( l ) => l() );
			}
		},
		subscribe( listener ) {
			listeners.add( listener );
			return () => {
				listeners.delete( listener );
			};
		},
	};
}
