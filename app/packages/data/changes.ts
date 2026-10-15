/**
 * Change feed (plan.frontend-ux.md §4.4): one poller per browser.
 *
 * - Leader election over `BroadcastChannel('cliedesk')`: heartbeat every 5 s; a follower takes over when no
 *   heartbeat arrived for 12 s, or when the leader's tab is hidden and the follower's is visible. Two leaders
 *   resolve to the lower tab id. Without BroadcastChannel every tab polls for itself.
 * - Only the leader calls `GET changes?since=` and broadcasts the batch; followers apply it.
 * - Delay: the mode interval (lists 15 s within 10–20 s, open conversation 3 s within 2–4 s), never sooner
 *   than the server's `Poll-After`. Paused while the leader tab is hidden; one immediate poll when it shows.
 * - De-duplication by change id; invalidation through `registerEntityInvalidation( entityType, keysFn )`.
 * - `410 cliedesk_cursor_expired` → invalidate every query and restart from a fresh cursor.
 * - Proactive nonce refresh by the leader every 8 h (and on visibility when older), broadcast to all tabs.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { api, type ApiResult } from './api';
import { isApiError } from './errors';
import {
	nonceAge,
	onNonceRefreshed,
	refreshNonce,
	requestReauth,
	setNonce,
} from './session';
import { ulid } from './ulid';

export interface Change {
	id: number | string;
	entity_type: string | number;
	entity_id: number | string | null;
	op: string;
	conversation_id?: number | null;
	product_id?: number | null;
}

export type FeedMode = 'list' | 'conversation';

export const MODE_INTERVALS: Record<
	FeedMode,
	{ min: number; def: number; max: number }
> = {
	list: { min: 10, def: 15, max: 20 },
	conversation: { min: 2, def: 3, max: 4 },
};

export const HEARTBEAT_MS = 5000;
export const LEADER_TIMEOUT_MS = 12000;
export const NONCE_REFRESH_MS = 8 * 3600 * 1000;

type KeysFn = ( change: Change ) => QueryKey[];
const invalidations = new Map< string, Set< KeysFn > >();

/**
 * Register query keys to invalidate for an entity type (Free modules, Pro, third parties).
 *
 * @param entityType `entity_type` from the change feed.
 * @param keysFn     Returns query keys (prefix match) for one change.
 */
export function registerEntityInvalidation(
	entityType: string,
	keysFn: KeysFn
): () => void {
	let set = invalidations.get( entityType );
	if ( ! set ) {
		set = new Set();
		invalidations.set( entityType, set );
	}
	set.add( keysFn );
	return () => {
		set?.delete( keysFn );
	};
}

/**
 * Query keys for a batch of changes, de-duplicated (one invalidation per key per batch).
 *
 * @param changes Changes.
 */
export function keysForChanges( changes: Change[] ): QueryKey[] {
	const out = new Map< string, QueryKey >();
	for ( const change of changes ) {
		// The server sends numeric entity type codes (plan.database.md Appendix A); keys are strings.
		for ( const fn of invalidations.get( String( change.entity_type ) ) ??
			[] ) {
			for ( const key of fn( change ) ) {
				out.set( JSON.stringify( key ), key );
			}
		}
	}
	return [ ...out.values() ];
}

export type Message =
	| { type: 'heartbeat'; from: string; visible: boolean }
	| { type: 'claim'; from: string }
	| { type: 'changes'; from: string; changes: Change[] }
	| { type: 'reset'; from: string }
	| { type: 'nonce'; from: string; nonce: string };

export interface Channel {
	post: ( msg: Message ) => void;
	onMessage: ( fn: ( msg: Message ) => void ) => void;
	close: () => void;
}

/** BroadcastChannel wrapper, or null when unsupported. */
export function createBroadcastChannel( name = 'cliedesk' ): Channel | null {
	if ( typeof BroadcastChannel === 'undefined' ) {
		return null;
	}
	const bc = new BroadcastChannel( name );
	return {
		post: ( msg ) => bc.postMessage( msg ),
		onMessage: ( fn ) => {
			bc.onmessage = ( e: MessageEvent ) => fn( e.data as Message );
		},
		close: () => bc.close(),
	};
}

export type FetchChanges = (
	since: string | null
) => Promise< ApiResult< Change[] > >;

const defaultFetch: FetchChanges = ( since ) =>
	api.get< Change[] >( 'changes', { query: since ? { since } : undefined } );

