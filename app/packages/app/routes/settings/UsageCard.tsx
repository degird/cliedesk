/**
 * Settings → Developer → Setup Health → Usage (ADM-10, ADM-23 Free part): queue lag, failed jobs, how jobs run,
 * messages per channel (last 30 days) and the largest tables. No hard caps: numbers only. Pro's incoming mailboxes
 * fill the `usage.mailboxes` slot (fill prop `usage`).
 *
 * - GET system/usage → {queueLag, failedJobs, cron, sizes, messages, index} (+ Pro's `mailboxes`).
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion, Slot } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { Muted } from '../../inbox/components';

interface Usage {
	queueLag: Record< string, number >;
	failedJobs: number;
	cron: { source: string; lastRun: string | null; wpCronDisabled: boolean };
	sizes: Array< { table: string; rows: number; bytes: number } >;
	messages: Array< { channel: string; messages: number } >;
	/** ADM-10: search index freshness. */
	index?: { documents: number; lastIndexedAt: string | null; stale: number };
}

const mb = ( bytes: number ) =>
	sprintf(
		/* translators: %s: size in megabytes. */
		__( '%s MB', 'cliedesk' ),
		( bytes / 1048576 ).toFixed( 1 )
	);

function Usage() {
	const q = useQuery( {
		queryKey: [ 'system', 'usage' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Usage >( 'system/usage', { signal } ) ).data,
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	if ( q.isError || ! q.data ) {
		return (
			<Muted>{ __( 'Usage could not be loaded.', 'cliedesk' ) }</Muted>
		);
	}
	const u = q.data;
	const row = ( label: string, value: string ) => (
		<div key={ label } className="flex justify-between gap-4 py-1">
			<dt className="text-fg-muted">{ label }</dt>
			<dd className="cd-tabular text-end">{ value }</dd>
		</div>
	);
	return (
		<div className="flex flex-col gap-4 pt-3 text-sm">
			<dl className="divide-y divide-line">
				{ Object.entries( u.queueLag ?? {} ).map( ( [ queue, lag ] ) =>
					row(
						sprintf(
							/* translators: %s: queue name. */
							__( 'Queue lag: %s', 'cliedesk' ),
							queue
						),
						sprintf(
							/* translators: %d: seconds. */
							__( '%d s', 'cliedesk' ),
							lag
						)
					)
				) }
				{ row(
					__( 'Failed jobs', 'cliedesk' ),
					String( u.failedJobs )
				) }
				{ row(
					__( 'Jobs run by', 'cliedesk' ),
					u.cron?.wpCronDisabled
						? __( 'a real cron job', 'cliedesk' )
						: ( u.cron?.source ?? '' )
				) }
				{ u.index &&
					row(
						__( 'Search index', 'cliedesk' ),
						sprintf(
							/* translators: 1: indexed documents, 2: articles waiting, 3: date and time. */
							__(
								'%1$d documents, %2$d waiting, updated %3$s',
								'cliedesk'
							),
							u.index.documents,
							u.index.stale,
							u.index.lastIndexedAt?.slice( 0, 16 ) ??
								__( 'never', 'cliedesk' )
						)
					) }
			</dl>
			<Slot name="usage.mailboxes" fillProps={ { usage: u } } />
			<section aria-labelledby="cd-usage-messages">
				<h3 id="cd-usage-messages" className="font-semibold">
					{ __( 'Messages, last 30 days', 'cliedesk' ) }
				</h3>
				<dl className="divide-y divide-line">
					{ ( u.messages ?? [] ).map( ( m ) =>
						row( m.channel, String( m.messages ) )
					) }
				</dl>
			</section>
			<section aria-labelledby="cd-usage-sizes">
				<h3 id="cd-usage-sizes" className="font-semibold">
					{ __( 'Largest tables', 'cliedesk' ) }
				</h3>
				<dl className="divide-y divide-line">
					{ ( u.sizes ?? [] )
						.slice( 0, 8 )
						.map( ( s ) => row( s.table, mb( s.bytes ) ) ) }
				</dl>
			</section>
		</div>
	);
}

export function UsageCard() {
	const [ open, setOpen ] = useState( false );
	return (
		<details
			className="rounded-lg border border-line bg-surface p-4"
			onToggle={ ( e ) => setOpen( e.currentTarget.open ) }
		>
			<summary className="cursor-pointer font-semibold">
				{ __( 'Usage and sizes', 'cliedesk' ) }
			</summary>
			{ open && <Usage /> }
		</details>
	);
}
