/**
 * Labels and formatting for the inbox, conversation and contact screens.
 */
import { getBoot } from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import { parseUtc } from '../workspace/api';
import {
	AUTHOR_CONTACT,
	AUTHOR_SYSTEM,
	AUTHOR_USER,
	type Priority,
	type SortKey,
	type Status,
	type TimelineEvent,
} from './api';

/**
 * Priority label.
 *
 * @param p Priority key.
 */
export function priorityLabel( p: Priority | string ): string {
	switch ( p ) {
		case 'none':
			return __( 'No priority', 'cliedesk' );
		case 'low':
			return __( 'Low', 'cliedesk' );
		case 'normal':
			return __( 'Normal', 'cliedesk' );
		case 'high':
			return __( 'High', 'cliedesk' );
		case 'urgent':
			return __( 'Urgent', 'cliedesk' );
	}
	return p;
}

/**
 * Lane label.
 *
 * @param lane Lane key.
 */
export function laneLabel( lane: string ): string {
	switch ( lane ) {
		case 'needs_work':
			return __( 'Needs work', 'cliedesk' );
		case 'waiting':
			return __( 'Waiting', 'cliedesk' );
		case 'resolved':
			return __( 'Resolved', 'cliedesk' );
		case 'closed':
			return __( 'Closed', 'cliedesk' );
	}
	return lane;
}

/**
 * Sort label.
 *
 * @param s Sort key.
 */
export function sortLabel( s: SortKey | string ): string {
	const field = /^field:([a-z0-9_]+)(:desc)?$/.exec( s );
	if ( field ) {
		const name = ( field[ 1 ] as string ).replace( /_/g, ' ' );
		return field[ 2 ]
			? sprintf(
					/* translators: %s: field name. */
					__( '%s, highest first', 'cliedesk' ),
					name
				)
			: sprintf(
					/* translators: %s: field name. */
					__( '%s, lowest first', 'cliedesk' ),
					name
				);
	}
	switch ( s ) {
		case 'priority':
			return __( 'Priority', 'cliedesk' );
		case 'waiting':
			return __( 'Waiting longest', 'cliedesk' );
		case 'later':
			return __( 'Snooze or scheduled time', 'cliedesk' );
		case 'updated':
			return __( 'Recently updated', 'cliedesk' );
		case 'created':
			return __( 'Newest', 'cliedesk' );
		case 'oldest':
			return __( 'Oldest', 'cliedesk' );
	}
	return s;
}

/** Keys of the Channel enum (Domain/Enum/Channel.php), in enum order. */
export const CHANNEL_KEYS = [
	'widget',
	'email',
	'form',
	'portal',
	'api',
	'whatsapp',
	'messenger',
	'instagram',
	'sms',
	'telegram',
	'voice',
	'review',
	'social_comment',
	'slack',
	'discord',
	'teams',
	'x',
	'custom',
	'internal',
	'forum',
];

/**
 * Channel label (keys from the Channel enum).
 *
 * @param c Channel key.
 */
export function channelLabel( c: string ): string {
	const map: Record< string, string > = {
		widget: __( 'Chat widget', 'cliedesk' ),
		email: __( 'Email', 'cliedesk' ),
		form: __( 'Form', 'cliedesk' ),
		portal: __( 'Portal', 'cliedesk' ),
		api: __( 'API', 'cliedesk' ),
		whatsapp: __( 'WhatsApp', 'cliedesk' ),
		messenger: __( 'Messenger', 'cliedesk' ),
		instagram: __( 'Instagram', 'cliedesk' ),
		sms: __( 'SMS', 'cliedesk' ),
		telegram: __( 'Telegram', 'cliedesk' ),
		voice: __( 'Voice', 'cliedesk' ),
		review: __( 'Reviews', 'cliedesk' ),
		social_comment: __( 'Social comments', 'cliedesk' ),
		slack: __( 'Slack', 'cliedesk' ),
		discord: __( 'Discord', 'cliedesk' ),
		teams: __( 'Microsoft Teams', 'cliedesk' ),
		x: __( 'X', 'cliedesk' ),
		custom: __( 'Custom channel', 'cliedesk' ),
		internal: __( 'Internal', 'cliedesk' ),
		forum: __( 'Forum', 'cliedesk' ),
	};
	return map[ c ] ?? c;
}

/**
 * Conversation source label (keys from the ConversationSource enum); unknown keys are shown as they are.
 *
 * @param s Source key.
 */
