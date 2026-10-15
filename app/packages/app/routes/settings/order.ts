/**
 * Ordered-list helpers shared by settings screens.
 */

/**
 * Move an item of an ordered list one place (-1 up, +1 down).
 *
 * @param list List.
 * @param item Item.
 * @param step Step.
 */
export function moveIn< T >( list: T[], item: T, step: -1 | 1 ): T[] {
	const i = list.indexOf( item );
	const j = i + step;
	if ( i < 0 || j < 0 || j >= list.length ) {
		return list;
	}
	const next = [ ...list ];
	[ next[ i ], next[ j ] ] = [ next[ j ] as T, next[ i ] as T ];
	return next;
}
