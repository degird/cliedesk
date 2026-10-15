/**
 * Conversation tabs, split view and the related list (INB-12). Its own chunk, loaded after the conversation.
 *
 * - Tabs (a list with the current one marked): the conversations the agent keeps open (inbox/tabs.ts). Each tab shows the customer's live state, read
 *   for all tabs at once every 5 seconds (GET conversation-tabs?numbers[]=…): typing, online in the chat, and how
 *   long they have waited. Closing the current tab opens the next one.
 * - Split view: a second conversation side by side (`?with=1043`).
 * - Related list: a compact list of the rest of the view the agent came from, in the same sort.
 */
import { api, useQuery } from '@cliedesk/data';
import { Button, cx } from '@cliedesk/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchInboxPage, type ListSort } from '../../inbox/api';
import { shortDuration } from '../../inbox/components';
import {
	closeTab,
	currentList,
	getTabs,
	openTab,
	subscribeTabs,
} from '../../inbox/tabs';

export interface TabState {
	id: number;
	number: number;
	subject: string;
	customer: string;
	open: boolean;
	online: boolean;
	typing: boolean;
	waitingSince: string | null;
	agents: string[];
}

/** Poll interval of the tab states (one widget poll cycle). */
export const TABS_POLL = 5000;

/**
 * Seconds since a UTC MySQL time.
 *
 * @param at  Time.
 * @param now Now (ms).
 */
function since( at: string, now: number ): number {
	const t = Date.parse(
		at.replace( ' ', 'T' ) + ( at.endsWith( 'Z' ) ? '' : 'Z' )
	);
	return Number.isNaN( t )
		? 0
		: Math.max( 0, Math.round( ( now - t ) / 1000 ) );
}

/**
 * The live line of a tab: typing, online, or waiting time.
 *
 * @param s   State.
 * @param now Now (ms).
 */
export function tabStatus( s: TabState, now: number = Date.now() ): string {
	if ( s.typing ) {
		return __( 'Typing…', 'cliedesk' );
	}
	const wait = s.waitingSince
		? sprintf(
				/* translators: %s: short duration, e.g. 5m. */
				__( 'waiting %s', 'cliedesk' ),
				shortDuration( since( s.waitingSince, now ) )
			)
		: '';
	if ( s.online ) {
		return wait
			? sprintf(
					/* translators: %s: waiting time, e.g. "waiting 5m". */
					__( 'Online, %s', 'cliedesk' ),
					wait
				)
			: __( 'Online', 'cliedesk' );
	}
	return wait;
}

function useTabs(): number[] {
	return useSyncExternalStore( subscribeTabs, getTabs, getTabs );
}

/**
 * The tab bar.
 *
 * @param props           Props.
 * @param props.current   Conversation shown.
 * @param props.with      Conversation shown next to it (split view).
 * @param props.related   Related list shown.
 * @param props.onRelated Toggle the related list.
 */
export function ConversationTabs( {
	current,
	with: other,
	related,
	onRelated,
}: {
	current: number;
	with: number | null;
	related: boolean;
	onRelated: () => void;
} ) {
	const navigate = useNavigate();
	const tabs = useTabs();
	useEffect( () => openTab( current ), [ current ] );
	const states = useQuery( {
		queryKey: [ 'conversation-tabs', tabs.join( ',' ) ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: TabState[] } >( 'conversation-tabs', {
					query: { numbers: tabs },
					signal,
				} )
			).data?.items ?? [],
		enabled: tabs.length > 0,
		refetchInterval: TABS_POLL,
		retry: false,
	} );
	const byNumber = new Map(
		( states.data ?? [] ).map( ( s ) => [ s.number, s ] )
	);
	const go = ( n: number, w: number | null = other ) =>
		void navigate( {
			to: '/c/$number',
			params: { number: String( n ) },
			search: ( w && w !== n ? { with: w } : {} ) as never,
		} );
	const close = ( n: number ) => {
		const rest = tabs.filter( ( x ) => x !== n );
		closeTab( n );
		if ( n === current && rest.length ) {
			go( rest[ rest.length - 1 ] as number );
		} else if ( n === other ) {
			go( current, null );
		}
	};
	const now = Date.now();
	return (
		<div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
			<ul
				aria-label={ __( 'Open conversations', 'cliedesk' ) }
				className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
			>
				{ tabs.map( ( n ) => {
					const s = byNumber.get( n );
					const selected = n === current || n === other;
					const status = s ? tabStatus( s, now ) : '';
					return (
						<li
							key={ n }
							className={ cx(
								'flex max-w-60 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-sm',
								selected
									? 'border-accent bg-accent-subtle'
									: 'border-line'
							) }
						>
							<button
								type="button"
								aria-current={ selected ? 'page' : undefined }
								className="flex min-w-0 flex-col text-start"
								onClick={ () =>
									n !== current &&
									go( n, other === n ? null : other )
								}
							>
								<span className="truncate font-medium">
									{ s?.subject
										? sprintf(
												/* translators: 1: number, 2: subject. */
												__( '#%1$d %2$s', 'cliedesk' ),
												n,
												s.subject
											)
										: `#${ n }` }
								</span>
								<span className="flex items-center gap-1 truncate text-xs text-fg-muted">
									{ s?.online && (
										<span
											aria-hidden="true"
											className="inline-block size-2 rounded-full bg-success"
										/>
									) }
									{ s?.customer }
									{ status && (
										<span
											data-testid={ `tab-status-${ n }` }
										>
											{ ' · ' + status }
										</span>
									) }
								</span>
							</button>
							<button
								type="button"
								className="rounded p-0.5 text-fg-muted hover:bg-surface-sunken"
								aria-label={ sprintf(
									/* translators: %d: conversation number. */
									__( 'Close tab #%d', 'cliedesk' ),
									n
								) }
								onClick={ () => close( n ) }
							>
								<X aria-hidden="true" size={ 14 } />
							</button>
						</li>
					);
				} ) }
			</ul>
			<SplitPicker
				tabs={ tabs.filter( ( n ) => n !== current ) }
				value={ other }
				onChange={ ( w ) => go( current, w ) }
			/>
			<Button size="sm" onPress={ onRelated } aria-pressed={ related }>
				{ related
					? __( 'Hide list', 'cliedesk' )
					: __( 'Show list', 'cliedesk' ) }
			</Button>
		</div>
	);
}

