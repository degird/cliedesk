/**
 * Reports → CSAT (CSX-21): CSAT %, response rate, the rating distribution, a daily trend and the comments (all or
 * only negative), each linking to its conversation; the comments download as CSV. Splits by agent, team, topic or
 * channel are on the Overview tab. CSAT per agent counts each answer for the agent who replied last (Cliedesk Pro also
 * counts it for every agent who replied, in the `reports.csat.agents` slot). CSX-10: with "hide CSAT" on, people without report export get no comments and only their
 * own agent row.
 *
 * - GET reports/csat?negative → {sent, ratings, responseRate, csat, distribution: [{scale, rating, count}], trend:
 *   [{date, ratings, csat}], comments: [{number, rating, positive, comment, respondedAt}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { Button, LoadingRegion, Slot, Switch } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { formatMetric } from './format';

interface Comment {
	conversationId: number;
	number: number;
	rating: number;
	positive: boolean;
	comment: string;
	respondedAt: string;
}

/**
 * Comments as CSV (formula-safe cells, quoted when needed).
 *
 * @param rows Comments.
 */
export function commentsCsv( rows: Comment[] ): string {
	const cell = ( v: string | number | boolean ) => {
		let s = String( v );
		if ( /^[=+\-@]/.test( s ) ) {
			s = `'${ s }`;
		}
		return /[",\n]/.test( s ) ? `"${ s.replace( /"/g, '""' ) }"` : s;
	};
	return [
		[ 'number', 'rating', 'positive', 'comment', 'responded_at' ],
		...rows.map( ( r ) => [
			r.number,
			r.rating,
			r.positive ? 'yes' : 'no',
			r.comment,
			r.respondedAt,
		] ),
	]
		.map( ( line ) => line.map( cell ).join( ',' ) )
		.join( '\n' );
}

interface AgentRow {
	userId: number;
	name: string;
	ratings: number;
	csat: number | null;
}

export function CsatReport( { query }: { query: Record< string, string > } ) {
	const [ negative, setNegative ] = useState( false );
	const q = useQuery( {
		queryKey: [ 'reports', 'csat', query, negative ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					sent: number;
					ratings: number;
					responseRate: number | null;
					csat: number | null;
					distribution: {
						scale: string;
						rating: number;
						count: number;
					}[];
					trend: {
						date: string;
						ratings: number;
						csat: number | null;
					}[];
					comments: Comment[];
					agents?: AgentRow[];
				} >( 'reports/csat', {
					query: { ...query, negative },
					signal,
				} )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const d = q.data;
	const most = Math.max( 1, ...d.distribution.map( ( x ) => x.count ) );
	const download = () => {
		const url = URL.createObjectURL(
			new Blob( [ commentsCsv( d.comments ) ], { type: 'text/csv' } )
		);
		const a = document.createElement( 'a' );
		a.href = url;
		a.download = 'csat-comments.csv';
		document.body.appendChild( a );
		a.click();
		a.remove();
		window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
	};
	return (
		<div className="flex flex-col gap-4">
			<dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{ (
					[
						[
							__( 'CSAT', 'cliedesk' ),
							formatMetric( 'percent', d.csat ),
						],
						[ __( 'Ratings', 'cliedesk' ), String( d.ratings ) ],
						[ __( 'Surveys sent', 'cliedesk' ), String( d.sent ) ],
						[
							__( 'Response rate', 'cliedesk' ),
							formatMetric( 'percent', d.responseRate ),
						],
					] as [ string, string ][]
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
			<section className="rounded-lg border border-line bg-surface p-3">
				<h3 className="mb-2 text-sm font-semibold">
					{ __( 'Ratings', 'cliedesk' ) }
				</h3>
				<ul className="flex flex-col gap-1 text-sm">
					{ d.distribution.map( ( x ) => (
						<li
							key={ `${ x.scale }-${ x.rating }` }
							className="flex items-center gap-2"
						>
							<span className="w-24">{ `${ x.rating } (${ x.scale })` }</span>
							<span
								className="h-3 rounded bg-accent"
								style={ {
									width: `${ ( x.count / most ) * 60 }%`,
								} }
							/>
							<span className="tabular-nums">{ x.count }</span>
						</li>
					) ) }
				</ul>
			</section>
			<section className="rounded-lg border border-line bg-surface p-3">
				<h3 className="mb-2 text-sm font-semibold">
					{ __( 'By agent', 'cliedesk' ) }
				</h3>
				<table className="w-full text-sm">
					<thead>
						<tr className="text-start text-fg-muted">
							<th className="text-start">
								{ __( 'Agent', 'cliedesk' ) }
							</th>
							<th className="text-end">
								{ __( 'Ratings', 'cliedesk' ) }
							</th>
							<th className="text-end">
								{ __( 'CSAT', 'cliedesk' ) }
							</th>
						</tr>
					</thead>
					<tbody>
						{ ( d.agents ?? [] ).map( ( r ) => (
							<tr key={ r.userId }>
								<td>{ r.name }</td>
								<td className="text-end tabular-nums">
									{ r.ratings }
								</td>
								<td className="text-end tabular-nums">
									{ formatMetric( 'percent', r.csat ) }
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			</section>
			<Slot name="reports.csat.agents" fillProps={ { query } } />
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-semibold">
					{ __( 'Comments', 'cliedesk' ) }
				</h3>
				<div className="flex items-center gap-3">
					<Switch isSelected={ negative } onChange={ setNegative }>
						{ __( 'Negative only', 'cliedesk' ) }
					</Switch>
					<Button
						size="sm"
						isDisabled={ ! d.comments.length }
						onPress={ download }
					>
						{ __( 'Download CSV', 'cliedesk' ) }
					</Button>
				</div>
			</div>
			<ul className="flex flex-col gap-2 text-sm">
				{ d.comments.map( ( c ) => (
					<li
						key={ `${ c.conversationId }-${ c.respondedAt }` }
						className="rounded-md border border-line p-2"
					>
						<Link
							to="/c/$number"
							params={ { number: String( c.number ) } }
							className="underline"
						>
							{ `#${ c.number }` }
						</Link>{ ' ' }
						<span
							className={
								c.positive ? 'text-success' : 'text-danger'
							}
						>
							{ `${ c.rating }` }
						</span>{ ' ' }
						<span>{ c.comment }</span>
					</li>
				) ) }
				{ d.comments.length === 0 && (
					<li className="text-fg-muted">
						{ __( 'No comments in this period.', 'cliedesk' ) }
					</li>
				) }
			</ul>
		</div>
	);
}
