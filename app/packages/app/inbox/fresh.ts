/**
 * New-message highlight in lists (INB-22): after a poll, rows whose last message is newer than before (or that
 * appear, after the first load) and are unread for me are marked for a while.
 */
import { useEffect, useRef, useState } from 'react';
import type { InboxItem } from './api';

/** How long a row stays marked. */
export const FRESH_MS = 30_000;

const stamp = ( i: InboxItem ) => i.lastMessageAt ?? i.updatedAt ?? '';

/**
 * Rows with news since the previous snapshot.
 *
 * @param seen  Last message time per row id from the previous snapshot (null: first load).
 * @param items Current rows.
 */
export function freshIds(
	seen: Map< number, string > | null,
	items: InboxItem[]
): number[] {
	if ( ! seen ) {
		return [];
	}
	// Rows not seen before count only when newer than everything seen (not older rows of a next page).
	const newest = [ ...seen.values() ].reduce(
		( a, b ) => ( b > a ? b : a ),
		''
	);
	return items
		.filter( ( i ) => {
			if ( ! i.unread ) {
				return false;
			}
			const before = seen.get( i.id );
			return undefined === before
				? stamp( i ) > newest
				: stamp( i ) > before;
		} )
		.map( ( i ) => i.id );
}

/**
 * Ids of the rows to mark now.
 *
 * @param items Current rows (a new array after every fetch).
 * @param ready The first page has loaded.
 * @param scope View and sort: a new scope starts over.
 */
export function useFreshRows(
	items: InboxItem[],
	ready: boolean,
	scope: string
): Set< number > {
	const seen = useRef< Map< number, string > | null >( null );
	const scoped = useRef( scope );
	const [ fresh, setFresh ] = useState< Map< number, number > >( new Map() );
	useEffect( () => {
		if ( scoped.current !== scope ) {
			scoped.current = scope;
			seen.current = null;
			setFresh( new Map() );
		}
		if ( ! ready ) {
			return;
		}
		const ids = freshIds( seen.current, items );
		seen.current = new Map( items.map( ( i ) => [ i.id, stamp( i ) ] ) );
		if ( ids.length ) {
			const until = Date.now() + FRESH_MS;
			setFresh( ( old ) => {
				const next = new Map( old );
				ids.forEach( ( id ) => next.set( id, until ) );
				return next;
			} );
		}
	}, [ items, ready, scope ] );
	useEffect( () => {
		if ( ! fresh.size ) {
			return undefined;
		}
		const soonest = Math.min( ...fresh.values() );
		const t = setTimeout(
			() =>
				setFresh( ( old ) => {
					const now = Date.now();
					return new Map(
						[ ...old ].filter( ( [ , until ] ) => until > now )
					);
				} ),
			Math.max( 0, soonest - Date.now() ) + 10
		);
		return () => clearTimeout( t );
	}, [ fresh ] );
	return new Set( fresh.keys() );
}
