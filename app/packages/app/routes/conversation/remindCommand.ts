/**
 * The composer's `/remind` command (INB-71): `/remind <when> [note]` sets a personal reminder instead of sending.
 * When: `in 30m`, `in 2h`, `in 3d`, `tomorrow`, `tomorrow 15:00`, `15:00` (today, or tomorrow when it has passed)
 * or `2026-10-12 09:00`. Times are local; the reminder is sent in UTC. A bare day starts at 9:00.
 */

export interface RemindCommand {
	at: Date;
	note: string;
}

const TIME = /^(\d{1,2}):(\d{2})$/;

/**
 * Parse a `/remind` command, or null when the text is not one (or the time is not understood or not in the future).
 *
 * @param text Editor text.
 * @param now  Now.
 */
export function parseRemind(
	text: string,
	now: Date = new Date()
): RemindCommand | null {
	const m = /^\/remind\s+(.+)$/i.exec( text.trim() );
	if ( ! m ) {
		return null;
	}
	const words = ( m[ 1 ] ?? '' ).trim().split( /\s+/ );
	let at: Date | null = null;
	let used = 0;
	const first = ( words[ 0 ] ?? '' ).toLowerCase();
	const setTime = ( d: Date, word: string | undefined ): boolean => {
		const t = TIME.exec( word ?? '' );
		if ( ! t ) {
			return false;
		}
		d.setHours( Number( t[ 1 ] ), Number( t[ 2 ] ), 0, 0 );
		return true;
	};
	if ( first === 'in' ) {
		const d = /^(\d{1,4})(m|h|d)$/i.exec( words[ 1 ] ?? '' );
		if ( d ) {
			const unit = { m: 60, h: 3600, d: 86400 }[
				( d[ 2 ] ?? 'm' ).toLowerCase() as 'm' | 'h' | 'd'
			];
			at = new Date( now.getTime() + Number( d[ 1 ] ) * unit * 1000 );
			used = 2;
		}
	} else if ( first === 'tomorrow' ) {
		at = new Date( now );
		at.setDate( at.getDate() + 1 );
		at.setHours( 9, 0, 0, 0 );
		used = setTime( at, words[ 1 ] ) ? 2 : 1;
	} else if ( /^\d{4}-\d{2}-\d{2}$/.test( first ) ) {
		const [ y, mo, d ] = first.split( '-' ).map( Number );
		at = new Date( y ?? 0, ( mo ?? 1 ) - 1, d ?? 1, 9, 0, 0, 0 );
		used = setTime( at, words[ 1 ] ) ? 2 : 1;
	} else if ( TIME.test( first ) ) {
		at = new Date( now );
		setTime( at, first );
		if ( at <= now ) {
			at.setDate( at.getDate() + 1 );
		}
		used = 1;
	}
	if ( ! at || Number.isNaN( at.getTime() ) || at <= now ) {
		return null;
	}
	return { at, note: words.slice( used ).join( ' ' ) };
}
