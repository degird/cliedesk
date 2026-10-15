/**
 * Tracking of one order in the Orders card (COM-05, COM-12, Free): shipments from tracking plugins (carrier, number
 * with its tracking page, status, last event, expected delivery), "No tracking" when there are none, and "Send
 * tracking link", which replies to the customer with a card for the latest shipment. The button is disabled with the
 * reason when the order has no shipment (or no tracking page).
 *
 * - GET orders/{id}/tracking → {items, latest, state, eta, late}.
 * - POST conversations/{id}/tracking-link {orderId}; needs `cliedesk_reply_conversations`.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, LoadingRegion } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ExternalLink } from 'lucide-react';
import { formatRecordDate, safeUrl } from '../../crm/records';
import { ActionError, Muted, Pill } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

export interface Shipment {
	source: string;
	carrier: string;
	number: string;
	url: string | null;
	status: string;
	statusLabel: string;
	shippedAt: string | null;
	eta: string | null;
	lastEvent: { text: string; at: string | null; location: string } | null;
}

export interface Tracking {
	items: Shipment[];
	latest: Shipment | null;
	state: string;
	eta: string | null;
	late: boolean;
}

/**
 * Why the tracking link cannot be sent, or null when it can.
 *
 * @param t Tracking.
 */
export function trackingBlocked( t: Tracking ): string | null {
	if ( ! t.latest ) {
		return __(
			'This order has no shipment yet, so there is no tracking link to send.',
			'cliedesk'
		);
	}
	return t.latest.url
		? null
		: __(
				'The latest shipment has no tracking page to link to.',
				'cliedesk'
			);
}

/**
 * Tracking panel of an order.
 *
 * @param props                Props.
 * @param props.orderId        Order id.
 * @param props.conversationId Conversation the link is sent in.
 */
export default function OrderTracking( {
	orderId,
	conversationId,
}: {
	orderId: string;
	conversationId: number;
} ) {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'orders', 'tracking', orderId ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< Tracking >( `orders/${ orderId }/tracking`, {
					signal,
				} )
			).data as Tracking,
	} );
	const send = useMutation( {
		mutationFn: () =>
			api.post( `conversations/${ conversationId }/tracking-link`, {
				body: { orderId: Number( orderId ) },
			} ),
		onSuccess: () => {
			announceResult( __( 'Tracking link sent.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'conversation', conversationId ],
			} );
		},
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const t = q.data;
	const blocked = trackingBlocked( t );
	return (
		<div className="flex flex-col gap-2 pt-2">
			{ t.items.length === 0 ? (
				<Muted>{ __( 'No tracking', 'cliedesk' ) }</Muted>
			) : (
				<ul className="flex flex-col gap-2">
					{ t.items.map( ( s ) => {
						const href = safeUrl( s.url );
						return (
							<li
								key={ `${ s.source }-${ s.number }` }
								className="flex flex-col gap-0.5"
							>
								<span className="flex flex-wrap items-center gap-2">
									<span className="font-medium">
										{ s.carrier }
									</span>
									{ href ? (
										<a
											href={ href }
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 underline"
										>
											{ s.number }
											<ExternalLink
												size={ 12 }
												aria-hidden
											/>
											<span className="sr-only">
												{ __(
													'(opens the tracking page)',
													'cliedesk'
												) }
											</span>
										</a>
									) : (
										<span>{ s.number }</span>
									) }
									<Pill>{ s.statusLabel }</Pill>
								</span>
								{ s.lastEvent && (
									<span className="text-xs text-fg-muted">
										{ [
											s.lastEvent.text,
											s.lastEvent.location,
											s.lastEvent.at
												? formatRecordDate(
														s.lastEvent.at
													)
												: '',
										]
											.filter( Boolean )
											.join( ' · ' ) }
									</span>
								) }
								{ s.eta && (
									<span className="text-xs text-fg-muted">
										{ sprintf(
											/* translators: %s: date. */
											__( 'Expected by %s', 'cliedesk' ),
											formatRecordDate( s.eta )
										) }
									</span>
								) }
							</li>
						);
					} ) }
				</ul>
			) }
			{ t.late && (
				<p className="text-xs text-danger">
					{ __(
						'The expected delivery date has passed.',
						'cliedesk'
					) }
				</p>
			) }
			{ can( 'cliedesk_reply_conversations' ) && (
				<div className="flex flex-col gap-1">
					<ActionError error={ send.error } />
					<Button
						size="sm"
						variant="secondary"
						className="self-start"
						isDisabled={ blocked !== null }
						isLoading={ send.isPending }
						onPress={ () => send.mutate() }
						aria-describedby={
							blocked ? `cd-track-why-${ orderId }` : undefined
						}
					>
						{ __( 'Send tracking link', 'cliedesk' ) }
					</Button>
					{ blocked && (
						<span
							id={ `cd-track-why-${ orderId }` }
							className="text-xs text-fg-muted"
						>
							{ blocked }
						</span>
					) }
				</div>
			) }
		</div>
	);
}
