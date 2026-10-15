/**
 * Report number formats (RPT-02), shared by every report tab and passed to Pro's report fills in the reports kit.
 */
import { __, sprintf } from '@wordpress/i18n';

export type MetricUnit = 'count' | 'seconds' | 'percent';

/**
 * A metric value for people: 2 h 5 m, 66.7 %, 1 204.
 *
 * @param unit  Unit.
 * @param value Value.
 */
export function formatMetric(
	unit: MetricUnit,
	value: number | null | undefined
): string {
	if ( value === null || value === undefined ) {
		return '—';
	}
	if ( unit === 'percent' ) {
		return `${ value.toLocaleString() } %`;
	}
	if ( unit !== 'seconds' ) {
		return value.toLocaleString();
	}
	const s = Math.round( value );
	if ( s < 60 ) {
		/* translators: %d: seconds. */
		return sprintf( __( '%d s', 'cliedesk' ), s );
	}
	const h = Math.floor( s / 3600 );
	if ( h >= 48 ) {
		/* translators: %d: days. */
		return sprintf( __( '%d d', 'cliedesk' ), Math.round( h / 24 ) );
	}
	const m = Math.floor( ( s % 3600 ) / 60 );
	return h > 0
		? /* translators: 1: hours, 2: minutes. */
			sprintf( __( '%1$d h %2$d m', 'cliedesk' ), h, m )
		: /* translators: %d: minutes. */
			sprintf( __( '%d m', 'cliedesk' ), m );
}
