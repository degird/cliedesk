/**
 * `/inbox` and `/inbox/$view` (INB-01, INB-15, INB-18, INB-22): the views sidebar (system views with counts, hidden
 * views, custom views, folders of views and queues: INB-11) and the conversation list of one view (keyset pages, sort, slow-view warning). Keyboard:
 * j / k move the selection, Enter opens. The change feed refreshes counts and rows (entity type 1 → ['inbox']).
 */
import {
	api,
	can,
	getBoot,
	isApiError,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	IconButton,
	LoadingRegion,
	Menu,
	MenuItem,
	Select,
	Slot,
	TextField,
	cx,
	toast,
} from '@cliedesk/ui';
import {
	Link,
	useNavigate,
	useParams,
	useRouterState,
	useSearch,
} from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	AlarmClock,
	ArrowUpDown,
	AtSign,
	CheckSquare,
	CircleCheck,
	Flame,
	Hourglass,
	Inbox,
	Layers,
	PenLine,
	Reply,
	ShieldAlert,
	Timer,
	Trash2,
	TriangleAlert,
	UserRound,
	type LucideIcon,
	ChevronDown,
	ChevronRight,
	Eye,
	EyeOff,
	FileText,
	LayoutList,
	ListChecks,
	MoreHorizontal,
	PanelLeftClose,
	PanelLeftOpen,
	Pencil,
	Play,
	Plus,
	Search,
} from 'lucide-react';
import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FormEvent,
	type Key,
	type MutableRefObject,
} from 'react';
import { PageHeader } from '../../components/PageHeader';
import { savePrefs } from '../../prefs';
import { JobsPanel } from '../../crm/jobs';
import type { ConversationSelection } from '../../inbox/bulk';
import { SPAM_VIEW, canManageSpam, spamReasonShort } from '../../inbox/spam';
import {
	SORTS,
	fetchInboxPage,
	moreSorts,
	vocabularyQuery,
	inboxProducts,
	inboxTotalQuery,
	inboxKeys,
	sidebarQuery,
	statusesQuery,
	type CustomView,
	type InboxItem,
	type Sidebar,
	type ListSort,
	type SortKey,
} from '../../inbox/api';
import {
	ActionError,
	Pill,
	PriorityBadge,
	QueryFailed,
	StatusBadge,
	useAgents,
} from '../../inbox/components';
import { conditionFieldLabel } from '../../inbox/conditions';
import { inboxKit } from '../../inbox/kit';
import { fullTime, relativeTime, sortLabel } from '../../inbox/labels';
import {
	WIDE_QUERY,
	useInboxLayout,
	useMediaQuery,
	type ListMode,
} from '../../inbox/layout';
import {
	PresenceDots,
	useListPresence,
	type PresenceOther,
} from '../../inbox/presence';
import { useShortcut } from '../../shortcuts';
import { versionTag } from '../../workspace/api';
import { announceResult } from '../../workspace/forms';
import { useFreshRows } from '../../inbox/fresh';
import { completeWord, helpFor } from '../../inbox/searchHelp';
import { SentimentMark } from '../../inbox/sentiment';
import { ConversationBulkBar } from './BulkBar';
import { DEFAULT_COLUMNS, InboxTable, columnLabel } from './InboxTable';
import { ReviewMode } from './ReviewMode';
import {
	TableColumnsDialog,
	applyColumnPrefs,
	useTableColumns,
} from '../../inbox/TableColumns';
import { PaneResizer } from './PaneResizer';
import { setCurrentList } from '../../inbox/tabs';
import { SearchResults } from './SearchResults';
import { FolderSection, startRefDrag, useFolders } from './Folders';
import { LiveNow } from './LiveNow';
import { ViewTemplatesMenu } from './ViewTemplatesMenu';
import { PlayButton, usePlayStart } from '../../inbox/PlayBar';
import { isPlayOnly } from '../../inbox/play';

const ViewEditor = lazy(
	() => import( /* webpackChunkName: "inbox-view-editor" */ './ViewEditor' )
);
const ConversationPane = lazy( () =>
	import(
		/* webpackChunkName: "conversation" */ '../conversation/ConversationRoute'
	).then( ( m ) => ( { default: m.ConversationView } ) )
);
const NewConversationDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "inbox-new-conversation" */ './NewConversationDialog'
		)
);

export const DEFAULT_VIEW = 'my_open';

/**
 * Label of the layout menu button.
 *
 * @param mode Layout.
 */
export function layoutLabel( mode: ListMode ): string {
	switch ( mode ) {
		case 'table':
			return __( 'Layout: Table', 'cliedesk' );
		case 'list':
			return __( 'Layout: List', 'cliedesk' );
		default:
			return __( 'Layout: Split', 'cliedesk' );
	}
}
export const SEARCH_VIEW = 'search';

function SearchBox( { initial }: { initial: string } ) {
	const navigate = useNavigate();
	const [ value, setValue ] = useState( initial );
	useEffect( () => setValue( initial ), [ initial ] );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( value.trim() ) {
			void navigate( {
				to: '/inbox/$view',
				params: { view: SEARCH_VIEW },
				search: { q: value.trim() },
			} as never );
		}
	};
	// INB-30: help for the word being typed.
	const help = helpFor( value );
	return (
		<form
			role="search"
			id="cd-inbox-search"
			noValidate
			onSubmit={ submit }
			className="flex flex-col gap-1"
		>
			<div className="flex items-center gap-2">
				<TextField
					id="cd-inbox-search-field"
					className="min-w-0 flex-1"
					label={ __( 'Search conversations', 'cliedesk' ) }
					labelHidden
					placeholder={ __(
						'Search, or narrow with status:, tag: or created>7d',
						'cliedesk'
					) }
					inputMode="search"
					value={ value }
					onChange={ setValue }
				/>
				<IconButton
					type="submit"
					variant="secondary"
					label={ __( 'Search', 'cliedesk' ) }
					shortcut="/"
					icon={ <Search size={ 16 } /> }
				/>
			</div>
			<div
				aria-live="polite"
				className="flex flex-wrap items-center gap-2 text-sm text-fg-muted empty:hidden"
			>
				{ help.using && (
					<p>
						<code className="rounded-sm bg-sunken px-1 font-mono">
							{ help.using.example }
						</code>{ ' ' }
						{ help.using.description }
					</p>
				) }
				{ help.suggestions.length > 0 && (
					<>
						<span>{ __( 'Operators:', 'cliedesk' ) }</span>
						{ help.suggestions.map( ( o ) => (
							<Button
								key={ o.key }
								size="sm"
								variant="ghost"
								aria-label={ sprintf(
									/* translators: 1: operator, 2: what it does. */
									__( 'Use %1$s (%2$s)', 'cliedesk' ),
									o.key,
									o.description
								) }
								onPress={ () => {
									setValue( completeWord( value, o.key ) );
									document
										.getElementById(
											'cd-inbox-search-field'
										)
										?.focus();
								} }
							>
								<code className="font-mono">{ o.key }</code>
							</Button>
						) ) }
					</>
				) }
			</div>
		</form>
	);
}

function viewPath( key: string ) {
	return { to: '/inbox/$view' as const, params: { view: key } };
}

