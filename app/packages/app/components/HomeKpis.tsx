/**
 * Home → key numbers (RPT-08, Free): new today and in the last 7 days, the backlog and CSAT of the last 7 days (Pro
 * adds SLA at risk through the `home.kpis.sla` slot); each card shows the same value as the Reports page for that
 * period and links to it.
 *
 * - GET reports/overview?preset=today|7d → {metrics}.
 * - GET reports/backlog?preset=today → {open}.
 */
import { api, useQuery } from '@cliedesk/data';
import { Skeleton, Slot, useSlotHasFills } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';

type Metrics = Record< string, number | null >;

export function HomeKpis() {
	const sla = useSlotHasFills( 'home.kpis.sla' );
	const q = useQuery( {
		queryKey: [ 'reports', 'home' ],
		queryFn: async ( { signal } ) => {
			const get = async < T, >( path: string, preset: string ) =>
				(
					await api.get< T >( path, {
						query: { preset },
						signal,
					} )
				).data;
			const [ today, week, backlog ] = await Promise.all( [
				get< { metrics: Metrics } >( 'reports/overview', 'today' ),
				get< { metrics: Metrics } >( 'reports/overview', '7d' ),
				get< { open: number } >( 'reports/backlog', 'today' ),
			] );
			return { today, week, backlog };
		},
		staleTime: 60_000,
	} );
	if ( ! q.data ) {
		return q.isError ? null : <Skeleton lines={ 2 } />;
	}
	const csat = q.data.week?.metrics.csat;
	const cards: [ string, string ][] = [
		[
			__( 'New today', 'cliedesk' ),
			String( q.data.today?.metrics.created ?? 0 ),
		],
		[
			__( 'New in 7 days', 'cliedesk' ),
			String( q.data.week?.metrics.created ?? 0 ),
		],
		[ __( 'Backlog', 'cliedesk' ), String( q.data.backlog?.open ?? 0 ) ],
		[
			__( 'CSAT, 7 days', 'cliedesk' ),
			csat === null || csat === undefined ? '—' : `${ csat } %`,
		],
	];
	return (
		<ul
			aria-label={ __( 'Key numbers', 'cliedesk' ) }
			className={ `grid grid-cols-2 gap-3 ${
				sla ? 'md:grid-cols-5' : 'md:grid-cols-4'
			}` }
		>
			{ cards.map( ( [ label, value ] ) => (
				<li key={ label }>
					<Link
						to="/reports"
						className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 hover:border-accent"
					>
						<span className="text-sm text-fg-muted">{ label }</span>
						<span className="text-2xl font-semibold tabular-nums">
							{ value }
						</span>
					</Link>
				</li>
			) ) }
			{ sla && (
				<li>
					<Slot name="home.kpis.sla" className="h-full" />
				</li>
			) }
		</ul>
	);
}
