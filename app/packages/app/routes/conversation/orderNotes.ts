/**
 * WooCommerce notes of the orders linked to a conversation (COM-13), as timeline events: read live from WooCommerce,
 * only when WooCommerce is connected and the person may view orders.
 *
 * - GET conversations/{id}/order-notes → {items: [{orderId, number, noteId, text, customer, by, createdAt}]}.
 */
import { api, can, queryOptions, useQuery } from '@cliedesk/data';
import { AUTHOR_SYSTEM, type TimelineEvent } from '../../inbox/api';
import { recordSourcesQuery } from '../../crm/records';

interface OrderNote {
	orderId: number;
	number: string;
	noteId: number;
	text: string;
	customer: boolean;
	by: string;
	createdAt: string;
}

export const orderNotesQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'conversation', id, 'order-notes' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: OrderNote[] } >(
					`conversations/${ id }/order-notes`,
					{ signal }
				)
			).data?.items ?? [],
	} );

/**
 * The linked orders' notes as timeline events (negative ids, so they never clash with Cliedesk events).
 *
 * @param id Conversation.
 */
export function useOrderNoteEvents( id: number ): TimelineEvent[] {
	const allowed = can( 'cliedesk_view_orders' );
	const sources = useQuery( { ...recordSourcesQuery(), enabled: allowed } );
	const connected = !! sources.data?.some( ( s ) => s.key === 'woo_order' );
	const notes = useQuery( {
		...orderNotesQuery( id ),
		enabled: allowed && connected,
	} );
	return ( notes.data ?? [] ).map( ( n ) => ( {
		id: -n.noteId,
		type: 'woo.order_note',
		actorType: AUTHOR_SYSTEM,
		actorId: null,
		data: {
			number: n.number,
			text: n.text,
			customer: n.customer,
			by: n.by,
		},
		timeline: true,
		createdAt: n.createdAt,
	} ) );
}