function ViewLink( {
	viewKey,
	dragRef,
	name,
	icon,
	count,
	active,
	Icon,
}: {
	viewKey: string;
	/** Folder reference for drag and drop (INB-11). */
	dragRef?: string;
	name: string;
	icon?: string | null;
	/** Null or missing: counts hidden (no badge). */
	count?: number | null;
	active: boolean;
	/** Icon of a system view. */
	Icon?: LucideIcon;
} ) {
	return (
		<Link
			{ ...viewPath( viewKey ) }
			aria-current={ active ? 'page' : undefined }
			draggable={ !! dragRef }
			onDragStart={
				dragRef ? ( e ) => startRefDrag( e, dragRef, null ) : undefined
			}
			className={ cx(
				'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg outline-none',
				'hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus',
				active && 'bg-accent-subtle font-semibold text-accent-fg'
			) }
		>
			{ Icon && (
				<Icon
					aria-hidden="true"
					size={ 16 }
					className={ active ? 'shrink-0' : 'shrink-0 text-fg-muted' }
				/>
			) }
			{ ! Icon && icon ? (
				<span aria-hidden="true" className="w-5 shrink-0 text-center">
					{ icon }
				</span>
			) : null }
			<span className="min-w-0 flex-1 truncate">{ name }</span>
			{ typeof count === 'number' && count > 0 && (
				<span className="cd-tabular text-xs text-fg-muted">
					<span className="sr-only">
						{ sprintf(
							/* translators: %d: number of open conversations. */
							_n( '%d open', '%d open', count, 'cliedesk' ),
							count
						) }
					</span>
					<span aria-hidden="true">{ count }</span>
				</span>
			) }
		</Link>
	);
}

/** System views by group (keys from Views::SYSTEM_KEYS); a key not listed (also Pro's) goes to Team. */
const VIEW_GROUPS: Record< string, 'mine' | 'team' | 'closed' > = {
	my_open: 'mine',
	mentions: 'mine',
	created_by_me: 'mine',
	resolved: 'closed',
	spam: 'closed',
	trash: 'closed',
};

function viewGroupTitle( group: 'mine' | 'team' | 'closed' ): string {
	switch ( group ) {
		case 'mine':
			return __( 'Mine', 'cliedesk' );
		case 'closed':
			return __( 'Closed', 'cliedesk' );
		default:
			return __( 'Team', 'cliedesk' );
	}
}

/** Icons of the system views (a key not listed has none). */
const VIEW_ICONS: Record< string, LucideIcon > = {
	my_open: UserRound,
	mentions: AtSign,
	created_by_me: PenLine,
	unassigned: Inbox,
	needs_reply: Reply,
	needs_attention: Flame,
	waiting: Hourglass,
	later: AlarmClock,
	all: Layers,
	at_risk: Timer,
	breached: TriangleAlert,
	resolved: CircleCheck,
	spam: ShieldAlert,
	trash: Trash2,
};

/** Hover-only row action that stays reachable by keyboard and on touch screens. */
const ROW_ACTION =
	'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100';

function ViewsSidebar( {
	current,
	query,
	sidebar,
	onEdit,
	onNew,
}: {
	current: string;
	query: string;
	sidebar: Sidebar;
	onEdit: ( v: CustomView ) => void;
	onNew: () => void;
} ) {
	const qc = useQueryClient();
	const folders = useFolders( sidebar );
	const [ showHidden, setShowHidden ] = useState( false );
	const hide = useMutation( {
		mutationFn: ( { key, hidden }: { key: string; hidden: boolean } ) =>
			api.post< Sidebar >( `views/system/${ key }/hide`, {
				body: { hidden },
			} ),
		onSuccess: ( _r, v ) => {
			void qc.invalidateQueries( { queryKey: inboxKeys.views } );
			announceResult(
				v.hidden
					? __( 'View hidden.', 'cliedesk' )
					: __( 'View shown.', 'cliedesk' )
			);
		},
	} );
	// Views in a folder (INB-11) show there instead of in their usual list.
	const visible = sidebar.system.filter(
		( s ) => ! s.hidden && ! folders.inFolder.has( `system:${ s.key }` )
	);
	const hidden = sidebar.system.filter( ( s ) => s.hidden );
	const custom = [ ...sidebar.custom ]
		.filter( ( v ) => ! folders.inFolder.has( `view:${ v.id }` ) )
		.sort( ( a, b ) => Number( b.pinned ) - Number( a.pinned ) );
	return (
		<nav
			aria-label={ __( 'Views', 'cliedesk' ) }
			className="flex flex-col gap-4 text-sm"
		>
			<ActionError
				error={ hide.error }
				onDismiss={ () => hide.reset() }
			/>
			<ProductSwitcher />
			<Link
				to="/drafts"
				className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
			>
				<FileText
					aria-hidden="true"
					size={ 16 }
					className="text-fg-muted"
				/>
				{ __( 'My drafts', 'cliedesk' ) }
			</Link>
			{ ( [ 'mine', 'team', 'closed' ] as const ).map( ( g ) => {
				const views = visible.filter(
					( v ) => ( VIEW_GROUPS[ v.key ] ?? 'team' ) === g
				);
				if ( ! views.length ) {
					return null;
				}
				return (
					<div key={ g } className="flex flex-col gap-0.5">
						<h2
							id={ `cd-views-${ g }` }
							className="px-2 text-xs font-semibold text-fg-subtle uppercase"
						>
							{ viewGroupTitle( g ) }
						</h2>
						<ul
							aria-labelledby={ `cd-views-${ g }` }
							className="flex flex-col gap-0.5"
						>
							{ views.map( ( v ) => (
								<li
									key={ v.key }
									className="group flex items-center gap-1"
								>
									<ViewLink
										viewKey={ v.key }
										dragRef={ `system:${ v.key }` }
										name={ v.name }
										count={ v.count }
										active={ current === v.key }
										Icon={ VIEW_ICONS[ v.key ] }
									/>
									<IconButton
										size="sm"
										className={ ROW_ACTION }
										label={ sprintf(
											/* translators: %s: view name. */
											__( 'Hide %s', 'cliedesk' ),
											v.name
										) }
										icon={ <EyeOff size={ 14 } /> }
										onPress={ () =>
											hide.mutate( {
												key: v.key,
												hidden: true,
											} )
										}
									/>
								</li>
							) ) }
						</ul>
					</div>
				);
			} ) }
			{ hidden.length > 0 && (
				<div className="flex flex-col gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="justify-start"
						aria-expanded={ showHidden }
						aria-controls="cd-hidden-views"
						iconStart={
							showHidden ? (
								<ChevronDown aria-hidden="true" size={ 14 } />
							) : (
								<ChevronRight
									aria-hidden="true"
									size={ 14 }
									className="rtl:rotate-180"
								/>
							)
						}
						onPress={ () => setShowHidden( ( x ) => ! x ) }
					>
						{ sprintf(
							/* translators: %d: number of hidden views. */
							__( 'Hidden views (%d)', 'cliedesk' ),
							hidden.length
						) }
					</Button>
					{ showHidden && (
						<ul
							id="cd-hidden-views"
							className="flex flex-col gap-0.5"
						>
							{ hidden.map( ( v ) => (
								<li
									key={ v.key }
									className="flex items-center gap-1"
								>
									<ViewLink
										viewKey={ v.key }
										dragRef={ `system:${ v.key }` }
										name={ v.name }
										count={ v.count }
										active={ current === v.key }
										Icon={ VIEW_ICONS[ v.key ] }
									/>
									<IconButton
										size="sm"
										label={ sprintf(
											/* translators: %s: view name. */
											__( 'Show %s', 'cliedesk' ),
											v.name
										) }
										icon={ <Eye size={ 14 } /> }
										onPress={ () =>
											hide.mutate( {
												key: v.key,
												hidden: false,
											} )
										}
									/>
								</li>
							) ) }
						</ul>
					) }
				</div>
			) }
			<FolderSection
				sidebar={ sidebar }
				folders={ folders }
				current={ current }
				query={ query }
			/>
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between gap-2 px-2">
					<h2 className="text-xs font-semibold text-fg-subtle uppercase">
						{ __( 'My views', 'cliedesk' ) }
					</h2>
					<IconButton
						size="sm"
						label={ __( 'New view', 'cliedesk' ) }
						icon={ <Plus size={ 14 } /> }
						onPress={ onNew }
					/>
					<ViewTemplatesMenu />
				</div>
				{ custom.length ? (
					<ul className="flex flex-col gap-0.5">
						{ custom.map( ( v ) => (
							<li
								key={ v.id }
								className="group flex items-center gap-1"
							>
								<ViewLink
									viewKey={ String( v.id ) }
									dragRef={ `view:${ v.id }` }
									name={ v.name }
									icon={ v.icon }
									count={ v.count }
									active={ current === String( v.id ) }
								/>
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: view name. */
										__( 'Edit %s', 'cliedesk' ),
										v.name
									) }
									className={ ROW_ACTION }
									icon={ <Pencil size={ 14 } /> }
									onPress={ () => onEdit( v ) }
								/>
							</li>
						) ) }
					</ul>
				) : (
					<p className="px-2 text-fg-muted">
						{ __( 'No views yet.', 'cliedesk' ) }
					</p>
				) }
				<Slot name="inbox.views.ai" className="px-2" />
			</div>
			<LiveNow />
		</nav>
	);
}

