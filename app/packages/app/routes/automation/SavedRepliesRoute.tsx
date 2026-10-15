/**
 * `/automation/replies`: the saved reply library (MAC-01, MAC-07, MAC-16, MAC-18). Everyone who may use saved
 * replies sees their personal replies, the team replies of their teams and the shared ones (the server scopes the
 * list). Search, status, folder (`a::b` nests) and sort (manual order, name, most used, recently used); scope and
 * status badges, shortcut and use count per row. People who may change a reply (SavedReplies::can_edit) can move it
 * up or down in the manual order (PATCH sort with If-Match), archive and restore it; anyone who may create replies
 * can copy one. Import and export (JSON or CSV) need cliedesk_manage_shared_replies.
 */
import {
	api,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	EmptyState,
	IconButton,
	LoadingRegion,
	Menu,
	MenuItem,
	Modal,
	Select,
	TextField,
} from '@cliedesk/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, MessageSquareText, Plus } from 'lucide-react';
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { describeError } from '../../components/RouteError';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { relativeTime } from '../../inbox/labels';
import { versionTag } from '../../workspace/api';
import { announceResult } from '../../workspace/forms';
import {
	SORTS,
	STATUSES,
	canCreateReplies,
	canEditReply,
	canTransfer,
	categoriesQuery,
	copyScope,
	downloadFile,
	folderLabel,
	replyKeys,
	replyListQuery,
	scopeLabel,
	sortLabel,
	statusLabel,
	type ListFilters,
	type ReplySort,
	type ReplyStatus,
	type SavedReply,
} from '../../macros/api';

interface ImportReport {
	created: number;
	updated: number;
	tagsCreated: string[];
	errors: string[];
}

function ImportDialog( { onClose }: { onClose: () => void } ) {
	const qc = useQueryClient();
	const fileId = useId();
	const [ format, setFormat ] = useState< 'json' | 'csv' >( 'json' );
	const [ data, setData ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const run = useMutation( {
		mutationFn: () =>
			api.post< ImportReport >( 'saved-replies/import', {
				body: { format, data },
			} ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: replyKeys.all } );
			announceResult(
				sprintf(
					/* translators: 1: number of replies created, 2: number of replies updated. */
					__(
						'Import done: %1$d created, %2$d updated.',
						'cliedesk'
					),
					r.data.created,
					r.data.updated
				)
			);
		},
	} );
	const onFile = ( e: ChangeEvent< HTMLInputElement > ) => {
		const file = e.target.files?.[ 0 ];
		if ( ! file ) {
			return;
		}
		setFormat( /\.csv$/i.test( file.name ) ? 'csv' : 'json' );
		void file.text().then( setData );
	};
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! data.trim() ) {
			setError( __( 'Choose a file or paste its content.', 'cliedesk' ) );
			return;
		}
		setError( null );
		run.mutate();
	};
	const report = run.data?.data;
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Import saved replies', 'cliedesk' ) }
			footer={
				report ? (
					<Button variant="primary" onPress={ onClose }>
						{ __( 'Done', 'cliedesk' ) }
					</Button>
				) : (
					<>
						<Button onPress={ onClose }>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
						<Button
							type="submit"
							form="cd-reply-import"
							variant="primary"
							isLoading={ run.isPending }
						>
							{ __( 'Import', 'cliedesk' ) }
						</Button>
					</>
				)
			}
		>
			{ report ? (
				<div className="flex flex-col gap-2" role="status">
					<p>
						{ sprintf(
							/* translators: 1: number of replies created, 2: number of replies updated. */
							__( '%1$d created, %2$d updated.', 'cliedesk' ),
							report.created,
							report.updated
						) }
					</p>
					{ report.tagsCreated.length > 0 && (
						<p>
							{ sprintf(
								/* translators: %s: comma-separated tag names. */
								__( 'New tags: %s', 'cliedesk' ),
								report.tagsCreated.join( ', ' )
							) }
						</p>
					) }
					{ report.errors.length > 0 && (
						<ul className="list-disc ps-5 text-danger">
							{ report.errors.map( ( m ) => (
								<li key={ m }>{ m }</li>
							) ) }
						</ul>
					) }
				</div>
			) : (
				<form
					id="cd-reply-import"
					noValidate
					onSubmit={ submit }
					className="flex flex-col gap-4"
				>
					<ActionError error={ run.error } />
					<Muted>
						{ __(
							'Replies with the same ID are updated, the others are added as shared replies. Missing tags are created.',
							'cliedesk'
						) }
					</Muted>
					<div className="flex flex-col gap-1">
						<label
							htmlFor={ fileId }
							className="text-sm font-medium"
						>
							{ __( 'File (JSON or CSV)', 'cliedesk' ) }
						</label>
						<input
							id={ fileId }
							type="file"
							accept=".json,.csv,application/json,text/csv"
							onChange={ onFile }
							className="text-sm text-fg file:me-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-fg"
						/>
					</div>
					<Select
						label={ __( 'Format', 'cliedesk' ) }
						value={ format }
						onChange={ ( v ) => setFormat( v as 'json' | 'csv' ) }
						options={ [
							{ id: 'json', label: 'JSON' },
							{ id: 'csv', label: 'CSV' },
						] }
					/>
					<TextField
						label={ __( 'Content', 'cliedesk' ) }
						multiline
						rows={ 6 }
						value={ data }
						onChange={ setData }
						errorMessage={ error }
					/>
				</form>
			) }
		</Modal>
	);
}

