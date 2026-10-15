/**
 * Sidebar folders (INB-11) in the inbox views sidebar: collapsible groups of system views, custom views and queues.
 * Views and queues that are not in a folder stay where they are. Each folder's menu offers Edit, Move up / Move down
 * (my own order, also for shared folders) and Delete; the folder editor is a lazy chunk. With a mouse, folders can
 * also be dragged onto each other to reorder them, and views and queues dragged onto a folder to file them there
 * (the menu and the folder editor do the same from the keyboard).
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	ConfirmDestructive,
	IconButton,
	Menu,
	MenuItem,
	cx,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	ChevronDown,
	ChevronRight,
	FolderPlus,
	MoreHorizontal,
} from 'lucide-react';
import { Suspense, lazy, useState, type DragEvent } from 'react';
import { queuePickerQuery, type Sidebar } from '../../inbox/api';
import { ActionError, Pill } from '../../inbox/components';
import {
	DRAG_FOLDER,
	DRAG_REF,
	dropRef,
	folderKeys,
	foldersQuery,
	hasQueueRefs,
	resolveRef,
	saveArrangement,
	type Folder,
	type ResolvedItem,
} from '../../inbox/folders';
import { announceResult } from '../../workspace/forms';

const FolderDialog = lazy(
	() => import( /* webpackChunkName: "inbox-folders" */ './FolderDialog' )
);

export const SEARCH_VIEW = 'search';

/**
 * Folders with their resolved items, and the references they hold (to leave them out of the plain lists).
 *
 * @param sidebar Sidebar views.
 */
export function useFolders( sidebar: Sidebar ) {
	const folders = useQuery( {
		...foldersQuery(),
		enabled: can( 'cliedesk_view_conversations' ),
	} );
	const list = folders.data ?? [];
	const queues = useQuery( {
		...queuePickerQuery(),
		enabled: hasQueueRefs( list ),
	} );
	const resolved = list.map( ( f ) => ( {
		folder: f,
		items: f.items
			.map( ( ref ) => resolveRef( ref, sidebar, queues.data ?? null ) )
			.filter( ( x ): x is ResolvedItem => x !== null && ! x.hidden ),
	} ) );
	const inFolder = new Set(
		resolved.flatMap( ( r ) => r.items.map( ( i ) => i.ref ) )
	);
	return { query: folders, list, resolved, inFolder };
}

/**
 * Start dragging a view or queue reference.
 *
 * @param e    Drag event.
 * @param ref  Reference.
 * @param from Folder it is in, or null.
 */
export function startRefDrag(
	e: DragEvent,
	ref: string,
	from: number | null
): void {
	e.dataTransfer.setData( DRAG_REF, JSON.stringify( { ref, from } ) );
	e.dataTransfer.effectAllowed = 'move';
}

function ItemLink( {
	item,
	active,
	from,
}: {
	item: ResolvedItem;
	active: boolean;
	from: number;
} ) {
	const drag = {
		draggable: true,
		onDragStart: ( e: DragEvent ) => startRefDrag( e, item.ref, from ),
	};
	const className = cx(
		'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg outline-none',
		'hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus',
		active && 'bg-accent-subtle font-semibold text-accent-fg'
	);
	const body = (
		<>
			{ item.icon ? (
				<span aria-hidden="true" className="w-5 shrink-0 text-center">
					{ item.icon }
				</span>
			) : null }
			<span className="min-w-0 flex-1 truncate">{ item.name }</span>
			{ item.kind === 'queue' && (
				<span className="text-xs text-fg-muted">
					{ __( 'queue', 'cliedesk' ) }
				</span>
			) }
			{ typeof item.count === 'number' && item.count > 0 && (
				<span className="cd-tabular text-xs text-fg-muted">
					<span className="sr-only">
						{ sprintf(
							/* translators: %d: number of open conversations. */
							_n( '%d open', '%d open', item.count, 'cliedesk' ),
							item.count
						) }
					</span>
					<span aria-hidden="true">{ item.count }</span>
				</span>
			) }
		</>
	);
	if ( item.kind === 'queue' ) {
		return (
			<Link
				to="/inbox/$view"
				params={ { view: SEARCH_VIEW } }
				search={ { q: `queue:${ item.key }` } as never }
				aria-current={ active ? 'page' : undefined }
				className={ className }
				{ ...drag }
			>
				{ body }
			</Link>
		);
	}
	return (
		<Link
			to="/inbox/$view"
			params={ { view: item.key } }
			aria-current={ active ? 'page' : undefined }
			className={ className }
			{ ...drag }
		>
			{ body }
		</Link>
	);
}

/**
 * Folders section of the views sidebar.
 *
 * @param props         Props.
 * @param props.sidebar Sidebar views.
 * @param props.folders useFolders() result.
 * @param props.current Current view key.
 * @param props.query   Current search (queue links).
 */
