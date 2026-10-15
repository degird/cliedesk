/**
 * Bulk and export jobs (CRM-40/41, INB-72): started jobs are tracked here and shown in a progress panel. Each job is
 * polled (GET bulk/{uid}) every 2 s until it is completed, failed or rolled back. A finished bulk job offers Undo
 * while canUndo (POST bulk/{uid}/undo, then polling resumes); a finished export opens its signed download link.
 * Items that were skipped (already in that state) or failed are listed on demand, in two lists (GET bulk/{uid}/report);
 * conversations link to /c/{number}.
 *
 * Jobs belong to a scope ('contacts' by default, 'inbox' for conversation bulk jobs); each screen shows the panel
 * of its own scope and refreshes its own queries when a job finishes.
 */
import {
	api,
	createStore,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, IconButton, toast } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActionError, actionMessage } from '../inbox/components';
import {
	downloadUrl,
	isTerminal,
	jobQuery,
	jobStatusLabel,
	navigateTo,
	TERMINAL,
	type BulkJob,
} from './listApi';

export interface TrackedJob {
	uid: string;
	label: string;
	/** Export: open the file when it is ready. */
	download?: boolean;
	/** Panel that shows the job (default 'contacts'). */
	scope?: string;
	/** Notice from the server (e.g. a very large selection). */
	warning?: string;
	/** Queries to refresh when the job finishes (default: contacts and segments). */
	invalidate?: ReadonlyArray< readonly unknown[] >;
	/** Label of an item in the skipped-items report (default "Item %d"). */
	itemLabel?: ( id: number ) => string;
}

export interface JobReportItem {
	entityId: number;
	/** Conversation number (null for other items or when it is gone). */
	number?: number | null;
	/** Conversation subject or contact name. */
	label?: string | null;
	/** Left alone on purpose (already in that state), not a failure. */
	skipped?: boolean;
	/** Why. */
	error: string | null;
}

const DEFAULT_INVALIDATE = [ [ 'contacts' ], [ 'segments' ] ] as const;

const store = createStore< TrackedJob[] >( [] );

/**
 * Start following a job returned by POST contacts/bulk or contacts/export.
 *
 * @param qc            Query client (seeded with the job so the panel shows it at once).
 * @param job           Job.
 * @param label         What the job does.
 * @param opts          Options (scope, warning, queries to refresh, report labels).
 * @param opts.download Export: open the file when ready.
 */
export function trackJob(
	qc: ReturnType< typeof useQueryClient >,
	job: BulkJob,
	label: string,
	opts: Omit< TrackedJob, 'uid' | 'label' > = {}
): void {
	qc.setQueryData( [ 'bulk', job.uid ], job );
	store.set( ( list ) => [
		{ uid: job.uid, label, ...opts },
		...list.filter( ( j ) => j.uid !== job.uid ),
	] );
}

function ReportItem( {
	item,
	itemLabel,
}: {
	item: JobReportItem;
	itemLabel: ( id: number ) => string;
} ) {
	const why =
		item.error ??
		( item.skipped
			? __( 'Already in that state.', 'cliedesk' )
			: __( 'Failed.', 'cliedesk' ) );
	const label = item.label?.trim() || itemLabel( item.entityId );
	if ( typeof item.number === 'number' && item.number > 0 ) {
		return (
			<li>
				<Link
					to="/c/$number"
					params={ { number: String( item.number ) } }
					className="text-accent-fg underline-offset-2 hover:underline"
				>
					{ `#${ item.number } ` }
					<bdi>{ label }</bdi>
				</Link>
				{ sprintf(
					/* translators: %s: why the item was skipped or failed. */
					__( ': %s', 'cliedesk' ),
					why
				) }
			</li>
		);
	}
	return (
		<li>
			{ sprintf(
				/* translators: 1: item (e.g. "Conversation ID 12" or a contact name), 2: why it was skipped or failed. */
				__( '%1$s: %2$s', 'cliedesk' ),
				label,
				why
			) }
		</li>
	);
}

function ReportList( {
	id,
	title,
	items,
	itemLabel,
}: {
	id: string;
	title: string;
	items: JobReportItem[];
	itemLabel: ( id: number ) => string;
} ) {
	if ( ! items.length ) {
		return null;
	}
	return (
		<section aria-labelledby={ id } className="flex flex-col gap-1">
			<h3 id={ id } className="text-sm font-semibold">
				{ sprintf(
					/* translators: 1: list title, 2: number of items. */
					__( '%1$s (%2$d)', 'cliedesk' ),
					title,
					items.length
				) }
			</h3>
			<ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
				{ items.map( ( item, i ) => (
					<ReportItem
						key={ `${ item.entityId }:${ i }` }
						item={ item }
						itemLabel={ itemLabel }
					/>
				) ) }
			</ul>
		</section>
	);
}

