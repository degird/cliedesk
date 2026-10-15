/**
 * Organization page sections (CRM-26, CRM-15) and the organization's recent conversations (organization card):
 * - Activity: GET organizations/{id}/health — monthly volume, open and total conversations, top topics. Only
 *   conversations the viewer may see are counted.
 * - Possible duplicates: GET organizations/duplicates?orgId (cliedesk_merge_contacts), with Merge… and
 *   "Not duplicates" (POST organizations/duplicates/{id}/dismiss).
 * - Recent conversations: GET inbox?view=all&filters={"field":"organization","value":[id]} (the conversation scope
 *   applies), newest first.
 */
import {
	api,
	can,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import type { InboxItem } from '../inbox/api';
import {
	ActionError,
	Muted,
	QueryFailed,
	StatusBadge,
} from '../inbox/components';
import { relativeTime } from '../inbox/labels';
import { announceResult } from '../workspace/forms';
import { Section } from './components';
import MergeDialog from './MergeDialog';

export interface OrgHealth {
	volume: Array< { month: string; count: number } >;
	open: number;
	total: number;
	topTopics: Array< { name: string; count: number } >;
	csat: number | null;
	revenue: { total: number; currency: string; orders: number } | null;
}

export interface OrgDuplicate {
	id: number;
	organizations: Array< { id: number; name: string } >;
	reason: string;
	score: number;
	foundAt: string;
}

export const orgHealthQuery = ( id: number, months = 12 ) =>
	queryOptions( {
		queryKey: [ 'organization', id, 'health', months ] as const,
		queryFn: async ( { signal } ): Promise< OrgHealth > => {
			const d = (
				await api.get< Partial< OrgHealth > >(
					`organizations/${ id }/health`,
					{ query: { months }, signal }
				)
			).data;
			return {
				volume: Array.isArray( d?.volume ) ? d.volume : [],
				open: d?.open ?? 0,
				total: d?.total ?? 0,
				topTopics: Array.isArray( d?.topTopics ) ? d.topTopics : [],
				csat: d?.csat ?? null,
				revenue: d?.revenue ?? null,
			};
		},
	} );

export const orgDuplicatesQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'organization', id, 'duplicates' ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: OrgDuplicate[] } >(
					'organizations/duplicates',
					{ query: { orgId: id }, signal }
				)
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