/**
 * Why a Spam view row is there (SEC-15), for people who manage spam.
 *
 * @param props      Props.
 * @param props.item Row.
 */
export function SpamChip( { item }: { item: InboxItem } ) {
	if ( ! item.spam || ! canManageSpam() ) {
		return null;
	}
	return (
		<Pill tone="warning">
			<span className="sr-only">
				{ __( 'Spam reason:', 'cliedesk' ) }{ ' ' }
			</span>
			{ spamReasonShort( item.spam ) }
		</Pill>
	);
}

/**
 * A row in selection mode (INB-72): a checkbox and a button that opens the conversation.
 *
 * @param props            Props.
 * @param props.item       Row.
 * @param props.active     Keyboard position.
 * @param props.checked    Selected for bulk actions.
 * @param props.open       Shown in the conversation pane.
 * @param props.assignee   Assignee name.
 * @param props.onToggle   Select or unselect.
 * @param props.onOpen     Open.
 * @param props.onFocusRow The row got focus.
 */
/**
 * "New message" label on a row that just got one (INB-22).
 *
 * @param props       Props.
 * @param props.fresh Shown.
 */
function NewMessagePill( { fresh }: { fresh: boolean } ) {
	return fresh ? (
		<Pill tone="accent">{ __( 'New message', 'cliedesk' ) }</Pill>
	) : null;
}

function SelectableRow( {
	item,
	fresh = false,
	active,
	checked,
	open,
	assignee,
	onToggle,
	onOpen,
	onFocusRow,
}: {
	item: InboxItem;
	/** New message since the last poll (INB-22). */
	fresh?: boolean;
	active: boolean;
	checked: boolean;
	open: boolean;
	assignee: string | null;
	onToggle: ( on: boolean ) => void;
	onOpen: () => void;
	onFocusRow: () => void;
} ) {
	return (
		<li
			id={ `cd-row-${ item.id }` }
			onFocus={ onFocusRow }
			className={ cx(
				'flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0',
				( active || checked ) && 'bg-selected',
				fresh && ! ( active || checked ) && 'bg-accent-subtle',
				open &&
					'shadow-[inset_3px_0_0_var(--color-accent)] rtl:shadow-[inset_-3px_0_0_var(--color-accent)]'
			) }
		>
			<Checkbox
				className="mt-0.5"
				isSelected={ checked }
				onChange={ onToggle }
			>
				<span className="sr-only">
					{ sprintf(
						/* translators: 1: conversation number, 2: subject. */
						__( 'Select #%1$d %2$s', 'cliedesk' ),
						item.number,
						item.subject
					) }
				</span>
			</Checkbox>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<button
					type="button"
					data-row-link
					tabIndex={ active ? 0 : -1 }
					aria-current={ open ? 'true' : undefined }
					onClick={ onOpen }
					className={ cx(
						'flex min-w-0 items-center gap-2 rounded-sm text-start outline-none',
						'hover:underline focus-visible:outline-2 focus-visible:outline-focus'
					) }
				>
					<span className="cd-tabular shrink-0 text-sm text-fg-muted">
						{ `#${ item.number }` }
					</span>
					<span
						className={ cx(
							'min-w-0 flex-1 truncate',
							item.unread && 'font-semibold'
						) }
					>
						{ item.unread && (
							<span className="sr-only">
								{ __( 'Unread:', 'cliedesk' ) }{ ' ' }
							</span>
						) }
						<bdi>{ item.subject }</bdi>
					</span>
				</button>
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-fg-muted">
					<bdi className="font-medium">{ item.requesterName }</bdi>
					{ item.status && (
						<StatusBadge
							label={ item.status.label }
							category={ item.status.category }
						/>
					) }
					<PriorityBadge priority={ item.priority } />
					<Slot
						name="inbox.row.sla"
						fillProps={ { item, kit: inboxKit } }
					/>
					<SpamChip item={ item } />
					<NewMessagePill fresh={ fresh } />
					<span className="text-xs">
						{ assignee
							? sprintf(
									/* translators: %s: assignee name. */
									__( 'Assigned to %s', 'cliedesk' ),
									assignee
								)
							: __( 'Unassigned', 'cliedesk' ) }
					</span>
				</div>
			</div>
			<time
				dateTime={ item.lastMessageAt ?? item.updatedAt }
				title={ fullTime( item.lastMessageAt ?? item.updatedAt ) }
				className="shrink-0 text-xs text-fg-muted"
			>
				{ relativeTime( item.lastMessageAt ?? item.updatedAt ) }
			</time>
		</li>
	);
}

