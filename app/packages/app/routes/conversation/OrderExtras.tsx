/**
 * More of one order in the Orders card, loaded on demand:
 * - COM-06: the order meta fields the admin mapped (hidden keys never reach the app);
 * - COM-04: link the order to this conversation, or unlink it (several orders can be linked);
 * - COM-08: quick links — copy the order number, open it in WooCommerce, open the customer profile, and the admin's
 *   own links (carrier, ERP …). GET orders/{id}/links → {number, items: [{key, label, url}]}.
 */
import { api, useQuery, useQueryClient, useMutation } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { copyText } from '../../links';
import {
	canLinkRecords,
	fieldText,
	linkRecord,
	recordKeys,
	recordLinksQuery,
	recordSourcesQuery,
	safeUrl,
	type ExternalRecord,
} from '../../crm/records';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

export interface OrderLinks {
	number: string;
	items: { key: string; label: string; url: string }[];
}

/**
 * Mapped meta fields of an order: label and text, in schema order.
 *
 * @param order  Order.
 * @param schema Order source schema.
 */
export function metaFields(
	order: ExternalRecord,
	schema: Record< string, { label: string; type: string } >
): { key: string; label: string; text: string }[] {
	return Object.entries( schema )
		.filter(
			( [ key ] ) =>
				key.startsWith( 'meta_' ) &&
				order.fields[ key ] !== undefined &&
				order.fields[ key ] !== null &&
				order.fields[ key ] !== ''
		)
		.map( ( [ key, def ] ) => ( {
			key,
			label: def.label,
			text: fieldText( def.type, order.fields[ key ] ),
		} ) );
}

/**
 * Quick links, meta fields and link / unlink of one order.
 *
 * @param props                Props.
 * @param props.order          Order.
 * @param props.conversationId Conversation.
 */
export default function OrderExtras( {
	order,
	conversationId,
}: {
	order: ExternalRecord;
	conversationId: number;
} ) {
	const qc = useQueryClient();
	const [ open, setOpen ] = useState( false );
	const sources = useQuery( recordSourcesQuery() );
	const schema =
		sources.data?.find( ( s ) => s.key === 'woo_order' )?.schema ?? {};
	const meta = metaFields( order, schema );
	const links = useQuery( {
		queryKey: [ 'orders', order.id, 'links' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< OrderLinks >( `orders/${ order.id }/links`, {
					signal,
				} )
			).data as OrderLinks,
		enabled: open,
	} );
	const linked = useQuery( {
		...recordLinksQuery( 'conversation', conversationId ),
		enabled: canLinkRecords( 'conversation' ),
	} );
	const link = ( linked.data ?? [] ).find(
		( l ) => l.source === 'woo_order' && l.recordId === order.id
	);
	const refresh = () => {
		void qc.invalidateQueries( {
			queryKey: recordKeys.links( 'conversation', conversationId ),
		} );
		void qc.invalidateQueries( { queryKey: [ 'orders', 'customer' ] } );
	};
	const toggle = useMutation( {
		mutationFn: async () => {
			if ( link ) {
				await api.del( `record-links/${ link.id }` );
			} else {
				await linkRecord(
					'conversation',
					conversationId,
					'woo_order',
					order.id
				);
			}
		},
		onSuccess: () => {
			announceResult(
				link
					? __( 'Order unlinked from this conversation.', 'cliedesk' )
					: __( 'Order linked to this conversation.', 'cliedesk' )
			);
			refresh();
		},
	} );
	return (
		<div className="flex flex-col gap-1">
			{ meta.length > 0 && (
				<dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
					{ meta.map( ( m ) => (
						<div key={ m.key } className="contents">
							<dt className="text-fg-muted">{ m.label }</dt>
							<dd>{ m.text }</dd>
						</div>
					) ) }
				</dl>
			) }
			<div className="flex flex-wrap items-center gap-1">
				{ canLinkRecords( 'conversation' ) && linked.data && (
					<Button
						size="sm"
						variant="ghost"
						isLoading={ toggle.isPending }
						onPress={ () => toggle.mutate() }
					>
						{ link
							? __( 'Unlink', 'cliedesk' )
							: __( 'Link to conversation', 'cliedesk' ) }
					</Button>
				) }
				<Button
					size="sm"
					variant="ghost"
					aria-expanded={ open }
					onPress={ () => setOpen( ( o ) => ! o ) }
					aria-label={ sprintf(
						/* translators: %s: order title. */
						__( 'Quick links for %s', 'cliedesk' ),
						order.title
					) }
				>
					{ __( 'Links', 'cliedesk' ) }
				</Button>
			</div>
			<ActionError error={ toggle.error } />
			{ open && links.data && (
				<ul className="flex flex-wrap gap-2 text-xs">
					<li>
						<Button
							size="sm"
							variant="secondary"
							onPress={ () =>
								void copyText( links.data.number ).then(
									( ok ) =>
										announceResult(
											ok
												? __(
														'Order number copied.',
														'cliedesk'
													)
												: __(
														'Could not copy the order number.',
														'cliedesk'
													)
										)
								)
							}
						>
							{ sprintf(
								/* translators: %s: order number. */
								__( 'Copy #%s', 'cliedesk' ),
								links.data.number
							) }
						</Button>
					</li>
					{ links.data.items.map( ( l ) => {
						const href = safeUrl( l.url );
						return href ? (
							<li key={ l.key }>
								<a
									href={ href }
									target="_blank"
									rel="noreferrer"
									className="underline"
								>
									{ l.label }
									<span className="sr-only">
										{ __(
											'(opens in a new tab)',
											'cliedesk'
										) }
									</span>
								</a>
							</li>
						) : null;
					} ) }
				</ul>
			) }
		</div>
	);
}
