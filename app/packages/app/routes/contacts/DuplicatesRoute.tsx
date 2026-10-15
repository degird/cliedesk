/**
 * `/contacts/duplicates` (CRM-12): possible duplicate contacts with the reason and score, "Merge…"
 * (cliedesk_merge_contacts) and "Not a duplicate" (cliedesk_edit_contacts).
 */
import { can, useInfiniteQuery } from '@cliedesk/data';
import { Button, LoadingRegion } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import {
	fetchDuplicatesPage,
	reasonLabel,
	type DuplicatePair,
} from '../../crm/api';
import { useDismissDuplicate } from '../../crm/ContactCrm';
import MergeDialog from '../../crm/MergeDialog';
import { ActionError, QueryFailed } from '../../inbox/components';
import { fullTime, relativeTime } from '../../inbox/labels';

const th = 'px-4 py-2 text-start font-medium';
const linkClass =
	'font-medium text-accent-fg underline-offset-2 hover:underline';

const nameOf = ( c: { displayName: string } ) =>
	c.displayName || __( 'Unnamed contact', 'cliedesk' );

/**
 * Possible duplicates screen.
 */
export default function DuplicatesRoute() {
	const q = useInfiniteQuery( {
		queryKey: [ 'contacts', 'duplicates', 'all', 'pages' ] as const,
		queryFn: ( { pageParam, signal } ) =>
			fetchDuplicatesPage( pageParam, signal ),
		initialPageParam: null as string | null,
		getNextPageParam: ( last ) => last.nextCursor ?? undefined,
	} );
	const dismiss = useDismissDuplicate();
	const [ merging, setMerging ] = useState< DuplicatePair | null >( null );
	const items = q.data?.pages.flatMap( ( p ) => p.items ) ?? [];
	const canMerge = can( 'cliedesk_merge_contacts' );
	const canDismiss = can( 'cliedesk_edit_contacts' );
	return (
		<div className="mx-auto flex max-w-5xl flex-col">
			<Link
				to="/contacts"
				className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				<ArrowLeft
					aria-hidden="true"
					size={ 14 }
					className="rtl:rotate-180"
				/>
				{ __( 'All contacts', 'cliedesk' ) }
			</Link>
			<PageHeader
				title={ __( 'Possible duplicates', 'cliedesk' ) }
				description={ __(
					'Contacts that look like the same person. Merge them, or mark them as not a duplicate.',
					'cliedesk'
				) }
			/>
			<ActionError
				error={ dismiss.error }
				onDismiss={ () => dismiss.reset() }
			/>
			{ q.isPending && (
				<LoadingRegion
					label={ __( 'Loading duplicates…', 'cliedesk' ) }
				/>
			) }
			{ q.isError && (
				<QueryFailed
					title={ __( 'Could not load the duplicates', 'cliedesk' ) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			) }
			{ q.isSuccess && ! items.length && (
				<p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-fg-muted">
					{ __( 'No possible duplicates found.', 'cliedesk' ) }
				</p>
			) }
			{ items.length > 0 && (
				<div className="overflow-x-auto rounded-lg border border-line bg-surface">
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ __( 'Possible duplicates', 'cliedesk' ) }
						</caption>
						<thead className="border-b border-line text-fg-muted">
							<tr>
								<th scope="col" className={ th }>
									{ __( 'Contacts', 'cliedesk' ) }
								</th>
								<th scope="col" className={ th }>
									{ __( 'Why', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="px-4 py-2 text-end font-medium"
								>
									{ __( 'Score', 'cliedesk' ) }
								</th>
								<th scope="col" className={ th }>
									{ __( 'Found', 'cliedesk' ) }
								</th>
								<th scope="col" className={ th }>
									<span className="sr-only">
										{ __( 'Actions', 'cliedesk' ) }
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{ items.map( ( p ) => {
								const [ a, b ] = p.contacts;
								const pair = sprintf(
									/* translators: 1: contact name, 2: other contact name. */
									__( '%1$s and %2$s', 'cliedesk' ),
									nameOf( a ),
									nameOf( b )
								);
								return (
									<tr
										key={ p.id }
										className="border-b border-line last:border-b-0"
									>
										<td className="px-4 py-2">
											<span className="flex flex-col gap-0.5">
												{ [ a, b ].map( ( c ) => (
													<Link
														key={ c.id }
														to="/contacts/$contactId"
														params={ {
															contactId: String(
																c.id
															),
														} }
														className={ linkClass }
													>
														<bdi>
															{ nameOf( c ) }
														</bdi>
													</Link>
												) ) }
											</span>
										</td>
										<td className="px-4 py-2">
											{ reasonLabel( p.reason ) }
										</td>
										<td className="cd-tabular px-4 py-2 text-end">
											{ p.score }
										</td>
										<td className="px-4 py-2">
											<time
												dateTime={ p.foundAt }
												title={ fullTime( p.foundAt ) }
											>
												{ relativeTime( p.foundAt ) }
											</time>
										</td>
										<td className="px-4 py-2">
											<span className="flex flex-wrap justify-end gap-1">
												{ canMerge && (
													<Button
														size="sm"
														onPress={ () =>
															setMerging( p )
														}
													>
														{ __(
															'Merge…',
															'cliedesk'
														) }
														<span className="sr-only">{ ` ${ pair }` }</span>
													</Button>
												) }
												{ canDismiss && (
													<Button
														size="sm"
														variant="ghost"
														isLoading={
															dismiss.isPending &&
															dismiss.variables ===
																p.id
														}
														onPress={ () =>
															dismiss.mutate(
																p.id
															)
														}
													>
														{ __(
															'Not a duplicate',
															'cliedesk'
														) }
														<span className="sr-only">{ ` ${ pair }` }</span>
													</Button>
												) }
											</span>
										</td>
									</tr>
								);
							} ) }
						</tbody>
					</table>
				</div>
			) }
			{ q.hasNextPage && (
				<Button
					className="mt-4 self-center"
					isLoading={ q.isFetchingNextPage }
					onPress={ () => void q.fetchNextPage() }
				>
					{ __( 'Load more', 'cliedesk' ) }
				</Button>
			) }
			{ merging && (
				<MergeDialog
					kind="contact"
					first={ {
						id: merging.contacts[ 0 ].id,
						label: nameOf( merging.contacts[ 0 ] ),
					} }
					second={ {
						id: merging.contacts[ 1 ].id,
						label: nameOf( merging.contacts[ 1 ] ),
					} }
					onClose={ () => setMerging( null ) }
				/>
			) }
		</div>
	);
}
