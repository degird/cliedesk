/**
 * Reports → time in each status (RPT-16) for the conversations created in the period.
 *
 * - GET reports/status-time → {statuses: [{status, label, seconds, conversations, average}], conversations, lifetime}.
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { formatMetric } from './format';

interface StatusRow {
	status: string;
	label: string;
	seconds: number;
	conversations: number;
	average: number | null;
}

export function StatusTime( { query }: { query: Record< string, string > } ) {
	const q = useQuery( {
		queryKey: [ 'reports', 'status-time', query ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					statuses: StatusRow[];
					conversations: number;
					lifetime: number;
				} >( 'reports/status-time', { query, signal } )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	return (
		<section
			aria-labelledby="cd-rpt-status-time"
			className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
		>
			<h3 id="cd-rpt-status-time" className="text-sm font-semibold">
				{ __(
					'Time in each status (conversations created in the period)',
					'cliedesk'
				) }
			</h3>
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-line">
						<th scope="col" className="p-2 text-start">
							{ __( 'Status', 'cliedesk' ) }
						</th>
						<th scope="col" className="p-2 text-end">
							{ __( 'Total', 'cliedesk' ) }
						</th>
						<th scope="col" className="p-2 text-end">
							{ __( 'Average per conversation', 'cliedesk' ) }
						</th>
					</tr>
				</thead>
				<tbody>
					{ q.data.statuses.map( ( r ) => (
						<tr
							key={ r.status }
							className="border-b border-line last:border-0"
						>
							<th
								scope="row"
								className="p-2 text-start font-normal"
							>
								{ r.label }
							</th>
							<td className="p-2 text-end tabular-nums">
								{ formatMetric( 'seconds', r.seconds ) }
							</td>
							<td className="p-2 text-end tabular-nums">
								{ formatMetric( 'seconds', r.average ) }
							</td>
						</tr>
					) ) }
					{ q.data.statuses.length === 0 && (
						<tr>
							<td colSpan={ 3 } className="p-2 text-fg-muted">
								{ __(
									'No conversations in this period.',
									'cliedesk'
								) }
							</td>
						</tr>
					) }
				</tbody>
			</table>
		</section>
	);
}
