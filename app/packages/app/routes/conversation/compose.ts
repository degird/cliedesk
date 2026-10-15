/**
 * Composer helpers shared by the composer, the timeline and the forward dialog.
 *
 * - Send split-button (INB-49): `then: {action, status?, snoozeUntil?, assigneeId?}` on POST …/replies. The default
 *   choice comes from GET …/drafts → `postSend`.
 * - Reply to one message (INB-46): `parentId`; replies carry `meta.replyTo {id, excerpt, authorType, authorId, at}`.
 * - CC / BCC (INB-47): `cc` and `bcc` arrays; sent replies carry `meta.recipients {cc, bcc}`; server errors name
 *   the address as `cc.N` / `bcc.N`.
 * - Forward (INB-47, INB-48): kind `forward` messages carry `meta.forward {to, cc, messageIds}`.
 *
 * The timeline and the conversation header talk to the composer and the forward dialog through two small stores.
 */
import { createStore } from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import type { Message } from '../../inbox/api';
import { utcValue } from '../../inbox/snooze';

export type PostSend = 'send' | 'resolve' | 'wait' | 'snooze';
export const POST_SEND: PostSend[] = [ 'send', 'resolve', 'wait', 'snooze' ];

/**
 * Whether a value is a send choice.
 *
 * @param v Value.
 */
export const isPostSend = ( v: unknown ): v is PostSend =>
	typeof v === 'string' && ( POST_SEND as string[] ).includes( v );

/**
 * Label of a send choice (menu items and the team setting).
 *
 * @param a Choice.
 */
export function postSendLabel( a: PostSend ): string {
	switch ( a ) {
		case 'resolve':
			return __( 'Send & resolve', 'cliedesk' );
		case 'wait':
			return __( 'Send & wait for the customer', 'cliedesk' );
		case 'snooze':
			return __( 'Send & snooze…', 'cliedesk' );
		default:
			return __( 'Send', 'cliedesk' );
	}
}

/** Who gets the conversation after sending: keep it as is, me, nobody, or a person. */
export type AfterAssignee = 'keep' | 'me' | 'none' | number;

/**
 * The `then` body of a reply, or undefined when it adds nothing (plain Send, assignee kept).
 *
 * @param action      Choice.
 * @param assignee    After-send assignee.
 * @param snoozeUntil Wake-up time (UTC) for Send & snooze.
 */
export function thenBody(
	action: PostSend,
	assignee: AfterAssignee,
	snoozeUntil?: string
): Record< string, unknown > | undefined {
	const out: Record< string, unknown > = { action };
	if ( action === 'snooze' && snoozeUntil ) {
		out.snoozeUntil = snoozeUntil;
	}
	if ( assignee === 'me' ) {
		out.assigneeId = 0;
	} else if ( assignee === 'none' ) {
		out.assigneeId = null;
	} else if ( typeof assignee === 'number' ) {
		out.assigneeId = assignee;
	}
	if ( action === 'send' && ! ( 'assigneeId' in out ) ) {
		return undefined;
	}
	return out;
}

/**
 * Send & snooze presets: tomorrow at 9:00 and next Monday at 9:00 (local time).
 *
 * @param now Now.
 */
export function postSendPresets( now: Date ): {
	tomorrow: Date;
	monday: Date;
} {
	const tomorrow = new Date( now );
	tomorrow.setDate( tomorrow.getDate() + 1 );
	tomorrow.setHours( 9, 0, 0, 0 );
	const monday = new Date( now );
	monday.setDate( monday.getDate() + ( ( 8 - now.getDay() ) % 7 || 7 ) );
	monday.setHours( 9, 0, 0, 0 );
	return { tomorrow, monday };
}

export { utcValue };

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * Whether a string looks like an email address (the server checks again).
 *
 * @param s Text.
 */
export const isEmail = ( s: string ): boolean => EMAIL.test( s.trim() );

/**
 * Addresses typed or pasted into an address field (commas, semicolons, spaces and new lines separate them).
 *
 * @param input Text.
 */
export function splitEmails( input: string ): string[] {
	return input
		.split( /[\s,;]+/ )
		.map( ( s ) => s.trim().replace( /^<|>$/g, '' ) )
		.filter( Boolean );
}

/**
 * CHN-22: quick-reply button labels, one per line (at most 10, no duplicates).
 *
 * @param value Text.
 */
export function buttonList( value: string | null ): string[] {
	return [
		...new Set(
			( value ?? '' )
				.split( '\n' )
				.map( ( s ) => s.trim().slice( 0, 80 ) )
				.filter( Boolean )
		),
	].slice( 0, 10 );
}

