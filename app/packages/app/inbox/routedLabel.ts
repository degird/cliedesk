/**
 * Routing decisions on the timeline (RTE-21): one line per `conversation.routed` event with its reason, and for
 * "nobody available" the counts of queue members who were away, offline, assign-only or outside their hours. Reasons
 * a module adds (Pro: entry conditions, sticky, offers, re-routing) come from `registerRoutedReason()`.
 */
import { __, _n, sprintf } from '@wordpress/i18n';
import { routedReason } from './routedReasons';

type NameFor = ( id: number ) => string | null;

/**
 * Counts of unavailable agents, e.g. "2 away, 1 outside working hours".
 *
 * @param d Event data.
 */
function counts( d: Record< string, unknown > ): string {
	const n = ( v: unknown ) => Number( v ?? 0 );
	return [
		n( d.away ) > 0 &&
			/* translators: %d: number of agents. */
			sprintf( __( '%d away', 'cliedesk' ), n( d.away ) ),
		n( d.offline ) > 0 &&
			/* translators: %d: number of agents. */
			sprintf( __( '%d offline', 'cliedesk' ), n( d.offline ) ),
		n( d.assignOnly ) > 0 &&
			/* translators: %d: number of agents. */
			sprintf( __( '%d assign-only', 'cliedesk' ), n( d.assignOnly ) ),
		n( d.outsideSchedule ) > 0 &&
			sprintf(
				/* translators: %d: number of agents. */
				__( '%d outside working hours', 'cliedesk' ),
				n( d.outsideSchedule )
			),
		n( d.atCapacity ) > 0 &&
			/* translators: %d: number of agents. */
			sprintf( __( '%d at capacity', 'cliedesk' ), n( d.atCapacity ) ),
		n( d.missingSkill ) > 0 &&
			sprintf(
				/* translators: %d: number of agents. */
				__( '%d missing a skill', 'cliedesk' ),
				n( d.missingSkill )
			),
	]
		.filter( Boolean )
		.join( ', ' );
}

/**
 * One-line description of a routing decision.
 *
 * @param data    Event data (reason and details).
 * @param nameFor Agent name by id.
 */
export function describeRouted(
	data: Record< string, unknown >,
	nameFor: NameFor
): string {
	const name = ( v: unknown ) =>
		( Number( v ) > 0 ? nameFor( Number( v ) ) : null ) ??
		__( 'an agent', 'cliedesk' );
	const reason = String( data.reason ?? '' );
	const more = routedReason( reason );
	if ( more ) {
		return more( data, name );
	}
	switch ( reason ) {
		case 'round_robin':
			return sprintf(
				/* translators: %s: agent. */
				__( 'Routing: assigned to %s by round robin', 'cliedesk' ),
				name( data.userId )
			);
		case 'default_assignee':
			return sprintf(
				/* translators: %s: agent. */
				__(
					'Routing: nobody was available, so it went to the default assignee %s',
					'cliedesk'
				),
				name( data.userId )
			);
		case 'nobody_available': {
			const detail = counts( data );
			const members = Number( data.members ?? 0 );
			const base = sprintf(
				/* translators: %d: number of queue members. */
				_n(
					'Routing: nobody available (%d member)',
					'Routing: nobody available (%d members)',
					members,
					'cliedesk'
				),
				members
			);
			return detail ? `${ base }: ${ detail }` : base;
		}
		case 'default_queue':
			return __(
				'Routing: moved to the product’s default queue',
				'cliedesk'
			);
		case 'assignee_deleted':
			return __(
				'Routing: the assignee was removed, so it went back to the queue',
				'cliedesk'
			);
		case 'chat_unanswered':
		case 'chat_ended':
			return __(
				'Routing: the chat continues by email and was routed again',
				'cliedesk'
			);
		default:
			return __( 'Routing: routed again', 'cliedesk' );
	}
}
