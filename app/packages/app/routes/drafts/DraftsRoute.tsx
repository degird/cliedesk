/**
 * `/drafts`: My drafts (INB-52). Lists my unsent reply and note drafts (GET drafts), newest first, each linking
 * to its conversation. Reviewers also get "To review": replies submitted for review by people in team draft mode
 * (GET drafts?review=true; 403 for someone who is in draft mode, so the tab is hidden), which they can send
 * (POST drafts/{id}/send).
 */
import {
	api,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	EmptyState,
	LoadingRegion,
	Tab,
	TabList,
	TabPanel,
	Tabs,
	toast,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { FileText } from 'lucide-react';
import { useState, type Key } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { type DraftListItem } from '../../inbox/api';
import { ActionError, Pill, QueryFailed } from '../../inbox/components';
import { htmlToText } from '../../inbox/html';
import { fullTime, relativeTime } from '../../inbox/labels';
import { announceResult } from '../../workspace/forms';

export const draftKeys = {
	mine: [ 'drafts', 'mine' ] as const,
	review: [ 'drafts', 'review' ] as const,
};

async function fetchDrafts(
	review: boolean,
	signal?: AbortSignal
): Promise< DraftListItem[] > {
	const r = await api.get< { items: DraftListItem[] } >( 'drafts', {
		query: review ? { review: true } : undefined,
		signal,
	} );
	return r.data?.items ?? [];
}

/**
 * Short excerpt of a draft.
 *
 * @param html Draft HTML.
 * @param max  Maximum characters.
 */
export function excerpt( html: string, max = 160 ): string {
	const t = htmlToText( html ).replace( /\s+/g, ' ' ).trim();
	return t.length > max ? t.slice( 0, max - 1 ) + '…' : t;
}

function DraftRow( {
	item,
	review,
}: {
	item: DraftListItem;
	review: boolean;
} ) {
	const qc = useQueryClient();
	const send = useMutation( {
		mutationFn: () => api.post( `drafts/${ item.id }/send` ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: [ 'drafts' ] } );
			void qc.invalidateQueries( {
				queryKey: [ 'conversation', item.conversationId ],
			} );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: conversation number. */
					__( 'Reply on #%d sent.', 'cliedesk' ),
					item.conversationNumber
				),
			} );
			announceResult( __( 'Reply sent.', 'cliedesk' ) );
		},
	} );
	return (
		<li className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<Link
					to="/c/$number"
					params={ { number: String( item.conversationNumber ) } }
					className="min-w-0 flex-1 truncate font-medium text-accent-fg underline-offset-2 hover:underline"
				>
					<span className="cd-tabular">{ `#${ item.conversationNumber }` }</span>{ ' ' }
					<bdi>{ item.subject }</bdi>
				</Link>
				<Pill tone={ item.mode === 'note' ? 'warning' : 'neutral' }>
					{ item.mode === 'note'
						? __( 'Note', 'cliedesk' )
						: __( 'Reply', 'cliedesk' ) }
				</Pill>
				{ item.review && (
					<Pill tone="accent">{ __( 'In review', 'cliedesk' ) }</Pill>
				) }
				<time
					dateTime={ item.updatedAt }
					title={ fullTime( item.updatedAt ) }
					className="text-xs text-fg-muted"
				>
					{ sprintf(
						/* translators: %s: relative time. */
						__( 'Saved %s', 'cliedesk' ),
						relativeTime( item.updatedAt )
					) }
				</time>
			</div>
			<p className="text-sm text-fg-muted">
				{ excerpt( item.html ) || __( '(empty)', 'cliedesk' ) }
			</p>
			{ review && (
				<div className="flex flex-col gap-2">
					<ActionError
						error={ send.error }
						onDismiss={ () => send.reset() }
					/>
					<Button
						size="sm"
						variant="primary"
						className="self-start"
						isLoading={ send.isPending }
						onPress={ () => send.mutate() }
					>
						{ sprintf(
							/* translators: %d: conversation number. */
							__( 'Send reply on #%d', 'cliedesk' ),
							item.conversationNumber
						) }
					</Button>
				</div>
			) }
		</li>
	);
}

