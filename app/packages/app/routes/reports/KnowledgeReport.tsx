/**
 * Reports → Knowledge (RPT-27): views, helpful %, conversations avoided per article, searches without results and
 * totals for the period; the article table downloads as CSV.
 *
 * - GET reports/knowledge → {totals: {views, deflected, failedSearches}, articles: [{id, title, views, helpful,
 *   unhelpful, helpfulPct, deflected}], failed: [{query, searches}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { Button, LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { formatMetric } from './format';

interface Article {
	id: number;
	title: string;
	views: number;
	helpful: number;
	unhelpful: number;
	helpfulPct: number | null;
	deflected: number;
	/** Conversations started on the article's page (RPT-27). */
	afterReading?: number;
}

/**
 * Rows as CSV (formula-safe cells, quoted when needed).
 *
 * @param rows Articles.
 */
export function articlesCsv( rows: Article[] ): string {
	const cell = ( v: string | number | null ) => {
		let s = v === null ? '' : String( v );
		if ( /^[=+\-@]/.test( s ) ) {
			s = `'${ s }`;
		}
		return /[",\n]/.test( s ) ? `"${ s.replace( /"/g, '""' ) }"` : s;
	};
	return [
		[
			'id',
			'title',
			'views',
			'helpful',
			'unhelpful',
			'helpful_pct',
			'deflected',
			'after_reading',
		],
		...rows.map( ( r ) => [
			r.id,
			r.title,
			r.views,
			r.helpful,
			r.unhelpful,
			r.helpfulPct,
			r.deflected,
			r.afterReading ?? 0,
		] ),
	]
		.map( ( line ) => line.map( cell ).join( ',' ) )
		.join( '\n' );
}

export function KnowledgeReport( {
	query,
}: {
	query: Record< string, string >;
} ) {
	const q = useQuery( {
		queryKey: [ 'reports', 'knowledge', query ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					totals: {
						views: number;
						deflected: number;
						failedSearches: number;
					};
					articles: Article[];
					failed: { query: string; searches: number }[];
				} >( 'reports/knowledge', { query, signal } )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const d = q.data;
	const download = () => {
		const url = URL.createObjectURL(
			new Blob( [ articlesCsv( d.articles ) ], { type: 'text/csv' } )
		);
		const a = document.createElement( 'a' );
		a.href = url;
		a.download = 'articles.csv';
		document.body.appendChild( a );
		a.click();
		a.remove();
		window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
	};
	return (
		<div className="flex flex-col gap-4">
			<dl className="grid grid-cols-3 gap-3">
				{ (
					[
						[ __( 'Article views', 'cliedesk' ), d.totals.views ],
						[
							__( 'Conversations avoided', 'cliedesk' ),
							d.totals.deflected,
						],
						[
							__( 'Searches without results', 'cliedesk' ),
							d.totals.failedSearches,
						],
					] as [ string, number ][]
				 ).map( ( [ k, v ] ) => (
					<div
						key={ k }
						className="rounded-lg border border-line bg-surface p-3"
					>
						<dt className="text-sm text-fg-muted">{ k }</dt>
						<dd className="text-2xl font-semibold tabular-nums">
							{ v }
						</dd>
					</div>
				) ) }
			</dl>
			<div className="flex items-center justify-between gap-2">
				<h3 className="font-semibold">
					{ __( 'Articles', 'cliedesk' ) }
				</h3>
				<Button
					size="sm"
					isDisabled={ ! d.articles.length }
					onPress={ download }
				>
					{ __( 'Download CSV', 'cliedesk' ) }
				</Button>
			</div>
			<table className="w-full rounded-lg border border-line bg-surface text-sm">
				<thead>
					<tr className="border-b border-line">
						<th scope="col" className="p-2 text-start">
							{ __( 'Article', 'cliedesk' ) }
						</th>
						<th scope="col" className="p-2 text-end">
							{ __( 'Views', 'cliedesk' ) }
						</th>
						<th scope="col" className="p-2 text-end">
							{ __( 'Helpful', 'cliedesk' ) }
						</th>
						<th scope="col" className="p-2 text-end">
							{ __( 'Avoided', 'cliedesk' ) }
						</th>
						<th scope="col" className="p-2 text-end">
							{ __( 'Conversations after reading', 'cliedesk' ) }
						</th>
					</tr>
				</thead>
				<tbody>
					{ d.articles.map( ( r ) => (
						<tr
							key={ r.id }
							className="border-b border-line last:border-0"
						>
							<th
								scope="row"
								className="p-2 text-start font-normal"
							>
								{ r.title }
							</th>
							<td className="p-2 text-end tabular-nums">
								{ r.views }
							</td>
							<td className="p-2 text-end tabular-nums">
								{ formatMetric( 'percent', r.helpfulPct ) }
							</td>
							<td className="p-2 text-end tabular-nums">
								{ r.deflected }
							</td>
							<td className="p-2 text-end tabular-nums">
								{ r.afterReading ?? 0 }
							</td>
						</tr>
					) ) }
				</tbody>
			</table>
			<h3 className="font-semibold">
				{ __( 'Searches without results', 'cliedesk' ) }
			</h3>
			<ul className="flex flex-col gap-1 text-sm">
				{ d.failed.map( ( f ) => (
					<li key={ f.query } className="flex justify-between gap-2">
						<span>{ f.query }</span>
						<span className="tabular-nums text-fg-muted">
							{ f.searches }
						</span>
					</li>
				) ) }
			</ul>
		</div>
	);
}
