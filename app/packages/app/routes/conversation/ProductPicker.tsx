/**
 * Product cards in the reply composer (COM-25, Free): "Add product" searches the WooCommerce catalog (with stock) and
 * adds the product to the reply as a card. Chat shows the card live (image, price, stock, variations, Add to cart);
 * email shows the product link. Shown only with WooCommerce connected. Loaded lazily.
 *
 * - GET products?q= → {items: [{id, name, sku, price, stock: {label}, image, url}]}.
 * - The reply sends rich.cards: [{title, url, text, product}].
 */
import { api, keepPreviousData, useQuery } from '@cliedesk/data';
import {
	Button,
	IconButton,
	Popover,
	TextField,
	UnstyledButton,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Package, X } from 'lucide-react';
import { useState } from 'react';
import { recordSourcesQuery } from '../../crm/records';
import { Muted } from '../../inbox/components';
import { TOOL_BUTTON } from './shared';

export interface ProductCardInput {
	title: string;
	url: string;
	text: string;
	product: number;
}

interface ProductHit {
	id: number;
	name: string;
	sku: string;
	price: string;
	stock: { label: string; status: string };
	image: string;
	url: string;
}

/**
 * The card a product hit becomes.
 *
 * @param p Product.
 */
export function toCard( p: ProductHit ): ProductCardInput {
	return {
		title: p.name.slice( 0, 120 ),
		url: p.url,
		text: [ p.price, p.stock.label ].filter( Boolean ).join( ' · ' ),
		product: p.id,
	};
}

/**
 * Products on the reply, each with Remove.
 *
 * @param props          Props.
 * @param props.value    Cards on the reply.
 * @param props.onChange Change.
 */
export function ProductChips( {
	value,
	onChange,
}: {
	value: ProductCardInput[];
	onChange: ( next: ProductCardInput[] ) => void;
} ) {
	return (
		<ul
			className="flex flex-wrap gap-1"
			aria-label={ __( 'Products on this reply', 'cliedesk' ) }
		>
			{ value.map( ( c ) => (
				<li
					key={ c.product }
					className="flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs"
				>
					<span>{ c.title }</span>
					<IconButton
						size="sm"
						variant="ghost"
						label={ sprintf(
							/* translators: %s: product name. */
							__( 'Remove %s', 'cliedesk' ),
							c.title
						) }
						icon={ <X size={ 12 } aria-hidden /> }
						onPress={ () =>
							onChange(
								value.filter( ( v ) => v.product !== c.product )
							)
						}
					/>
				</li>
			) ) }
		</ul>
	);
}

/**
 * "Add product" button of the composer toolbar: a search in a popover (WooCommerce connected only).
 *
 * @param props          Props.
 * @param props.value    Cards on the reply.
 * @param props.onChange Change.
 */
export default function ProductPicker( {
	value,
	onChange,
}: {
	value: ProductCardInput[];
	onChange: ( next: ProductCardInput[] ) => void;
} ) {
	const sources = useQuery( recordSourcesQuery() );
	const [ open, setOpen ] = useState( false );
	const [ q, setQ ] = useState( '' );
	const term = q.trim();
	const found = useQuery( {
		queryKey: [ 'products', 'search', term ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: ProductHit[] } >( 'products', {
					query: { q: term, limit: 8 },
					signal,
				} )
			).data?.items ?? [],
		enabled: open && term.length >= 2,
		placeholderData: keepPreviousData,
	} );
	if ( ! sources.data?.some( ( s ) => s.key === 'woo_order' ) ) {
		return null;
	}
	const chosen = new Set( value.map( ( c ) => c.product ) );
	return (
		<Popover
			label={ __( 'Add product', 'cliedesk' ) }
			placement="top start"
			isOpen={ open }
			onOpenChange={ setOpen }
			trigger={
				<UnstyledButton
					aria-label={ __( 'Add product', 'cliedesk' ) }
					className={ TOOL_BUTTON }
				>
					<Package aria-hidden="true" size={ 16 } />
				</UnstyledButton>
			}
		>
			<div className="flex flex-col gap-2">
				<TextField
					label={ __( 'Find a product', 'cliedesk' ) }
					description={ __(
						'Chat shows a product card with price, stock and Add to cart; email shows the product link.',
						'cliedesk'
					) }
					type="search"
					value={ q }
					onChange={ setQ }
				/>
				{ term.length >= 2 && found.data && found.data.length === 0 && (
					<Muted>{ __( 'No products found.', 'cliedesk' ) }</Muted>
				) }
				<ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto">
					{ ( term.length >= 2 ? ( found.data ?? [] ) : [] ).map(
						( p ) => (
							<li
								key={ p.id }
								className="flex items-center justify-between gap-2 py-1 text-sm"
							>
								<span className="flex min-w-0 flex-col">
									<span className="truncate font-medium">
										{ p.name }
									</span>
									<span className="text-xs text-fg-muted">
										{ [ p.sku, p.price, p.stock.label ]
											.filter( Boolean )
											.join( ' · ' ) }
									</span>
								</span>
								<Button
									size="sm"
									variant="secondary"
									isDisabled={
										chosen.has( p.id ) || value.length >= 10
									}
									onPress={ () =>
										onChange( [ ...value, toCard( p ) ] )
									}
									aria-label={ sprintf(
										/* translators: %s: product name. */
										__( 'Add %s', 'cliedesk' ),
										p.name
									) }
								>
									{ chosen.has( p.id )
										? __( 'Added', 'cliedesk' )
										: __( 'Add', 'cliedesk' ) }
								</Button>
							</li>
						)
					) }
				</ul>
			</div>
		</Popover>
	);
}
