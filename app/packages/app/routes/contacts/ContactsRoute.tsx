/**
 * `/contacts` (CRM-01, CRM-36…41): contact list with search, sort, a filter builder with nested AND / OR groups
 * (POST contacts/query, keyset "Load more" and the total), a column chooser (kept in localStorage: me/prefs takes
 * no extra keys), row selection with "Select all matching", segments and lists (CRM-38), bulk actions (CRM-40)
 * and export (CRM-41). Trash still uses GET contacts?state=trash (contacts/query leaves trashed contacts out).
 */
import {
	can,
	getBoot,
	isApiError,
	useInfiniteQuery,
	useQuery,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	LoadingRegion,
	Modal,
	Select,
	TextField,
	EmptyState,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Columns3, Filter, Search } from 'lucide-react';
import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
const ImportDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "contacts-import" */ '../../crm/ImportDialog'
		)
);
const DataCleanerDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "contacts-cleaner" */ '../../crm/DataCleanerDialog'
		)
);
import { BulkBar, selectionText } from '../../crm/BulkBar';
import {
	ContactFilterBuilder,
	type FilterLookups,
} from '../../crm/ContactFilterBuilder';
import {
	conditionLabels,
	countLeaves,
	fromJson,
	newGroup,
	toJson,
	validateTree,
	type CGroup,
} from '../../crm/contactConditions';
import { JobsPanel } from '../../crm/jobs';
import {
	COLUMNS,
	CONTACT_SORTS,
	columnLabel,
	contactQueryKey,
	fetchContactQuery,
	loadColumns,
	saveColumns,
	segmentFilter,
	segmentOf,
	segmentsQuery,
	sortLabel,
	type ColumnKey,
	type ContactRow,
	type ContactSort,
	type Selection,
} from '../../crm/listApi';
import { SegmentDialog, SegmentsPanel } from '../../crm/Segments';
import { fetchContactsPage, fieldsQuery, tagsQuery } from '../../inbox/api';
import {
	ActionError,
	Avatar,
	Pill,
	QueryFailed,
	useAgents,
} from '../../inbox/components';
import { fullTime, relativeTime } from '../../inbox/labels';
import { formatDate } from '../../workspace/api';

const th = 'px-3 py-2 text-start font-medium';

const nameOf = ( c: ContactRow ) =>
	c.displayName || __( 'Unnamed contact', 'cliedesk' );

/**
 * Identity values of a type (falls back to the primary email / phone).
 *
 * @param c     Contact.
 * @param types Identity types.
 */
function identityValues( c: ContactRow, types: string[] ): string {
	const list = ( c.identities ?? [] )
		.filter( ( i ) => types.includes( i.type ) )
		.map( ( i ) => i.value );
	if ( list.length ) {
		return list.join( ', ' );
	}
	return ( types.includes( 'email' ) ? c.email : c.phone ) ?? '';
}

function Cell( { c, col }: { c: ContactRow; col: ColumnKey } ) {
	switch ( col ) {
		case 'emails':
			return <bdi>{ identityValues( c, [ 'email' ] ) }</bdi>;
		case 'phones':
			return <bdi>{ identityValues( c, [ 'phone', 'whatsapp' ] ) }</bdi>;
		case 'country':
			return <>{ c.country ?? '' }</>;
		case 'city':
			return <bdi>{ c.city ?? '' }</bdi>;
		case 'organization':
			return (
				<bdi>
					{ ( c.organizations ?? [] )
						.map( ( o ) => o.name )
						.join( ', ' ) }
				</bdi>
			);
		case 'tags':
			return (
				<span className="flex flex-wrap gap-1">
					{ ( c.tags ?? [] ).map( ( t ) => (
						<Pill key={ t.id }>
							<bdi>{ t.name }</bdi>
						</Pill>
					) ) }
				</span>
			);
		case 'conversations':
			return <span className="cd-tabular">{ c.conversationCount }</span>;
		case 'lastConversation':
			return c.lastConversationAt ? (
				<time
					dateTime={ c.lastConversationAt }
					title={ fullTime( c.lastConversationAt ) }
				>
					{ relativeTime( c.lastConversationAt ) }
				</time>
			) : null;
		case 'created':
			return c.createdAt ? (
				<time dateTime={ c.createdAt }>
					{ formatDate( c.createdAt, false ) }
				</time>
			) : null;
	}
	return null;
}

