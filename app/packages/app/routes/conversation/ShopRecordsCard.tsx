/**
 * Subscriptions and licences of the requester in the side panel (COM-29, COM-35, Free, read-only): every WooCommerce
 * subscription (any status) with billing period and next payment, and licences from EDD Software Licensing or License
 * Manager for WooCommerce with a masked key, activations and expiry. Each source shows only when its plugin is active
 * (the `woo_subscription` and `licence` record sources). Changes (skip, pause, reset activations…) are Pro.
 *
 * - GET record-sources/{source}/records?contactId= → {items: ExternalRecord[]}.
 */
import { can, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { ExternalLink } from 'lucide-react';
import {
	fieldText,
	formatAmount,
	recordFindQuery,
	recordSourcesQuery,
	safeUrl,
	type RecordSource,
} from '../../crm/records';
import { Muted, PanelSection, Pill } from '../../inbox/components';

export const SHOP_SOURCES = [ 'woo_subscription', 'licence' ];

function SourceList( {
	source,
	contactId,
}: {
	source: RecordSource;
	contactId: number;
} ) {
	const q = useQuery( recordFindQuery( source.key, contactId, '' ) );
	const none =
		source.key === 'licence'
			? __( 'No licences.', 'cliedesk' )
			: __( 'No subscriptions.', 'cliedesk' );
	if ( ! q.data ) {
		return (
			<PanelSection
				id={ `cd-side-${ source.key }` }
				title={ source.plural }
			>
				<LoadingRegion />
			</PanelSection>
		);
	}
	return (
		<PanelSection id={ `cd-side-${ source.key }` } title={ source.plural }>
			{ q.data.length === 0 ? (
				<Muted>{ none }</Muted>
			) : (
				<ul className="flex flex-col divide-y divide-line text-sm">
					{ q.data.map( ( r ) => {
						const url = safeUrl( r.url );
						const facts = Object.entries( source.schema )
							.map( ( [ key, def ] ) => {
								const text = fieldText(
									def.type,
									r.fields[ key ]
								);
								return text ? `${ def.label }: ${ text }` : '';
							} )
							.filter( Boolean );
						return (
							<li
								key={ r.id }
								className="flex flex-col gap-0.5 py-2"
							>
								<span className="flex items-center justify-between gap-2">
									<span className="flex items-center gap-2 font-medium">
										{ url ? (
											<a
												href={ url }
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 underline"
											>
												{ r.title }
												<ExternalLink
													size={ 12 }
													aria-hidden
												/>
											</a>
										) : (
											r.title
										) }
										{ r.status && (
											<Pill>{ r.status }</Pill>
										) }
									</span>
									{ r.amount !== null && (
										<span className="tabular-nums">
											{ formatAmount(
												r.amount,
												r.currency
											) }
										</span>
									) }
								</span>
								{ r.subtitle && (
									<span className="text-xs">
										{ r.subtitle }
									</span>
								) }
								{ facts.length > 0 && (
									<span className="text-xs text-fg-muted">
										{ facts.join( ' · ' ) }
									</span>
								) }
							</li>
						);
					} ) }
				</ul>
			) }
		</PanelSection>
	);
}

/**
 * Card.
 *
 * @param props           Props.
 * @param props.contactId Requester.
 */
export default function ShopRecordsCard( {
	contactId,
}: {
	contactId: number;
} ) {
	const allowed = can( 'cliedesk_view_orders' ) && contactId > 0;
	const sources = useQuery( { ...recordSourcesQuery(), enabled: allowed } );
	if ( ! allowed ) {
		return null;
	}
	return (
		<>
			{ ( sources.data ?? [] )
				.filter( ( s ) => SHOP_SOURCES.includes( s.key ) )
				.map( ( s ) => (
					<SourceList
						key={ s.key }
						source={ s }
						contactId={ contactId }
					/>
				) ) }
		</>
	);
}
