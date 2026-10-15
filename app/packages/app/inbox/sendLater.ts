/**
 * Send later (INB-51): presets (tomorrow 9:00, Monday 9:00) and custom times, in the agent's or the customer's
 * time zone. Times in a named zone are converted with Intl (no date library).
 */
import { utcValue } from './snooze';

export type SendPreset = 'tomorrow' | 'monday' | 'custom';

interface Parts {
	y: number;
	m: number;
	d: number;
	h: number;
	min: number;
	/** 0 Sunday … 6 Saturday. */
	weekday: number;
}

const WEEKDAYS = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];

/**
 * Whether the browser knows the time zone.
 *
 * @param tz IANA zone.
 */
export function validZone( tz: string | null | undefined ): tz is string {
	if ( ! tz ) {
		return false;
	}
	try {
		new Intl.DateTimeFormat( 'en-US', { timeZone: tz } ).format( 0 );
		return true;
	} catch {
		return false;
	}
}

/**
 * Wall-clock parts of an instant in a zone.
 *
 * @param at Instant.
 * @param tz IANA zone.
 */
export function zoneParts( at: Date, tz: string ): Parts {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat( 'en-US', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			weekday: 'short',
		} )
			.formatToParts( at )
			.map( ( p ) => [ p.type, p.value ] )
	);
	return {
		y: Number( parts.year ),
		m: Number( parts.month ),
		d: Number( parts.day ),
		h: Number( parts.hour ) % 24,
		min: Number( parts.minute ),
		weekday: WEEKDAYS.indexOf( String( parts.weekday ) ),
	};
}

/**
 * The instant when the wall clock in `tz` shows the given time.
 *
 * @param p  Wall-clock time (weekday ignored).
 * @param tz IANA zone.
 */
export function zonedToUtc( p: Omit< Parts, 'weekday' >, tz: string ): Date {
	const wanted = Date.UTC( p.y, p.m - 1, p.d, p.h, p.min );
	let guess = wanted;
	// Two rounds settle the offset, also next to a DST change.
	for ( let i = 0; i < 2; i++ ) {
		const s = zoneParts( new Date( guess ), tz );
		const shown = Date.UTC( s.y, s.m - 1, s.d, s.h, s.min );
		guess += wanted - shown;
	}
	return new Date( guess );
}

/**
 * Wall-clock parts in the zone, or in the browser's zone without one.
 *
 * @param at Instant.
 * @param tz IANA zone or null.
 */
function partsIn( at: Date, tz: string | null ): Parts {
	return tz
		? zoneParts( at, tz )
		: {
				y: at.getFullYear(),
				m: at.getMonth() + 1,
				d: at.getDate(),
				h: at.getHours(),
				min: at.getMinutes(),
				weekday: at.getDay(),
			};
}

/**
 * The instant of a calendar day + time in the zone (or locally).
 *
 * @param p  Wall-clock time.
 * @param tz IANA zone or null.
 */
function instant( p: Omit< Parts, 'weekday' >, tz: string | null ): Date {
	return tz
		? zonedToUtc( p, tz )
		: new Date( p.y, p.m - 1, p.d, p.h, p.min, 0, 0 );
}

/**
 * Preset times from `now`: tomorrow 9:00 and the next Monday 9:00, in the zone.
 *
 * @param now Now.
 * @param tz  IANA zone, or null for the agent's.
 */
export function sendPresets(
	now: Date,
	tz: string | null
): Array< { id: Exclude< SendPreset, 'custom' >; at: Date } > {
	const today = partsIn( now, tz );
	// Calendar arithmetic on a UTC date avoids the zone.
	const day = ( add: number ) => {
		const c = new Date( Date.UTC( today.y, today.m - 1, today.d + add ) );
		return instant(
			{
				y: c.getUTCFullYear(),
				m: c.getUTCMonth() + 1,
				d: c.getUTCDate(),
				h: 9,
				min: 0,
			},
			tz
		);
	};
	const toMonday = ( 1 - today.weekday + 7 ) % 7 || 7;
	return [
		{ id: 'tomorrow', at: day( 1 ) },
		{ id: 'monday', at: day( toMonday ) },
	];
}

/**
 * API time (UTC) of a datetime-local value read in the zone (or locally).
 *
 * @param local Value of a datetime-local input.
 * @param tz    IANA zone or null.
 */
export function customSendAt(
	local: string,
	tz: string | null
): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec( local );
	if ( ! m ) {
		return null;
	}
	const at = instant(
		{
			y: Number( m[ 1 ] ),
			m: Number( m[ 2 ] ),
			d: Number( m[ 3 ] ),
			h: Number( m[ 4 ] ),
			min: Number( m[ 5 ] ),
		},
		tz
	);
	return Number.isNaN( at.getTime() ) ? null : utcValue( at );
}

/**
 * Date and time of an instant in the zone, for labels.
 *
 * @param at Instant.
 * @param tz IANA zone or null.
 */
export function whenIn( at: Date, tz: string | null ): string {
	try {
		return new Intl.DateTimeFormat(
			( typeof document !== 'undefined' &&
				document.documentElement.lang ) ||
				undefined,
			{
				weekday: 'short',
				day: 'numeric',
				month: 'short',
				hour: 'numeric',
				minute: '2-digit',
				...( tz ? { timeZone: tz } : {} ),
			}
		).format( at );
	} catch {
		return at.toISOString();
	}
}