function Row( {
	item,
	fresh = false,
	selected,
	open,
	assignee,
	presence,
	onOpen,
	onFocusRow,
}: {
	item: InboxItem;
	/** New message since the last poll (INB-22). */
	fresh?: boolean;
	selected: boolean;
	/** Shown in the conversation pane. */
	open: boolean;
	assignee: string | null;
	presence: PresenceOther[];
	onOpen: () => void;
	onFocusRow: () => void;
} ) {
	return (
		<li
			role="option"
			aria-selected={ selected }
			id={ `cd-row-${ item.id }` }
			tabIndex={ selected ? 0 : -1 }
			onClick={ onOpen }
			onFocus={ onFocusRow }
			onKeyDown={ ( e ) => {
				if ( e.key === 'Enter' ) {
					e.preventDefault();
					onOpen();
				}
			} }
			aria-current={ open ? 'true' : undefined }
			// A fixed gutter for the unread dot and an inset open marker keep every row's text aligned.
			className={ cx(
				'grid cursor-pointer grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-b border-line py-2.5 ps-3 pe-4 outline-none last:border-b-0',
				'hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
				selected && 'bg-selected',
				fresh && ! selected && 'bg-accent-subtle',
				open &&
					'shadow-[inset_3px_0_0_var(--color-accent)] rtl:shadow-[inset_-3px_0_0_var(--color-accent)]'
			) }
		>
			<span
				aria-hidden="true"
				className={ cx(
					'mt-1.5 size-2 rounded-full',
					item.unread && 'bg-accent'
				) }
			/>
			<div className="flex min-w-0 items-baseline gap-2">
				<bdi
					className={ cx(
						'min-w-0 flex-1 truncate',
						item.unread
							? 'font-semibold text-fg'
							: 'font-medium text-fg'
					) }
				>
					{ item.requesterName }
				</bdi>
				<time
					dateTime={ item.lastMessageAt ?? item.updatedAt }
					title={ fullTime( item.lastMessageAt ?? item.updatedAt ) }
					className="shrink-0 text-xs text-fg-muted"
				>
					{ relativeTime( item.lastMessageAt ?? item.updatedAt ) }
				</time>
			</div>
			<p
				className={ cx(
					'col-start-2 min-w-0 truncate text-sm',
					item.unread ? 'font-semibold text-fg' : 'text-fg'
				) }
			>
				{ item.unread && (
					<span className="sr-only">
						{ __( 'Unread:', 'cliedesk' ) }{ ' ' }
					</span>
				) }
				<span className="cd-tabular font-normal text-fg-muted">
					{ `#${ item.number }` }
				</span>{ ' ' }
				<bdi>{ item.subject }</bdi>
			</p>
			{ item.lastMessagePreview ? (
				<p className="col-start-2 min-w-0 truncate text-sm text-fg-muted">
					{ item.lastMessagePreview }
				</p>
			) : null }
			<div className="col-start-2 mt-1 flex flex-wrap items-center gap-1.5">
				{ item.status && (
					<StatusBadge
						label={ item.status.label }
						category={ item.status.category }
					/>
				) }
				<PriorityBadge priority={ item.priority } />
				<SentimentMark value={ item.sentiment } />
				<Slot
					name="inbox.row.sla"
					fillProps={ { item, kit: inboxKit } }
				/>
				<SpamChip item={ item } />
				<NewMessagePill fresh={ fresh } />
				<PresenceDots others={ presence } />
				<span className="text-xs text-fg-muted">
					{ assignee
						? sprintf(
								/* translators: %s: assignee name. */
								__( 'Assigned to %s', 'cliedesk' ),
								assignee
							)
						: __( 'Unassigned', 'cliedesk' ) }
				</span>
			</div>
		</li>
	);
}