export const orgConversationsQuery = ( id: number, limit: number ) =>
	queryOptions( {
		queryKey: [ 'inbox', 'organization', id, limit ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: InboxItem[] } >( 'inbox', {
					query: {
						view: 'all',
						sort: 'created',
						limit,
						filters: JSON.stringify( {
							field: 'organization',
							value: [ id ],
						} ),
					},
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

/**
 * Why two organizations look like duplicates.
 *
 * @param reason Reason key.
 */
export function orgDuplicateReason( reason: string ): string {
	switch ( reason ) {
		case 'same_name':
			return __( 'Same name', 'cliedesk' );
		case 'domain_stem':
			return __( 'Same domain name', 'cliedesk' );
		case 'similar_name':
			return __( 'Similar name', 'cliedesk' );
		default:
			return reason;
	}
}

/**
 * Month label ("2026-10" → "Oct 2026").
 *
 * @param month Year and month.
 */
export function monthLabel( month: string ): string {
	const [ y, m ] = month.split( '-' ).map( Number );
	if ( ! y || ! m ) {
		return month;
	}
	return new Date( Date.UTC( y, m - 1, 1 ) ).toLocaleDateString( undefined, {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	} );
}

/**
 * Conversations of the organization's members, newest first.
 *
 * @param props       Props.
 * @param props.orgId Organization.
 * @param props.limit How many.
 */
export function RecentConversations( {
	orgId,
	limit,
}: {
	orgId: number;
	limit: number;
} ) {
	const enabled = can( 'cliedesk_view_conversations' );
	const q = useQuery( { ...orgConversationsQuery( orgId, limit ), enabled } );
	if ( ! enabled ) {
		return null;
	}
	if ( q.isPending ) {
		return <Muted>{ __( 'Loading conversations…', 'cliedesk' ) }</Muted>;
	}
	if ( q.isError ) {
		return (
			<Muted>
				{ __( 'Could not load the conversations.', 'cliedesk' ) }
			</Muted>
		);
	}
	if ( ! q.data.length ) {
		return <Muted>{ __( 'No conversations yet.', 'cliedesk' ) }</Muted>;
	}
	return (
		<ul className="flex flex-col gap-1">
			{ q.data.map( ( c ) => (
				<li key={ c.id } className="flex flex-wrap items-center gap-2">
					<Link
						to="/c/$number"
						params={ { number: String( c.number ) } }
						className="min-w-0 truncate font-medium text-accent-fg underline-offset-2 hover:underline"
					>
						#{ c.number } <bdi>{ c.subject }</bdi>
					</Link>
					{ c.status && (
						<StatusBadge
							label={ c.status.label }
							category={ c.status.category }
						/>
					) }
					<span className="text-sm text-fg-muted">
						<bdi>{ c.requesterName }</bdi>
						{ ' · ' }
						{ relativeTime( c.updatedAt ) }
					</span>
				</li>
			) ) }
		</ul>
	);
}

/**
 * Activity figures.
 *
 * @param props       Props.
 * @param props.orgId Organization.
 */
export function OrgActivity( { orgId }: { orgId: number } ) {
	const q = useQuery( orgHealthQuery( orgId ) );
	let body;
	if ( q.isPending ) {
		body = <Muted>{ __( 'Loading figures…', 'cliedesk' ) }</Muted>;
	} else if ( q.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the figures', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else {
		const h = q.data;
		const max = Math.max( 1, ...h.volume.map( ( v ) => v.count ) );
		body = (
			<div className="flex flex-col gap-4">
				<dl className="flex flex-wrap gap-6">
					<div>
						<dt className="text-sm text-fg-muted">
							{ __( 'Open conversations', 'cliedesk' ) }
						</dt>
						<dd className="text-2xl font-semibold">{ h.open }</dd>
					</div>
					<div>
						<dt className="text-sm text-fg-muted">
							{ __( 'All conversations', 'cliedesk' ) }
						</dt>
						<dd className="text-2xl font-semibold">{ h.total }</dd>
					</div>
					{ h.csat !== null && (
						<div>
							<dt className="text-sm text-fg-muted">
								{ __( 'Satisfaction', 'cliedesk' ) }
							</dt>
							<dd className="text-2xl font-semibold">
								{ sprintf(
									/* translators: %d: satisfaction score in percent. */
									__( '%d%%', 'cliedesk' ),
									h.csat
								) }
							</dd>
						</div>
					) }
				</dl>
				<table className="w-full text-sm">
					<caption className="pb-2 text-start font-medium">
						{ __( 'Conversations per month', 'cliedesk' ) }
					</caption>
					<thead className="sr-only">
						<tr>
							<th scope="col">{ __( 'Month', 'cliedesk' ) }</th>
							<th scope="col">
								{ __( 'Conversations', 'cliedesk' ) }
							</th>
						</tr>
					</thead>
					<tbody>
						{ h.volume.map( ( v ) => (
							<tr key={ v.month }>
								<th
									scope="row"
									className="w-24 py-0.5 pe-3 text-start font-normal text-fg-muted"
								>
									{ monthLabel( v.month ) }
								</th>
								<td className="py-0.5">
									<span className="flex items-center gap-2">
										<span
											aria-hidden="true"
											className="inline-block h-2 rounded-full bg-accent"
											style={ {
												width: `${
													( v.count / max ) * 100
												}%`,
												minWidth: v.count ? 4 : 0,
												maxWidth: '75%',
											} }
										/>
										<span>{ v.count }</span>
									</span>
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
				<div>
					<h3 className="pb-1 text-sm font-medium">
						{ __( 'Top topics', 'cliedesk' ) }
					</h3>
					{ h.topTopics.length ? (
						<ul className="flex flex-wrap gap-2">
							{ h.topTopics.map( ( t ) => (
								<li
									key={ t.name }
									className="rounded-full border border-line px-2 text-sm"
								>
									<bdi>{ t.name }</bdi>{ ' ' }
									<span className="text-fg-muted">
										{ t.count }
									</span>
								</li>
							) ) }
						</ul>
					) : (
						<Muted>{ __( 'No topics yet.', 'cliedesk' ) }</Muted>
					) }
				</div>
			</div>
		);
	}
	return (
		<Section id="cd-org-activity" title={ __( 'Activity', 'cliedesk' ) }>
			{ body }
		</Section>
	);
}

/**
 * Suggested duplicates of this organization (only when there are any).
 *
 * @param props     Props.
 * @param props.org Organization on screen (id and name).
 */
export function OrgDuplicates( {
	org,
}: {
	org: { id: number; name: string };
} ) {
	const qc = useQueryClient();
	const allowed = can( 'cliedesk_merge_contacts' );
	const q = useQuery( { ...orgDuplicatesQuery( org.id ), enabled: allowed } );
	const [ merging, setMerging ] = useState< {
		id: number;
		label: string;
	} | null >( null );
	const dismiss = useMutation( {
		mutationFn: ( pair: OrgDuplicate ) =>
			api.post( `organizations/duplicates/${ pair.id }/dismiss`, {
				body: {},
			} ),
		onSuccess: () => {
			announceResult( __( 'Suggestion dismissed.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: orgDuplicatesQuery( org.id ).queryKey,
			} );
		},
	} );
	if ( ! allowed || ! q.data?.length ) {
		return null;
	}
	return (
		<Section
			id="cd-org-duplicates"
			title={ __( 'Possible duplicates', 'cliedesk' ) }
		>
			<ActionError error={ dismiss.error } />
			<ul className="flex flex-col divide-y divide-line">
				{ q.data.map( ( pair ) => {
					const other =
						pair.organizations.find( ( o ) => o.id !== org.id ) ??
						pair.organizations[ 0 ];
					if ( ! other ) {
						return null;
					}
					return (
						<li
							key={ pair.id }
							className="flex flex-wrap items-center gap-3 py-2"
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<Link
									to="/organizations/$orgId"
									params={ { orgId: String( other.id ) } }
									className="font-medium text-accent-fg underline-offset-2 hover:underline"
								>
									<bdi>{ other.name }</bdi>
								</Link>
								<span className="text-sm text-fg-muted">
									{ sprintf(
										/* translators: 1: reason, e.g. "Same name"; 2: match score 0–100. */
										__( '%1$s · %2$d%% match', 'cliedesk' ),
										orgDuplicateReason( pair.reason ),
										pair.score
									) }
								</span>
							</div>
							<Button
								size="sm"
								onPress={ () =>
									setMerging( {
										id: other.id,
										label: other.name,
									} )
								}
								aria-label={ sprintf(
									/* translators: %s: organization name. */
									__( 'Merge with %s…', 'cliedesk' ),
									other.name
								) }
							>
								{ __( 'Merge…', 'cliedesk' ) }
							</Button>
							<Button
								size="sm"
								variant="ghost"
								isLoading={
									dismiss.isPending &&
									dismiss.variables?.id === pair.id
								}
								onPress={ () => dismiss.mutate( pair ) }
								aria-label={ sprintf(
									/* translators: %s: organization name. */
									__( 'Not a duplicate of %s', 'cliedesk' ),
									other.name
								) }
							>
								{ __( 'Not duplicates', 'cliedesk' ) }
							</Button>
						</li>
					);
				} ) }
			</ul>
			{ merging && (
				<MergeDialog
					kind="organization"
					first={ { id: org.id, label: org.name } }
					second={ merging }
					onClose={ () => setMerging( null ) }
				/>
			) }
		</Section>
	);
}

/**
 * Recent conversations section of the organization page.
 *
 * @param props       Props.
 * @param props.orgId Organization.
 */
export function OrgConversations( { orgId }: { orgId: number } ) {
	if ( ! can( 'cliedesk_view_conversations' ) ) {
		return null;
	}
	return (
		<Section
			id="cd-org-conversations"
			title={ __( 'Recent conversations', 'cliedesk' ) }
		>
			<RecentConversations orgId={ orgId } limit={ 10 } />
		</Section>
	);
}
