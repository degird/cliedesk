/**
 * Reports → Widget (RPT-30): widget loads, opens, chats started and help searches, in total and per page path.
 *
 * - GET reports/widget → {totals: {loads, opens, chats, searches}, pages: [{page, loads, opens, chats, searches}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';

type Counts = Record< 'loads' | 'opens' | 'chats' | 'searches', number >;

export function WidgetReport( { query }: { query: Record< string, string > } ) {
	const q = useQuery( {
		queryKey: [ 'reports', 'widget', query ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					totals: Counts;
					pages: ( Counts & { page: string } )[];
				} >( 'reports/widget', { query, signal } )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const cols: [ keyof Counts, string ][] = [
		[ 'loads', __( 'Loads', 'cliedesk' ) ],
		[ 'opens', __( 'Opens', 'cliedesk' ) ],
		[ 'chats', __( 'Chats started', 'cliedesk' ) ],
		[ 'searches', __( 'Help searches', 'cliedesk' ) ],
	];
	return (
		<div className="flex flex-col gap-4">
			<dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{ cols.map( ( [ k, label ] ) => (
					<div
						key={ k }
						className="rounded-lg border border-line bg-surface p-3"
					>
						<dt className="text-sm text-fg-muted">{ label }</dt>
						<dd className="text-2xl font-semibold tabular-nums">
							{ q.data?.totals[ k ] ?? 0 }
						</dd>
					</div>
				) ) }
			</dl>
			<table className="w-full rounded-lg border border-line bg-surface text-sm">
				<thead>
					<tr className="border-b border-line">
						<th scope="col" className="p-2 text-start">
							{ __( 'Page', 'cliedesk' ) }
						</th>
						{ cols.map( ( [ k, label ] ) => (
							<th key={ k } scope="col" className="p-2 text-end">
								{ label }
							</th>
						) ) }
					</tr>
				</thead>
				<tbody>
					{ q.data.pages.map( ( p ) => (
						<tr
							key={ p.page }
							className="border-b border-line last:border-0"
						>
							<th
								scope="row"
								className="p-2 text-start font-normal"
							>
								<bdi>{ p.page }</bdi>
							</th>
							{ cols.map( ( [ k ] ) => (
								<td
									key={ k }
									className="p-2 text-end tabular-nums"
								>
									{ p[ k ] }
								</td>
							) ) }
						</tr>
					) ) }
				</tbody>
			</table>
		</div>
	);
}
