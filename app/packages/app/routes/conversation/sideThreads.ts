/**
 * Side threads (INB-61): emailing outside people from a conversation is Cliedesk Pro (answers come back through a
 * mailbox, FPS-10). Free still shows side-thread messages that exist (internal, never to the customer) and lists the
 * threads in the side panel; Pro fills the slots `composer.side_thread` (the composer tab),
 * `conversation.side_thread.dialog` (More → Side thread…) and `message.side_thread` (who is in a thread, Answer), which
 * get `conversationEmailKit` as their `kit` prop.
 */
import type { Message } from '../../inbox/api';
import { conversationKeys } from '../../inbox/api';
import { ActionError } from '../../inbox/components';
import { htmlToText, textToHtml } from '../../inbox/html';
import { EmailChips } from './EmailChips';

/**
 * People and subject of a side thread's first message.
 *
 * @param m Message.
 */
export function sideThreadOf(
	m: Pick< Message, 'kind' | 'meta' >
): { people: string[]; subject: string } | null {
	const s = m.kind === 'side_thread' ? m.meta?.sideThread : null;
	if ( ! s || typeof s !== 'object' ) {
		return null;
	}
	const v = s as { people?: unknown; subject?: unknown };
	return {
		people: Array.isArray( v.people ) ? v.people.map( String ) : [],
		subject: typeof v.subject === 'string' ? v.subject : '',
	};
}

/**
 * The pieces of Free's conversation screen that Pro's email fills (side threads, the email source and the sender
 * check notices) receive as the `kit` fill prop.
 */
export const conversationEmailKit = {
	ActionError,
	EmailChips,
	conversationKeys,
	htmlToText,
	textToHtml,
	sideThreadOf,
};

export type ConversationEmailKit = typeof conversationEmailKit;
