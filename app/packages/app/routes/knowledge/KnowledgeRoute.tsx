/**
 * `/knowledge`: the knowledge library (KB-33). Help articles, site pages, files and web pages in one list with one
 * search ("quoted words" match exactly) and filters; filters can be saved by name and reloaded. The visibility levels
 * come from the server (Free: everyone and agents only; Pro adds its levels).
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
	wpAdminUrl,
} from '@cliedesk/data';
import {
	Button,
	EmptyState,
	LoadingRegion,
	Select,
	TextField,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { BookOpen } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ActionError, Pill, QueryFailed } from '../../inbox/components';

export interface LibraryFilters {
	q?: string;
	source?: string;
	visibility?: string;
	status?: string;
	updatedAfter?: string;
}

interface LibraryItem {
	source: string;
	ref: string;
	title: string;
	url: string;
	editUrl: string;
	visibility: string;
	status: string;
	author: string;
	categories: string[];
	updatedAt: string;
}

interface VisibilityOption {
	id: string;
	label: string;
}

interface SavedFilter {
	id: string;
	name: string;
	filters: LibraryFilters;
}

const SOURCES = () => [
	{ id: 'all', label: __( 'Everything', 'cliedesk' ) },
	{ id: 'article', label: __( 'Help articles', 'cliedesk' ) },
	{ id: 'site', label: __( 'Site pages', 'cliedesk' ) },
	{ id: 'file', label: __( 'Files', 'cliedesk' ) },
	{ id: 'web', label: __( 'Web pages', 'cliedesk' ) },
];

const VISIBILITY = ( levels: VisibilityOption[] ) => [
	{ id: '', label: __( 'Any', 'cliedesk' ) },
	...levels,
];

const STATUS = () => [
	{ id: '', label: __( 'Any', 'cliedesk' ) },
	{ id: 'publish', label: __( 'Published', 'cliedesk' ) },
	{ id: 'draft', label: __( 'Draft', 'cliedesk' ) },
	{ id: 'pending', label: __( 'Waiting for review', 'cliedesk' ) },
	{ id: 'cliedesk_archived', label: __( 'Archived', 'cliedesk' ) },
	{ id: 'no_text', label: __( 'No text found', 'cliedesk' ) },
];

const sourceLabel = ( s: string ) =>
	SOURCES().find( ( x ) => x.id === s )?.label ?? s;

/** Only the filters that are set (what is sent and saved). */
export function cleanFilters( f: LibraryFilters ): LibraryFilters {
	return Object.fromEntries(
		Object.entries( f ).filter(
			( [ k, v ] ) =>
				v !== '' &&
				v !== undefined &&
				! ( k === 'source' && v === 'all' )
		)
	) as LibraryFilters;
}

/** WordPress "Add article" screen. */
export function newArticleUrl(): string {
	return wpAdminUrl( 'post-new.php?post_type=cliedesk_article' );
}