export interface ChangeFeedOptions {
	queryClient?: Pick< QueryClient, 'invalidateQueries' >;
	channel?: Channel | null;
	fetchChanges?: FetchChanges;
	isVisible?: () => boolean;
	now?: () => number;
	setTimer?: ( fn: () => void, ms: number ) => unknown;
	clearTimer?: ( id: unknown ) => void;
	id?: string;
	/** Wait before claiming leadership on start (lets an existing leader answer). */
	electionDelayMs?: number;
}

type Listener = ( changes: Change[] ) => void;

export class ChangeFeed {
	readonly id: string;
	leader = false;
	cursor: string | null = null;
	mode: FeedMode = 'list';
	private seen = new Set< string >();
	private seenOrder: string[] = [];
	private lastHeartbeat: number | null = null;
	private pollTimer: unknown = null;
	private beatTimer: unknown = null;
	private pollAfter: number | null = null;
	private polling = false;
	private stopped = true;
	private listeners = new Set< Listener >();
	private offNonce: ( () => void ) | null = null;
	private o: Required<
		Omit< ChangeFeedOptions, 'queryClient' | 'channel' | 'id' >
	> & {
		queryClient?: ChangeFeedOptions[ 'queryClient' ];
		channel: Channel | null;
	};

	constructor( opts: ChangeFeedOptions = {} ) {
		this.id = opts.id ?? ulid();
		this.o = {
			queryClient: opts.queryClient,
			channel:
				opts.channel === undefined
					? createBroadcastChannel()
					: opts.channel,
			fetchChanges: opts.fetchChanges ?? defaultFetch,
			isVisible:
				opts.isVisible ??
				( () =>
					typeof document === 'undefined' ||
					document.visibilityState !== 'hidden' ),
			now: opts.now ?? ( () => Date.now() ),
			setTimer: opts.setTimer ?? ( ( fn, ms ) => setTimeout( fn, ms ) ),
			clearTimer:
				opts.clearTimer ??
				( ( id ) =>
					clearTimeout( id as ReturnType< typeof setTimeout > ) ),
			electionDelayMs: opts.electionDelayMs ?? 300,
		};
	}

	/** Start listening; claim leadership if no leader answers. */
	start(): void {
		if ( ! this.stopped ) {
			return;
		}
		this.stopped = false;
		const ch = this.o.channel;
		if ( ! ch ) {
			this.becomeLeader();
			return;
		}
		ch.onMessage( ( msg ) => this.receive( msg ) );
		this.offNonce = onNonceRefreshed( ( nonce ) =>
			ch.post( { type: 'nonce', from: this.id, nonce } )
		);
		this.lastHeartbeat = null;
		this.beatTimer = this.o.setTimer(
			() => this.tick(),
			this.o.electionDelayMs
		);
	}

	stop(): void {
		this.stopped = true;
		this.leader = false;
		this.o.clearTimer( this.pollTimer );
		this.o.clearTimer( this.beatTimer );
		this.offNonce?.();
		this.o.channel?.close();
	}

	/**
	 * Subscribe to applied change batches (after de-duplication).
	 *
	 * @param fn Listener.
	 */
	subscribe( fn: Listener ): () => void {
		this.listeners.add( fn );
		return () => {
			this.listeners.delete( fn );
		};
	}

	/**
	 * Cadence: 'conversation' while a conversation is open with an active customer, else 'list'.
	 *
	 * @param mode Mode.
	 */
	setMode( mode: FeedMode ): void {
		if ( mode !== this.mode ) {
			this.mode = mode;
			if ( this.leader ) {
				this.schedule();
			}
		}
	}

	/** Seconds until the next poll. */
	nextDelay(): number {
		const m = MODE_INTERVALS[ this.mode ];
		const base = Math.min(
			Math.max( this.pollAfter ?? m.def, m.min ),
			m.max
		);
		return Math.max( base, this.pollAfter ?? 0 );
	}

	/** The tab became visible or hidden. */
	onVisibilityChange(): void {
		if ( this.o.isVisible() ) {
			if ( this.leader ) {
				if ( nonceAge() > NONCE_REFRESH_MS ) {
					void this.refreshNonce();
				}
				void this.poll();
			} else if ( this.o.channel ) {
				this.o.channel.post( { type: 'claim', from: this.id } );
			}
		} else if ( this.leader ) {
			this.o.clearTimer( this.pollTimer );
		}
	}

	/**
	 * Apply a batch: drop seen ids, invalidate registered keys, notify listeners.
	 *
	 * @param changes Changes from the server or the leader.
	 */
	apply( changes: Change[] ): Change[] {
		const fresh = changes.filter( ( c ) => {
			const k = String( c.id );
			if ( this.seen.has( k ) ) {
				return false;
			}
			this.seen.add( k );
			this.seenOrder.push( k );
			if ( this.seenOrder.length > 2000 ) {
				this.seen.delete( this.seenOrder.shift() as string );
			}
			return true;
		} );
		if ( fresh.length ) {
			for ( const queryKey of keysForChanges( fresh ) ) {
				void this.o.queryClient?.invalidateQueries( { queryKey } );
			}
			this.listeners.forEach( ( l ) => l( fresh ) );
		}
		return fresh;
	}

