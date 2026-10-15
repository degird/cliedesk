/**
 * Reports → split table (RPT-04, RPT-10): new, resolved, median first response and resolution, replies, CSAT and
 * one-touch % per value of a dimension (channel, status, priority, type, product, language, organization, country,
 * segment; the list comes from `reports/metrics`, Pro adds its splits there); chat numbers per channel (missed chats,
 * chat length, messages per conversation, returning customers); every column sorts both ways; a search box when there
 * are many rows. Pro's fills render this table through the reports kit with more columns (`extraColumns`) and numbers
 * that open their conversations (`renderCell`).
 *
 * - GET reports/breakdown?by → {items: [{key, label, created, resolved, firstResponse, resolution, replies, csat,
 *   oneTouch}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { Select, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type ReactNode } from 'react';
import { channelLabel, priorityLabel } from '../../inbox/labels';
import { formatMetric, type MetricUnit } from './format';

export interface SplitRow {
	key: string | null;
	label: string;
	created: number;
	resolved: number;
	firstResponse: number | null;
	resolution: number | null;
	replies: number;
	csat: number | null;
	oneTouch?: number | null;
	missed?: number;
	chatDuration?: number | null;
	messagesPer?: number | null;
	returning?: number;
	[ more: string ]: unknown;
}

export interface SplitColumn {
	id: string;
	label: string;
	unit: MetricUnit;
}

export interface Dimension {
	id: string;
	label: string;
}

/**
 * Rows sorted by a column (largest first by default; empty values last).
 *
 * @param rows Rows.
 * @param col  Column.
 * @param asc  Smallest first.
 */
export function sortRows(
	rows: SplitRow[],
	col: string,
	asc = false
): SplitRow[] {
	const num = ( v: unknown ) => ( typeof v === 'number' ? v : null );
	return [ ...rows ].sort( ( a, b ) => {
		const x = num( a[ col ] );
		const y = num( b[ col ] );
		if ( x === null || y === null ) {
			return ( x === null ? 1 : 0 ) - ( y === null ? 1 : 0 );
		}
		return asc ? x - y : y - x;
	} );
}

const FALLBACK = (): Dimension[] => [
	{ id: 'channel', label: __( 'Channel', 'cliedesk' ) },
];

