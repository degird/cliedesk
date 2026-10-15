/**
 * Inbox search results (`/inbox/search?q=…`, GET search): exact matches first, snippets with the matched words
 * highlighted, matching contacts, the syntax cheat-sheet, and "Save as view" (a view with the condition
 * `{"field":"search","value":q}`). A malformed query (400 cliedesk_search_syntax) shows the server's message and
 * its help.
 */
import {
	api,
	can,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Banner, Button, LoadingRegion, Select, toast } from '@cliedesk/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Fragment, Suspense, lazy, useState, type ReactNode } from 'react';
import { BulkLinkDialog } from '../../inbox/BulkLinkDialog';
import {
	inboxKeys,
	type ContactSummary,
	type CustomView,
	type InboxItem,
} from '../../inbox/api';
import {
	ActionError,
	Pill,
	PriorityBadge,
	QueryFailed,
	StatusBadge,
} from '../../inbox/components';
import { fullTime, relativeTime } from '../../inbox/labels';

const SearchFilters = lazy(
	() =>
		import(
			/* webpackChunkName: "inbox-search-filters" */ './SearchFilters'
		)
);

export type SearchSort = 'relevance' | 'newest' | 'oldest';

/**
 * Conditions of a search, with the advanced filters when there are some (INB-31).
 *
 * @param query   Search words.
 * @param filters Advanced conditions, or null.
 */
export function searchConditions( query: string, filters: unknown ): unknown {
	const search = { field: 'search', value: query };
	return filters ? { all: [ search, filters ] } : search;
}

export interface SearchItem extends InboxItem {
	exact: boolean;
	snippet: string | null;
	matchId: number | null;
	archived: boolean;
}

export interface SearchHelp {
	example: string;
	description: string;
}

export interface SearchResult {
	items: SearchItem[];
	highlights: string[];
	exact: boolean;
	contacts: ContactSummary[];
	help: SearchHelp[];
}

/**
 * Text with the highlighted words wrapped in <mark> (case-insensitive, longest words first).
 *
 * @param text  Text.
 * @param words Words to highlight.
 */
export function highlight( text: string, words: string[] ): ReactNode {
	const list = [
		...new Set( words.map( ( w ) => w.trim() ).filter( Boolean ) ),
	].sort( ( a, b ) => b.length - a.length );
	if ( ! list.length || ! text ) {
		return text;
	}
	const re = new RegExp(
		`(${ list.map( ( w ) => w.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) ).join( '|' ) })`,
		'gi'
	);
	return text.split( re ).map( ( part, i ) =>
		i % 2 === 1 ? (
			<mark
				key={ i }
				className="rounded-sm bg-warning-subtle px-0.5 text-fg"
			>
				{ part }
			</mark>
		) : (
			<Fragment key={ i }>{ part }</Fragment>
		)
	);
}

/**
 * Exact matches first, otherwise the server's order.
 *
 * @param items Items.
 */
export function exactFirst( items: SearchItem[] ): SearchItem[] {
	return [
		...items.filter( ( i ) => i.exact ),
		...items.filter( ( i ) => ! i.exact ),
	];
}

/**
 * Syntax help from a search error or result.
 *
 * @param e Error.
 */
export function errorHelp( e: unknown ): SearchHelp[] {
	if ( ! isApiError( e ) ) {
		return [];
	}
	const d = e.details as { help?: unknown } | null;
	return Array.isArray( d?.help ) ? ( d.help as SearchHelp[] ) : [];
}

function Help( { help, open }: { help: SearchHelp[]; open?: boolean } ) {
	if ( ! help.length ) {
		return null;
	}
	return (
		<details
			open={ open }
			className="rounded-lg border border-line bg-surface px-4 py-2 text-sm"
		>
			<summary className="cursor-pointer font-medium">
				{ __( 'Search syntax', 'cliedesk' ) }
			</summary>
			<dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
				{ help.map( ( h ) => (
					<Fragment key={ h.example }>
						<dt>
							<code className="rounded-sm bg-sunken px-1 font-mono">
								{ h.example }
							</code>
						</dt>
						<dd className="text-fg-muted">{ h.description }</dd>
					</Fragment>
				) ) }
			</dl>
		</details>
	);
}

/**
 * Search results.
 *
 * @param props   Props.
 * @param props.q Query.
 */
