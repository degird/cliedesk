/**
 * Durations written like "30m", "4h" or "1d 2h" (rule wait and timer steps; Pro's SLA targets) and the priority keys
 * of target tables.
 */
export const PRIORITIES = [
	'none',
	'low',
	'normal',
	'high',
	'urgent',
] as const;

/**
 * Seconds from "1d 2h 30m" (also "90m", "4h", "2"=hours); null for empty, NaN for nonsense.
 *
 * @param text Text.
 */
export function parseDuration( text: string ): number | null {
	const t = text.trim().toLowerCase();
	if ( t === '' ) {
		return null;
	}
	if ( /^\d+(\.\d+)?$/.test( t ) ) {
		return Math.round( Number( t ) * 3600 );
	}
	let total = 0;
	let rest = t;
	for ( const [ unit, secs ] of [
		[ 'd', 86400 ],
		[ 'h', 3600 ],
		[ 'm', 60 ],
	] as const ) {
		const m = new RegExp( `(\\d+(?:\\.\\d+)?)\\s*${ unit }` ).exec( rest );
		if ( m ) {
			total += Number( m[ 1 ] ) * secs;
			rest = rest.replace( m[ 0 ], '' );
		}
	}
	return rest.trim() === '' && total > 0 ? Math.round( total ) : NaN;
}

/**
 * "1d 2h 30m" from seconds.
 *
 * @param secs Seconds.
 */
export function formatDuration( secs: number | null ): string {
	if ( ! secs ) {
		return '';
	}
	const d = Math.floor( secs / 86400 );
	const h = Math.floor( ( secs % 86400 ) / 3600 );
	const m = Math.round( ( secs % 3600 ) / 60 );
	return [ d && `${ d }d`, h && `${ h }h`, m && `${ m }m` ]
		.filter( Boolean )
		.join( ' ' );
}