function ReplyRow( {
	item,
	prev,
	next,
	ordering,
	onMove,
	moving,
}: {
	item: SavedReply;
	prev?: SavedReply;
	next?: SavedReply;
	ordering: boolean;
	onMove: ( a: SavedReply, b: SavedReply ) => void;
	moving: boolean;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const editable = canEditReply( item );
	const scope = copyScope( item.scope );
	const setStatus = useMutation( {
		mutationFn: ( status: ReplyStatus ) =>
			api.patch< SavedReply >( `saved-replies/${ item.id }`, {
				body: { status },
				ifMatch: versionTag( item.version ),
			} ),
		onSuccess: ( _r, status ) => {
			announceResult(
				status === 'archived'
					? sprintf(
							/* translators: %s: saved reply name. */
							__( '“%s” archived.', 'cliedesk' ),
							item.name
						)
					: sprintf(
							/* translators: %s: saved reply name. */
							__( '“%s” restored.', 'cliedesk' ),
							item.name
						)
			);
			void qc.invalidateQueries( { queryKey: replyKeys.all } );
		},
	} );
	const duplicate = useMutation( {
		mutationFn: () =>
			api.post< SavedReply >( `saved-replies/${ item.id }/duplicate`, {
				body: { scope },
			} ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: replyKeys.all } );
			announceResult(
				sprintf(
					/* translators: %s: saved reply name. */
					__( 'Copied as “%s”.', 'cliedesk' ),
					r.data.name
				)
			);
			void navigate( {
				to: '/automation/replies/$replyId',
				params: { replyId: String( r.data.id ) },
			} as never );
		},
	} );
	const archived = item.status === 'archived';
	return (
		<li className="flex flex-wrap items-center gap-4 p-4">
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-base font-semibold">
						<Link
							to="/automation/replies/$replyId"
							params={ { replyId: String( item.id ) } }
							className="text-accent-fg underline-offset-2 hover:underline"
						>
							<bdi>{ item.name }</bdi>
						</Link>
					</h2>
					<Pill
						tone={
							item.scope === 'personal' ? 'neutral' : 'accent'
						}
					>
						{ scopeLabel( item.scope ) }
					</Pill>
					{ item.status !== 'active' && (
						<Pill tone="warning">
							{ statusLabel( item.status ) }
						</Pill>
					) }
					{ item.steps?.length > 0 && (
						<Pill>
							{ sprintf(
								/* translators: %d: number of macro actions. */
								_n(
									'%d action',
									'%d actions',
									item.steps.length,
									'cliedesk'
								),
								item.steps.length
							) }
						</Pill>
					) }
					{ item.shortcut && (
						<code className="rounded-sm bg-sunken px-1 text-sm">
							<bdi>{ item.shortcut }</bdi>
						</code>
					) }
				</div>
				<p className="text-sm text-fg-muted">
					{ item.category && (
						<>
							<bdi>{ folderLabel( item.category ) }</bdi>
							{ ' · ' }
						</>
					) }
					{ sprintf(
						/* translators: %d: number of times the saved reply was used. */
						_n(
							'Used %d time',
							'Used %d times',
							item.useCount,
							'cliedesk'
						),
						item.useCount
					) }
					{ item.lastUsedAt &&
						` · ${ sprintf(
							/* translators: %s: relative time, e.g. "2 days ago". */
							__( 'last %s', 'cliedesk' ),
							relativeTime( item.lastUsedAt )
						) }` }
				</p>
				<ActionError
					error={ setStatus.error ?? duplicate.error }
					onDismiss={ () => {
						setStatus.reset();
						duplicate.reset();
					} }
				/>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{ ordering && editable && (
					<>
						<IconButton
							size="sm"
							label={ sprintf(
								/* translators: %s: saved reply name. */
								__( 'Move %s up', 'cliedesk' ),
								item.name
							) }
							isDisabled={
								! prev || ! canEditReply( prev ) || moving
							}
							onPress={ () => prev && onMove( item, prev ) }
							icon={ <ArrowUp aria-hidden="true" size={ 14 } /> }
						/>
						<IconButton
							size="sm"
							label={ sprintf(
								/* translators: %s: saved reply name. */
								__( 'Move %s down', 'cliedesk' ),
								item.name
							) }
							isDisabled={
								! next || ! canEditReply( next ) || moving
							}
							onPress={ () => next && onMove( item, next ) }
							icon={
								<ArrowDown aria-hidden="true" size={ 14 } />
							}
						/>
					</>
				) }
				{ scope && (
					<Button
						size="sm"
						isLoading={ duplicate.isPending }
						onPress={ () => duplicate.mutate() }
						aria-label={ sprintf(
							/* translators: %s: saved reply name. */
							__( 'Copy %s', 'cliedesk' ),
							item.name
						) }
					>
						{ __( 'Copy', 'cliedesk' ) }
					</Button>
				) }
				{ editable && (
					<Button
						size="sm"
						variant="ghost"
						isLoading={ setStatus.isPending }
						onPress={ () =>
							setStatus.mutate( archived ? 'active' : 'archived' )
						}
						aria-label={
							archived
								? sprintf(
										/* translators: %s: saved reply name. */
										__( 'Restore %s', 'cliedesk' ),
										item.name
									)
								: sprintf(
										/* translators: %s: saved reply name. */
										__( 'Archive %s', 'cliedesk' ),
										item.name
									)
						}
					>
						{ archived
							? __( 'Restore', 'cliedesk' )
							: __( 'Archive', 'cliedesk' ) }
					</Button>
				) }
			</div>
		</li>
	);
}

