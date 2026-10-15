/**
 * Offline-tolerant sending (APP-04): a reply or note that could not reach the server (no network) is kept on this
 * device and sent once when the connection is back, with the same Idempotency-Key, so it is never sent twice. The
 * request keeps the newest message the agent had seen (`seenMessageId`): if the conversation changed meanwhile, the
 * server holds the reply and the agent reviews the new messages first (INB-60).
 */
import { api, isApiError, ulid } from '@cliedesk/data';
import { toast } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';

const KEY = 'cliedesk:outbox';

export interface QueuedSend {
	id: string;
	path: string;
	body: Record< string, unknown >;
	at: string;
}

function read(): QueuedSend[] {
	try {
		const v: unknown = JSON.parse(
			window.localStorage.getItem( KEY ) ?? '[]'
		);
		return Array.isArray( v ) ? ( v as QueuedSend[] ) : [];
	} catch {
		return [];
	}
}

function write( items: QueuedSend[] ): void {
	try {
		window.localStorage.setItem( KEY, JSON.stringify( items ) );
	} catch {
		// Storage unavailable: nothing to keep.
	}
}

/** Unsent replies and notes on this device. */
export function queued(): QueuedSend[] {
	return read();
}

/**
 * Keep a send for later.
 *
 * @param path REST path.
 * @param body Request body.
 */
export function queueSend(
	path: string,
	body: Record< string, unknown >
): void {
	write( [
		...read(),
		{ id: ulid(), path, body, at: new Date().toISOString() },
	] );
	toast( {
		tone: 'warning',
		title: __(
			'You are offline. Your message is kept on this device and sent when you are back online.',
			'cliedesk'
		),
	} );
}

let flushing = false;

/**
 * Send what is waiting, each exactly once (same Idempotency-Key on every try).
 *
 * @return Number sent.
 */
export async function flushQueued(): Promise< number > {
	if ( flushing ) {
		return 0;
	}
	flushing = true;
	let sent = 0;
	try {
		for ( const item of read() ) {
			try {
				await api.post( item.path, {
					body: item.body,
					idempotencyKey: item.id,
				} );
				sent++;
			} catch ( e ) {
				if ( isApiError( e ) && e.isNetwork ) {
					break; // Still offline: keep the rest.
				}
				toast( {
					tone: 'danger',
					title: __(
						'A message written offline could not be sent.',
						'cliedesk'
					),
				} );
			}
			write( read().filter( ( q ) => q.id !== item.id ) );
		}
	} finally {
		flushing = false;
	}
	if ( sent ) {
		toast( {
			tone: 'success',
			title: __( 'Messages written offline were sent.', 'cliedesk' ),
		} );
	}
	return sent;
}

if ( typeof window !== 'undefined' ) {
	window.addEventListener( 'online', () => void flushQueued() );
}