export function conversationSourceLabel( s: string ): string {
	const map: Record< string, string > = {
		widget: __( 'Chat widget', 'cliedesk' ),
		portal: __( 'Portal', 'cliedesk' ),
		form: __( 'Form', 'cliedesk' ),
		email: __( 'Email', 'cliedesk' ),
		api: __( 'API', 'cliedesk' ),
		ai_agent: __( 'AI agent', 'cliedesk' ),
		agent: __( 'Started by an agent', 'cliedesk' ),
		import: __( 'Import', 'cliedesk' ),
		workflow: __( 'Workflow', 'cliedesk' ),
		cli: __( 'Command line', 'cliedesk' ),
		channel: __( 'Messaging channel', 'cliedesk' ),
	};
	return map[ s ] ?? s;
}

/**
 * Identity type label.
 *
 * @param t Identity type key.
 */
export function identityLabel( t: string ): string {
	const map: Record< string, string > = {
		email: __( 'Email', 'cliedesk' ),
		phone: __( 'Phone', 'cliedesk' ),
		whatsapp: __( 'WhatsApp', 'cliedesk' ),
		messenger: __( 'Messenger', 'cliedesk' ),
		instagram: __( 'Instagram', 'cliedesk' ),
		telegram: __( 'Telegram', 'cliedesk' ),
		x: __( 'X', 'cliedesk' ),
		external: __( 'External ID', 'cliedesk' ),
		visitor: __( 'Visitor', 'cliedesk' ),
	};
	return map[ t ] ?? t;
}

/**
 * Link type label (from this conversation's point of view).
 *
 * @param t Link type key.
 */
/** Link types an agent can add (Split from is made by splitting). */
export const LINK_TYPES = [
	'related',
	'duplicate_of',
	'part_of',
	'caused_by',
	'blocks',
	'child_of',
];

export function linkLabel( t: string ): string {
	const map: Record< string, string > = {
		duplicate_of: __( 'Duplicate of', 'cliedesk' ),
		part_of: __( 'Part of', 'cliedesk' ),
		caused_by: __( 'Caused by', 'cliedesk' ),
		blocks: __( 'Blocks', 'cliedesk' ),
		related: __( 'Related', 'cliedesk' ),
		child_of: __( 'Child of', 'cliedesk' ),
		split_from: __( 'Split from', 'cliedesk' ),
		has_duplicate: __( 'Has duplicate', 'cliedesk' ),
		has_part: __( 'Has part', 'cliedesk' ),
		causes: __( 'Causes', 'cliedesk' ),
		blocked_by: __( 'Blocked by', 'cliedesk' ),
		parent_of: __( 'Parent of', 'cliedesk' ),
		split_into: __( 'Split into', 'cliedesk' ),
	};
	return map[ t ] ?? t.replace( /_/g, ' ' );
}

let zoneOverride: string | undefined;

/**
 * Show absolute times in another time zone (INB-39: the customer's, while a conversation is open), or the
 * browser's again with null.
 *
 * @param zone IANA time zone, or null.
 */
export function setTimeZoneOverride( zone: string | null ): void {
	zoneOverride = zone || undefined;
}

/**
 * Relative time ("5 minutes ago"), with the absolute date for older items.
 *
 * @param value Date string.
 * @param now   Now (tests).
 */
export function relativeTime(
	value: string | null,
	now: number = Date.now()
): string {
	const d = value ? parseUtc( value ) : null;
	if ( ! d ) {
		return '';
	}
	const lang =
		( typeof document !== 'undefined' && document.documentElement.lang ) ||
		undefined;
	const secs = Math.round( ( d.getTime() - now ) / 1000 );
	const abs = Math.abs( secs );
	try {
		const rtf = new Intl.RelativeTimeFormat( lang, { numeric: 'auto' } );
		if ( abs < 60 ) {
			return rtf.format( 0, 'second' );
		}
		if ( abs < 3600 ) {
			return rtf.format( Math.round( secs / 60 ), 'minute' );
		}
		if ( abs < 86400 ) {
			return rtf.format( Math.round( secs / 3600 ), 'hour' );
		}
		if ( abs < 86400 * 7 ) {
			return rtf.format( Math.round( secs / 86400 ), 'day' );
		}
		return new Intl.DateTimeFormat( lang, {
			dateStyle: 'medium',
			timeZone: zoneOverride,
		} ).format( d );
	} catch {
		return d.toISOString();
	}
}

/**
 * Full date and time (title / tooltip of relative times).
 *
 * @param value Date string.
 */