function DraftList( {
	q,
	review,
}: {
	q: {
		isPending: boolean;
		isError: boolean;
		error: unknown;
		data?: DraftListItem[];
		refetch: () => unknown;
	};
	review: boolean;
} ) {
	if ( q.isPending ) {
		return <LoadingRegion label={ __( 'Loading drafts…', 'cliedesk' ) } />;
	}
	if ( q.isError || ! q.data ) {
		return (
			<QueryFailed
				title={ __( 'Could not load the drafts', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	if ( ! q.data.length ) {
		return (
			<EmptyState
				icon={ <FileText size={ 32 } strokeWidth={ 1.75 } /> }
				title={
					review
						? __( 'Nothing to review', 'cliedesk' )
						: __( 'No drafts', 'cliedesk' )
				}
				description={
					review
						? __(
								'Replies your teammates submit for review appear here.',
								'cliedesk'
							)
						: __(
								'Replies and notes you start but do not send are saved here automatically.',
								'cliedesk'
							)
				}
				actions={
					// ADM-04: every empty state offers a way to start.
					<Link
						to="/inbox"
						className="inline-flex h-(--cd-control-h) items-center rounded-md border border-line-strong bg-surface px-(--cd-control-px) font-medium text-fg hover:bg-sunken"
					>
						{ __( 'Open the inbox', 'cliedesk' ) }
					</Link>
				}
			/>
		);
	}
	return (
		<ul className="overflow-hidden rounded-lg border border-line bg-surface">
			{ q.data.map( ( d ) => (
				<DraftRow key={ d.id } item={ d } review={ review } />
			) ) }
		</ul>
	);
}

/**
 * My drafts screen.
 */
export default function DraftsRoute() {
	const [ tab, setTab ] = useState< 'mine' | 'review' >( 'mine' );
	const mine = useQuery( {
		queryKey: draftKeys.mine,
		queryFn: ( { signal } ) => fetchDrafts( false, signal ),
	} );
	const review = useQuery( {
		queryKey: draftKeys.review,
		queryFn: ( { signal } ) => fetchDrafts( true, signal ),
		retry: ( n, e ) => ! ( isApiError( e ) && e.status === 403 ) && n < 2,
	} );
	// 403: the user is in team draft mode (not a reviewer): no review tab.
	const canReview = ! (
		review.isError &&
		isApiError( review.error ) &&
		review.error.status === 403
	);
	return (
		<div className="flex flex-col">
			<PageHeader
				title={ __( 'My drafts', 'cliedesk' ) }
				description={ __(
					'Unsent replies and notes. They follow you to any device.',
					'cliedesk'
				) }
				actions={
					<Link
						to="/inbox"
						className="text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
					>
						{ __( 'Back to the inbox', 'cliedesk' ) }
					</Link>
				}
			/>
			{ canReview ? (
				<Tabs
					selectedKey={ tab }
					onSelectionChange={ ( k: Key ) =>
						setTab( k as 'mine' | 'review' )
					}
				>
					<TabList label={ __( 'Drafts', 'cliedesk' ) }>
						<Tab id="mine">{ __( 'My drafts', 'cliedesk' ) }</Tab>
						<Tab id="review">
							{ review.data?.length
								? sprintf(
										/* translators: %d: number of drafts to review. */
										__( 'To review (%d)', 'cliedesk' ),
										review.data.length
									)
								: __( 'To review', 'cliedesk' ) }
						</Tab>
					</TabList>
					<TabPanel id="mine">
						<DraftList q={ mine } review={ false } />
					</TabPanel>
					<TabPanel id="review">
						<DraftList q={ review } review />
					</TabPanel>
				</Tabs>
			) : (
				<DraftList q={ mine } review={ false } />
			) }
		</div>
	);
}