function ColumnsDialog( {
	value,
	onChange,
	onClose,
}: {
	value: ColumnKey[];
	onChange: ( c: ColumnKey[] ) => void;
	onClose: () => void;
} ) {
	const [ cols, setCols ] = useState( value );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Choose columns', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						onPress={ () => {
							onChange(
								COLUMNS.filter( ( c ) => cols.includes( c ) )
							);
							onClose();
						} }
					>
						{ __( 'Apply', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<fieldset className="flex flex-col gap-1">
				<legend className="pb-1 text-sm font-medium">
					{ __( 'Columns', 'cliedesk' ) }
				</legend>
				{ COLUMNS.map( ( c ) => (
					<Checkbox
						key={ c }
						isDisabled={ c === 'name' }
						isSelected={ cols.includes( c ) }
						onChange={ ( on ) =>
							setCols( ( l ) =>
								on ? [ ...l, c ] : l.filter( ( x ) => x !== c )
							)
						}
					>
						{ columnLabel( c ) }
					</Checkbox>
				) ) }
				<p className="pt-2 text-sm text-fg-muted">
					{ __( 'Saved in this browser.', 'cliedesk' ) }
				</p>
			</fieldset>
		</Modal>
	);
}

/**
 * Contacts screen.
 */
export default function ContactsRoute() {
	const [ input, setInput ] = useState( '' );
	const [ q, setQ ] = useState( '' );
	const [ sort, setSort ] = useState< ContactSort >( 'last_conversation' );
	const [ trash, setTrash ] = useState( false );
	const [ importing, setImporting ] = useState( false );
	const [ cleaning, setCleaning ] = useState( false );
	const [ draft, setDraft ] = useState< CGroup >( () => newGroup() );
	const [ applied, setApplied ] = useState< string | null >( null );
	const [ showFilter, setShowFilter ] = useState( false );
	const [ filterSubmitted, setFilterSubmitted ] = useState( false );
	const [ cols, setCols ] = useState< ColumnKey[] >( loadColumns );
	const [ choosing, setChoosing ] = useState( false );
	const [ selected, setSelected ] = useState< number[] >( [] );
	const [ allMatching, setAllMatching ] = useState( false );
	const [ saving, setSaving ] = useState( false );

	const tags = useQuery( tagsQuery() );
	const fields = useQuery( fieldsQuery( 'contact' ) );
	const segments = useQuery( segmentsQuery() );
	const { agents } = useAgents();
	const lookups: FilterLookups = {
		tags: Array.isArray( tags.data ) ? tags.data : [],
		agents,
		fields: ( Array.isArray( fields.data ) ? fields.data : [] ).filter(
			( f ) => ! f.archived
		),
		segments: segments.data ?? [],
		meId: getBoot().user?.id ?? null,
	};

	const input0 = useMemo(
		() => ( { conditions: applied, q, sort } ),
		[ applied, q, sort ]
	);
	const list = useInfiniteQuery( {
		queryKey: contactQueryKey( input0 ),
		queryFn: ( { pageParam, signal } ) =>
			fetchContactQuery( input0, pageParam, signal ),
		initialPageParam: null as string | null,
		getNextPageParam: ( last ) => last.nextCursor ?? undefined,
		enabled: ! trash,
		retry: ( n, e ) => ! ( isApiError( e ) && e.status === 400 ) && n < 2,
	} );
	const trashList = useInfiniteQuery( {
		queryKey: [ 'contacts', 'list', q, 'trash' ] as const,
		queryFn: ( { pageParam, signal } ) =>
			fetchContactsPage( q, 'trash', pageParam, signal ),
		initialPageParam: null as string | null,
		getNextPageParam: ( last ) => last.next ?? undefined,
		enabled: trash,
	} );
	const active = trash ? trashList : list;
	const items: ContactRow[] = trash
		? ( trashList.data?.pages.flatMap( ( p ) => p.items ) ?? [] )
		: ( list.data?.pages.flatMap( ( p ) => p.items ) ?? [] );
	const total = trash ? null : ( list.data?.pages[ 0 ]?.total ?? null );
	const activeSegment = segmentOf( applied ? JSON.parse( applied ) : null );
	const activeList =
		segments.data?.find(
			( s ) => s.id === activeSegment && s.kind === 'static'
		)?.id ?? null;
	const is400 = isApiError( list.error ) && list.error.status === 400;

	const resetSelection = () => {
		setSelected( [] );
		setAllMatching( false );
	};
	const applyTree = ( root: CGroup ) => {
		setDraft( root );
		setApplied( toJson( root, lookups.fields ) );
		resetSelection();
	};
	const submitSearch = ( e: FormEvent ) => {
		e.preventDefault();
		setQ( input.trim() );
		resetSelection();
	};
	const filterErrors = filterSubmitted
		? validateTree( draft, lookups.fields )
		: {};
	const applyFilter = () => {
		setFilterSubmitted( true );
		if ( ! Object.keys( validateTree( draft, lookups.fields ) ).length ) {
			setFilterSubmitted( false );
			applyTree( draft );
		}
	};
	let selection: Selection | null = null;
	if ( allMatching ) {
		selection = { kind: 'all', conditions: applied, q, total };
	} else if ( selected.length ) {
		selection = { kind: 'ids', ids: selected };
	}
	const pageIds = items.map( ( c ) => c.id );
	const allOnPage =
		pageIds.length > 0 &&
		pageIds.every( ( id ) => selected.includes( id ) );
	const someOnPage = pageIds.some( ( id ) => selected.includes( id ) );
	const leaves = countLeaves( draft );
	const canEdit = can( 'cliedesk_edit_contacts' );

	return (
		<div className="mx-auto flex max-w-7xl flex-col">
			<PageHeader
				title={ __( 'Contacts', 'cliedesk' ) }
				description={ __(
					'Everyone who has contacted you.',
					'cliedesk'
				) }
				actions={
					<>
						{ can( 'cliedesk_edit_contacts' ) && (
							<Button onPress={ () => setCleaning( true ) }>
								{ __( 'Clean up data…', 'cliedesk' ) }
							</Button>
						) }
						{ can( 'cliedesk_import_data' ) && (
							<Button onPress={ () => setImporting( true ) }>
								{ __( 'Import…', 'cliedesk' ) }
							</Button>
						) }
						<Link
							to="/records"
							className="inline-flex h-(--cd-control-h) items-center rounded-md border border-line-strong bg-surface px-(--cd-control-px) font-medium text-fg hover:bg-sunken"
						>
							{ __( 'Records', 'cliedesk' ) }
						</Link>
						<Link
							to="/contacts/duplicates"
							className="inline-flex h-(--cd-control-h) items-center rounded-md border border-line-strong bg-surface px-(--cd-control-px) font-medium text-fg hover:bg-sunken"
						>
							{ __( 'Possible duplicates', 'cliedesk' ) }
						</Link>
					</>
				}
			/>
			{ cleaning && (
				<Suspense fallback={ null }>
					<DataCleanerDialog onClose={ () => setCleaning( false ) } />
				</Suspense>
			) }
			{ importing && (
				<Suspense fallback={ null }>
					<ImportDialog onClose={ () => setImporting( false ) } />
				</Suspense>
			) }
			<div className="flex flex-col gap-6 lg:flex-row">
				{ ! trash && (
					<aside className="lg:w-64 lg:shrink-0">
						<SegmentsPanel
							segments={ segments.data ?? [] }
							isError={ segments.isError }
							activeId={ activeSegment }
							lookups={ lookups }
							onSelect={ ( s ) =>
								applyTree(
									fromJson(
										segmentFilter( s.id ),
										lookups.fields
									)
								)
							}
						/>
					</aside>
				) }
				<div className="flex min-w-0 flex-1 flex-col gap-4">
					<div className="flex flex-wrap items-end gap-3">
						<form
							role="search"
							noValidate
							onSubmit={ submitSearch }
							className="flex min-w-72 flex-1 items-end gap-2"
						>
							<TextField
								className="flex-1"
								label={ __( 'Search contacts', 'cliedesk' ) }
								description={ __(
									'Name, or an exact email address, phone number or #ID.',
									'cliedesk'
								) }
								inputMode="search"
								value={ input }
								onChange={ setInput }
							/>
							<Button
								type="submit"
								iconStart={
									<Search aria-hidden="true" size={ 14 } />
								}
							>
								{ __( 'Search', 'cliedesk' ) }
							</Button>
						</form>
						<Select
							className="min-w-36"
							label={ __( 'Show', 'cliedesk' ) }
							value={ trash ? 'trash' : 'contacts' }
							onChange={ ( x ) => {
								setTrash( x === 'trash' );
								resetSelection();
							} }
							options={ [
								{
									id: 'contacts',
									label: __( 'Contacts', 'cliedesk' ),
								},
								{
									id: 'trash',
									label: __( 'Trash', 'cliedesk' ),
								},
							] }
						/>
						{ ! trash && (
							<Select
								className="min-w-44"
								label={ __( 'Sort by', 'cliedesk' ) }
								value={ sort }
								onChange={ ( x ) =>
									setSort( x as ContactSort )
								}
								options={ CONTACT_SORTS.map( ( s ) => ( {
									id: s,
									label: sortLabel( s ),
								} ) ) }
							/>
						) }
					</div>
					{ ! trash && (
						<div className="flex flex-wrap items-center gap-2">
							<Button
								aria-expanded={ showFilter }
								aria-controls="cd-contact-filter"
								iconStart={
									<Filter aria-hidden="true" size={ 14 } />
								}
								onPress={ () => setShowFilter( ( s ) => ! s ) }
							>
								{ leaves
									? sprintf(
											/* translators: %d: number of conditions. */
											_n(
												'Filter (%d)',
												'Filter (%d)',
												leaves,
												'cliedesk'
											),
											leaves
										)
									: __( 'Filter', 'cliedesk' ) }
							</Button>
							<Button
								iconStart={
									<Columns3 aria-hidden="true" size={ 14 } />
								}
								onPress={ () => setChoosing( true ) }
							>
								{ __( 'Columns', 'cliedesk' ) }
							</Button>
							{ applied && (
								<Button
									variant="ghost"
									onPress={ () => applyTree( newGroup() ) }
								>
									{ __( 'Clear filter', 'cliedesk' ) }
								</Button>
							) }
							{ applied && canEdit && (
								<Button onPress={ () => setSaving( true ) }>
									{ __( 'Save as segment', 'cliedesk' ) }
								</Button>
							) }
							<p
								role="status"
								className="ms-auto text-sm text-fg-muted"
							>
								{ total !== null &&
									sprintf(
										/* translators: %d: number of contacts. */
										_n(
											'%d contact',
											'%d contacts',
											total,
											'cliedesk'
										),
										total
									) }
							</p>
						</div>
					) }
					{ ! trash && showFilter && (
						<div
							id="cd-contact-filter"
							className="flex flex-col gap-3"
						>
							<ContactFilterBuilder
								root={ draft }
								lookups={ lookups }
								errors={ filterErrors }
								onChange={ setDraft }
							/>
							<div className="flex gap-2">
								<Button
									variant="primary"
									onPress={ applyFilter }
								>
									{ __( 'Apply filter', 'cliedesk' ) }
								</Button>
							</div>
						</div>
					) }
					<JobsPanel />
					{ selection && ! trash && (
						<BulkBar
							selection={ selection }
							segments={ segments.data ?? [] }
							activeListId={ activeList }
							onClear={ resetSelection }
						/>
					) }
					{ ! allMatching &&
						allOnPage &&
						total !== null &&
						total > items.length &&
						! trash && (
							<Banner
								tone="info"
								title={ sprintf(
									/* translators: %d: number of contacts on this page. */
									_n(
										'The %d contact on this page is selected.',
										'All %d contacts on this page are selected.',
										selected.length,
										'cliedesk'
									),
									selected.length
								) }
								actions={
									<Button
										size="sm"
										onPress={ () => setAllMatching( true ) }
									>
										{ sprintf(
											/* translators: %d: number of matching contacts. */
											__(
												'Select all matching (%d)',
												'cliedesk'
											),
											total
										) }
									</Button>
								}
							/>
						) }
					{ allMatching && selection && (
						<p className="text-sm text-fg-muted">
							{ selectionText( selection ) }
						</p>
					) }
					{ active.isPending && (
						<LoadingRegion
							label={ __( 'Loading contacts…', 'cliedesk' ) }
						/>
					) }
					{ is400 && (
						<ActionError
							title={ __( 'Check the filter', 'cliedesk' ) }
							error={ list.error }
							labels={ conditionLabels() }
						/>
					) }
					{ active.isError && ! is400 && (
						<QueryFailed
							title={ __(
								'Could not load the contacts',
								'cliedesk'
							) }
							error={ active.error }
							onRetry={ () => void active.refetch() }
						/>
					) }
					{ active.isSuccess &&
						items.length === 0 &&
						( q || applied ? (
							<p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-fg-muted">
								{ __( 'No contacts match.', 'cliedesk' ) }
							</p>
						) : (
							// ADM-04: every empty state offers a way to start.
							<EmptyState
								title={ __(
									'No contacts here yet.',
									'cliedesk'
								) }
								description={ __(
									'Contacts appear when customers write in. Import a CSV from your old helpdesk or shop to start with their history.',
									'cliedesk'
								) }
								actions={
									can( 'cliedesk_import_data' ) && (
										<Button
											onPress={ () =>
												setImporting( true )
											}
										>
											{ __(
												'Import contacts',
												'cliedesk'
											) }
										</Button>
									)
								}
							/>
						) ) }
					{ items.length > 0 && (
						<div className="overflow-x-auto rounded-lg border border-line bg-surface">
							<table className="w-full text-start text-sm">
								<caption className="sr-only">
									{ __( 'Contacts', 'cliedesk' ) }
								</caption>
								<thead className="border-b border-line text-fg-muted">
									<tr>
										{ ! trash && (
											<th
												scope="col"
												className="w-10 px-3 py-2"
											>
												<Checkbox
													isSelected={
														allOnPage || allMatching
													}
													isIndeterminate={
														! allOnPage &&
														someOnPage &&
														! allMatching
													}
													onChange={ ( on ) => {
														setAllMatching( false );
														setSelected(
															on ? pageIds : []
														);
													} }
												>
													<span className="sr-only">
														{ __(
															'Select all on this page',
															'cliedesk'
														) }
													</span>
												</Checkbox>
											</th>
										) }
										{ ( trash
											? ( [
													'name',
													'emails',
													'phones',
													'conversations',
												] as ColumnKey[] )
											: cols
										).map( ( c ) => (
											<th
												key={ c }
												scope="col"
												className={
													c === 'conversations'
														? 'px-3 py-2 text-end font-medium'
														: th
												}
											>
												{ columnLabel( c ) }
											</th>
										) ) }
									</tr>
								</thead>
								<tbody>
									{ items.map( ( c ) => (
										<tr
											key={ c.id }
											className="border-b border-line last:border-b-0"
										>
											{ ! trash && (
												<td className="px-3 py-2">
													<Checkbox
														isSelected={
															allMatching ||
															selected.includes(
																c.id
															)
														}
														onChange={ ( on ) => {
															if ( allMatching ) {
																setAllMatching(
																	false
																);
																setSelected(
																	pageIds.filter(
																		(
																			id
																		) =>
																			on ||
																			id !==
																				c.id
																	)
																);
																return;
															}
															setSelected(
																( l ) =>
																	on
																		? [
																				...l,
																				c.id,
																			]
																		: l.filter(
																				(
																					x
																				) =>
																					x !==
																					c.id
																			)
															);
														} }
													>
														<span className="sr-only">
															{ sprintf(
																/* translators: %s: contact name. */
																__(
																	'Select %s',
																	'cliedesk'
																),
																nameOf( c )
															) }
														</span>
													</Checkbox>
												</td>
											) }
											{ ( trash
												? ( [
														'name',
														'emails',
														'phones',
														'conversations',
													] as ColumnKey[] )
												: cols
											).map( ( col ) =>
												col === 'name' ? (
													<td
														key={ col }
														className="px-3 py-2"
													>
														<span className="flex items-center gap-2">
															<Avatar
																name={
																	c.displayName
																}
																src={ c.avatar }
																size={ 28 }
															/>
															<Link
																to="/contacts/$contactId"
																params={ {
																	contactId:
																		String(
																			c.id
																		),
																} }
																className="font-medium text-accent-fg underline-offset-2 hover:underline"
															>
																<bdi>
																	{ nameOf(
																		c
																	) }
																</bdi>
															</Link>
															{ c.blocked && (
																<Pill tone="danger">
																	{ __(
																		'Blocked',
																		'cliedesk'
																	) }
																</Pill>
															) }
														</span>
													</td>
												) : (
													<td
														key={ col }
														className={
															col ===
															'conversations'
																? 'px-3 py-2 text-end'
																: 'px-3 py-2'
														}
													>
														<Cell
															c={ c }
															col={ col }
														/>
													</td>
												)
											) }
										</tr>
									) ) }
								</tbody>
							</table>
						</div>
					) }
					{ active.hasNextPage && (
						<Button
							className="self-center"
							isLoading={ active.isFetchingNextPage }
							onPress={ () => void active.fetchNextPage() }
						>
							{ __( 'Load more', 'cliedesk' ) }
						</Button>
					) }
				</div>
			</div>
			{ choosing && (
				<ColumnsDialog
					value={ cols }
					onChange={ ( c ) => {
						setCols( c );
						saveColumns( c );
					} }
					onClose={ () => setChoosing( false ) }
				/>
			) }
			{ saving && (
				<SegmentDialog
					conditions={ applied }
					lookups={ lookups }
					onClose={ () => setSaving( false ) }
					onSaved={ ( s ) =>
						applyTree(
							fromJson( segmentFilter( s.id ), lookups.fields )
						)
					}
				/>
			) }
		</div>
	);
}
