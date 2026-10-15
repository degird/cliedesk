/**
 * Settings → Help center → Searches with no results (KB-46): what visitors looked for in the help center, the widget
 * or the portal without finding an article in the last 30 days — topics to write about.
 */
import { api, useQuery } from '@cliedesk/data';
import { __, _n, sprintf } from '@wordpress/i18n';

interface FailedSearch {
	query: string;
	searches: number;
	lastDay: string;
}

export function FailedSearches() {
	const q = useQuery( {
		queryKey: [ 'knowledge', 'failed-searches' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< FailedSearch[] >( 'knowledge/failed-searches', {
					signal,
				} )
			).data ?? [],
	} );
	return (
		<section
			aria-labelledby="cd-failed-searches"
			className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-failed-searches" className="font-semibold">
				{ __( 'Searches with no results', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'What visitors searched for in the last 30 days without finding an article.',
					'cliedesk'
				) }
			</p>
			{ q.data && q.data.length === 0 && (
				<p className="text-sm">{ __( 'None yet.', 'cliedesk' ) }</p>
			) }
			{ q.data && q.data.length > 0 && (
				<ul className="flex flex-col gap-1 text-sm">
					{ q.data.map( ( s ) => (
						<li
							key={ s.query }
							className="flex justify-between gap-2"
						>
							<bdi>{ s.query }</bdi>
							<span className="text-fg-muted">
								{ sprintf(
									/* translators: %d: number of searches. */
									_n(
										'%d search',
										'%d searches',
										s.searches,
										'cliedesk'
									),
									s.searches
								) }
							</span>
						</li>
					) ) }
				</ul>
			) }
		</section>
	);
}
