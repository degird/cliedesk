/**
 * Notification bell (APP-10) with browser notifications (APP-08): the unread count on the bell and in the tab title,
 * and a desktop notification for new items while the tab is in the background (when the person allowed it). Opening
 * a conversation reads its notifications. Rows update live through the change feed (entity type 13). The panel is a
 * lazy chunk. APP-08: a sound for new items (per device; mute; none in quiet hours), the count on the tab icon, and a
 * desktop notification for a newly assigned chat even while the tab is open.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { LoadingRegion, Popover, UnstyledButton } from '@cliedesk/ui';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Bell } from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { chime, faviconBadge, isAssigned, shouldChime } from './alerts';

const NotificationPanel = lazy(
	() =>
		import(
			/* webpackChunkName: "notifications-panel" */ './NotificationPanel'
		)
);

export interface NotificationItem {
	id: number;
	kind: string;
	title: string;
	excerpt: string;
	conversationId: number | null;
	conversationNumber: number | null;
	/** An app page to open instead of a conversation. */
	path?: string | null;
	read: boolean;
	createdAt: string;
}

interface NotificationPage {
	items: NotificationItem[];
	unread: number;
	next: number | null;
	/** APP-08: the person's quiet hours are on now (no sound). */
	quiet?: boolean;
}

export const NOTIFICATIONS_KEY = [ 'notifications' ] as const;

/**
 * The tab title with the unread count in front ("(3) Inbox").
 *
 * @param title  Current title.
 * @param unread Unread count.
 */
export function badgeTitle( title: string, unread: number ): string {
	const plain = title.replace( /^\(\d+\+?\) /, '' );
	if ( unread <= 0 ) {
		return plain;
	}
	return `(${ unread > 99 ? '99+' : unread }) ${ plain }`;
}

function canNotify(): boolean {
	return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Bell.
 */
export function NotificationBell() {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const pathname = useRouterState( { select: ( s ) => s.location.pathname } );
	const [ open, setOpen ] = useState( false );
	const [ permission, setPermission ] = useState(
		canNotify() ? window.Notification.permission : 'denied'
	);
	const q = useQuery( {
		queryKey: NOTIFICATIONS_KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< NotificationPage >( 'notifications', { signal } ) )
				.data ?? { items: [], unread: 0, next: null },
	} );
	const read = useMutation( {
		mutationFn: ( body: {
			ids?: number[];
			all?: boolean;
			conversationId?: number;
		} ) => api.post< { unread: number } >( 'notifications/read', { body } ),
		onSuccess: () =>
			void qc.invalidateQueries( { queryKey: NOTIFICATIONS_KEY } ),
	} );
	const unread = q.data?.unread ?? 0;
	const go = ( number: number | null ) => {
		if ( number ) {
			void navigate( {
				to: '/c/$number',
				params: { number: String( number ) },
			} as never );
		}
	};

	// Tab title badge.
	useEffect( () => {
		document.title = badgeTitle( document.title, unread );
		faviconBadge( unread );
	}, [ unread, pathname ] );

	// Desktop notification for items that arrive while the tab is in the background.
	const seen = useRef< number | null >( null );
	useEffect( () => {
		const list = q.data?.items ?? [];
		const newest = list.reduce( ( max, n ) => Math.max( max, n.id ), 0 );
		if ( seen.current === null ) {
			seen.current = newest; // First load: nothing is "new".
			return;
		}
		const fresh = list.filter(
			( n ) => ! n.read && n.id > ( seen.current ?? 0 )
		);
		seen.current = Math.max( seen.current, newest );
		if (
			shouldChime(
				fresh.map( ( n ) => n.kind ),
				q.data?.quiet ?? false
			)
		) {
			chime();
		}
		// In the background every new item; while the tab is open only a newly assigned chat.
		const show = document.hidden
			? fresh
			: fresh.filter( ( n ) => isAssigned( n.kind ) );
		if (
			! show.length ||
			! canNotify() ||
			window.Notification.permission !== 'granted'
		) {
			return;
		}
		for ( const n of show.slice( 0, 3 ) ) {
			const shown = new window.Notification( n.title, {
				body: n.excerpt,
				tag: `cliedesk-${ n.id }`,
			} );
			shown.onclick = () => {
				window.focus();
				go( n.conversationNumber );
				shown.close();
			};
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- go only wraps navigate.
	}, [ q.data ] );

	// Opening a conversation reads its notifications.
	useEffect( () => {
		const m = /^\/c\/(\d+)/.exec( pathname );
		if ( ! m ) {
			return;
		}
		const hit = ( q.data?.items ?? [] ).find(
			( n ) => ! n.read && String( n.conversationNumber ) === m[ 1 ]
		);
		if ( hit?.conversationId ) {
			read.mutate( { conversationId: hit.conversationId } );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- runs per page and data.
	}, [ pathname, q.data ] );

	const label =
		unread > 0
			? sprintf(
					/* translators: %d: number of unread notifications. */
					_n(
						'Notifications, %d unread',
						'Notifications, %d unread',
						unread,
						'cliedesk'
					),
					unread
				)
			: __( 'Notifications', 'cliedesk' );

	return (
		<Popover
			label={ __( 'Notifications', 'cliedesk' ) }
			placement="bottom end"
			className="w-[380px]"
			isOpen={ open }
			onOpenChange={ setOpen }
			trigger={
				<UnstyledButton
					aria-label={ label }
					className="relative flex size-9 items-center justify-center rounded-md text-fg-muted outline-none hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
				>
					<Bell aria-hidden="true" size={ 18 } />
					{ unread > 0 && (
						<span
							aria-hidden="true"
							className="absolute -end-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white"
						>
							{ unread > 99 ? '99+' : unread }
						</span>
					) }
				</UnstyledButton>
			}
		>
			<Suspense fallback={ <LoadingRegion /> }>
				<NotificationPanel
					items={ q.data?.items ?? [] }
					unread={ unread }
					onMarkAll={ () => read.mutate( { all: true } ) }
					onOpen={ ( n ) => {
						if ( ! n.read ) {
							read.mutate( { ids: [ n.id ] } );
						}
						setOpen( false );
						if ( n.path ) {
							void navigate( { to: n.path } as never );
						} else {
							go( n.conversationNumber );
						}
					} }
					onAskPermission={
						canNotify() && permission === 'default'
							? () =>
									void window.Notification.requestPermission().then(
										setPermission
									)
							: undefined
					}
				/>
			</Suspense>
		</Popover>
	);
}