export function Breakdown( {
	query,
	business,
	dimensions,
	initialBy = 'channel',
	title = __( 'Split', 'cliedesk' ),
	extraColumns,
	renderCell,
}: {
	query: Record< string, string >;
	business: boolean;
	/** What the table splits by (reports/metrics `dimensions`). */
	dimensions?: Dimension[];
	initialBy?: string;
	title?: string;
	/** More columns for a split (Pro: the period before, corrections). */
	extraColumns?: ( by: string ) => SplitColumn[];
	/** A cell (Pro: a number that opens its conversations); `name` is the row's shown label. */
	renderCell?: ( args: {
		by: string;
		row: SplitRow;
		name: string;
		column: SplitColumn | null;
		text: string;
	} ) => ReactNode;
} ) {
	const options = dimensions?.length ? dimensions : FALLBACK();
	const [ chosen, setBy ] = useState( initialBy );
	const by = options.some( ( d ) => d.id === chosen )
		? chosen
		: ( options[ 0 ]?.id ?? 'channel' );
	const [ col, setCol ] = useState( 'created' );
	const [ asc, setAsc ] = useState( false );
	const [ search, setSearch ] = useState( '' );
	const q = useQuery( {
		queryKey: [ 'reports', 'breakdown', by, query, business ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: SplitRow[] } >( 'reports/breakdown', {
					query: { ...query, by, business },
					signal,
				} )
			).data?.items ?? [],
		retry: false,
	} );
	const name = ( r: SplitRow ) => {
		if ( by === 'channel' ) {
			return channelLabel( r.label );
		}
		return by === 'priority' ? priorityLabel( r.label ) : r.label;
	};
	const rows = sortRows( q.data ?? [], col, asc ).filter(
		( r ) =>
			! search || name( r ).toLowerCase().includes( search.toLowerCase() )
	);
	const cols: SplitColumn[] = [
		{ id: 'created', label: __( 'New', 'cliedesk' ), unit: 'count' },
		{ id: 'resolved', label: __( 'Resolved', 'cliedesk' ), unit: 'count' },
		{
			id: 'firstResponse',
			label: __( 'First response', 'cliedesk' ),
			unit: 'seconds',
		},
		{
			id: 'resolution',
			label: __( 'Resolution', 'cliedesk' ),
			unit: 'seconds',
		},
		{ id: 'replies', label: __( 'Replies', 'cliedesk' ), unit: 'count' },
		{ id: 'csat', label: __( 'CSAT', 'cliedesk' ), unit: 'percent' },
		{
			id: 'oneTouch',
			label: __( 'One touch', 'cliedesk' ),
			unit: 'percent',
		},
		...( extraColumns?.( by ) ?? [] ),
	];
	if ( by === 'channel' ) {
		cols.push(
			{
				id: 'messagesPer',
				label: __( 'Messages per conversation', 'cliedesk' ),
				unit: 'count',
			},
			{
				id: 'returning',
				label: __( 'Returning customers', 'cliedesk' ),
				unit: 'count',
			},
			{
				id: 'missed',
				label: __( 'Missed chats', 'cliedesk' ),
				unit: 'count',
			},
			{
				id: 'chatDuration',
				label: __( 'Chat length', 'cliedesk' ),
				unit: 'seconds',
			}
		);
	}
	const cell = ( r: SplitRow, c: SplitColumn ) => {
		const v = r[ c.id ];
		const text = formatMetric( c.unit, typeof v === 'number' ? v : null );
		return renderCell
			? renderCell( { by, row: r, name: name( r ), column: c, text } )
			: text;
	};
	return (
		<section aria-labelledby="cd-rpt-split" className="flex flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<h2 id="cd-rpt-split" className="font-semibold">
					{ title }
				</h2>
				<div className="flex flex-wrap items-end gap-3">
					{ options.length > 1 && (
						<Select
							label={ __( 'Split by', 'cliedesk' ) }
							value={ by }
							onChange={ setBy }
							options={ options }
						/>
					) }
					{ ( q.data?.length ?? 0 ) > 15 && (
						<TextField
							label={ __( 'Find', 'cliedesk' ) }
							type="search"
							value={ search }
							onChange={ setSearch }
						/>
					) }
				</div>
			</div>
			<div className="overflow-x-auto rounded-lg border border-line bg-surface">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-line text-start">
							<th scope="col" className="p-2 text-start">
								{ options.find( ( b ) => b.id === by )?.label }
							</th>
							{ cols.map( ( c ) => (
								<th
									key={ c.id }
									scope="col"
									className="p-2 text-end"
									aria-sort={
										// eslint-disable-next-line no-nested-ternary
										col !== c.id
											? 'none'
											: asc
												? 'ascending'
												: 'descending'
									}
								>
									<button
										type="button"
										className="font-semibold"
										onClick={ () => {
											setAsc(
												col === c.id ? ! asc : false
											);
											setCol( c.id );
										} }
									>
										{ c.label }
									</button>
								</th>
							) ) }
						</tr>
					</thead>
					<tbody>
						{ rows.map( ( r ) => (
							<tr
								key={ r.key ?? '-' }
								className="border-b border-line last:border-0"
							>
								<th
									scope="row"
									className="p-2 text-start font-normal"
								>
									{ renderCell
										? renderCell( {
												by,
												row: r,
												name: name( r ),
												column: null,
												text: name( r ),
											} )
										: name( r ) }
								</th>
								{ cols.map( ( c ) => (
									<td
										key={ c.id }
										className="p-2 text-end tabular-nums"
									>
										{ cell( r, c ) }
									</td>
								) ) }
							</tr>
						) ) }
						{ q.isSuccess && rows.length === 0 && (
							<tr>
								<td
									colSpan={ cols.length + 1 }
									className="p-3 text-fg-muted"
								>
									{ __(
										'No conversations in this period.',
										'cliedesk'
									) }
								</td>
							</tr>
						) }
					</tbody>
				</table>
			</div>
		</section>
	);
}