function ConversationList( {
	view,
	viewName,
	sort,
	mode,
	openNumber,
	onOpen,
	onSort,
	custom = null,
	review = false,
	stepRef,
}: {
	view: string;
	viewName: string;
	sort: ListSort | null;
	mode: 'list' | 'table';
	/** Set to "open the previous / next row" for the conversation pane's arrows. */
	stepRef?: MutableRefObject< ( ( delta: 1 | -1 ) => void ) | null >;
	onSort?: ( sort: ListSort ) => void;
	/** The custom view shown, if it is one (columns for everyone). */
	custom?: CustomView | null;
	/** Review mode instead of the list (INB-27). */
	review?: boolean;
	/** Conversation shown in the pane. */
	openNumber: number | null;
	onOpen: ( item: InboxItem ) => void;
} ) {
	const { nameFor, agents } = useAgents();
	const me = getBoot().user;
	const q = useInfiniteQuery( {
		queryKey: inboxKeys.list( view, sort ),
		queryFn: ( { pageParam, signal } ) =>
			fetchInboxPage( view, sort, pageParam, signal ),
		initialPageParam: null as string | null,
		getNextPageParam: ( last ) => last.next ?? undefined,
	} );
	const items = useMemo(
		() => q.data?.pages.flatMap( ( p ) => p.items ) ?? [],
		[ q.data ]
	);
	const viewColumns = q.data?.pages[ 0 ]?.view.columns ?? [];
	// INB-22: rows with a new message since the last poll.
	const fresh = useFreshRows(
		items,
		q.isSuccess,
		`${ view }|${ JSON.stringify( sort ) }`
	);
	// INB-03: my own columns of this view (order, hidden, widths).
	const [ myColumns ] = useTableColumns( view );
	const [ columnsOpen, setColumnsOpen ] = useState( false );
	const columns = applyColumnPrefs(
		viewColumns.length ? viewColumns : DEFAULT_COLUMNS,
		myColumns
	);
	// INB-03: inline status, priority and assignee changes in the table (one event each, If-Match).
	const qc = useQueryClient();
	const canStatus = mode === 'table' && can( 'cliedesk_change_status' );
	const statuses = useQuery( { ...statusesQuery(), enabled: canStatus } );
	const rowWrite = useMutation( {
		mutationFn: ( {
			item,
			path,
			body,
		}: {
			item: InboxItem;
			path: 'status' | 'priority' | 'assign';
			body: Record< string, unknown >;
		} ) =>
			api.post( `conversations/${ item.id }/${ path }`, {
				body,
				ifMatch: versionTag( item.version ),
			} ),
		onSuccess: ( _r, { item } ) => {
			announceResult(
				sprintf(
					/* translators: %d: conversation number. */
					__( '#%d changed.', 'cliedesk' ),
					item.number
				)
			);
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
		},
		onError: ( e ) =>
			toast( {
				tone: 'danger',
				title: isApiError( e )
					? e.message
					: __( 'Could not save the change.', 'cliedesk' ),
			} ),
	} );
	const canPriority =
		mode === 'table' && can( 'cliedesk_edit_conversation_fields' );
	const canAssign = mode === 'table' && can( 'cliedesk_assign_others' );
	const rowEdit = {
		...( canStatus && statuses.data
			? {
					statuses: statuses.data.filter(
						( x ) =>
							x.active &&
							x.category !== 'new' &&
							x.category !== 'closed'
					),
					onStatus: ( item: InboxItem, statusId: number ) =>
						rowWrite.mutate( {
							item,
							path: 'status',
							body: { statusId },
						} ),
				}
			: {} ),
		...( canPriority
			? {
					onPriority: ( item: InboxItem, priority: string ) =>
						rowWrite.mutate( {
							item,
							path: 'priority',
							body: { priority },
						} ),
				}
			: {} ),
		...( canAssign
			? {
					agents: agents.map( ( x ) => ( {
						id: x.userId,
						name: x.name,
					} ) ),
					onAssign: ( item: InboxItem, assigneeId: number | null ) =>
						rowWrite.mutate( {
							item,
							path: 'assign',
							body: { assigneeId },
						} ),
				}
			: {} ),
	};
	const presence = useListPresence( items.map( ( i ) => i.id ) );
	const slowPage = q.data?.pages.find( ( p ) => p.slow );
	const slow = !! slowPage;
	const hint = slowPage?.hint ?? null;
	const [ active, setActive ] = useState( 0 );
	const listRef = useRef< HTMLDivElement >( null );
	const sentinel = useRef< HTMLDivElement >( null );
	const index = Math.min( active, Math.max( items.length - 1, 0 ) );
	// INB-72: selection for bulk actions (reset with the view, since the list is keyed by view and sort).
	const bulkOk = can( 'cliedesk_bulk_actions' );
	const [ selecting, setSelecting ] = useState( false );
	const [ selected, setSelected ] = useState< number[] >( [] );
	const [ allMatching, setAllMatching ] = useState( false );
	const clearSelection = useCallback( () => {
		setSelected( [] );
		setAllMatching( false );
	}, [] );

	const rowTarget = useCallback(
		( i: number ) => {
			const row = listRef.current?.querySelector< HTMLElement >(
				`#cd-row-${ items[ i ]?.id }`
			);
			return mode === 'table' || selecting
				? ( row?.querySelector< HTMLElement >( '[data-row-link]' ) ??
						null )
				: ( row ?? null );
		},
		[ items, mode, selecting ]
	);
	const move = useCallback(
		( delta: number ) => {
			if ( ! items.length ) {
				return;
			}
			// The first j / k only focuses the selected row when focus is elsewhere.
			const inList = listRef.current?.contains(
				listRef.current.ownerDocument.activeElement
			);
			const next = Math.max(
				0,
				Math.min( items.length - 1, index + ( inList ? delta : 0 ) )
			);
			setActive( next );
			const el = rowTarget( next );
			el?.focus();
			el?.scrollIntoView?.( { block: 'nearest' } );
		},
		[ items, index, rowTarget ]
	);

	useEffect( () => {
		if ( ! stepRef ) {
			return undefined;
		}
		stepRef.current = ( delta ) => {
			const i = items.findIndex( ( x ) => x.number === openNumber );
			const next = i < 0 ? undefined : items[ i + delta ];
			if ( next ) {
				setActive( i + delta );
				onOpen( next );
			}
		};
		return () => {
			stepRef.current = null;
		};
	}, [ stepRef, items, openNumber, onOpen ] );

	const group = __( 'Inbox list', 'cliedesk' );
	useShortcut(
		{
			id: 'list-next',
			keys: 'j',
			label: __( 'Next conversation', 'cliedesk' ),
			group,
			run: () => move( 1 ),
		},
		! review
	);
	useShortcut(
		{
			id: 'list-previous',
			keys: 'k',
			label: __( 'Previous conversation', 'cliedesk' ),
			group,
			run: () => move( -1 ),
		},
		! review
	);
	useShortcut(
		{
			id: 'list-open',
			keys: 'o',
			label: __( 'Open the selected conversation', 'cliedesk' ),
			group,
			run: () => {
				const item = items[ index ];
				if ( item ) {
					onOpen( item );
				}
			},
		},
		! review
	);

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
	// "Select all conversations in this view" shows how many (counted only when that choice is offered or made).
	const wholePageSelected =
		items.length > 0 && items.every( ( i ) => selected.includes( i.id ) );
	const totalQuery = useQuery( {
		...inboxTotalQuery( view ),
		enabled:
			selecting &&
			( allMatching || ( wholePageSelected && hasNextPage ) ),
	} );
	const viewTotal = totalQuery.data ?? null;
	useEffect( () => {
		const el = sentinel.current;
		if ( ! el || typeof IntersectionObserver === 'undefined' ) {
			return undefined;
		}
		const io = new IntersectionObserver( ( entries ) => {
			if (
				entries.some( ( x ) => x.isIntersecting ) &&
				hasNextPage &&
				! isFetchingNextPage
			) {
				void fetchNextPage();
			}
		} );
		io.observe( el );
		return () => io.disconnect();
	}, [ hasNextPage, isFetchingNextPage, fetchNextPage ] );

	if ( q.isPending ) {
		return (
			<LoadingRegion
				label={ __( 'Loading conversations…', 'cliedesk' ) }
			/>
		);
	}
	if ( q.isError ) {
		return (
			<QueryFailed
				title={ __( 'Could not load the conversations', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const assigneeOf = ( item: InboxItem ) =>
		item.assigneeId === null
			? null
			: ( ( item.assigneeId === me?.id
					? __( 'you', 'cliedesk' )
					: null ) ??
				nameFor( item.assigneeId ) ??
				sprintf(
					/* translators: %d: user id. */
					__( 'Agent #%d', 'cliedesk' ),
					item.assigneeId
				) );
	const pageIds = items.map( ( i ) => i.id );
	const allOnPage =
		pageIds.length > 0 &&
		pageIds.every( ( id ) => selected.includes( id ) );
	const someOnPage = pageIds.some( ( id ) => selected.includes( id ) );
	let selection: ConversationSelection | null = null;
	if ( allMatching ) {
		selection = { kind: 'all', view, q: '', total: viewTotal };
	} else if ( selected.length ) {
		selection = { kind: 'ids', ids: selected };
	}
	const isChecked = ( id: number ) => allMatching || selected.includes( id );
	const toggleOne = ( id: number, on: boolean ) => {
		if ( allMatching ) {
			setAllMatching( false );
			setSelected( pageIds.filter( ( x ) => on || x !== id ) );
			return;
		}
		setSelected( ( l ) =>
			on ? [ ...l, id ] : l.filter( ( x ) => x !== id )
		);
	};
	const togglePage = ( on: boolean ) => {
		setAllMatching( false );
		setSelected( on ? pageIds : [] );
	};
	const selectedProducts = [
		...new Set(
			items
				.filter( ( i ) => selected.includes( i.id ) )
				.map( ( i ) => i.productId )
		),
	];
	const onArrows = ( e: { key: string; preventDefault: () => void } ) => {
		if ( e.key === 'ArrowDown' ) {
			e.preventDefault();
			move( 1 );
		} else if ( e.key === 'ArrowUp' ) {
			e.preventDefault();
			move( -1 );
		} else if ( e.key === 'Home' ) {
			e.preventDefault();
			move( -items.length );
		} else if ( e.key === 'End' ) {
			e.preventDefault();
			move( items.length );
		}
	};
	let body;
	if ( review ) {
		body = (
			<ReviewMode items={ items } total={ viewTotal } onOpen={ onOpen } />
		);
	} else if ( items.length === 0 ) {
		body = (
			<p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-fg-muted">
				{ __( 'No conversations in this view.', 'cliedesk' ) }
			</p>
		);
	} else if ( mode === 'table' ) {
		body = (
			// Arrow keys move between rows (the subject links have a roving tabindex).
			// eslint-disable-next-line jsx-a11y/no-static-element-interactions
			<div ref={ listRef } onKeyDown={ onArrows }>
				<InboxTable
					items={ items }
					columns={ columns }
					caption={ viewName }
					index={ index }
					assigneeOf={ assigneeOf }
					presence={ presence }
					onFocusRow={ setActive }
					sort={ sort }
					onSort={ onSort }
					widths={ myColumns?.widths }
					edit={ rowEdit }
					select={
						selecting
							? {
									isChecked,
									onToggle: toggleOne,
									all: allOnPage || allMatching,
									some: someOnPage,
									onTogglePage: togglePage,
								}
							: undefined
					}
				/>
			</div>
		);
	} else if ( selecting ) {
		body = (
			// Arrow keys move between rows (the open buttons have a roving tabindex).
			// eslint-disable-next-line jsx-a11y/no-static-element-interactions
			<div ref={ listRef } onKeyDown={ onArrows }>
				<div className="flex items-center gap-2 px-4 pb-2">
					<Checkbox
						isSelected={ allOnPage || allMatching }
						isIndeterminate={
							! allOnPage && someOnPage && ! allMatching
						}
						onChange={ togglePage }
					>
						{ __( 'Select all on this page', 'cliedesk' ) }
					</Checkbox>
				</div>
				<ul
					aria-label={ viewName }
					className="overflow-hidden rounded-lg border border-line bg-surface"
				>
					{ items.map( ( item, i ) => (
						<SelectableRow
							key={ item.id }
							item={ item }
							fresh={ fresh.has( item.id ) }
							active={ i === index }
							checked={ isChecked( item.id ) }
							open={ item.number === openNumber }
							assignee={ assigneeOf( item ) }
							onToggle={ ( on ) => toggleOne( item.id, on ) }
							onOpen={ () => {
								setActive( i );
								onOpen( item );
							} }
							onFocusRow={ () => setActive( i ) }
						/>
					) ) }
				</ul>
			</div>
		);
	} else {
		body = (
			<div ref={ listRef }>
				<ul
					role="listbox"
					aria-label={ viewName }
					aria-describedby="cd-inbox-keys"
					onKeyDown={ onArrows }
					className="overflow-hidden rounded-lg border border-line bg-surface"
				>
					{ items.map( ( item, i ) => (
						<Row
							key={ item.id }
							item={ item }
							fresh={ fresh.has( item.id ) }
							selected={ i === index }
							open={ item.number === openNumber }
							assignee={ assigneeOf( item ) }
							presence={ presence[ String( item.id ) ] ?? [] }
							onOpen={ () => {
								setActive( i );
								onOpen( item );
							} }
							onFocusRow={ () => setActive( i ) }
						/>
					) ) }
				</ul>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			<JobsPanel scope="inbox" />
			{ ( ( bulkOk && items.length > 0 ) || mode === 'table' ) && (
				<div className="flex flex-wrap items-center gap-2">
					{ bulkOk && items.length > 0 && (
						<Button
							size="sm"
							variant="ghost"
							aria-pressed={ selecting }
							iconStart={
								<CheckSquare aria-hidden="true" size={ 14 } />
							}
							onPress={ () => {
								setSelecting( ( x ) => ! x );
								clearSelection();
							} }
						>
							{ __( 'Select conversations', 'cliedesk' ) }
						</Button>
					) }
					{ mode === 'table' && (
						<Button
							size="sm"
							variant="ghost"
							className="ms-auto"
							onPress={ () => setColumnsOpen( true ) }
						>
							{ __( 'Columns…', 'cliedesk' ) }
						</Button>
					) }
				</div>
			) }
			{ selecting && selection && (
				<ConversationBulkBar
					selection={ selection }
					view={ view }
					productIds={ selectedProducts }
					items={ items }
					onClear={ clearSelection }
				/>
			) }
			{ selecting && ! allMatching && allOnPage && hasNextPage && (
				<Banner
					tone="info"
					title={ sprintf(
						/* translators: %d: number of conversations on this page. */
						_n(
							'The %d conversation on this page is selected.',
							'All %d conversations on this page are selected.',
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
							{ viewTotal === null
								? __(
										'Select all conversations in this view',
										'cliedesk'
									)
								: sprintf(
										/* translators: %d: number of conversations in the view. */
										_n(
											'Select the %d conversation in this view',
											'Select all %d conversations in this view',
											viewTotal,
											'cliedesk'
										),
										viewTotal
									) }
						</Button>
					}
				/>
			) }
			{ slow && (
				<Banner
					tone="warning"
					title={ __( 'This view is slow', 'cliedesk' ) }
				>
					<p>
						{ __(
							'Its conditions take longer to run than the limit set in Settings.',
							'cliedesk'
						) }
					</p>
					{ hint && ! hint.narrow && (
						<p>
							{ __(
								'Add a condition on lane, assignee, queue, product, customer or created date: these use an index.',
								'cliedesk'
							) }
						</p>
					) }
					{ hint && hint.costly.length > 0 && (
						<p>
							{ sprintf(
								/* translators: %s: list of condition names. */
								__(
									'These conditions cannot use an index: %s.',
									'cliedesk'
								),
								hint.costly
									.map( ( k ) => conditionFieldLabel( k ) )
									.join( ', ' )
							) }
						</p>
					) }
				</Banner>
			) }
			{ body }
			{ columnsOpen && (
				<TableColumnsDialog
					view={ view }
					viewColumns={
						viewColumns.length ? viewColumns : DEFAULT_COLUMNS
					}
					custom={ custom }
					label={ columnLabel }
					onClose={ () => setColumnsOpen( false ) }
				/>
			) }
			<p id="cd-inbox-keys" className="sr-only">
				{ mode === 'table'
					? __(
							'Use J and K or the arrow keys to move between rows.',
							'cliedesk'
						)
					: __(
							'Use J and K or the arrow keys to move, Enter to open.',
							'cliedesk'
						) }
			</p>
			<div ref={ sentinel } />
			{ hasNextPage && (
				<Button
					className="self-center"
					isLoading={ isFetchingNextPage }
					onPress={ () => void fetchNextPage() }
				>
					{ __( 'Load more', 'cliedesk' ) }
				</Button>
			) }
		</div>
	);
}

/**
 * Inbox screen. On wide screens (≥ 1280 px) in list layout, opening a row shows the conversation next to the list
 * (`?c=1042`), with a resizable splitter; on narrower screens, and in table layout, rows open the full page.
 */
/**
 * BRD-12: the products this inbox shows, remembered for me across devices (lists and counts follow).
 */
function ProductSwitcher() {
	const qc = useQueryClient();
	const products = getBoot().products ?? [];
	// BRD-15: open conversations per product, from cached counters.
	const counts = useQuery( {
		queryKey: [ 'products', 'counts' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Record< string, number > } >(
					'products/counts',
					{ signal }
				)
			).data?.items ?? {},
		enabled: products.length > 1,
		staleTime: 60000,
		retry: false,
	} );
	if ( products.length < 2 ) {
		return null;
	}
	return (
		<Select
			label={ __( 'Product', 'cliedesk' ) }
			value={ String( inboxProducts()[ 0 ] ?? 0 ) }
			onChange={ ( v ) => {
				const id = Number( v );
				savePrefs( { layout: { inboxProducts: id ? [ id ] : [] } } );
				void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			} }
			options={ [
				{ id: '0', label: __( 'All products', 'cliedesk' ) },
				...products.map( ( p ) => ( {
					id: String( p.id ),
					label:
						counts.data?.[ String( p.id ) ] !== undefined
							? sprintf(
									/* translators: 1: product name, 2: open conversations. */
									__( '%1$s (%2$d)', 'cliedesk' ),
									p.name,
									counts.data[ String( p.id ) ] ?? 0
								)
							: p.name,
				} ) ),
			] }
		/>
	);
}

export default function InboxRoute() {
	const navigate = useNavigate();
	const params = useParams( { strict: false } ) as { view?: string };
	const view = params.view ?? DEFAULT_VIEW;
	const search = useSearch( { strict: false } ) as {
		q?: unknown;
		c?: unknown;
		new?: unknown;
		order?: unknown;
		email?: unknown;
		name?: unknown;
		subject?: unknown;
		body?: unknown;
		type?: unknown;
		queue?: unknown;
	};
	// Sorts modules add (Pro: next SLA due), from the view vocabulary.
	const vocabulary = useQuery( vocabularyQuery() );
	const extraSorts = moreSorts( vocabulary.data );
	const sortName = ( s: string ) =>
		extraSorts.find( ( x ) => x.key === s )?.label ?? sortLabel( s );
	// INB-55: /new opens the new-conversation dialog with the fields from the address.
	const atNew = useRouterState( {
		select: ( s ) => s.location.pathname.endsWith( '/new' ),
	} );
	const prefill = {
		email: String( search.email ?? '' ),
		name: String( search.name ?? '' ),
		subject: String( search.subject ?? '' ),
		body: String( search.body ?? '' ),
		type: String( search.type ?? '' ),
		queue: Number( search.queue ) > 0 ? Number( search.queue ) : null,
	};
	const q = view === SEARCH_VIEW ? String( search.q ?? '' ) : '';
	const searching = view === SEARCH_VIEW;
	const playOnly = isPlayOnly();
	const canReview = view === SPAM_VIEW && canManageSpam();
	const [ reviewOff, setReviewOff ] = useState( false );
	useEffect( () => setReviewOff( false ), [ view ] );
	const reviewing = canReview && ! reviewOff && ! searching;
	const sidebar = useQuery( sidebarQuery() );
	const [ sort, setSort ] = useState< ListSort | null >( null );
	const [ editing, setEditing ] = useState< CustomView | 'new' | null >(
		null
	);
	// COM-07: the WooCommerce order screen opens the new-conversation dialog for the order's customer (?new=1&order=).
	const startOrder =
		Number( search.order ) > 0 ? Number( search.order ) : null;
	const [ creating, setCreating ] = useState(
		() => String( search.new ?? '' ) === '1' || atNew
	);
	const [ layout, setLayout ] = useInboxLayout();
	const wide = useMediaQuery( WIDE_QUERY );
	// The pane's previous / next arrows open the list's neighbouring rows.
	const stepRef = useRef< ( ( delta: 1 | -1 ) => void ) | null >( null );
	useEffect( () => setSort( null ), [ view ] );

	const split = wide && layout.mode === 'split' && ! searching;
	const requested = Number( search.c );
	const openNumber =
		split && Number.isInteger( requested ) && requested > 0
			? requested
			: null;

	const system = sidebar.data?.system.find( ( s ) => s.key === view );
	const custom = sidebar.data?.custom.find(
		( c ) => String( c.id ) === view
	);
	let viewName = system?.name ?? custom?.name ?? __( 'Inbox', 'cliedesk' );
	if ( searching ) {
		viewName = q
			? sprintf(
					/* translators: %s: search query. */
					__( 'Search: %s', 'cliedesk' ),
					q
				)
			: __( 'Search', 'cliedesk' );
	}
	const effectiveSort = sort ?? custom?.sort ?? null;
	// INB-12: the related list next to an open conversation follows this view and sort.
	useEffect( () => {
		if ( ! searching ) {
			setCurrentList( { view, sort: effectiveSort, name: viewName } );
		}
	}, [ view, effectiveSort, viewName, searching ] );
	// Play (inbox/next) takes built-in sorts only.
	const playSort =
		SORTS.includes( effectiveSort as SortKey ) ||
		extraSorts.some( ( x ) => x.key === effectiveSort )
			? ( effectiveSort as SortKey )
			: null;

	const setPane = ( n: number | null ) =>
		void navigate( {
			search: ( prev: Record< string, unknown > ) => {
				const next = { ...prev };
				if ( n === null ) {
					delete next.c;
				} else {
					next.c = n;
				}
				return next;
			},
			replace: true,
		} as never );
	const openItem = ( item: InboxItem ) => {
		if ( split ) {
			setPane( item.number );
		} else {
			void navigate( {
				to: '/c/$number',
				params: { number: String( item.number ) },
			} );
		}
	};
	const closePane = () => {
		// Back to the row that opened it (§8.3).
		const row = document.querySelector< HTMLElement >(
			'#cd-inbox-list [role="option"][aria-current="true"]'
		);
		setPane( null );
		window.setTimeout( () => row?.focus(), 0 );
	};
	const toggleMode = () =>
		setLayout( { mode: layout.mode === 'table' ? 'split' : 'table' } );
	const toggleSidebar = () =>
		setLayout( { sidebarCollapsed: ! layout.sidebarCollapsed } );

	const group = __( 'Inbox list', 'cliedesk' );
	useShortcut(
		{
			id: 'inbox-layout',
			keys: 'l',
			label: __( 'Switch between table and split layout', 'cliedesk' ),
			group,
			run: toggleMode,
		},
		! searching
	);
	useShortcut( {
		id: 'inbox-sidebar',
		keys: '[',
		label: __( 'Show or hide the views', 'cliedesk' ),
		group,
		run: toggleSidebar,
	} );
	useShortcut(
		{
			id: 'inbox-close-pane',
			keys: ']',
			label: __( 'Close the conversation pane', 'cliedesk' ),
			group,
			run: closePane,
		},
		openNumber !== null
	);
	useShortcut( {
		id: 'inbox-search',
		keys: '/',
		label: __( 'Search conversations', 'cliedesk' ),
		group,
		run: () =>
			document
				.querySelector< HTMLInputElement >( '#cd-inbox-search input' )
				?.focus(),
	} );

	const play = usePlayStart( { view, viewName, sort: playSort } );
	const canPlay = ! searching && ! playOnly;
	const onListAction = ( key: Key ) => {
		switch ( key ) {
			case 'views':
				toggleSidebar();
				break;
			case 'review':
				setReviewOff( ( v ) => ! v );
				break;
			case 'play':
				play.start();
				break;
			case 'edit':
				if ( custom ) {
					setEditing( custom );
				}
				break;
		}
	};
	const listHeader = (
		<div className="flex flex-col gap-2 pb-3">
			<PageHeader
				dense
				title={ viewName }
				actions={
					<>
						{ /* RTE-22 (Pro): Get next. */ }
						{ ! searching && can( 'cliedesk_assign_self' ) && (
							<Slot name="inbox.get_next" />
						) }
						{ /* RPT-37 (Pro): export the view. */ }
						{ ! searching && (
							<Slot name="inbox.export" fillProps={ { view } } />
						) }
						<Menu
							aria-label={ __( 'List options', 'cliedesk' ) }
							onAction={ onListAction }
							trigger={
								<Button
									aria-label={ __(
										'List options',
										'cliedesk'
									) }
									isLoading={ play.busy }
									iconStart={
										<MoreHorizontal
											aria-hidden="true"
											size={ 16 }
										/>
									}
								/>
							}
						>
							<MenuItem
								id="views"
								icon={
									layout.sidebarCollapsed ? (
										<PanelLeftOpen
											size={ 14 }
											className="rtl:rotate-180"
										/>
									) : (
										<PanelLeftClose
											size={ 14 }
											className="rtl:rotate-180"
										/>
									)
								}
							>
								{ layout.sidebarCollapsed
									? __( 'Show views ([)', 'cliedesk' )
									: __( 'Hide views ([)', 'cliedesk' ) }
							</MenuItem>
							{ canReview ? (
								<MenuItem
									id="review"
									icon={ <ListChecks size={ 14 } /> }
								>
									{ reviewing
										? __( 'Show the list', 'cliedesk' )
										: __( 'Review mode', 'cliedesk' ) }
								</MenuItem>
							) : null }
							{ canPlay ? (
								<MenuItem
									id="play"
									icon={ <Play size={ 14 } /> }
								>
									{ __( 'Play', 'cliedesk' ) }
								</MenuItem>
							) : null }
							{ custom ? (
								<MenuItem
									id="edit"
									icon={ <Pencil size={ 14 } /> }
								>
									{ __( 'Edit view', 'cliedesk' ) }
								</MenuItem>
							) : null }
						</Menu>
						{ can( 'cliedesk_reply_conversations' ) && (
							<Button
								variant="primary"
								aria-label={ __(
									'New conversation',
									'cliedesk'
								) }
								iconStart={
									<Plus aria-hidden="true" size={ 14 } />
								}
								onPress={ () => setCreating( true ) }
							>
								{ __( 'New', 'cliedesk' ) }
							</Button>
						) }
					</>
				}
			/>
			{ custom?.pinned && (
				<p>
					<Pill>{ __( 'Pinned', 'cliedesk' ) }</Pill>
				</p>
			) }
			<SearchBox initial={ q } />
			{ ! searching && (
				<div className="flex flex-wrap items-center gap-1">
					<Menu
						aria-label={ __( 'List layout', 'cliedesk' ) }
						selectionMode="single"
						selectedKeys={ [ layout.mode ] }
						placement="bottom start"
						onAction={ ( k ) =>
							setLayout( { mode: k as ListMode } )
						}
						trigger={
							<Button
								size="sm"
								variant="ghost"
								iconStart={
									<LayoutList
										aria-hidden="true"
										size={ 14 }
									/>
								}
								iconEnd={
									<ChevronDown
										aria-hidden="true"
										size={ 14 }
									/>
								}
							>
								{ layoutLabel( layout.mode ) }
							</Button>
						}
					>
						<MenuItem id="split">
							{ __( 'List and conversation', 'cliedesk' ) }
						</MenuItem>
						<MenuItem id="list">
							{ __( 'List', 'cliedesk' ) }
						</MenuItem>
						<MenuItem id="table">
							{ __( 'Table', 'cliedesk' ) }
						</MenuItem>
					</Menu>
					<Menu
						aria-label={ __( 'Sort conversations', 'cliedesk' ) }
						selectionMode="single"
						selectedKeys={ effectiveSort ? [ effectiveSort ] : [] }
						placement="bottom start"
						onAction={ ( k ) => setSort( k as SortKey ) }
						trigger={
							<Button
								size="sm"
								variant="ghost"
								iconStart={
									<ArrowUpDown
										aria-hidden="true"
										size={ 14 }
									/>
								}
								iconEnd={
									<ChevronDown
										aria-hidden="true"
										size={ 14 }
									/>
								}
							>
								{ sprintf(
									/* translators: %s: sort order. */
									__( 'Sort: %s', 'cliedesk' ),
									effectiveSort
										? sortName( effectiveSort )
										: __( 'View default', 'cliedesk' )
								) }
							</Button>
						}
					>
						{ [
							...SORTS.map( ( s ) => ( {
								key: s as string,
								label: sortLabel( s ),
							} ) ),
							...extraSorts,
						].map( ( s ) => (
							<MenuItem key={ s.key } id={ s.key }>
								{ s.label }
							</MenuItem>
						) ) }
					</Menu>
				</div>
			) }
		</div>
	);
	let list = searching ? (
		<SearchResults q={ q } />
	) : (
		<ConversationList
			key={ `${ view }:${ effectiveSort ?? '' }` }
			view={ view }
			viewName={ viewName }
			sort={ sort }
			mode={ layout.mode === 'table' ? 'table' : 'list' }
			openNumber={ openNumber }
			onOpen={ openItem }
			onSort={ setSort }
			custom={ custom ?? null }
			review={ reviewing }
			stepRef={ stepRef }
		/>
	);

	if ( playOnly && ! searching ) {
		// Roles that work through Play only see no list (INB-26).
		list = (
			<section
				aria-labelledby="cd-play-only"
				className="flex flex-col items-start gap-3 rounded-lg border border-line px-6 py-8"
			>
				<h2 id="cd-play-only" className="text-lg font-semibold">
					{ __( 'Work through Play mode', 'cliedesk' ) }
				</h2>
				<p className="text-fg-muted">
					{ __(
						'Your role takes conversations one at a time, in the order of the view. Press Play to open the next one.',
						'cliedesk'
					) }
				</p>
				<PlayButton
					view={ view }
					viewName={ viewName }
					sort={ playSort }
					variant="primary"
				/>
			</section>
		);
	}

	return (
		<div className="flex flex-col gap-6 md:flex-row">
			<aside
				id="cd-inbox-views"
				hidden={ layout.sidebarCollapsed }
				className="w-full shrink-0 md:w-56"
			>
				{ sidebar.isPending && (
					<LoadingRegion
						label={ __( 'Loading views…', 'cliedesk' ) }
					/>
				) }
				{ sidebar.isError && (
					<QueryFailed
						headingLevel={ 2 }
						title={ __( 'Could not load the views', 'cliedesk' ) }
						error={ sidebar.error }
						onRetry={ () => void sidebar.refetch() }
					/>
				) }
				{ sidebar.data && (
					<ViewsSidebar
						current={ view }
						query={ q }
						sidebar={ sidebar.data }
						onEdit={ ( v ) => setEditing( v ) }
						onNew={ () => setEditing( 'new' ) }
					/>
				) }
			</aside>
			{ split ? (
				<div className="flex min-w-0 flex-1 items-start">
					<div
						id="cd-inbox-list"
						className="shrink-0"
						style={ { width: layout.listWidth } }
					>
						{ listHeader }
						{ list }
					</div>
					<PaneResizer
						value={ layout.listWidth }
						controls="cd-inbox-list"
						onChange={ ( w ) => setLayout( { listWidth: w } ) }
					/>
					<section
						aria-label={ __( 'Conversation', 'cliedesk' ) }
						// The visible height inside the page padding (py-6): the open conversation fills it, so the thread
						// grows and the composer sits at the bottom edge on any monitor height.
						className="sticky top-[calc(var(--cd-topbar-h)+1.5rem)] h-[calc(100dvh-var(--cd-topbar-h)-3rem)] min-w-0 flex-1 overflow-y-auto ps-4"
					>
						{ openNumber ? (
							<Suspense
								fallback={
									<LoadingRegion
										label={ __(
											'Loading the conversation…',
											'cliedesk'
										) }
									/>
								}
							>
								<ConversationPane
									key={ openNumber }
									number={ openNumber }
									inPane
									onClose={ closePane }
									onStep={ ( d ) => stepRef.current?.( d ) }
								/>
							</Suspense>
						) : (
							<p className="rounded-lg border border-dashed border-line-strong px-6 py-16 text-center text-fg-muted">
								{ __(
									'Select a conversation to read it here.',
									'cliedesk'
								) }
							</p>
						) }
					</section>
				</div>
			) : (
				<div className="min-w-0 flex-1">
					{ listHeader }
					{ list }
				</div>
			) }
			<Suspense fallback={ null }>
				{ editing && (
					<ViewEditor
						view={ editing === 'new' ? null : editing }
						onClose={ () => setEditing( null ) }
					/>
				) }
				{ creating && (
					<NewConversationDialog
						onClose={ () => setCreating( false ) }
						orderId={ startOrder }
						prefill={ prefill }
					/>
				) }
			</Suspense>
		</div>
	);
}
