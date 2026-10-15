/**
 * "Orders" in the conversation side panel (COM-02, Free): the requester's WooCommerce orders, read live. A header
 * with paid orders, lifetime value and average order value; the orders linked to this conversation pinned on top;
 * then every order newest first, 10 a page with no cap. Each order shows number, status, total, date, items,
 * payment and shipping, and opens in WooCommerce.
 *
 * - Shown only with WooCommerce connected (the `woo_order` record source) and `cliedesk_view_orders`.
 * - GET contacts/{id}/orders?conversationId=&page= → {pinned, items, page, pages, total, stats}.
 * - COM-13: "Add note" on an order (private, or for the customer: WooCommerce emails it); needs
 *   `cliedesk_run_commerce_actions`. POST orders/{id}/notes {text, customer, conversationId}.
 * - COM-05, COM-12: "Tracking" on an order shows its shipments and "Send tracking link" (OrderTracking).
 * - COM-11: "Resend email" (confirmation, invoice, shipped, download) with a preview first; same capability.
 */
import {
	api,
	can,
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, Checkbox, LoadingRegion, Slot, TextField } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { ExternalLink } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import {
	formatAmount,
	formatRecordDate,
	recordSourcesQuery,
	safeUrl,
	type ExternalRecord,
} from '../../crm/records';
import type { Conversation } from '../../inbox/api';
import { ActionError, Muted, PanelSection, Pill } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';
import OrderTracking from './OrderTracking';

// COM-11: resend an order email (preview, then confirm).
const OrderResendEmail = lazy(
	() =>
		import(
			/* webpackChunkName: "order-resend-email" */ './OrderResendEmail'
		)
);
// COM-04, COM-06, COM-08: link / unlink, mapped meta fields and quick links of an order.
const OrderExtras = lazy(
	() => import( /* webpackChunkName: "order-extras" */ './OrderExtras' )
);

interface OrdersPanel {
	pinned: ExternalRecord[];
	items: ExternalRecord[];
	page: number;
	pages: number;
	total: number;
	stats: {
		orders: number;
		spent: number;
		average: number;
		currency: string;
	};
}

