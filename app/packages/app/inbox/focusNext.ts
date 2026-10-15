/**
 * Focus mode (INB-28): after an agent in focus mode resolves a conversation, the next one opens at once. Free:
 * routing gives out what waits in round-robin queues and the agent's next live conversation opens; Pro answers with
 * Get next from the agent's queues (RTE-22). Outside focus mode nothing happens.
 */
import { api } from '@cliedesk/data';

type Go = ( number: number ) => void;

/**
 * Open the next conversation when focus mode is on.
 *
 * @param go Navigate to a conversation number.
 * @return Whether a next conversation was opened.
 */
export async function focusNextAfterResolve( go: Go ): Promise< boolean > {
	try {
		const focus = ( await api.get< { on: boolean } >( 'me/focus' ) ).data;
		if ( ! focus?.on ) {
			return false;
		}
		const r = await api.post< { number: number | null } >(
			'me/focus/next',
			{ body: {} }
		);
		if ( r.data?.number ) {
			go( r.data.number );
			return true;
		}
	} catch {
		// Not online or nothing to take: stay on the resolved conversation.
	}
	return false;
}
