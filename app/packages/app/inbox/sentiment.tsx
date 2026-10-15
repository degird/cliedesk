/**
 * Sentiment icon (TRI-07): the Sentiment field (set by agents or rules; AI with Pro) as a small face in the inbox
 * list and the conversation header. -2 very negative … 2 very positive; neutral shows nothing.
 */
import { __ } from '@wordpress/i18n';

/**
 * Accessible label of a sentiment value.
 *
 * @param value -2..2.
 */
export function sentimentLabel( value: number ): string {
	switch ( value ) {
		case -2:
			return __( 'Sentiment: very negative', 'cliedesk' );
		case -1:
			return __( 'Sentiment: negative', 'cliedesk' );
		case 1:
			return __( 'Sentiment: positive', 'cliedesk' );
		case 2:
			return __( 'Sentiment: very positive', 'cliedesk' );
	}
	return __( 'Sentiment: neutral', 'cliedesk' );
}

/**
 * The face.
 *
 * @param props       Props.
 * @param props.value -2..2, or null when not set.
 */
export function SentimentMark( { value }: { value?: number | null } ) {
	if ( value === null || value === undefined || value === 0 ) {
		return null;
	}
	const sad = value < 0;
	return (
		<svg
			role="img"
			aria-label={ sentimentLabel( value ) }
			viewBox="0 0 16 16"
			width="16"
			height="16"
			className={ sad ? 'shrink-0 text-danger' : 'shrink-0 text-success' }
			fill="none"
			stroke="currentColor"
			strokeWidth={ value === -2 || value === 2 ? 2 : 1.5 }
		>
			<title>{ sentimentLabel( value ) }</title>
			<circle cx="8" cy="8" r="6.5" />
			<path d={ sad ? 'M5 11q3-3 6 0' : 'M5 9.5q3 3 6 0' } />
		</svg>
	);
}