export function fullTime( value: string | null ): string {
	const d = value ? parseUtc( value ) : null;
	if ( ! d ) {
		return '';
	}
	try {
		return new Intl.DateTimeFormat(
			( typeof document !== 'undefined' &&
				document.documentElement.lang ) ||
				undefined,
			{ dateStyle: 'medium', timeStyle: 'short', timeZone: zoneOverride }
		).format( d );
	} catch {
		return d.toISOString();
	}
}

/**
 * Who did something: you, an agent's name, the customer or the system.
 *
 * @param type         Author or actor type.
 * @param id           Author id.
 * @param agentNameFor Lookup of agent names.
 * @param contactName  Name of the requester (for contact authors).
 */
export function actorName(
	type: number,
	id: number | null,
	agentNameFor: ( id: number ) => string | null,
	contactName?: string
): string {
	if ( type === AUTHOR_USER && id !== null ) {
		if ( id === getBoot().user?.id ) {
			return __( 'You', 'cliedesk' );
		}
		return (
			agentNameFor( id ) ??
			sprintf(
				/* translators: %d: user id. */
				__( 'Agent #%d', 'cliedesk' ),
				id
			)
		);
	}
	if ( type === AUTHOR_CONTACT ) {
		return contactName || __( 'Customer', 'cliedesk' );
	}
	if ( type === AUTHOR_SYSTEM ) {
		return __( 'Cliedesk', 'cliedesk' );
	}
	return __( 'Automation', 'cliedesk' );
}

/**
 * Status label by key, from the status list.
 *
 * @param key      Status key.
 * @param statuses Statuses.
 */
export function statusLabelFor(
	key: unknown,
	statuses: Status[] | undefined
): string {
	const k = String( key ?? '' );
	return statuses?.find( ( s ) => s.key === k )?.label ?? k;
}

/**
 * One-line description of a timeline event.
 *
 * @param e        Event.
 * @param actor    Actor name.
 * @param statuses Statuses (labels).
 */
