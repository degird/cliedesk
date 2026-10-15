/**
 * "Matches N conversations now" under a condition editor (AUT-23): asks the server (POST conditions/preview) a moment
 * after the conditions stop changing.
 */
import { api, useQuery } from '@cliedesk/data';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';

export function ConditionPreview( { json }: { json: string } ) {
	const [ settled, setSettled ] = useState( json );
	useEffect( () => {
		const t = window.setTimeout( () => setSettled( json ), 400 );
		return () => window.clearTimeout( t );
	}, [ json ] );
	const q = useQuery( {
		queryKey: [ 'conditions', 'preview', settled ],
		queryFn: async () =>
			(
				await api.post< { count: number } >( 'conditions/preview', {
					body: { conditions: settled },
				} )
			).data,
		retry: false,
	} );
	let text: string = __( 'Counting matching conversations…', 'cliedesk' );
	if ( q.isError ) {
		text = __(
			'Fix the conditions to see how many conversations match.',
			'cliedesk'
		);
	} else if ( q.data ) {
		text = sprintf(
			/* translators: %d: number of conversations. */
			_n(
				'Matches %d conversation now.',
				'Matches %d conversations now.',
				q.data.count,
				'cliedesk'
			),
			q.data.count
		);
	}
	return (
		<p role="status" className="text-sm text-fg-muted">
			{ text }
		</p>
	);
}