/**
 * Per-address server errors of a list field (`cc.1` → {1: message}).
 *
 * @param fields Field errors of the API.
 * @param prefix List field (cc, bcc, to).
 */
export function indexErrors(
	fields: Record< string, string >,
	prefix: string
): Record< number, string > {
	const out: Record< number, string > = {};
	for ( const [ k, msg ] of Object.entries( fields ) ) {
		const m = new RegExp( `^${ prefix }\\.(\\d+)$` ).exec( k );
		if ( m ) {
			out[ Number( m[ 1 ] ) ] = msg;
		}
	}
	return out;
}

export interface ReplyTo {
	id: number;
	excerpt: string;
	authorType: number;
	authorId: number | null;
	at: string;
}

/**
 * The quoted message of a reply (meta.replyTo), or null.
 *
 * @param m Message.
 */
export function replyToOf( m: Message ): ReplyTo | null {
	const r = m.meta?.replyTo as Partial< ReplyTo > | undefined;
	if ( ! r || typeof r !== 'object' || typeof r.id !== 'number' ) {
		return null;
	}
	return {
		id: r.id,
		excerpt: typeof r.excerpt === 'string' ? r.excerpt : '',
		authorType: typeof r.authorType === 'number' ? r.authorType : 0,
		authorId: typeof r.authorId === 'number' ? r.authorId : null,
		at: typeof r.at === 'string' ? r.at : '',
	};
}

const strings = ( v: unknown ): string[] =>
	Array.isArray( v )
		? v.filter( ( x ): x is string => typeof x === 'string' )
		: [];

/**
 * CC and BCC of a sent reply (meta.recipients), or null when it had none.
 *
 * @param m Message.
 */
export function recipientsOf(
	m: Message
): { cc: string[]; bcc: string[] } | null {
	const r = m.meta?.recipients as Record< string, unknown > | undefined;
	if ( ! r || typeof r !== 'object' ) {
		return null;
	}
	const cc = strings( r.cc );
	const bcc = strings( r.bcc );
	return cc.length || bcc.length ? { cc, bcc } : null;
}

/**
 * Who a forward went to (meta.forward of a kind `forward` message), or null.
 *
 * @param m Message.
 */
export function forwardOf(
	m: Message
): { to: string[]; cc: string[]; count: number } | null {
	if ( m.kind !== 'forward' ) {
		return null;
	}
	const f = ( m.meta?.forward ?? {} ) as Record< string, unknown >;
	return {
		to: strings( f.to ),
		cc: strings( f.cc ),
		count: Array.isArray( f.messageIds ) ? f.messageIds.length : 0,
	};
}

/**
 * A short excerpt of a message for the quote chip.
 *
 * @param m   Message.
 * @param max Most characters.
 */
export function excerptOf( m: Message, max = 140 ): string {
	const t = ( m.text ?? '' ).replace( /\s+/g, ' ' ).trim();
	return t.length > max ? `${ t.slice( 0, max - 1 ).trimEnd() }…` : t;
}

/**
 * "Forwarded to a, b" (plus the CCs).
 *
 * @param f Forward details.
 */
export function forwardSummary( f: { to: string[]; cc: string[] } ): string {
	const to = f.to.join( ', ' );
	return f.cc.length
		? sprintf(
				/* translators: 1: email addresses, 2: email addresses copied. */
				__( 'Forwarded to %1$s (Cc: %2$s)', 'cliedesk' ),
				to,
				f.cc.join( ', ' )
			)
		: sprintf(
				/* translators: %s: email addresses. */
				__( 'Forwarded to %s', 'cliedesk' ),
				to
			);
}

export interface ReplyTarget {
	id: number;
	excerpt: string;
	author: string;
}

/** "Reply to this" from the timeline: the message the reply composer quotes. */
export const replyTargetStore = createStore< {
	conversationId: number;
	target: ReplyTarget;
	/** Increases with every request, so asking twice still focuses the editor. */
	seq: number;
} | null >( null );

/**
 * Ask the composer to reply to one message.
 *
 * @param conversationId Conversation.
 * @param target         Message.
 */
export function replyTo( conversationId: number, target: ReplyTarget ): void {
	replyTargetStore.set( ( prev ) => ( {
		conversationId,
		target,
		seq: ( prev?.seq ?? 0 ) + 1,
	} ) );
}

/** The forward dialog: the conversation and, when forwarding one message, its id. */
/** INB-41: the chat reply being edited (`last`: my last chat reply, from ↑ in an empty composer). */
export const editReplyStore = createStore< {
	conversationId: number;
	messageId: number | 'last';
} | null >( null );

export const forwardStore = createStore< {
	conversationId: number;
	messageId: number | null;
} | null >( null );