	/** Cursor expired: refetch every active query. */
	reset(): void {
		this.cursor = null;
		void this.o.queryClient?.invalidateQueries();
	}

	/** One poll (leader only). */
	async poll(): Promise< void > {
		if ( ! this.leader || this.polling || this.stopped ) {
			return;
		}
		if ( ! this.o.isVisible() ) {
			return;
		}
		this.polling = true;
		this.o.clearTimer( this.pollTimer );
		try {
			const res = await this.o.fetchChanges( this.cursor );
			this.pollAfter = res.pollAfter;
			const first = this.cursor === null;
			const cursor = res.meta.cursor;
			if ( typeof cursor === 'string' || typeof cursor === 'number' ) {
				this.cursor = String( cursor );
			}
			const changes = Array.isArray( res.data ) ? res.data : [];
			if ( ! first && changes.length ) {
				const fresh = this.apply( changes );
				if ( fresh.length ) {
					this.o.channel?.post( {
						type: 'changes',
						from: this.id,
						changes: fresh,
					} );
				}
			}
		} catch ( e ) {
			if (
				isApiError( e ) &&
				e.status === 410 &&
				e.code === 'cliedesk_cursor_expired'
			) {
				this.reset();
				this.o.channel?.post( { type: 'reset', from: this.id } );
				this.polling = false;
				return this.poll();
			}
			if ( isApiError( e ) && e.retryAfter ) {
				this.pollAfter = e.retryAfter;
			}
		} finally {
			this.polling = false;
		}
		this.schedule();
	}

	private schedule(): void {
		this.o.clearTimer( this.pollTimer );
		if ( this.leader && ! this.stopped && this.o.isVisible() ) {
			this.pollTimer = this.o.setTimer(
				() => void this.poll(),
				this.nextDelay() * 1000
			);
		}
	}

	private async refreshNonce(): Promise< void > {
		const r = await refreshNonce();
		if ( ! r.ok ) {
			void requestReauth( r.reason ).catch( () => {} );
		}
	}

	private becomeLeader(): void {
		if ( this.leader ) {
			return;
		}
		this.leader = true;
		this.heartbeat();
		void this.poll();
	}

	private stepDown(): void {
		if ( ! this.leader ) {
			return;
		}
		this.leader = false;
		this.o.clearTimer( this.pollTimer );
	}

	private heartbeat(): void {
		this.o.channel?.post( {
			type: 'heartbeat',
			from: this.id,
			visible: this.o.isVisible(),
		} );
	}

	/** Heartbeat / watchdog timer. Public for tests. */
	tick(): void {
		if ( this.stopped ) {
			return;
		}
		if ( this.leader ) {
			this.heartbeat();
			if ( nonceAge() > NONCE_REFRESH_MS ) {
				void this.refreshNonce();
			}
		} else if (
			this.lastHeartbeat === null ||
			this.o.now() - this.lastHeartbeat > LEADER_TIMEOUT_MS
		) {
			this.becomeLeader();
		}
		this.o.clearTimer( this.beatTimer );
		this.beatTimer = this.o.setTimer( () => this.tick(), HEARTBEAT_MS );
	}

	/**
	 * Handle a message from another tab. Public for tests.
	 *
	 * @param msg Message.
	 */
	receive( msg: Message ): void {
		if ( msg.from === this.id || this.stopped ) {
			return;
		}
		switch ( msg.type ) {
			case 'heartbeat':
				this.lastHeartbeat = this.o.now();
				if ( this.leader && msg.from < this.id ) {
					this.stepDown(); // Two leaders: the lower id wins.
				} else if ( this.leader ) {
					this.heartbeat(); // Tell the other one we lead.
				} else if ( ! msg.visible && this.o.isVisible() ) {
					this.o.channel?.post( { type: 'claim', from: this.id } );
					this.lastHeartbeat = null;
					this.becomeLeader();
				}
				break;
			case 'claim':
				if ( this.leader && ! this.o.isVisible() ) {
					this.stepDown();
					this.lastHeartbeat = this.o.now();
				}
				break;
			case 'changes':
				this.apply( msg.changes );
				break;
			case 'reset':
				this.reset();
				break;
			case 'nonce':
				setNonce( msg.nonce, false );
				break;
		}
	}
}
