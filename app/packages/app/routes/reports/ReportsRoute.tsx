/**
 * `/reports`: the Overview report (RPT-01, RPT-02, RPT-04, RPT-10): key numbers with each metric's formula, the split
 * table and a daily created/resolved chart, for a period in the report time zone, in calendar or business hours,
 * medians or averages, with the same filters as the conversation list; and the Backlog, Automation, Knowledge, Widget
 * and CSAT tabs.
 *
 * Cliedesk Pro (FPS-08) fills: `reports.toolbar` (saved views, share links; `current` + `onApply` + `tab` + `onTab`),
 * `reports.options` (compare with the period before), `reports.overview` and `reports.split` (the key numbers and the
 * split through the reports kit, with the period before, targets and the conversations behind a number),
 * `reports.targets`, `reports.busiest_times` and the tabs `reports.sla`, `reports.team` and `reports.topics` (each
 * shows only with a fill). Without Pro those slots show PRO badges.
 *
 * - GET reports/metrics → {items: {key: {label, unit, formula}}, timezone, dimensions: [{id, label}]}.
 * - GET reports/overview?from&to&business&average → {period, metrics}.
 * - GET reports/series?metric=created|resolved → {items: [{date, value}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import {
	LoadingRegion,
	Switch,
	Tab,
	TabList,
	TabPanel,
	Tabs,
	TextField,
	Slot,
	useSlotHasFills,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useCallback, useState, type Key } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { QueryFailed } from '../../inbox/components';
import { Breakdown, type Dimension } from './Breakdown';
import { BacklogReport } from './Backlog';
import { AutomationReport } from './AutomationReport';
import { KnowledgeReport } from './KnowledgeReport';
import { WidgetReport } from './WidgetReport';
import { CsatReport } from './CsatReport';
import { FiltersBar, type ReportScopeFilters } from './FiltersBar';
import { StatusTime } from './StatusTime';
import { formatMetric } from './format';
import { KeyNumbers, type Metric, type Values } from './KeyNumbers';
import { reportsKit } from './kit';

export { formatMetric } from './format';

/** The report state Pro's fills read and set (saved views, share links, compare). */
export type ReportFilters = {
	from?: string;
	to?: string;
	business?: boolean;
	average?: boolean;
} & ReportScopeFilters &
	Record< string, string | number | boolean | undefined >;

const SCOPE = [ 'channel', 'teamId', 'queueId', 'agentId' ] as const;