export default function KnowledgeRoute() {
	const qc = useQueryClient();
	const [ draft, setDraft ] = useState< LibraryFilters >( { source: 'all' } );
	const [ applied, setApplied ] = useState< LibraryFilters >( {} );
	const [ name, setName ] = useState( '' );
	const list = useQuery( {
		queryKey: [ 'knowledge', 'library', applied ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					items: LibraryItem[];
					total: number;
					visibilities?: VisibilityOption[];
				} >( 'knowledge/library', { signal, query: { ...applied } } )
			).data,
	} );
	// The levels arrive with the list; keep the last ones while a new search loads.
	const [ levels, setLevels ] = useState< VisibilityOption[] >( [] );
	const loaded = list.data?.visibilities;
	useEffect( () => {
		if ( loaded ) {
			setLevels( loaded );
		}
	}, [ loaded ] );
	const saved = useQuery( {
		queryKey: [ 'knowledge', 'library', 'filters' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: SavedFilter[] } >(
					'knowledge/library/filters',
					{ signal }
				)
			).data?.items ?? [],
	} );
	const refreshSaved = () =>
		void qc.invalidateQueries( {
			queryKey: [ 'knowledge', 'library', 'filters' ],
		} );
	const save = useMutation( {
		mutationFn: () =>
			api.post( 'knowledge/library/filters', {
				body: { name: name.trim(), filters: cleanFilters( applied ) },
			} ),
		onSuccess: () => {
			setName( '' );
			refreshSaved();
		},
	} );
	const remove = useMutation( {
		mutationFn: ( id: string ) =>
			api.del( `knowledge/library/filters/${ id }` ),
		onSuccess: refreshSaved,
	} );
	const set = ( k: keyof LibraryFilters ) => ( v: string ) =>
		setDraft( ( d ) => ( { ...d, [ k ]: v } ) );
	const onSearch = ( e: FormEvent ) => {
		e.preventDefault();
		setApplied( cleanFilters( draft ) );
	};
	const load = ( f: SavedFilter ) => {
		setDraft( { source: 'all', ...f.filters } );
		setApplied( cleanFilters( f.filters ) );
	};
	const items = list.data?.items ?? [];
	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={ __( 'Knowledge', 'cliedesk' ) }
				description={ __(
					'Help articles and everything else agents can find: site pages, files and web pages.',
					'cliedesk'
				) }
			/>
			<form
				role="search"
				noValidate
				onSubmit={ onSearch }
				className="flex flex-col gap-3 px-4"
			>
				<TextField
					label={ __( 'Search', 'cliedesk' ) }
					description={ __(
						'Put words in quotes to match them exactly, e.g. "free returns".',
						'cliedesk'
					) }
					maxLength={ 200 }
					value={ draft.q ?? '' }
					onChange={ set( 'q' ) }
				/>
				<div className="grid gap-3 sm:grid-cols-4">
					<Select
						label={ __( 'Source', 'cliedesk' ) }
						value={ draft.source ?? 'all' }
						onChange={ set( 'source' ) }
						options={ SOURCES() }
					/>
					<Select
						label={ __( 'Who can read it', 'cliedesk' ) }
						value={ draft.visibility ?? '' }
						onChange={ set( 'visibility' ) }
						options={ VISIBILITY( levels ) }
					/>
					<Select
						label={ __( 'Status', 'cliedesk' ) }
						value={ draft.status ?? '' }
						onChange={ set( 'status' ) }
						options={ STATUS() }
					/>
					<TextField
						label={ __( 'Changed after', 'cliedesk' ) }
						type="date"
						value={ draft.updatedAfter ?? '' }
						onChange={ set( 'updatedAfter' ) }
					/>
				</div>
				<div>
					<Button type="submit" variant="primary">
						{ __( 'Search', 'cliedesk' ) }
					</Button>
				</div>
			</form>
			<section
				className="flex flex-wrap items-end gap-2 px-4"
				aria-label={ __( 'Saved filters', 'cliedesk' ) }
			>
				{ ( saved.data ?? [] ).map( ( f ) => (
					<span key={ f.id } className="flex items-center gap-1">
						<Button size="sm" onPress={ () => load( f ) }>
							{ f.name }
						</Button>
						<Button
							size="sm"
							variant="ghost"
							aria-label={ sprintf(
								/* translators: %s: filter name. */
								__( 'Delete filter %s', 'cliedesk' ),
								f.name
							) }
							onPress={ () => remove.mutate( f.id ) }
						>
							×
						</Button>
					</span>
				) ) }
				<TextField
					label={ __( 'Save these filters as', 'cliedesk' ) }
					maxLength={ 60 }
					value={ name }
					onChange={ setName }
				/>
				<Button
					size="sm"
					isDisabled={ ! name.trim() }
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save filter', 'cliedesk' ) }
				</Button>
			</section>
			<div className="px-4">
				<ActionError error={ save.error ?? remove.error } />
			</div>
			{ list.isPending && <LoadingRegion /> }
			{ list.isError && (
				<QueryFailed
					title={ __(
						'The knowledge library could not load.',
						'cliedesk'
					) }
					error={ list.error }
					onRetry={ () => void list.refetch() }
				/>
			) }
			{ list.data &&
				items.length === 0 &&
				( Object.keys( applied ).length ? (
					<EmptyState
						icon={ <BookOpen aria-hidden size={ 32 } /> }
						title={ __( 'Nothing found', 'cliedesk' ) }
						description={ __(
							'Try other words or fewer filters.',
							'cliedesk'
						) }
						actions={
							<Button
								onPress={ () => {
									setDraft( { source: 'all' } );
									setApplied( {} );
								} }
							>
								{ __( 'Clear the search', 'cliedesk' ) }
							</Button>
						}
					/>
				) : (
					// ADM-04: every empty state offers a way to start.
					<EmptyState
						icon={ <BookOpen aria-hidden size={ 32 } /> }
						title={ __( 'No knowledge yet', 'cliedesk' ) }
						description={ __(
							'Start with the questions customers ask most, for example “How do I return an item?”, or import the articles you already have.',
							'cliedesk'
						) }
						actions={
							<>
								{ can( 'edit_cliedesk_articles' ) && (
									<a
										href={ newArticleUrl() }
										className="inline-flex h-(--cd-control-h) items-center rounded-md bg-accent px-(--cd-control-px) font-medium text-on-accent hover:bg-accent-hover"
									>
										{ __(
											'Write your first article',
											'cliedesk'
										) }
									</a>
								) }
								{ can( 'cliedesk_manage_knowledge' ) && (
									<Link
										to="/settings/$area/$section"
										params={ {
											area: 'channels',
											section: 'help-center',
										} }
										className="inline-flex h-(--cd-control-h) items-center rounded-md border border-line-strong bg-surface px-(--cd-control-px) font-medium text-fg hover:bg-sunken"
									>
										{ __( 'Import articles', 'cliedesk' ) }
									</Link>
								) }
							</>
						}
					/>
				) ) }
			{ items.length > 0 && (
				<>
					<p className="px-4 text-sm text-fg-muted" role="status">
						{ sprintf(
							/* translators: %d: number of results. */
							_n(
								'%d result',
								'%d results',
								list.data?.total ?? 0,
								'cliedesk'
							),
							list.data?.total ?? 0
						) }
					</p>
					<ul className="flex flex-col divide-y divide-line border-y border-line">
						{ items.map( ( i ) => (
							<li
								key={ `${ i.source }:${ i.ref }` }
								className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm"
							>
								<a
									href={ i.editUrl || i.url || undefined }
									className="min-w-0 flex-1 font-medium text-accent-fg underline-offset-2 hover:underline"
								>
									{ i.title ||
										__( '(no title)', 'cliedesk' ) }
								</a>
								<Pill>{ sourceLabel( i.source ) }</Pill>
								<Pill>{ i.status }</Pill>
								<span className="text-fg-muted">
									{ [ i.author, i.categories.join( ', ' ) ]
										.filter( Boolean )
										.join( ' · ' ) }
								</span>
							</li>
						) ) }
					</ul>
				</>
			) }
		</div>
	);
}