export function FolderSection( {
	sidebar,
	folders,
	current,
	query,
}: {
	sidebar: Sidebar;
	folders: ReturnType< typeof useFolders >;
	current: string;
	query: string;
} ) {
	const qc = useQueryClient();
	const [ editing, setEditing ] = useState< Folder | 'new' | null >( null );
	const [ deleting, setDeleting ] = useState< Folder | null >( null );
	const arrange = useMutation( {
		mutationFn: saveArrangement,
		onMutate: ( next ) => {
			qc.setQueryData( folderKeys.all, next );
		},
		onSuccess: ( list ) => {
			if ( list.length ) {
				qc.setQueryData( folderKeys.all, list );
			}
		},
		onError: () =>
			void qc.invalidateQueries( { queryKey: folderKeys.all } ),
	} );
	const remove = useMutation( {
		mutationFn: ( f: Folder ) => api.del( `folders/${ f.id }` ),
		onSuccess: ( _r, f ) => {
			setDeleting( null );
			qc.setQueryData< Folder[] >( folderKeys.all, ( old ) =>
				( old ?? [] ).filter( ( x ) => x.id !== f.id )
			);
			void qc.invalidateQueries( { queryKey: folderKeys.all } );
			announceResult(
				sprintf(
					/* translators: %s: folder name. */
					__( 'Folder “%s” deleted.', 'cliedesk' ),
					f.name
				)
			);
		},
	} );
	const list = folders.list;
	const move = ( i: number, to: number ) => {
		if ( to < 0 || to >= list.length ) {
			return;
		}
		const next = [ ...list ];
		const [ f ] = next.splice( i, 1 );
		next.splice( to, 0, f as Folder );
		arrange.mutate( next );
		announceResult(
			sprintf(
				/* translators: 1: folder name, 2: position, 3: number of folders. */
				__( '%1$s moved to position %2$d of %3$d.', 'cliedesk' ),
				( f as Folder ).name,
				to + 1,
				list.length
			)
		);
		// Keep the keyboard on the moved folder.
		window.setTimeout(
			() =>
				document
					.getElementById(
						`cd-folder-${ ( f as Folder ).id }-toggle`
					)
					?.focus(),
			0
		);
	};
	// Drag and drop (mouse): folders reorder; views and queues file into editable folders.
	const [ over, setOver ] = useState< number | null >( null );
	const fill = useMutation( {
		mutationFn: ( changes: Array< { id: number; items: string[] } > ) =>
			Promise.all(
				changes.map( ( c ) =>
					api.patch( `folders/${ c.id }`, {
						body: { items: c.items },
					} )
				)
			),
		onMutate: ( changes ) => {
			qc.setQueryData< Folder[] >( folderKeys.all, ( old ) =>
				( old ?? [] ).map( ( f ) => {
					const c = changes.find( ( x ) => x.id === f.id );
					return c ? { ...f, items: c.items } : f;
				} )
			);
		},
		onSettled: () =>
			void qc.invalidateQueries( { queryKey: folderKeys.all } ),
	} );
	const dropOn = ( e: DragEvent, i: number, f: Folder ) => {
		e.preventDefault();
		setOver( null );
		const folderId = e.dataTransfer.getData( DRAG_FOLDER );
		if ( folderId ) {
			const from = list.findIndex( ( x ) => String( x.id ) === folderId );
			if ( from >= 0 && from !== i ) {
				move( from, i );
			}
			return;
		}
		let data: { ref?: unknown; from?: unknown } = {};
		try {
			data = JSON.parse( e.dataTransfer.getData( DRAG_REF ) || '{}' );
		} catch {
			return;
		}
		const changes = dropRef(
			list,
			String( data.ref ?? '' ),
			typeof data.from === 'number' ? data.from : null,
			f.id
		);
		if ( changes.length ) {
			fill.mutate( changes );
			const item = folders.resolved
				.flatMap( ( r ) => r.items )
				.find( ( x ) => x.ref === data.ref );
			announceResult(
				sprintf(
					/* translators: 1: view or queue name, 2: folder name. */
					__( '%1$s added to folder %2$s.', 'cliedesk' ),
					item?.name ?? String( data.ref ),
					f.name
				)
			);
		}
	};
	const dragOver = ( e: DragEvent, f: Folder ) => {
		const types = Array.from( e.dataTransfer.types );
		if (
			types.includes( DRAG_FOLDER ) ||
			( types.includes( DRAG_REF ) && f.canEdit )
		) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			setOver( f.id );
		}
	};
	const toggle = ( f: Folder ) =>
		arrange.mutate(
			list.map( ( x ) =>
				x.id === f.id ? { ...x, collapsed: ! x.collapsed } : x
			)
		);
	const isActive = ( item: ResolvedItem ) =>
		item.kind === 'queue'
			? current === SEARCH_VIEW && query === `queue:${ item.key }`
			: current === item.key;
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2 px-2">
				<h2 className="text-xs font-semibold text-fg-subtle uppercase">
					{ __( 'Folders', 'cliedesk' ) }
				</h2>
				<IconButton
					size="sm"
					label={ __( 'New folder', 'cliedesk' ) }
					icon={ <FolderPlus size={ 14 } /> }
					onPress={ () => setEditing( 'new' ) }
				/>
			</div>
			<ActionError
				error={ arrange.error ?? remove.error ?? fill.error }
				onDismiss={ () => {
					arrange.reset();
					remove.reset();
					fill.reset();
				} }
			/>
			{ folders.resolved.length > 0 && (
				<ul className="flex flex-col gap-0.5">
					{ folders.resolved.map( ( { folder: f, items }, i ) => {
						const region = `cd-folder-${ f.id }-items`;
						return (
							<li key={ f.id } className="flex flex-col">
								<div
									draggable
									onDragStart={ ( e ) => {
										e.dataTransfer.setData(
											DRAG_FOLDER,
											String( f.id )
										);
										e.dataTransfer.effectAllowed = 'move';
									} }
									onDragOver={ ( e ) => dragOver( e, f ) }
									onDragLeave={ () => setOver( null ) }
									onDrop={ ( e ) => dropOn( e, i, f ) }
									data-drop-target={
										over === f.id ? 'true' : undefined
									}
									className={ cx(
										'flex items-center gap-1 rounded-md',
										over === f.id &&
											'outline-2 outline-dashed outline-accent'
									) }
								>
									<Button
										id={ `cd-folder-${ f.id }-toggle` }
										variant="ghost"
										size="sm"
										className="min-w-0 flex-1 justify-start"
										aria-expanded={ ! f.collapsed }
										aria-controls={ region }
										iconStart={
											f.collapsed ? (
												<ChevronRight
													aria-hidden="true"
													size={ 14 }
													className="rtl:rotate-180"
												/>
											) : (
												<ChevronDown
													aria-hidden="true"
													size={ 14 }
												/>
											)
										}
										onPress={ () => toggle( f ) }
									>
										<span className="truncate font-medium">
											{ f.name }
										</span>
										{ f.shared && (
											<Pill>
												{ __( 'Shared', 'cliedesk' ) }
											</Pill>
										) }
									</Button>
									<Menu
										aria-label={ sprintf(
											/* translators: %s: folder name. */
											__( 'Actions for %s', 'cliedesk' ),
											f.name
										) }
										onAction={ ( k ) => {
											if ( k === 'edit' ) {
												setEditing( f );
											} else if ( k === 'up' ) {
												move( i, i - 1 );
											} else if ( k === 'down' ) {
												move( i, i + 1 );
											} else if ( k === 'delete' ) {
												setDeleting( f );
											}
										} }
										trigger={
											<Button
												variant="ghost"
												size="sm"
												aria-label={ sprintf(
													/* translators: %s: folder name. */
													__(
														'Folder actions for %s',
														'cliedesk'
													),
													f.name
												) }
											>
												<MoreHorizontal
													aria-hidden="true"
													size={ 14 }
												/>
											</Button>
										}
									>
										{ f.canEdit ? (
											<MenuItem id="edit">
												{ __(
													'Edit folder…',
													'cliedesk'
												) }
											</MenuItem>
										) : null }
										<MenuItem
											id="up"
											isDisabled={ i === 0 }
										>
											{ __( 'Move up', 'cliedesk' ) }
										</MenuItem>
										<MenuItem
											id="down"
											isDisabled={ i === list.length - 1 }
										>
											{ __( 'Move down', 'cliedesk' ) }
										</MenuItem>
										{ f.canEdit ? (
											<MenuItem id="delete">
												{ __(
													'Delete folder…',
													'cliedesk'
												) }
											</MenuItem>
										) : null }
									</Menu>
								</div>
								<ul
									id={ region }
									hidden={ f.collapsed }
									aria-label={ f.name }
									className="flex flex-col gap-0.5 ps-4"
								>
									{ items.length ? (
										items.map( ( item ) => (
											<li
												key={ item.ref }
												className="flex"
											>
												<ItemLink
													item={ item }
													active={ isActive( item ) }
													from={ f.id }
												/>
											</li>
										) )
									) : (
										<li className="px-2 py-1 text-sm text-fg-muted">
											{ __( 'Empty folder', 'cliedesk' ) }
										</li>
									) }
								</ul>
							</li>
						);
					} ) }
				</ul>
			) }
			<Suspense fallback={ null }>
				{ editing && (
					<FolderDialog
						folder={ editing === 'new' ? null : editing }
						sidebar={ sidebar }
						onClose={ () => setEditing( null ) }
					/>
				) }
			</Suspense>
			<ConfirmDestructive
				isOpen={ !! deleting }
				onOpenChange={ ( open ) => ! open && setDeleting( null ) }
				title={ sprintf(
					/* translators: %s: folder name. */
					__( 'Delete the folder “%s”?', 'cliedesk' ),
					deleting?.name ?? ''
				) }
				description={
					deleting?.shared
						? __(
								'It is removed for everyone it is shared with. Its views and queues stay in the sidebar.',
								'cliedesk'
							)
						: __(
								'Its views and queues stay in the sidebar.',
								'cliedesk'
							)
				}
				confirmLabel={ __( 'Delete folder', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( deleting ) {
						remove.mutate( deleting );
					}
				} }
			/>
		</div>
	);
}