export default function ReportsRoute() {
	const [ from, setFrom ] = useState( '' );
	const [ to, setTo ] = useState( '' );
	const [ business, setBusiness ] = useState( false );
	const [ average, setAverage ] = useState( false );
	// A link may open a tab (`?tab=backlog`).
	const [ tab, setTab ] = useState(
		() =>
			new URLSearchParams( window.location.search ).get( 'tab' ) ??
			'overview'
	);
	const [ scope, setScope ] = useState< ReportScopeFilters >( {} );
	// Report input a Pro fill adds (e.g. compare).
	const [ options, setOptions ] = useState<
		Record< string, string | boolean >
	>( {} );
	// RPT-13 (SLA), RPT-11 (Team) and TRI-27 (Topics) are Pro tabs: shown only with a fill, PRO badges below.
	const slaTab = useSlotHasFills( 'reports.sla' );
	const teamTab = useSlotHasFills( 'reports.team' );
	const topicsTab = useSlotHasFills( 'reports.topics' );
	const apply = useCallback( ( v: ReportFilters ) => {
		const {
			from: f,
			to: t,
			business: b,
			average: av,
			channel,
			teamId,
			queueId,
			agentId,
			...rest
		} = v;
		setFrom( f ?? '' );
		setTo( t ?? '' );
		setBusiness( !! b );
		setAverage( !! av );
		setScope( { channel, teamId, queueId, agentId } );
		const more: Record< string, string | boolean > = {};
		for ( const [ k, x ] of Object.entries( rest ) ) {
			if ( typeof x === 'string' || typeof x === 'boolean' ) {
				more[ k ] = x;
			}
		}
		setOptions( more );
	}, [] );
	const valid = ( d: string ) => d === '' || /^\d{4}-\d{2}-\d{2}$/.test( d );
	const query: Record< string, string > = {
		...( from && valid( from ) ? { from } : {} ),
		...( to && valid( to ) ? { to } : {} ),
	};
	for ( const k of SCOPE ) {
		const v = scope[ k ];
		if ( v !== undefined && v !== '' ) {
			query[ k ] = String( v );
		}
	}
	for ( const [ k, v ] of Object.entries( options ) ) {
		if ( v !== false && v !== '' ) {
			query[ k ] = v === true ? '1' : v;
		}
	}
	const current: ReportFilters = {
		...( from && valid( from ) ? { from } : {} ),
		...( to && valid( to ) ? { to } : {} ),
		...scope,
		business,
		average,
		...options,
	};
	const catalog = useQuery( {
		queryKey: [ 'reports', 'metrics' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					items: Record< string, Metric >;
					timezone: string;
					dimensions?: Dimension[];
				} >( 'reports/metrics', { signal } )
			).data,
		staleTime: Infinity,
	} );
	const overview = useQuery( {
		queryKey: [ 'reports', 'overview', query, business, average ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					period: { fromDate: string; toDate: string };
					metrics: Values;
					[ more: string ]: unknown;
				} >( 'reports/overview', {
					query: { ...query, business, average },
					signal,
				} )
			).data,
	} );
	const series = useQuery( {
		queryKey: [ 'reports', 'series', query ],
		queryFn: async ( { signal } ) => {
			const get = async ( metric: string ) =>
				(
					await api.get< {
						items: { date: string; value: number }[];
					} >( 'reports/series', {
						query: { ...query, metric },
						signal,
					} )
				).data?.items ?? [];
			const [ created, resolved ] = await Promise.all( [
				get( 'created' ),
				get( 'resolved' ),
			] );
			return { created, resolved };
		},
	} );
	const metrics = catalog.data?.items ?? {};
	const dimensions = catalog.data?.dimensions ?? [];
	const max = Math.max(
		1,
		...( series.data?.created ?? [] ).map( ( d ) => d.value ),
		...( series.data?.resolved ?? [] ).map( ( d ) => d.value )
	);
	const fill = {
		query,
		business,
		average,
		current,
		onApply: apply,
		metrics,
		dimensions,
		formatMetric,
		kit: reportsKit,
	};
	const shown: Record< string, boolean > = {
		sla: slaTab,
		team: teamTab,
		topics: topicsTab,
	};
	const selected = shown[ tab ] === false ? 'overview' : tab;
	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
			<PageHeader
				title={ __( 'Reports', 'cliedesk' ) }
				description={
					catalog.data
						? sprintf(
								/* translators: %s: time zone. */
								__( 'Days and hours in %s.', 'cliedesk' ),
								catalog.data.timezone
							)
						: undefined
				}
			/>
			<Slot
				name="reports.toolbar"
				className="flex flex-col gap-3"
				fillProps={ { ...fill, tab, onTab: setTab } }
			/>
			<div className="flex flex-wrap items-end gap-4">
				<TextField
					label={ __( 'From', 'cliedesk' ) }
					type="date"
					value={ from || overview.data?.period.fromDate || '' }
					onChange={ setFrom }
				/>
				<TextField
					label={ __( 'To', 'cliedesk' ) }
					type="date"
					value={ to || overview.data?.period.toDate || '' }
					onChange={ setTo }
				/>
				<Switch isSelected={ business } onChange={ setBusiness }>
					{ __( 'Business hours', 'cliedesk' ) }
				</Switch>
				<Switch isSelected={ average } onChange={ setAverage }>
					{ __( 'Averages instead of medians', 'cliedesk' ) }
				</Switch>
				<Slot name="reports.options" fillProps={ fill } />
			</div>
			<FiltersBar value={ scope } onChange={ setScope } />
			<Tabs
				selectedKey={ selected }
				onSelectionChange={ ( k: Key ) => setTab( String( k ) ) }
			>
				<TabList label={ __( 'Reports', 'cliedesk' ) }>
					<Tab id="overview">{ __( 'Overview', 'cliedesk' ) }</Tab>
					{ slaTab && (
						<Tab id="sla">{ __( 'SLA', 'cliedesk' ) }</Tab>
					) }
					<Tab id="backlog">{ __( 'Backlog', 'cliedesk' ) }</Tab>
					{ topicsTab && (
						<Tab id="topics">{ __( 'Topics', 'cliedesk' ) }</Tab>
					) }
					<Tab id="automation">
						{ __( 'Automation', 'cliedesk' ) }
					</Tab>
					<Tab id="knowledge">{ __( 'Knowledge', 'cliedesk' ) }</Tab>
					<Tab id="widget">{ __( 'Widget', 'cliedesk' ) }</Tab>
					<Tab id="csat">{ __( 'CSAT', 'cliedesk' ) }</Tab>
					{ teamTab && (
						<Tab id="team">{ __( 'Team', 'cliedesk' ) }</Tab>
					) }
				</TabList>
				<TabPanel id="overview">
					<div className="flex flex-col gap-6">
						{ overview.isPending && <LoadingRegion /> }
						{ overview.isError && (
							<QueryFailed
								headingLevel={ 2 }
								title={ __(
									'Could not load the report',
									'cliedesk'
								) }
								error={ overview.error }
								onRetry={ () => void overview.refetch() }
							/>
						) }
						{ overview.isSuccess && (
							<Slot
								name="reports.overview"
								className="flex flex-col gap-2"
								fillProps={ { ...fill, data: overview.data } }
								fallback={
									<KeyNumbers
										metrics={ metrics }
										values={ overview.data.metrics }
									/>
								}
							/>
						) }
						<Slot
							name="reports.split"
							fillProps={ fill }
							fallback={
								<Breakdown
									query={ query }
									business={ business }
									dimensions={ dimensions }
								/>
							}
						/>
						<Slot
							name="reports.targets"
							className="flex flex-col gap-6"
							fillProps={ { ...fill, data: overview.data } }
						/>
						<section
							aria-labelledby="cd-rpt-daily"
							className="flex flex-col gap-2"
						>
							<h2 id="cd-rpt-daily" className="font-semibold">
								{ __( 'New and resolved per day', 'cliedesk' ) }
							</h2>
							<div
								className="flex h-40 items-end gap-px overflow-x-auto rounded-lg border border-line bg-surface p-3"
								role="img"
								aria-label={ ( series.data?.created ?? [] )
									.map(
										( d, i ) =>
											`${ d.date }: ${ d.value } / ${
												series.data?.resolved[ i ]
													?.value ?? 0
											}`
									)
									.join( ', ' ) }
							>
								{ ( series.data?.created ?? [] ).map(
									( d, i ) => (
										<div
											key={ d.date }
											className="flex h-full min-w-2 flex-1 items-end gap-px"
											title={ `${ d.date }: ${
												d.value
											} / ${
												series.data?.resolved[ i ]
													?.value ?? 0
											}` }
										>
											<span
												className="w-1/2 rounded-t bg-accent"
												style={ {
													height: `${
														( d.value / max ) * 100
													}%`,
												} }
											/>
											<span
												className="w-1/2 rounded-t bg-success"
												style={ {
													height: `${
														( ( series.data
															?.resolved[ i ]
															?.value ?? 0 ) /
															max ) *
														100
													}%`,
												} }
											/>
										</div>
									)
								) }
							</div>
						</section>
						<Slot name="reports.busiest_times" fillProps={ fill } />
					</div>
				</TabPanel>
				{ slaTab && (
					<TabPanel id="sla">
						<Slot name="reports.sla" fillProps={ fill } />
					</TabPanel>
				) }
				<TabPanel id="backlog">
					<div className="flex flex-col gap-4">
						<BacklogReport query={ query } />
						<StatusTime query={ query } />
					</div>
				</TabPanel>
				{ topicsTab && (
					<TabPanel id="topics">
						<Slot name="reports.topics" fillProps={ fill } />
					</TabPanel>
				) }
				<TabPanel id="automation">
					<AutomationReport query={ query } />
				</TabPanel>
				<TabPanel id="knowledge">
					<KnowledgeReport query={ query } />
				</TabPanel>
				<TabPanel id="widget">
					<WidgetReport query={ query } />
				</TabPanel>
				<TabPanel id="csat">
					<CsatReport query={ query } />
				</TabPanel>
				{ teamTab && (
					<TabPanel id="team">
						<Slot name="reports.team" fillProps={ fill } />
					</TabPanel>
				) }
			</Tabs>
			{ /* RPT-09: the Pro dashboards (a PRO badge without Pro). */ }
			<section
				aria-label={ __( 'More dashboards', 'cliedesk' ) }
				className="flex flex-col gap-1"
			>
				{ [
					...( teamTab ? [] : [ 'reports.team' ] ),
					...( topicsTab ? [] : [ 'reports.topics' ] ),
					...( slaTab ? [] : [ 'reports.sla' ] ),
					'reports.live_board',
					'reports.ai_agent',
					'reports.copilot',
					'reports.qa',
					'reports.custom',
				].map( ( slot ) => (
					<Slot key={ slot } name={ slot } />
				) ) }
			</section>
		</div>
	);
}
