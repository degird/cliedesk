/**
 * Settings → System → Audit log (SEC-32), for cliedesk_view_audit_log. Read-only: the log is append-only and
 * hash-chained, so there is nothing to edit or delete here.
 *
 * - GET audit {from, to, actorType, action (prefix with *), result, before, limit}: newest first, keyset `next`.
 * - POST audit/export {filters} → {rows, truncated, csv}: the export is itself audited.
 * - GET audit/verify → {intact, checked, brokenAt}.
 */
import { api, useInfiniteQuery, useMutation } from '@cliedesk/data';
import { Banner, Button, LoadingRegion, Select, TextField } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import { saveFile } from '../../inbox/TranscriptDialog';

export interface AuditEntry {
	id: number;
	createdAt: string;
	actorType: string;
	actorId: number | null;
	actorLabel: string;
	via: string;
	result: 'success' | 'denied' | 'failed';
	reason: string | null;
	ip: string | null;
	action: string;
	objectType: string;
	objectId: string | null;
	productId: number | null;
	summary: string;
	before: unknown;
	after: unknown;
	requestId: string | null;
}

export interface AuditFilters {
	from: string;
	to: string;
	actorType: string;
	action: string;
	result: string;
}

const EMPTY: AuditFilters = {
	from: '',
	to: '',
	actorType: '',
	action: '',
	result: '',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTION = /^[a-z0-9_.]{1,63}\*?$/;

/**
 * Client checks of the filters, keyed by field.
 *
 * @param f Filters.
 */
export function filterErrors( f: AuditFilters ): Partial< AuditFilters > {
	const out: Partial< AuditFilters > = {};
	if ( f.from && ! DATE.test( f.from ) ) {
		out.from = __( 'Enter a valid date.', 'cliedesk' );
	}
	if ( f.to && ! DATE.test( f.to ) ) {
		out.to = __( 'Enter a valid date.', 'cliedesk' );
	}
	if ( f.from && f.to && DATE.test( f.from ) && f.from > f.to ) {
		out.to = __( 'Choose a day on or after the start.', 'cliedesk' );
	}
	if ( f.action && ! ACTION.test( f.action.trim() ) ) {
		out.action = __(
			'Lowercase letters, digits, dots and underscores; end with * for a prefix.',
			'cliedesk'
		);
	}
	return out;
}

/**
 * Query parameters for the API (empty filters left out; "to" covers the whole day).
 *
 * @param f Filters.
 */
export function filterQuery( f: AuditFilters ): Record< string, string > {
	const q: Record< string, string > = {};
	if ( f.from ) {
		q.from = f.from;
	}
	if ( f.to ) {
		q.to = `${ f.to } 23:59:59`;
	}
	if ( f.actorType ) {
		q.actorType = f.actorType;
	}
	if ( f.action.trim() ) {
		q.action = f.action.trim();
	}
	if ( f.result ) {
		q.result = f.result;
	}
	return q;
}

const actorTypes = () => [
	{ id: '', label: __( 'Anyone', 'cliedesk' ) },
	{ id: 'user', label: __( 'People', 'cliedesk' ) },
	{ id: 'rule', label: __( 'Workflows and rules', 'cliedesk' ) },
	{ id: 'api_key', label: __( 'API keys', 'cliedesk' ) },
	{ id: 'system', label: __( 'Cliedesk (system)', 'cliedesk' ) },
	{ id: 'customer', label: __( 'Customers', 'cliedesk' ) },
	{ id: 'ai', label: __( 'AI', 'cliedesk' ) },
];

const results = () => [
	{ id: '', label: __( 'Any result', 'cliedesk' ) },
	{ id: 'success', label: __( 'Done', 'cliedesk' ) },
	{ id: 'denied', label: __( 'Denied', 'cliedesk' ) },
	{ id: 'failed', label: __( 'Failed', 'cliedesk' ) },
];

const json = ( v: unknown ) =>
	null === v || undefined === v ? '' : JSON.stringify( v, null, 2 );

/**
 * Section.
 */
export default function AuditSection() {
	const [ draft, setDraft ] = useState< AuditFilters >( EMPTY );
	const [ applied, setApplied ] = useState< AuditFilters >( EMPTY );
	const [ errors, setErrors ] = useState< Partial< AuditFilters > >( {} );
	const q = useInfiniteQuery( {
		queryKey: [ 'audit', applied ] as const,
		queryFn: async ( { pageParam, signal } ) =>
			(
				await api.get< { items: AuditEntry[]; next: string | null } >(
					'audit',
					{
						query: {
							...filterQuery( applied ),
							limit: 50,
							...( pageParam ? { before: pageParam } : {} ),
						},
						signal,
					}
				)
			).data,
		initialPageParam: null as string | null,
		getNextPageParam: ( last ) =>
			last.next === null || last.next === undefined
				? undefined
				: String( last.next ),
	} );
	const exportCsv = useMutation( {
		mutationFn: async () =>
			(
				await api.post< {
					rows: number;
					truncated: boolean;
					csv: string;
				} >( 'audit/export', { body: filterQuery( applied ) } )
			).data,
		onSuccess: ( r ) =>
			saveFile( r.csv, 'cliedesk-audit-log.csv', 'text/csv' ),
	} );
	const verify = useMutation( {
		mutationFn: async () =>
			(
				await api.get< {
					intact: boolean;
					checked: number;
					brokenAt: number | null;
				} >( 'audit/verify' )
			).data,
	} );
	const set = ( k: keyof AuditFilters, v: string ) =>
		setDraft( ( d ) => ( { ...d, [ k ]: v } ) );
	const apply = ( e: FormEvent ) => {
		e.preventDefault();
		const next = filterErrors( draft );
		setErrors( next );
		if ( ! Object.keys( next ).length ) {
			setApplied( draft );
		}
	};
	const items = q.data?.pages.flatMap( ( p ) => p.items ) ?? [];
	let body;
	if ( q.isPending ) {
		body = (
			<LoadingRegion
				label={ __( 'Loading the audit log…', 'cliedesk' ) }
			/>
		);
	} else if ( q.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the audit log', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! items.length ) {
		body = <Muted>{ __( 'No entries match.', 'cliedesk' ) }</Muted>;
	} else {
		body = (
			<div className="overflow-x-auto rounded-lg border border-line bg-surface">
				<table className="w-full text-start text-sm">
					<caption className="sr-only">
						{ __( 'Audit log, newest first', 'cliedesk' ) }
					</caption>
					<thead className="text-xs text-fg-muted">
						<tr>
							<th scope="col" className="px-3 py-2 font-medium">
								{ __( 'When', 'cliedesk' ) }
							</th>
							<th scope="col" className="px-3 py-2 font-medium">
								{ __( 'Who', 'cliedesk' ) }
							</th>
							<th scope="col" className="px-3 py-2 font-medium">
								{ __( 'What', 'cliedesk' ) }
							</th>
							<th scope="col" className="px-3 py-2 font-medium">
								{ __( 'Result', 'cliedesk' ) }
							</th>
						</tr>
					</thead>
					<tbody>
						{ items.map( ( e ) => (
							<tr
								key={ e.id }
								className="border-t border-line align-top"
							>
								<td className="whitespace-nowrap px-3 py-2">
									<time dateTime={ e.createdAt }>
										{ fullTime( e.createdAt ) }
									</time>
								</td>
								<td className="px-3 py-2">
									<bdi>
										{ e.actorLabel ||
											actorTypes().find(
												( a ) => a.id === e.actorType
											)?.label ||
											e.actorType }
									</bdi>
									<span className="block text-xs text-fg-muted">
										{ e.via }
										{ e.ip ? ` · ${ e.ip }` : '' }
									</span>
								</td>
								<td className="px-3 py-2">
									<span className="block">{ e.summary }</span>
									<code className="text-xs text-fg-muted">
										{ e.action }
										{ e.objectId
											? ` · ${ e.objectType } ${ e.objectId }`
											: '' }
									</code>
									{ ( e.before !== null ||
										e.after !== null ||
										e.reason ) && (
										<details className="mt-1">
											<summary className="cursor-pointer text-xs text-accent-fg">
												{ __( 'Details', 'cliedesk' ) }
											</summary>
											{ e.reason && (
												<p className="text-xs">
													{ sprintf(
														/* translators: %s: reason given. */
														__(
															'Reason: %s',
															'cliedesk'
														),
														e.reason
													) }
												</p>
											) }
											{ e.before !== null && (
												<>
													<p className="text-xs font-medium">
														{ __(
															'Before',
															'cliedesk'
														) }
													</p>
													<pre className="max-h-48 overflow-auto rounded-sm bg-sunken p-2 text-xs">
														{ json( e.before ) }
													</pre>
												</>
											) }
											{ e.after !== null && (
												<>
													<p className="text-xs font-medium">
														{ __(
															'After',
															'cliedesk'
														) }
													</p>
													<pre className="max-h-48 overflow-auto rounded-sm bg-sunken p-2 text-xs">
														{ json( e.after ) }
													</pre>
												</>
											) }
										</details>
									) }
								</td>
								<td className="px-3 py-2">
									{ e.result === 'success' ? (
										<Pill>
											{ __( 'Done', 'cliedesk' ) }
										</Pill>
									) : (
										<Pill tone="warning">
											{ e.result === 'denied'
												? __( 'Denied', 'cliedesk' )
												: __( 'Failed', 'cliedesk' ) }
										</Pill>
									) }
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-fg-muted">
				{ __(
					'Every sensitive change, export and sign-in is recorded here. Entries cannot be changed or deleted; old ones leave after the retention period.',
					'cliedesk'
				) }
			</p>
			<form
				noValidate
				onSubmit={ apply }
				aria-label={ __( 'Filter the audit log', 'cliedesk' ) }
				className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
			>
				<TextField
					label={ __( 'From (day)', 'cliedesk' ) }
					type="date"
					value={ draft.from }
					onChange={ ( v ) => set( 'from', v ) }
					errorMessage={ errors.from }
				/>
				<TextField
					label={ __( 'To (day)', 'cliedesk' ) }
					type="date"
					value={ draft.to }
					onChange={ ( v ) => set( 'to', v ) }
					errorMessage={ errors.to }
				/>
				<Select
					label={ __( 'Who', 'cliedesk' ) }
					value={ draft.actorType }
					onChange={ ( v ) => set( 'actorType', String( v ) ) }
					options={ actorTypes() }
				/>
				<TextField
					label={ __( 'Action', 'cliedesk' ) }
					description={ __(
						'For example settings.update, or auth.* for all sign-ins.',
						'cliedesk'
					) }
					value={ draft.action }
					onChange={ ( v ) => set( 'action', v ) }
					errorMessage={ errors.action }
				/>
				<Select
					label={ __( 'Result', 'cliedesk' ) }
					value={ draft.result }
					onChange={ ( v ) => set( 'result', String( v ) ) }
					options={ results() }
				/>
				<div className="flex items-end gap-2">
					<Button type="submit" variant="primary">
						{ __( 'Show entries', 'cliedesk' ) }
					</Button>
					<Button
						variant="ghost"
						onPress={ () => {
							setDraft( EMPTY );
							setApplied( EMPTY );
							setErrors( {} );
						} }
					>
						{ __( 'Clear', 'cliedesk' ) }
					</Button>
				</div>
			</form>
			<div className="flex flex-wrap gap-2">
				<Button
					isLoading={ exportCsv.isPending }
					onPress={ () => exportCsv.mutate() }
				>
					{ __( 'Export CSV', 'cliedesk' ) }
				</Button>
				<Button
					isLoading={ verify.isPending }
					onPress={ () => verify.mutate() }
				>
					{ __( 'Check the log is intact', 'cliedesk' ) }
				</Button>
			</div>
			<ActionError
				error={ exportCsv.error ?? verify.error }
				onDismiss={ () => {
					exportCsv.reset();
					verify.reset();
				} }
			/>
			{ exportCsv.data?.truncated && (
				<Banner
					tone="warning"
					title={ sprintf(
						/* translators: %d: number of rows. */
						__(
							'The export stops at %d rows. Narrow the filters to get the rest.',
							'cliedesk'
						),
						exportCsv.data.rows
					) }
				/>
			) }
			{ verify.data && (
				<Banner
					tone={ verify.data.intact ? 'success' : 'danger' }
					role={ verify.data.intact ? 'status' : 'alert' }
					title={
						verify.data.intact
							? sprintf(
									/* translators: %d: number of entries checked. */
									_n(
										'The log is intact: %d entry checked.',
										'The log is intact: %d entries checked.',
										verify.data.checked,
										'cliedesk'
									),
									verify.data.checked
								)
							: sprintf(
									/* translators: %d: entry id. */
									__(
										'The log was changed: the chain breaks at entry %d. Tell your site owner.',
										'cliedesk'
									),
									verify.data.brokenAt ?? 0
								)
					}
				/>
			) }
			{ body }
			{ q.hasNextPage && (
				<div>
					<Button
						isLoading={ q.isFetchingNextPage }
						onPress={ () => void q.fetchNextPage() }
					>
						{ __( 'Show older entries', 'cliedesk' ) }
					</Button>
				</div>
			) }
		</div>
	);
}