export function SearchResults( { q }: { q: string } ) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const query = q.trim();
	const [ sort, setSort ] = useState< SearchSort >( 'relevance' );
	const [ filters, setFilters ] = useState< unknown >( null );
	const [ panel, setPanel ] = useState( false );
	const [ linking, setLinking ] = useState< SearchItem | null >( null );
	const r = useQuery( {
		queryKey: [ 'inbox', 'search', query, sort, filters ] as const,
		queryFn: async ( { signal } ): Promise< SearchResult > => {
			if ( filters ) {
				// INB-31: the view list with the search and the filters, newest or oldest first.
				const res = await api.get< { items: InboxItem[] } >( 'inbox', {
					query: {
						view: 'all',
						filters: JSON.stringify(
							searchConditions( query, filters )
						),
						sort: sort === 'oldest' ? 'oldest' : 'created',
						limit: 50,
					},
					signal,
				} );
				return {
					items: ( res.data?.items ?? [] ).map( ( i ) => ( {
						...i,
						exact: false,
						snippet: null,
						matchId: null,
						archived: false,
					} ) ),
					highlights: [],
					exact: false,
					contacts: [],
					help: [],
				};
			}
			const res = await api.get< SearchResult >( 'search', {
				query: { q: query, sort, limit: 50 },
				signal,
			} );
			return {
				items: res.data?.items ?? [],
				highlights: res.data?.highlights ?? [],
				exact: !! res.data?.exact,
				contacts: res.data?.contacts ?? [],
				help: res.data?.help ?? [],
			};
		},
		enabled: query !== '',
	} );
	const save = useMutation( {
		mutationFn: () =>
			api.post< CustomView >( 'views', {
				body: {
					name: query.slice( 0, 191 ),
					conditions: JSON.stringify(
						searchConditions( query, filters )
					),
				},
			} ),
		onSuccess: ( res ) => {
			void qc.invalidateQueries( { queryKey: inboxKeys.views } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %s: view name. */
					__( 'View “%s” saved.', 'cliedesk' ),
					res.data.name
				),
			} );
			void navigate( {
				to: '/inbox/$view',
				params: { view: String( res.data.id ) },
			} );
		},
	} );

	if ( query === '' ) {
		return (
			<p className="text-fg-muted">
				{ __( 'Type something to search for.', 'cliedesk' ) }
			</p>
		);
	}
	const canLink = can( 'cliedesk_edit_conversation_fields' );
	let body: ReactNode;
	if ( r.isPending ) {
		body = <LoadingRegion label={ __( 'Searching…', 'cliedesk' ) } />;
	} else if ( r.isError ) {
		if (
			isApiError( r.error ) &&
			r.error.code === 'cliedesk_search_syntax'
		) {
			body = (
				<div className="flex flex-col gap-3">
					<p
						id="cd-search-error"
						role="alert"
						className="text-danger"
					>
						{ r.error.message }
					</p>
					<Help help={ errorHelp( r.error ) } open />
				</div>
			);
		} else {
			body = (
				<QueryFailed
					title={ __( 'Could not search', 'cliedesk' ) }
					error={ r.error }
					onRetry={ () => void r.refetch() }
				/>
			);
		}
	} else {
		const items = exactFirst( r.data.items );
		body = (
			<div className="flex flex-col gap-4">
				<p role="status" className="text-fg-muted">
					{ sprintf(
						/* translators: %d: number of conversations found. */
						_n(
							'%d conversation found',
							'%d conversations found',
							items.length,
							'cliedesk'
						),
						items.length
					) }
				</p>
				{ r.data.contacts.length > 0 && (
					<section
						aria-labelledby="cd-search-contacts"
						className="flex flex-col gap-2"
					>
						<h2
							id="cd-search-contacts"
							className="text-sm font-semibold"
						>
							{ __( 'Contacts', 'cliedesk' ) }
						</h2>
						<ul className="flex flex-wrap gap-2">
							{ r.data.contacts.map( ( c ) => (
								<li key={ c.id }>
									<Link
										to="/contacts/$contactId"
										params={ { contactId: String( c.id ) } }
										className="inline-flex rounded-full border border-line px-3 py-1 text-sm text-accent-fg hover:bg-sunken"
									>
										<bdi>
											{ c.displayName ||
												c.email ||
												`#${ c.id }` }
										</bdi>
									</Link>
								</li>
							) ) }
						</ul>
					</section>
				) }
				{ items.length === 0 ? (
					<Banner
						tone="info"
						title={ __( 'No conversations match.', 'cliedesk' ) }
					/>
				) : (
					<section aria-labelledby="cd-search-conversations">
						<h2 id="cd-search-conversations" className="sr-only">
							{ __( 'Conversations', 'cliedesk' ) }
						</h2>
						<ul className="overflow-hidden rounded-lg border border-line bg-surface">
							{ items.map( ( item ) => (
								<li
									key={ item.id }
									className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-b-0"
								>
									<div className="flex min-w-0 items-center gap-2">
										<span className="cd-tabular text-sm text-fg-muted">{ `#${ item.number }` }</span>
										<Link
											to="/c/$number"
											params={ {
												number: String( item.number ),
											} }
											// INB-04: open at the matching message.
											hash={
												item.matchId
													? `m-${ item.matchId }`
													: undefined
											}
											className="min-w-0 flex-1 truncate font-medium text-accent-fg underline-offset-2 hover:underline"
										>
											<bdi>
												{ highlight(
													item.subject,
													r.data.highlights
												) }
											</bdi>
										</Link>
										{ item.exact && (
											<Pill tone="accent">
												{ __(
													'Exact match',
													'cliedesk'
												) }
											</Pill>
										) }
										{ item.archived && (
											<Pill>
												{ __( 'Archived', 'cliedesk' ) }
											</Pill>
										) }
										<time
											dateTime={
												item.lastMessageAt ??
												item.updatedAt
											}
											title={ fullTime(
												item.lastMessageAt ??
													item.updatedAt
											) }
											className="shrink-0 text-xs text-fg-muted"
										>
											{ relativeTime(
												item.lastMessageAt ??
													item.updatedAt
											) }
										</time>
									</div>
									<p className="text-sm text-fg-muted">
										<bdi className="font-medium">
											{ item.requesterName }
										</bdi>
										{ item.snippet ? (
											<>
												{ ' ' }
												—{ ' ' }
												{ highlight(
													item.snippet,
													r.data.highlights
												) }
											</>
										) : null }
									</p>
									<div className="flex flex-wrap gap-2">
										{ item.status && (
											<StatusBadge
												label={ item.status.label }
												category={
													item.status.category
												}
											/>
										) }
										<PriorityBadge
											priority={ item.priority }
										/>
										{ canLink && (
											<Button
												size="sm"
												variant="ghost"
												className="ms-auto"
												onPress={ () =>
													setLinking( item )
												}
												aria-label={ sprintf(
													/* translators: %d: conversation number. */
													__(
														'Link #%d to…',
														'cliedesk'
													),
													item.number
												) }
											>
												{ __( 'Link to…', 'cliedesk' ) }
											</Button>
										) }
									</div>
								</li>
							) ) }
						</ul>
					</section>
				) }
				<Help help={ r.data.help } />
			</div>
		);
	}
	const sorts: Array< { id: SearchSort; label: string } > = [
		...( filters
			? []
			: [
					{
						id: 'relevance' as const,
						label: __( 'Best match', 'cliedesk' ),
					},
				] ),
		{ id: 'newest', label: __( 'Newest first', 'cliedesk' ) },
		{ id: 'oldest', label: __( 'Oldest first', 'cliedesk' ) },
	];
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<Select
					label={ __( 'Sort results', 'cliedesk' ) }
					value={ sort }
					onChange={ ( v ) => setSort( v as SearchSort ) }
					options={ sorts }
				/>
				<Button
					aria-expanded={ panel }
					aria-controls="cd-search-filters"
					onPress={ () => setPanel( ( o ) => ! o ) }
				>
					{ filters
						? __( 'Advanced filters (on)', 'cliedesk' )
						: __( 'Advanced filters', 'cliedesk' ) }
				</Button>
				<Button
					className="ms-auto"
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save as view', 'cliedesk' ) }
				</Button>
			</div>
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
			<div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
				{ panel && (
					<section
						id="cd-search-filters"
						aria-labelledby="cd-search-filters-title"
						className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 lg:w-[28rem] lg:shrink-0"
					>
						<h2
							id="cd-search-filters-title"
							className="text-sm font-semibold"
						>
							{ __( 'Advanced filters', 'cliedesk' ) }
						</h2>
						<Suspense
							fallback={
								<LoadingRegion
									label={ __( 'Loading…', 'cliedesk' ) }
								/>
							}
						>
							<SearchFilters
								applied={ filters }
								onApply={ ( next ) => {
									setFilters( next );
									if ( next && sort === 'relevance' ) {
										setSort( 'newest' );
									}
								} }
							/>
						</Suspense>
					</section>
				) }
				<div className="min-w-0 flex-1">{ body }</div>
			</div>
			{ linking && (
				<BulkLinkDialog
					ids={ [ linking.id ] }
					onClose={ () => setLinking( null ) }
					onDone={ () => setLinking( null ) }
				/>
			) }
		</div>
	);
}
