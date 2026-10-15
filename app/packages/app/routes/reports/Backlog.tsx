/**
 * Reports → Backlog (RPT-16) tab. Pro adds the SLA tab (RPT-13).
 *
 * - GET reports/backlog → {open, category: {new, open, waiting}, age: {day, days3, week, older}, queues: [{queue, open}],
 *   daily: [{date, open}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';

export function BacklogReport( {
	query,
}: {
	query: Record< string, string >;
} ) {
	const q = useQuery( {
		queryKey: [ 'reports', 'backlog', query ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					open: number;
					category: Record< string, number >;
					age: Record< 'day' | 'days3' | 'week' | 'older', number >;
					queues: { queue: string; open: number }[];
					daily: { date: string; open: number }[];
				} >( 'reports/backlog', { query, signal } )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const d = q.data;
	const ages: [ string, number ][] = [
		[ __( 'Under a day', 'cliedesk' ), d.age.day ],
		[ __( '1–3 days', 'cliedesk' ), d.age.days3 ],
		[ __( '3–7 days', 'cliedesk' ), d.age.week ],
		[ __( 'Over a week', 'cliedesk' ), d.age.older ],
	];
	const cats: [ string, number ][] = [
		[ __( 'New', 'cliedesk' ), d.category.new ?? 0 ],
		[ __( 'Open', 'cliedesk' ), d.category.open ?? 0 ],
		[ __( 'Waiting', 'cliedesk' ), d.category.waiting ?? 0 ],
	];
	const max = Math.max( 1, ...d.daily.map( ( x ) => x.open ) );
	return (
		<div className="grid gap-4 md:grid-cols-3">
			{ [
				[ __( 'By status', 'cliedesk' ), cats ],
				[ __( 'By age', 'cliedesk' ), ages ],
				[
					__( 'By queue', 'cliedesk' ),
					d.queues.map( ( x ): [ string, number ] => [
						x.queue || __( 'No queue', 'cliedesk' ),
						x.open,
					] ),
				],
			].map( ( [ title, rows ] ) => (
				<section
					key={ title as string }
					className="rounded-lg border border-line bg-surface p-3"
				>
					<h3 className="mb-2 text-sm font-semibold">
						{ title as string }
					</h3>
					<dl className="grid grid-cols-[1fr_auto] gap-1 text-sm">
						{ ( rows as [ string, number ][] ).map(
							( [ k, v ] ) => (
								<div key={ k } className="contents">
									<dt>{ k }</dt>
									<dd className="text-end tabular-nums">
										{ v }
									</dd>
								</div>
							)
						) }
					</dl>
				</section>
			) ) }
			<section className="rounded-lg border border-line bg-surface p-3 md:col-span-3">
				<h3 className="mb-2 text-sm font-semibold">
					{ __( 'Open at the end of each day', 'cliedesk' ) }
				</h3>
				<div
					className="flex h-24 items-end gap-px"
					role="img"
					aria-label={ d.daily
						.map( ( x ) => `${ x.date }: ${ x.open }` )
						.join( ', ' ) }
				>
					{ d.daily.map( ( x ) => (
						<span
							key={ x.date }
							title={ `${ x.date }: ${ x.open }` }
							className="min-w-1 flex-1 rounded-t bg-accent"
							style={ { height: `${ ( x.open / max ) * 100 }%` } }
						/>
					) ) }
				</div>
			</section>
		</div>
	);
}
