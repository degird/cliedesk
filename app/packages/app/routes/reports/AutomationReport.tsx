/**
 * Reports → Automation (RPT-23): per rule, how often its trigger fired, how often it ran, failed runs and actions
 * done, failed or held back; saved reply uses by agents.
 *
 * - GET reports/automation → {rules: [{id, name, triggered, runs, failed, actions, errors, held}], replies: [{id,
 *   name, uses, people}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';

interface Rule {
	id: number;
	name: string;
	triggered: number;
	runs: number;
	failed: number;
	actions: number;
	errors: number;
	held: number;
}

export function AutomationReport( {
	query,
}: {
	query: Record< string, string >;
} ) {
	const q = useQuery( {
		queryKey: [ 'reports', 'automation', query ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					rules: Rule[];
					replies: {
						id: number;
						name: string;
						uses: number;
						people: number;
					}[];
				} >( 'reports/automation', { query, signal } )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const cols: [ keyof Rule, string ][] = [
		[ 'triggered', __( 'Triggered', 'cliedesk' ) ],
		[ 'runs', __( 'Ran', 'cliedesk' ) ],
		[ 'failed', __( 'Failed runs', 'cliedesk' ) ],
		[ 'actions', __( 'Actions done', 'cliedesk' ) ],
		[ 'errors', __( 'Action errors', 'cliedesk' ) ],
		[ 'held', __( 'Held back', 'cliedesk' ) ],
	];
	return (
		<div className="flex flex-col gap-4">
			<table className="w-full rounded-lg border border-line bg-surface text-sm">
				<thead>
					<tr className="border-b border-line">
						<th scope="col" className="p-2 text-start">
							{ __( 'Rule', 'cliedesk' ) }
						</th>
						{ cols.map( ( [ k, label ] ) => (
							<th key={ k } scope="col" className="p-2 text-end">
								{ label }
							</th>
						) ) }
					</tr>
				</thead>
				<tbody>
					{ q.data.rules.map( ( r ) => (
						<tr
							key={ r.id }
							className="border-b border-line last:border-0"
						>
							<th
								scope="row"
								className="p-2 text-start font-normal"
							>
								{ r.name }
							</th>
							{ cols.map( ( [ k ] ) => (
								<td
									key={ k }
									className="p-2 text-end tabular-nums"
								>
									{ r[ k ] }
								</td>
							) ) }
						</tr>
					) ) }
				</tbody>
			</table>
			<h3 className="font-semibold">
				{ __( 'Saved replies used', 'cliedesk' ) }
			</h3>
			<ul className="flex flex-col gap-1 text-sm">
				{ q.data.replies.map( ( r ) => (
					<li key={ r.id } className="flex justify-between gap-2">
						<span>{ r.name }</span>
						<span className="tabular-nums text-fg-muted">
							{ `${ r.uses } · ${ r.people } ${ __( 'people', 'cliedesk' ) }` }
						</span>
					</li>
				) ) }
				{ q.data.replies.length === 0 && (
					<li className="text-fg-muted">
						{ __(
							'No saved replies used in this period.',
							'cliedesk'
						) }
					</li>
				) }
			</ul>
		</div>
	);
}