function NoteForm( {
	orderId,
	conversationId,
	onDone,
}: {
	orderId: string;
	conversationId: number;
	onDone: () => void;
} ) {
	const qc = useQueryClient();
	const [ text, setText ] = useState( '' );
	const [ customer, setCustomer ] = useState( false );
	const save = useMutation( {
		mutationFn: () =>
			api.post( `orders/${ orderId }/notes`, {
				body: { text, customer, conversationId },
			} ),
		onSuccess: () => {
			announceResult( __( 'Note added to the order.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'conversation', conversationId ],
			} );
			onDone();
		},
	} );
	return (
		<form
			className="flex flex-col gap-2 pt-2"
			onSubmit={ ( e ) => {
				e.preventDefault();
				save.mutate();
			} }
		>
			<ActionError error={ save.error } />
			<TextField
				label={ __( 'Order note', 'cliedesk' ) }
				multiline
				value={ text }
				onChange={ setText }
			/>
			<Checkbox isSelected={ customer } onChange={ setCustomer }>
				{ __(
					'Note to the customer (WooCommerce emails it)',
					'cliedesk'
				) }
			</Checkbox>
			<div className="flex gap-2">
				<Button
					type="submit"
					size="sm"
					variant="primary"
					isDisabled={ text.trim() === '' }
					isLoading={ save.isPending }
				>
					{ __( 'Add note', 'cliedesk' ) }
				</Button>
				<Button size="sm" variant="secondary" onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

function OrderRow( {
	order,
	pinned,
	conversationId,
}: {
	order: ExternalRecord;
	pinned?: boolean;
	conversationId: number;
} ) {
	const [ noting, setNoting ] = useState( false );
	const [ resending, setResending ] = useState( false );
	// COM-05, COM-12: shipments and "Send tracking link".
	const [ tracking, setTracking ] = useState( false );
	const url = safeUrl( order.url );
	const details = [
		order.subtitle,
		order.fields.payment,
		order.fields.shipping,
	].filter( ( v ) => typeof v === 'string' && v !== '' );
	return (
		<li className="flex flex-col gap-0.5 py-2">
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-2 font-medium">
					{ url ? (
						<a
							href={ url }
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 underline"
						>
							{ order.title }
							<ExternalLink size={ 12 } aria-hidden />
							<span className="sr-only">
								{ __( '(opens in WooCommerce)', 'cliedesk' ) }
							</span>
						</a>
					) : (
						order.title
					) }
					{ pinned && (
						<Pill tone="accent">
							{ __( 'Linked', 'cliedesk' ) }
						</Pill>
					) }
				</span>
				{ order.amount !== null && (
					<span className="tabular-nums">
						{ formatAmount( order.amount, order.currency ) }
					</span>
				) }
			</div>
			<div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
				{ order.status && <Pill>{ order.status }</Pill> }
				{ order.date && (
					<span>{ formatRecordDate( order.date ) }</span>
				) }
				{ details.length > 0 && <span>{ details.join( ' · ' ) }</span> }
				<Button
					size="sm"
					variant="ghost"
					aria-expanded={ tracking }
					onPress={ () => setTracking( ( v ) => ! v ) }
					aria-label={ sprintf(
						/* translators: %s: order title. */
						__( 'Tracking of %s', 'cliedesk' ),
						order.title
					) }
				>
					{ __( 'Tracking', 'cliedesk' ) }
				</Button>
				{ can( 'cliedesk_run_commerce_actions' ) && ! noting && (
					<Button
						size="sm"
						variant="ghost"
						onPress={ () => setNoting( true ) }
						aria-label={ sprintf(
							/* translators: %s: order title. */
							__( 'Add a note to %s', 'cliedesk' ),
							order.title
						) }
					>
						{ __( 'Add note', 'cliedesk' ) }
					</Button>
				) }
				{ can( 'cliedesk_run_commerce_actions' ) && ! resending && (
					<Button
						size="sm"
						variant="ghost"
						onPress={ () => setResending( true ) }
						aria-label={ sprintf(
							/* translators: %s: order title. */
							__( 'Resend an email for %s', 'cliedesk' ),
							order.title
						) }
					>
						{ __( 'Resend email', 'cliedesk' ) }
					</Button>
				) }
			</div>
			<Suspense fallback={ null }>
				<OrderExtras
					order={ order }
					conversationId={ conversationId }
				/>
			</Suspense>
			{ tracking && (
				<OrderTracking
					orderId={ order.id }
					conversationId={ conversationId }
				/>
			) }
			{ noting && (
				<NoteForm
					orderId={ order.id }
					conversationId={ conversationId }
					onDone={ () => setNoting( false ) }
				/>
			) }
			{ resending && (
				<Suspense fallback={ <LoadingRegion /> }>
					<OrderResendEmail
						orderId={ order.id }
						conversationId={ conversationId }
						onClose={ () => setResending( false ) }
					/>
				</Suspense>
			) }
		</li>
	);
}

/**
 * Orders card.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export default function OrdersCard( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const allowed = can( 'cliedesk_view_orders' ) && c.requesterId > 0;
	const sources = useQuery( { ...recordSourcesQuery(), enabled: allowed } );
	const connected = !! sources.data?.some( ( s ) => s.key === 'woo_order' );
	const [ page, setPage ] = useState( 1 );
	const q = useQuery( {
		queryKey: [ 'orders', 'customer', c.requesterId, c.id, page ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< OrdersPanel >(
					`contacts/${ c.requesterId }/orders`,
					{
						query: { conversationId: c.id, page },
						signal,
					}
				)
			).data as OrdersPanel,
		enabled: allowed && connected,
		placeholderData: keepPreviousData,
	} );
	if ( ! allowed || ! connected ) {
		return null;
	}
	const d = q.data;
	const pinnedIds = new Set( ( d?.pinned ?? [] ).map( ( o ) => o.id ) );
	return (
		<PanelSection id="cd-side-orders" title={ __( 'Orders', 'cliedesk' ) }>
			{ ! d ? (
				<LoadingRegion />
			) : (
				<div className="flex flex-col gap-2 text-sm">
					{ d.stats.orders > 0 && (
						<p className="text-xs text-fg-muted">
							{ sprintf(
								/* translators: 1: number of paid orders, 2: amount spent, 3: average order value. */
								_n(
									'%1$d paid order · %2$s spent · %3$s average',
									'%1$d paid orders · %2$s spent · %3$s average',
									d.stats.orders,
									'cliedesk'
								),
								d.stats.orders,
								formatAmount( d.stats.spent, d.stats.currency ),
								formatAmount(
									d.stats.average,
									d.stats.currency
								)
							) }
						</p>
					) }
					{ d.total === 0 && d.pinned.length === 0 ? (
						<Muted>{ __( 'No orders yet.', 'cliedesk' ) }</Muted>
					) : (
						<ul className="flex flex-col divide-y divide-line">
							{ d.pinned.map( ( o ) => (
								<OrderRow
									key={ `p${ o.id }` }
									order={ o }
									pinned
									conversationId={ c.id }
								/>
							) ) }
							{ d.items
								.filter( ( o ) => ! pinnedIds.has( o.id ) )
								.map( ( o ) => (
									<OrderRow
										key={ o.id }
										order={ o }
										conversationId={ c.id }
									/>
								) ) }
						</ul>
					) }
					{ d.pages > 1 && (
						<nav
							aria-label={ __( 'Order pages', 'cliedesk' ) }
							className="flex items-center justify-between gap-2"
						>
							<Button
								size="sm"
								variant="secondary"
								isDisabled={ page <= 1 }
								onPress={ () => setPage( ( p ) => p - 1 ) }
							>
								{ __( 'Newer', 'cliedesk' ) }
							</Button>
							<span className="text-xs text-fg-muted">
								{ sprintf(
									/* translators: 1: page, 2: pages. */
									__( 'Page %1$d of %2$d', 'cliedesk' ),
									d.page,
									d.pages
								) }
							</span>
							<Button
								size="sm"
								variant="secondary"
								isDisabled={ page >= d.pages }
								onPress={ () => setPage( ( p ) => p + 1 ) }
							>
								{ __( 'Older', 'cliedesk' ) }
							</Button>
						</nav>
					) }
					{ /* INB-65: refunds, cancellations and other order actions are Pro (badge without Pro). */ }
					<Slot name="context.order_actions" />
				</div>
			) }
		</PanelSection>
	);
}