function SplitPicker( {
	tabs,
	value,
	onChange,
}: {
	tabs: number[];
	value: number | null;
	onChange: ( n: number | null ) => void;
} ) {
	if ( value ) {
		return (
			<Button size="sm" onPress={ () => onChange( null ) }>
				{ __( 'Close split view', 'cliedesk' ) }
			</Button>
		);
	}
	return (
		<span className="flex items-center gap-1 text-sm">
			<label htmlFor="cd-split-with">
				{ __( 'Split view with', 'cliedesk' ) }
			</label>
			<select
				id="cd-split-with"
				className="rounded-md border border-line bg-surface px-2 py-1"
				value=""
				disabled={ tabs.length === 0 }
				onChange={ ( e ) =>
					onChange( Number( e.target.value ) || null )
				}
			>
				<option value="">{ __( 'Choose a tab', 'cliedesk' ) }</option>
				{ tabs.map( ( n ) => (
					<option key={ n } value={ n }>
						{ `#${ n }` }
					</option>
				) ) }
			</select>
		</span>
	);
}

/**
 * The rest of the view the agent came from, in the same sort (first page).
 *
 * @param props         Props.
 * @param props.current Conversation shown.
 */
export function RelatedList( { current }: { current: number } ) {
	const [ list ] = useState( currentList );
	const view = list?.view ?? 'my_open';
	const sort = ( list?.sort ?? null ) as ListSort | null;
	const q = useQuery( {
		queryKey: [ 'inbox', 'related', view, sort ] as const,
		queryFn: ( { signal } ) => fetchInboxPage( view, sort, null, signal ),
		staleTime: 30000,
	} );
	const items = ( q.data?.items ?? [] ).filter(
		( i ) => i.number !== current
	);
	return (
		<nav
			aria-label={
				list?.name ?? __( 'Related conversations', 'cliedesk' )
			}
			className="flex w-64 shrink-0 flex-col gap-1 text-sm"
		>
			<h2 className="font-semibold">
				{ list?.name ?? __( 'Related conversations', 'cliedesk' ) }
			</h2>
			{ q.isPending && (
				<p className="text-fg-muted">
					{ __( 'Loading…', 'cliedesk' ) }
				</p>
			) }
			{ q.isSuccess && items.length === 0 && (
				<p className="text-fg-muted">
					{ __( 'No other conversations in this view.', 'cliedesk' ) }
				</p>
			) }
			<ul className="flex flex-col divide-y divide-line">
				{ items.map( ( i ) => (
					<li key={ i.id }>
						<Link
							to="/c/$number"
							params={ { number: String( i.number ) } }
							className="flex flex-col py-1.5 hover:bg-surface-sunken"
						>
							<span className="truncate">{ i.subject }</span>
							<span className="truncate text-xs text-fg-muted">
								{ `#${ i.number } · ${ i.requesterName }` }
							</span>
						</Link>
					</li>
				) ) }
			</ul>
		</nav>
	);
}