export function describeEvent(
	e: TimelineEvent,
	actor: string,
	statuses: Status[] | undefined
): string {
	const d = e.data ?? {};
	switch ( e.type ) {
		// COM-13: WooCommerce order notes (read live) and notes added from Cliedesk.
		case 'woo.order_note': {
			const [ number, by, text ] = [
				String( d.number ?? '' ),
				String( d.by ?? '' ),
				String( d.text ?? '' ),
			];
			return d.customer
				? sprintf(
						/* translators: 1: order number, 2: author, 3: note. */
						__(
							'Order #%1$s, note to customer by %2$s: %3$s',
							'cliedesk'
						),
						number,
						by,
						text
					)
				: sprintf(
						/* translators: 1: order number, 2: author, 3: note. */
						__(
							'Order #%1$s, private note by %2$s: %3$s',
							'cliedesk'
						),
						number,
						by,
						text
					);
		}
		case 'order.note_added':
			return d.customer
				? sprintf(
						/* translators: 1: person, 2: order number. */
						__(
							'%1$s added a note for the customer to order #%2$s',
							'cliedesk'
						),
						actor,
						String( d.number ?? '' )
					)
				: sprintf(
						/* translators: 1: person, 2: order number. */
						__(
							'%1$s added a private note to order #%2$s',
							'cliedesk'
						),
						actor,
						String( d.number ?? '' )
					);
		case 'conversation.created':
			return sprintf(
				/* translators: %s: person. */
				__( '%s started the conversation', 'cliedesk' ),
				actor
			);
		case 'conversation.status_changed':
			return sprintf(
				/* translators: 1: person, 2: new status. */
				__( '%1$s changed the status to %2$s', 'cliedesk' ),
				actor,
				statusLabelFor( d.to, statuses )
			);
		case 'conversation.priority_changed':
			return sprintf(
				/* translators: 1: person, 2: new priority. */
				__( '%1$s changed the priority to %2$s', 'cliedesk' ),
				actor,
				priorityLabel( String( d.to ?? '' ) )
			);
		case 'conversation.subject_changed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s changed the subject', 'cliedesk' ),
				actor
			);
		case 'conversation.assigned':
			return sprintf(
				/* translators: %s: person. */
				__( '%s changed the assignee', 'cliedesk' ),
				actor
			);
		case 'conversation.tags_changed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s changed the tags', 'cliedesk' ),
				actor
			);
		case 'conversation.fields_changed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s changed fields', 'cliedesk' ),
				actor
			);
		case 'conversation.type_changed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s changed the type', 'cliedesk' ),
				actor
			);
		case 'message.redacted':
			return sprintf(
				/* translators: %s: person. */
				__( '%s redacted part of a message', 'cliedesk' ),
				actor
			);
		case 'conversation.merged':
		case 'conversation.merged_into':
			return sprintf(
				/* translators: %s: person. */
				__( '%s merged conversations', 'cliedesk' ),
				actor
			);
		case 'conversation.merge_undone':
		case 'conversation.unmerged':
			return sprintf(
				/* translators: %s: person. */
				__( '%s undid a merge', 'cliedesk' ),
				actor
			);
		case 'conversation.cc_added':
			return sprintf(
				/* translators: %s: person. */
				__( '%s added a CC', 'cliedesk' ),
				actor
			);
		case 'conversation.cc_removed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s removed a CC', 'cliedesk' ),
				actor
			);
		case 'conversation.product_changed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s changed the product', 'cliedesk' ),
				actor
			);
		case 'conversation.agent_added':
			return sprintf(
				/* translators: %s: person. */
				__( '%s added an agent', 'cliedesk' ),
				actor
			);
		case 'conversation.agent_removed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s removed an agent', 'cliedesk' ),
				actor
			);
		case 'conversation.follower_added':
			return sprintf(
				/* translators: %s: person. */
				__( '%s started following', 'cliedesk' ),
				actor
			);
		case 'conversation.follower_removed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s stopped following', 'cliedesk' ),
				actor
			);
		case 'conversation.linked':
			return sprintf(
				/* translators: %s: person. */
				__( '%s linked a conversation', 'cliedesk' ),
				actor
			);
		case 'conversation.unlinked':
			return sprintf(
				/* translators: %s: person. */
				__( '%s removed a link', 'cliedesk' ),
				actor
			);
		case 'conversation.requester_changed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s changed the customer', 'cliedesk' ),
				actor
			);
		case 'checklist.attached':
			return sprintf(
				/* translators: %s: person. */
				__( '%s added a checklist', 'cliedesk' ),
				actor
			);
		case 'checklist.item_added':
			return sprintf(
				/* translators: %s: person. */
				__( '%s added a checklist item', 'cliedesk' ),
				actor
			);
		case 'checklist.item_done':
			return sprintf(
				/* translators: %s: person. */
				__( '%s ticked a checklist item', 'cliedesk' ),
				actor
			);
		case 'checklist.item_undone':
			return sprintf(
				/* translators: %s: person. */
				__( '%s unticked a checklist item', 'cliedesk' ),
				actor
			);
		case 'checklist.item_removed':
			return sprintf(
				/* translators: %s: person. */
				__( '%s removed a checklist item', 'cliedesk' ),
				actor
			);
		case 'conversation.episode_started':
			return __( 'The conversation was reopened', 'cliedesk' );
		case 'csat.offered':
			return __( 'A satisfaction survey was sent', 'cliedesk' );
		case 'csat.received': {
			if ( d.hidden ) {
				return __( 'The customer rated the conversation', 'cliedesk' );
			}
			let max = 5;
			if ( d.scale === 'faces3' ) {
				max = 3;
			} else if ( d.scale === 'thumbs' ) {
				max = 2;
			}
			const text = sprintf(
				/* translators: 1: rating, 2: highest rating. */
				__( 'The customer rated it %1$d of %2$d', 'cliedesk' ),
				Number( d.rating ),
				max
			);
			return [
				text,
				d.positive
					? __( '(positive)', 'cliedesk' )
					: __( '(negative)', 'cliedesk' ),
				d.comment ? __( 'with a comment', 'cliedesk' ) : '',
			]
				.filter( Boolean )
				.join( ' ' );
		}
		case 'conversation.split':
			return sprintf(
				/* translators: %s: person. */
				__( '%s split the conversation', 'cliedesk' ),
				actor
			);
	}
	// COM-45: commerce actions carry a translated "what" (or a failure reason).
	if ( e.type.startsWith( 'commerce.' ) && ( d.what || d.reason ) ) {
		return d.what
			? `${ actor } ${ String( d.what ) }`
			: sprintf(
					/* translators: 1: person, 2: reason. */
					__( '%1$s: action failed. %2$s', 'cliedesk' ),
					actor,
					String( d.reason )
				);
	}
	return sprintf(
		/* translators: 1: person, 2: event name. */
		__( '%1$s: %2$s', 'cliedesk' ),
		actor,
		e.type.replace( /^conversation\./, '' ).replace( /_/g, ' ' )
	);
}