/**
 * Items a job skipped or failed, and why (first 500): skipped items (already in that state) and failures are listed
 * separately; conversations link to their page.
 *
 * @param props           Props.
 * @param props.uid       Job uid.
 * @param props.itemLabel Label of an item without a server label.
 */
function JobReport( {
	uid,
	itemLabel,
}: {
	uid: string;
	itemLabel: ( id: number ) => string;
} ) {
	const q = useQuery( {
		queryKey: [ 'bulk', uid, 'report' ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: JobReportItem[] } >(
					`bulk/${ uid }/report`,
					{ signal }
				)
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );
	if ( q.isPending ) {
		return (
			<p className="text-sm text-fg-muted">
				{ __( 'Loading the skipped and failed items…', 'cliedesk' ) }
			</p>
		);
	}
	if ( q.isError ) {
		return <ActionError error={ q.error } />;
	}
	if ( ! q.data.length ) {
		return (
			<p className="text-sm text-fg-muted">
				{ __( 'Nothing was skipped and nothing failed.', 'cliedesk' ) }
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			<ReportList
				id={ `cd-job-skipped-${ uid }` }
				title={ __( 'Skipped (already in that state)', 'cliedesk' ) }
				items={ q.data.filter( ( i ) => i.skipped === true ) }
				itemLabel={ itemLabel }
			/>
			<ReportList
				id={ `cd-job-failed-${ uid }` }
				title={ __( 'Failed', 'cliedesk' ) }
				items={ q.data.filter( ( i ) => i.skipped !== true ) }
				itemLabel={ itemLabel }
			/>
		</div>
	);
}

/** Tests only. */
export function resetJobsForTests(): void {
	store.set( [] );
}

/**
 * Open the export file (signed link, valid 15 minutes).
 *
 * @param uid Job uid.
 */
export async function openDownload( uid: string ): Promise< void > {
	try {
		navigateTo.assign( await downloadUrl( uid ) );
	} catch ( e ) {
		toast( {
			tone: 'danger',
			title: __( 'Could not download the export', 'cliedesk' ),
			description: actionMessage( e ),
		} );
	}
}

/**
 * Progress of one job: bar, counts, status and its actions.
 *
 * @param props            Props.
 * @param props.uid        Job uid.
 * @param props.label      What the job does.
 * @param props.download   Export: open the file when ready.
 * @param props.onClose    Hide (only once the job has finished).
 * @param props.pageLink   Link to the export page (off on that page).
 * @param props.warning    Notice from the server.
 * @param props.invalidate Queries to refresh when the job finishes.
 * @param props.itemLabel  Label of an item in the skipped-items report.
 */
export function JobProgress( {
	uid,
	label,
	download,
	onClose,
	pageLink = true,
	warning,
	invalidate = DEFAULT_INVALIDATE,
	itemLabel,
}: {
	uid: string;
	label: string;
	download?: boolean;
	onClose?: () => void;
	pageLink?: boolean;
	warning?: string;
	invalidate?: ReadonlyArray< readonly unknown[] >;
	itemLabel?: ( id: number ) => string;
} ) {
	const qc = useQueryClient();
	const q = useQuery( jobQuery( uid ) );
	const job = q.data;
	const seen = useRef< string | null >( null );
	const [ showReport, setShowReport ] = useState( false );
	const undo = useMutation( {
		mutationFn: () => api.post< BulkJob >( `bulk/${ uid }/undo` ),
		onSuccess: ( r ) => {
			if ( r.data?.uid ) {
				qc.setQueryData( [ 'bulk', uid ], r.data );
			}
			void qc.invalidateQueries( { queryKey: [ 'bulk', uid ] } );
		},
	} );
	const status = job?.status ?? 'queued';
	// Notice (and the automatic download) only when this page saw the job finish.
	useEffect( () => {
		if ( ! job ) {
			return;
		}
		const before = seen.current;
		seen.current = job.status;
		if (
			before === null ||
			before === job.status ||
			TERMINAL.includes( before ) ||
			! isTerminal( job )
		) {
			return;
		}
		for ( const key of invalidate ) {
			void qc.invalidateQueries( { queryKey: [ ...key ] } );
		}
		if ( job.status === 'completed' && download ) {
			void openDownload( uid );
		}
		toast( {
			tone: job.status === 'failed' ? 'danger' : 'success',
			title: sprintf(
				/* translators: 1: what the job does, 2: its status. */
				__( '%1$s: %2$s', 'cliedesk' ),
				label,
				jobStatusLabel( job.status )
			),
		} );
	}, [ job, download, label, qc, uid, invalidate ] );
	const total = job?.total ?? 0;
	const processed = job?.processed ?? 0;
	const skipped = job?.skipped ?? 0;
	const failed = job?.failed ?? 0;
	return (
		<div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
			<div className="flex items-center gap-2">
				<p className="min-w-0 flex-1 font-medium">{ label }</p>
				{ onClose && job && isTerminal( job ) && (
					<IconButton
						size="sm"
						label={ sprintf(
							/* translators: %s: what the job did. */
							__( 'Hide “%s”', 'cliedesk' ),
							label
						) }
						icon={ <X size={ 14 } /> }
						onPress={ onClose }
					/>
				) }
			</div>
			<progress
				className="h-2 w-full"
				max={ Math.max( total, 1 ) }
				value={ total ? processed : 0 }
				aria-label={ sprintf(
					/* translators: %s: what the job does. */
					__( 'Progress of “%s”', 'cliedesk' ),
					label
				) }
			/>
			<p role="status" className="text-sm text-fg-muted">
				{ sprintf(
					/* translators: 1: status, 2: items done, 3: all items, 4: items skipped (already in that state), 5: items that failed. */
					__(
						'%1$s · %2$d of %3$d · %4$d skipped · %5$d failed',
						'cliedesk'
					),
					jobStatusLabel( status ),
					processed,
					total,
					skipped,
					failed
				) }
			</p>
			{ warning && <p className="text-sm text-fg-muted">{ warning }</p> }
			<ActionError
				error={ q.error ?? undo.error }
				onDismiss={ () => undo.reset() }
			/>
			<div className="flex flex-wrap gap-2">
				{ job?.canUndo && ! download && (
					<Button
						size="sm"
						isLoading={ undo.isPending }
						onPress={ () => undo.mutate() }
					>
						{ __( 'Undo', 'cliedesk' ) }
					</Button>
				) }
				{ download && status === 'completed' && (
					<Button
						size="sm"
						variant="primary"
						onPress={ () => void openDownload( uid ) }
					>
						{ __( 'Download', 'cliedesk' ) }
					</Button>
				) }
				{ download && pageLink && (
					<Link
						to="/exports/$uid"
						params={ { uid } }
						className="self-center text-sm text-accent-fg underline-offset-2 hover:underline"
					>
						{ __( 'Export page', 'cliedesk' ) }
					</Link>
				) }
				{ ! download &&
					job &&
					isTerminal( job ) &&
					failed + skipped > 0 && (
						<Button
							size="sm"
							variant="ghost"
							aria-expanded={ showReport }
							aria-controls={ `cd-job-report-${ uid }` }
							onPress={ () => setShowReport( ( x ) => ! x ) }
						>
							{ showReport
								? __(
										'Hide skipped and failed items',
										'cliedesk'
									)
								: sprintf(
										/* translators: %d: number of items skipped or failed. */
										__(
											'Show skipped and failed items (%d)',
											'cliedesk'
										),
										failed + skipped
									) }
						</Button>
					) }
			</div>
			<div id={ `cd-job-report-${ uid }` } hidden={ ! showReport }>
				{ showReport && (
					<JobReport
						uid={ uid }
						itemLabel={
							itemLabel ??
							( ( id ) =>
								sprintf(
									/* translators: %d: item id. */
									__( 'Item %d', 'cliedesk' ),
									id
								) )
						}
					/>
				) }
			</div>
		</div>
	);
}

/**
 * Panel with the jobs started on this page.
 *
 * @param props       Props.
 * @param props.scope Which jobs to show (default 'contacts').
 */
export function JobsPanel( { scope = 'contacts' }: { scope?: string } ) {
	const all = useSyncExternalStore( store.subscribe, store.get, store.get );
	const jobs = all.filter( ( j ) => ( j.scope ?? 'contacts' ) === scope );
	if ( ! jobs.length ) {
		return null;
	}
	return (
		<section
			aria-label={ __( 'Background jobs', 'cliedesk' ) }
			className="flex flex-col gap-2"
		>
			{ jobs.map( ( j ) => (
				<JobProgress
					key={ j.uid }
					uid={ j.uid }
					label={ j.label }
					download={ j.download }
					warning={ j.warning }
					invalidate={ j.invalidate }
					itemLabel={ j.itemLabel }
					onClose={ () =>
						store.set( ( l ) =>
							l.filter( ( x ) => x.uid !== j.uid )
						)
					}
				/>
			) ) }
		</section>
	);
}
