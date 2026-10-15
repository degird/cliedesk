/**
 * Table layout of the inbox list (INB-03): one row per conversation, the columns of the view (view.columns, or
 * the defaults). The subject cell links to the conversation; J / K move between rows. Columns the list API does
 * not return (custom fields) show "—"; a column a module adds (Pro: SLA) is the fill of `inbox.cell.<key>`.
 */
import { useQuery } from '@cliedesk/data';
import {
	Checkbox,
	Menu,
	MenuItem,
	Slot,
	UnstyledButton,
	cx,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import {
	PRIORITIES,
	type InboxItem,
	type ListSort,
	type Status,
	vocabularyQuery,
} from '../../inbox/api';
import { Pill, PriorityBadge, StatusBadge } from '../../inbox/components';
import { inboxKit } from '../../inbox/kit';
import {
	fullTime,
	laneLabel,
	priorityLabel,
	relativeTime,
} from '../../inbox/labels';
import { PresenceDots, type PresenceOther } from '../../inbox/presence';
import { canManageSpam, spamReasonShort } from '../../inbox/spam';

/** Row checkboxes for bulk actions (INB-72). */
export interface TableSelect {
	isChecked: ( id: number ) => boolean;
	onToggle: ( id: number, on: boolean ) => void;
	/** Every row on the page (or every matching conversation) is selected. */
	all: boolean;
	some: boolean;
	onTogglePage: ( on: boolean ) => void;
}

/** Inline edits in the table (INB-03): status, priority and assignee, each when given. */
export interface RowEdit {
	statuses?: Status[];
	onStatus?: ( item: InboxItem, statusId: number ) => void;
	onPriority?: ( item: InboxItem, priority: string ) => void;
	agents?: Array< { id: number; name: string } >;
	onAssign?: ( item: InboxItem, assigneeId: number | null ) => void;
}

/**
 * A cell that opens a menu of choices (inline edit).
 *
 * @param props              Props.
 * @param props.menuLabel    Menu name.
 * @param props.triggerLabel Button name.
 * @param props.selected     Selected choice ids.
 * @param props.items        Choices.
 * @param props.onPick       A choice was made.
 * @param props.children     What the cell shows.
 */
function CellMenu( {
	menuLabel,
	triggerLabel,
	selected,
	items,
	onPick,
	children,
}: {
	menuLabel: string;
	triggerLabel: string;
	selected: string[];
	items: Array< { id: string; label: string } >;
	onPick: ( id: string ) => void;
	children: ReactNode;
} ) {
	return (
		<Menu
			aria-label={ menuLabel }
			selectionMode="single"
			selectedKeys={ selected }
			onAction={ ( k ) => onPick( String( k ) ) }
			trigger={
				<UnstyledButton
					aria-label={ triggerLabel }
					className="rounded-sm outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus"
				>
					{ children }
				</UnstyledButton>
			}
		>
			{ items.map( ( x ) => (
				<MenuItem key={ x.id } id={ x.id }>
					{ x.label }
				</MenuItem>
			) ) }
		</Menu>
	);
}

/** Built-in columns and the list sort their heading applies. */
const COLUMN_SORTS: Record< string, ListSort > = {
	priority: 'priority',
	updated: 'updated',
	waiting: 'waiting',
	number: 'created',
};

/**
 * The sort a click on a column heading applies (field columns switch between lowest and highest first), or null.
 *
 * @param column  Column key.
 * @param current Current sort.
 */
export function columnSort(
	column: string,
	current: ListSort | null
): ListSort | null {
	if ( column.startsWith( 'field:' ) ) {
		const asc = column as ListSort;
		return current === asc ? ( `${ column }:desc` as ListSort ) : asc;
	}
	if ( column === 'number' ) {
		return current === 'created' ? 'oldest' : 'created';
	}
	return COLUMN_SORTS[ column ] ?? null;
}

/**
 * aria-sort of a column heading for the current sort.
 *
 * @param column  Column key.
 * @param current Current sort.
 */
export function ariaSort(
	column: string,
	current: ListSort | null
): 'ascending' | 'descending' | 'none' {
	if ( ! current ) {
		return 'none';
	}
	if ( column.startsWith( 'field:' ) ) {
		if ( current === column ) {
			return 'ascending';
		}
		return current === `${ column }:desc` ? 'descending' : 'none';
	}
	if ( column === 'number' ) {
		if ( current === 'created' ) {
			return 'descending';
		}
		return current === 'oldest' ? 'ascending' : 'none';
	}
	if ( COLUMN_SORTS[ column ] !== current ) {
		return 'none';
	}
	return current === 'updated' ? 'descending' : 'ascending';
}

export const DEFAULT_COLUMNS = [
	'number',
	'subject',
	'requester',
	'status',
	'priority',
	'assignee',
	'updated',
];

/**
 * Column heading.
 *
 * @param key      Column key.
 * @param fallback Label of a column a module adds (from the view vocabulary).
 */
export function columnLabel( key: string, fallback?: string ): string {
	switch ( key ) {
		case 'number':
			return __( 'Number', 'cliedesk' );
		case 'subject':
			return __( 'Subject', 'cliedesk' );
		case 'requester':
		case 'customer':
			return __( 'Customer', 'cliedesk' );
		case 'status':
			return __( 'Status', 'cliedesk' );
		case 'priority':
			return __( 'Priority', 'cliedesk' );
		case 'assignee':
			return __( 'Assignee', 'cliedesk' );
		case 'updated':
			return __( 'Updated', 'cliedesk' );
		case 'last_message':
		case 'lastMessage':
			return __( 'Last message', 'cliedesk' );
		case 'waiting':
			return __( 'Waiting since', 'cliedesk' );
		case 'messages':
			return __( 'Messages', 'cliedesk' );
		case 'lane':
			return __( 'Lane', 'cliedesk' );
		case 'preview':
			return __( 'Preview', 'cliedesk' );
		default:
			return (
				fallback ?? key.replace( /^field:/, '' ).replace( /_/g, ' ' )
			);
	}
}

function TimeCell( { value }: { value: string | null } ) {
	if ( ! value ) {
		return <span className="text-fg-muted">—</span>;
	}
	return (
		<time dateTime={ value } title={ fullTime( value ) }>
			{ relativeTime( value ) }
		</time>
	);
}

function Cell( {
	column,
	item,
	assignee,
	edit,
}: {
	column: string;
	item: InboxItem;
	assignee: string | null;
	edit?: RowEdit;
} ) {
	switch ( column ) {
		case 'number':
			return <span className="cd-tabular">{ `#${ item.number }` }</span>;
		case 'requester':
		case 'customer':
			return <bdi>{ item.requesterName }</bdi>;
		case 'status': {
			const badge = item.status ? (
				<StatusBadge
					label={ item.status.label }
					category={ item.status.category }
				/>
			) : (
				<span className="text-fg-muted">—</span>
			);
			if ( ! edit?.onStatus || ! edit.statuses ) {
				return badge;
			}
			const onStatus = edit.onStatus;
			return (
				<CellMenu
					menuLabel={ sprintf(
						/* translators: %d: conversation number. */
						__( 'Status of #%d', 'cliedesk' ),
						item.number
					) }
					triggerLabel={ sprintf(
						/* translators: 1: conversation number, 2: status. */
						__( 'Change the status of #%1$d (%2$s)', 'cliedesk' ),
						item.number,
						item.status?.label ?? ''
					) }
					selected={ edit.statuses
						.filter( ( x ) => x.key === item.status?.key )
						.map( ( x ) => String( x.id ) ) }
					items={ edit.statuses.map( ( x ) => ( {
						id: String( x.id ),
						label: x.label,
					} ) ) }
					onPick={ ( k ) => onStatus( item, Number( k ) ) }
				>
					{ badge }
				</CellMenu>
			);
		}
		case 'priority': {
			const badge =
				item.priority === 'none' ? (
					<span className="text-fg-muted">—</span>
				) : (
					<PriorityBadge priority={ item.priority } />
				);
			if ( ! edit?.onPriority ) {
				return badge;
			}
			const onPriority = edit.onPriority;
			return (
				<CellMenu
					menuLabel={ sprintf(
						/* translators: %d: conversation number. */
						__( 'Priority of #%d', 'cliedesk' ),
						item.number
					) }
					triggerLabel={ sprintf(
						/* translators: 1: conversation number, 2: priority. */
						__( 'Change the priority of #%1$d (%2$s)', 'cliedesk' ),
						item.number,
						priorityLabel( item.priority )
					) }
					selected={ [ item.priority ] }
					items={ PRIORITIES.map( ( x ) => ( {
						id: x,
						label: priorityLabel( x ),
					} ) ) }
					onPick={ ( k ) => onPriority( item, k ) }
				>
					{ badge }
				</CellMenu>
			);
		}
		case 'assignee': {
			const text = assignee ? (
				<bdi>{ assignee }</bdi>
			) : (
				<span className="text-fg-muted">
					{ __( 'Unassigned', 'cliedesk' ) }
				</span>
			);
			if ( ! edit?.onAssign || ! edit.agents ) {
				return text;
			}
			const onAssign = edit.onAssign;
			return (
				<CellMenu
					menuLabel={ sprintf(
						/* translators: %d: conversation number. */
						__( 'Assignee of #%d', 'cliedesk' ),
						item.number
					) }
					triggerLabel={ sprintf(
						/* translators: 1: conversation number, 2: assignee or "Unassigned". */
						__( 'Change the assignee of #%1$d (%2$s)', 'cliedesk' ),
						item.number,
						assignee ?? __( 'Unassigned', 'cliedesk' )
					) }
					selected={ [
						item.assigneeId ? String( item.assigneeId ) : 'none',
					] }
					items={ [
						{ id: 'none', label: __( 'Unassigned', 'cliedesk' ) },
						...edit.agents.map( ( a ) => ( {
							id: String( a.id ),
							label: a.name,
						} ) ),
					] }
					onPick={ ( k ) =>
						onAssign( item, k === 'none' ? null : Number( k ) )
					}
				>
					{ text }
				</CellMenu>
			);
		}
		case 'updated':
			return <TimeCell value={ item.updatedAt } />;
		case 'last_message':
		case 'lastMessage':
			return <TimeCell value={ item.lastMessageAt } />;
		case 'waiting':
			return <TimeCell value={ item.waitingSince } />;
		case 'messages':
			return <span className="cd-tabular">{ item.messageCount }</span>;
		case 'lane':
			return <>{ laneLabel( item.lane ) }</>;
		case 'preview':
			return (
				<span className="line-clamp-1 text-fg-muted">
					{ item.lastMessagePreview }
				</span>
			);
		default: {
			const none = (
				<span className="text-fg-muted">
					<span aria-hidden="true">—</span>
					<span className="sr-only">
						{ __( 'Not available', 'cliedesk' ) }
					</span>
				</span>
			);
			return column.startsWith( 'field:' ) ? (
				none
			) : (
				<Slot
					name={ `inbox.cell.${ column }` }
					fillProps={ { item, kit: inboxKit } }
					fallback={ none }
				/>
			);
		}
	}
}

/**
 * Table.
 *
 * @param props            Props.
 * @param props.items      Rows.
 * @param props.columns    Column keys.
 * @param props.caption    Caption (view name).
 * @param props.index      Selected row.
 * @param props.assigneeOf Assignee name of a row.
 * @param props.presence   Presence per conversation id.
 * @param props.onFocusRow A row's link got focus.
 * @param props.select     Row checkboxes (selection mode).
 */
export function InboxTable( {
	items,
	columns,
	caption,
	index,
	assigneeOf,
	presence,
	onFocusRow,
	select,
	sort = null,
	onSort,
	widths = {},
	edit,
}: {
	items: InboxItem[];
	columns: string[];
	caption: string;
	index: number;
	assigneeOf: ( item: InboxItem ) => string | null;
	presence: Record< string, PresenceOther[] >;
	onFocusRow: ( i: number ) => void;
	select?: TableSelect;
	/** Current sort; a click on a sortable heading calls onSort (INB-03). */
	sort?: ListSort | null;
	onSort?: ( sort: ListSort ) => void;
	/** Inline edits of status, priority and assignee. */
	edit?: RowEdit;
	/** My column widths in px (INB-03). */
	widths?: Record< string, number >;
} ) {
	const spam = canManageSpam();
	// Labels of columns modules add (Pro: SLA).
	const vocabulary = useQuery( vocabularyQuery() );
	const heading = ( c: string ) =>
		columnLabel(
			c,
			c.startsWith( 'field:' )
				? undefined
				: vocabulary.data?.columns.find( ( x ) => x.key === c )?.label
		);
	const cols = ( columns.length ? columns : DEFAULT_COLUMNS ).filter(
		( c, i, all ) => all.indexOf( c ) === i
	);
	// The subject links to the conversation: always show it.
	if ( ! cols.includes( 'subject' ) ) {
		cols.splice( cols[ 0 ] === 'number' ? 1 : 0, 0, 'subject' );
	}
	return (
		<div className="overflow-x-auto rounded-lg border border-line bg-surface">
			<table className="w-full border-collapse text-sm">
				<caption className="sr-only">
					{ sprintf(
						/* translators: %s: view name. */
						__( '%s: conversations', 'cliedesk' ),
						caption
					) }
				</caption>
				<thead>
					<tr className="border-b border-line bg-sunken text-start">
						{ select && (
							<th scope="col" className="w-10 px-3 py-2">
								<Checkbox
									isSelected={ select.all }
									isIndeterminate={
										! select.all && select.some
									}
									onChange={ select.onTogglePage }
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
						{ cols.map( ( c ) => {
							const next = onSort ? columnSort( c, sort ) : null;
							const state = ariaSort( c, sort );
							return (
								<th
									key={ c }
									scope="col"
									aria-sort={ next ? state : undefined }
									style={
										widths[ c ]
											? { width: widths[ c ] }
											: undefined
									}
									className="px-3 py-2 text-start font-semibold whitespace-nowrap text-fg-muted"
								>
									{ next ? (
										<button
											type="button"
											onClick={ () => onSort?.( next ) }
											className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
										>
											{ heading( c ) }
											<span aria-hidden="true">
												{
													{
														ascending: '↑',
														descending: '↓',
														none: '',
													}[ state ]
												}
											</span>
										</button>
									) : (
										heading( c )
									) }
								</th>
							);
						} ) }
					</tr>
				</thead>
				<tbody>
					{ items.map( ( item, i ) => (
						<tr
							key={ item.id }
							id={ `cd-row-${ item.id }` }
							className={ cx(
								'h-(--cd-table-row-height) border-b border-line last:border-b-0 hover:bg-sunken',
								( i === index ||
									select?.isChecked( item.id ) ) &&
									'bg-selected'
							) }
						>
							{ select && (
								<td className="px-3 py-1.5">
									<Checkbox
										isSelected={ select.isChecked(
											item.id
										) }
										onChange={ ( on ) =>
											select.onToggle( item.id, on )
										}
									>
										<span className="sr-only">
											{ sprintf(
												/* translators: 1: conversation number, 2: subject. */
												__(
													'Select #%1$d %2$s',
													'cliedesk'
												),
												item.number,
												item.subject
											) }
										</span>
									</Checkbox>
								</td>
							) }
							{ cols.map( ( c ) =>
								c === 'subject' ? (
									<td
										key={ c }
										className="max-w-md px-3 py-1.5"
									>
										<span className="flex min-w-0 items-center gap-2">
											{ item.unread && (
												<span
													aria-hidden="true"
													className="size-2 shrink-0 rounded-full bg-accent"
												/>
											) }
											<Link
												to="/c/$number"
												params={ {
													number: String(
														item.number
													),
												} }
												tabIndex={
													i === index ? 0 : -1
												}
												onFocus={ () =>
													onFocusRow( i )
												}
												data-row-link
												className={ cx(
													'min-w-0 truncate text-accent-fg underline-offset-2 hover:underline',
													item.unread &&
														'font-semibold'
												) }
											>
												{ item.unread && (
													<span className="sr-only">
														{ __(
															'Unread:',
															'cliedesk'
														) }{ ' ' }
													</span>
												) }
												<bdi>{ item.subject }</bdi>
											</Link>
											{ spam && item.spam && (
												<Pill tone="warning">
													<span className="sr-only">
														{ __(
															'Spam reason:',
															'cliedesk'
														) }{ ' ' }
													</span>
													{ spamReasonShort(
														item.spam
													) }
												</Pill>
											) }
											<PresenceDots
												others={
													presence[
														String( item.id )
													] ?? []
												}
											/>
										</span>
									</td>
								) : (
									<td
										key={ c }
										className="px-3 py-1.5 whitespace-nowrap"
									>
										<Cell
											column={ c }
											item={ item }
											assignee={ assigneeOf( item ) }
											edit={ edit }
										/>
									</td>
								)
							) }
						</tr>
					) ) }
				</tbody>
			</table>
		</div>
	);
}