/**
 * Saved reply library.
 */
export default function SavedRepliesRoute() {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ filters, setFilters ] = useState< ListFilters >( {
		q: '',
		status: 'active',
		category: '',
		sort: 'manual',
	} );
	const [ importing, setImporting ] = useState( false );
	const set = ( patch: Partial< ListFilters > ) =>
		setFilters( ( f ) => ( { ...f, ...patch } ) );
	const list = useQuery( replyListQuery( filters ) );
	const folders = useQuery( categoriesQuery() );
	const items = list.data ?? [];
	// The manual order is shared: only shown while nothing else reorders the list.
	const ordering = filters.sort === 'manual' && ! filters.q.trim();

	// Swap the order numbers of two neighbours (each saved with If-Match).
	const move = useMutation( {
		mutationFn: async ( { a, b }: { a: SavedReply; b: SavedReply } ) => {
			const [ sa, sb ] =
				a.sort === b.sort ? [ b.sort + 1, a.sort ] : [ b.sort, a.sort ];
			const up = items.indexOf( b ) < items.indexOf( a );
			// Moving up past an equal number: the moved one takes the lower number.
			const [ na, nb ] =
				a.sort === b.sort && up ? [ sb, sa ] : [ sa, sb ];
			await api.patch( `saved-replies/${ a.id }`, {
				body: { sort: na },
				ifMatch: versionTag( a.version ),
			} );
			await api.patch( `saved-replies/${ b.id }`, {
				body: { sort: nb },
				ifMatch: versionTag( b.version ),
			} );
		},
		onSuccess: ( _r, { a } ) =>
			announceResult(
				sprintf(
					/* translators: %s: saved reply name. */
					__( '“%s” moved.', 'cliedesk' ),
					a.name
				)
			),
		onSettled: () =>
			void qc.invalidateQueries( { queryKey: replyKeys.all } ),
	} );

	const exportAs = useMutation( {
		mutationFn: async ( format: 'json' | 'csv' | 'usage' ) => {
			if ( format === 'usage' ) {
				// MAC-19: uses in 7 / 30 / 90 days, people, total and the unused flag per saved reply.
				const r = await api.get< { csv?: string } >(
					'saved-replies/stats',
					{ query: { format: 'csv' } }
				);
				return { data: { format: 'csv', data: r.data?.csv ?? '' } };
			}
			return api.get< { format: string; data: string } >(
				'saved-replies/export',
				{ query: { format } }
			);
		},
		onSuccess: ( r, format ) => {
			downloadFile(
				format === 'usage'
					? 'saved-reply-usage.csv'
					: `saved-replies.${ format }`,
				r.data.data,
				format === 'json' ? 'application/json' : 'text/csv'
			);
			announceResult( __( 'Export downloaded.', 'cliedesk' ) );
		},
	} );

	let body;
	if ( list.isPending ) {
		body = (
			<LoadingRegion
				label={ __( 'Loading saved replies…', 'cliedesk' ) }
			/>
		);
	} else if ( list.isError ) {
		body = (
			<QueryFailed
				title={ __( 'Could not load the saved replies', 'cliedesk' ) }
				error={ list.error }
				onRetry={ () => void list.refetch() }
			/>
		);
	} else if ( ! items.length ) {
		const filtered =
			filters.q.trim() || filters.category || filters.status !== 'active';
		body = (
			<EmptyState
				icon={ <MessageSquareText size={ 32 } strokeWidth={ 1.75 } /> }
				title={
					filtered
						? __( 'No saved replies match', 'cliedesk' )
						: __( 'Create your first saved reply', 'cliedesk' )
				}
				description={
					filtered
						? __( 'Try another search or filter.', 'cliedesk' )
						: __(
								'Save answers you send often, with actions that update the conversation. A good first one: “Where is my order?” with the tracking link.',
								'cliedesk'
							)
				}
				actions={
					// ADM-04: every empty state offers a way to start.
					filtered ? (
						<Button
							onPress={ () =>
								set( { q: '', category: '', status: 'active' } )
							}
						>
							{ __( 'Clear filters', 'cliedesk' ) }
						</Button>
					) : (
						<>
							{ canCreateReplies() && (
								<Button
									variant="primary"
									onPress={ () =>
										void navigate( {
											to: '/automation/replies/$replyId',
											params: { replyId: 'new' },
										} as never )
									}
								>
									{ __(
										'Create your first saved reply',
										'cliedesk'
									) }
								</Button>
							) }
							{ canTransfer() && (
								<Button onPress={ () => setImporting( true ) }>
									{ __( 'Import saved replies', 'cliedesk' ) }
								</Button>
							) }
						</>
					)
				}
			/>
		);
	} else {
		body = (
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ items.map( ( item, i ) => (
					<ReplyRow
						key={ item.id }
						item={ item }
						prev={ items[ i - 1 ] }
						next={ items[ i + 1 ] }
						ordering={ ordering }
						moving={ move.isPending }
						onMove={ ( a, b ) => move.mutate( { a, b } ) }
					/>
				) ) }
			</ul>
		);
	}

	const failure = move.error ?? exportAs.error;
	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={ __( 'Saved replies', 'cliedesk' ) }
				description={ __(
					'Answers you send often, with actions that update the conversation when they are sent.',
					'cliedesk'
				) }
				actions={
					<>
						{ canTransfer() && (
							<>
								<Menu
									aria-label={ __(
										'Export format',
										'cliedesk'
									) }
									onAction={ ( k ) =>
										exportAs.mutate(
											k as 'json' | 'csv' | 'usage'
										)
									}
									trigger={
										<Button
											isLoading={ exportAs.isPending }
										>
											{ __( 'Export', 'cliedesk' ) }
										</Button>
									}
								>
									<MenuItem id="json">
										{ __( 'Export as JSON', 'cliedesk' ) }
									</MenuItem>
									<MenuItem id="csv">
										{ __( 'Export as CSV', 'cliedesk' ) }
									</MenuItem>
									<MenuItem id="usage">
										{ __(
											'Usage statistics (CSV)',
											'cliedesk'
										) }
									</MenuItem>
								</Menu>
								<Button onPress={ () => setImporting( true ) }>
									{ __( 'Import', 'cliedesk' ) }
								</Button>
							</>
						) }
						{ canCreateReplies() && (
							<Button
								variant="primary"
								iconStart={
									<Plus aria-hidden="true" size={ 16 } />
								}
								onPress={ () =>
									void navigate( {
										to: '/automation/replies/$replyId',
										params: { replyId: 'new' },
									} as never )
								}
							>
								{ __( 'New saved reply', 'cliedesk' ) }
							</Button>
						) }
					</>
				}
			/>
			<form
				role="search"
				aria-label={ __( 'Filter saved replies', 'cliedesk' ) }
				onSubmit={ ( e ) => e.preventDefault() }
				className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
			>
				<TextField
					label={ __( 'Search', 'cliedesk' ) }
					inputMode="search"
					value={ filters.q }
					onChange={ ( q ) => set( { q } ) }
				/>
				<Select
					label={ __( 'Status', 'cliedesk' ) }
					value={ filters.status }
					onChange={ ( v ) =>
						set( { status: v as ListFilters[ 'status' ] } )
					}
					options={ [ ...STATUSES, 'all' as const ].map( ( s ) => ( {
						id: s,
						label: statusLabel( s ),
					} ) ) }
				/>
				<Select
					label={ __( 'Folder', 'cliedesk' ) }
					value={ filters.category || 'all' }
					onChange={ ( v ) =>
						set( { category: v === 'all' ? '' : v } )
					}
					options={ [
						{ id: 'all', label: __( 'All folders', 'cliedesk' ) },
						...( folders.data ?? [] ).map( ( c ) => ( {
							id: c,
							label: folderLabel( c ),
						} ) ),
					] }
				/>
				<Select
					label={ __( 'Sort by', 'cliedesk' ) }
					value={ filters.sort }
					onChange={ ( v ) => set( { sort: v as ReplySort } ) }
					options={ SORTS.map( ( s ) => ( {
						id: s,
						label: sortLabel( s ),
					} ) ) }
				/>
			</form>
			{ failure && (
				<Banner
					tone="danger"
					role="alert"
					title={
						isApiError( failure ) && failure.status === 412
							? __(
									'Someone else changed a saved reply. The list was reloaded; try again.',
									'cliedesk'
								)
							: describeError( failure )
					}
				/>
			) }
			{ body }
			{ importing && (
				<ImportDialog onClose={ () => setImporting( false ) } />
			) }
		</div>
	);
}
