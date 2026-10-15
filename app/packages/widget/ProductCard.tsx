/**
 * Product card in the chat (COM-25, Free), loaded only when a message has one. Reads the product live from the shop
 * (GET widget/products/{id}: image, price, stock, variations) and adds it to the visitor's own WooCommerce cart through
 * the shop's add-to-cart endpoint (same site, so the shop's cart cookie goes along). Until the product loads, or when
 * it is no longer available, the plain link card shows.
 */
import { useEffect, useState } from 'react';
import { widgetUrl } from './url';

interface Stock {
	status: string;
	label: string;
}

interface Product {
	id: number;
	name: string;
	url: string;
	image: string;
	price: string;
	stock: Stock;
	purchasable: boolean;
	variations: Array< {
		id: number;
		label: string;
		price: string;
		stock: Stock;
		purchasable: boolean;
	} >;
	cart: string;
	cartUrl: string;
	texts: Record< string, string >;
}

export interface CardInput {
	title: string;
	url: string;
	text?: string;
	product?: number;
}

/**
 * Add a product (or variation) to the visitor's cart.
 *
 * @param cart Add-to-cart endpoint.
 * @param id   Product or variation id.
 */
export async function addToCart(
	cart: string,
	id: number
): Promise< boolean > {
	const body = new FormData();
	body.set( 'product_id', String( id ) );
	body.set( 'quantity', '1' );
	const r = await fetch( cart, {
		method: 'POST',
		credentials: 'same-origin',
		body,
	} );
	const j = await r.json().catch( () => null );
	if ( ! r.ok || ! j || j.error ) {
		return false;
	}
	// Let the theme's mini cart refresh (WooCommerce cart fragments).
	const jq = (
		window as unknown as {
			jQuery?: ( el: unknown ) => { trigger: ( e: string ) => void };
		}
	 ).jQuery;
	jq?.( document.body ).trigger( 'wc_fragment_refresh' );
	return true;
}

/**
 * Card.
 *
 * @param props      Props.
 * @param props.api  Widget API base.
 * @param props.card The card on the message.
 */
export default function ProductCard( {
	api,
	card,
}: {
	api: string;
	card: CardInput;
} ) {
	const [ p, setP ] = useState< Product | null >( null );
	const [ pick, setPick ] = useState( 0 );
	const [ state, setState ] = useState( '' );
	useEffect( () => {
		fetch( widgetUrl( api, 'products/' + card.product ), {
			credentials: 'omit',
		} )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.then( ( j ) => j?.data && setP( j.data as Product ) )
			.catch( () => undefined );
	}, [ api, card.product ] );
	if ( ! p ) {
		return (
			<a
				href={ card.url }
				target="_blank"
				rel="noopener noreferrer"
				className="cdw-card"
			>
				<strong>{ card.title }</strong>
				{ card.text && <span>{ card.text }</span> }
			</a>
		);
	}
	const t = p.texts;
	const v = p.variations.find( ( x ) => x.id === pick );
	const can = p.variations.length ? !! v?.purchasable : p.purchasable;
	const add = async () => {
		setState( 'adding' );
		setState(
			( await addToCart( p.cart, v ? v.id : p.id ).catch( () => false ) )
				? 'added'
				: 'error'
		);
	};
	return (
		<div className="cdw-card">
			{ p.image && (
				<img
					src={ p.image }
					alt=""
					width={ 64 }
					height={ 64 }
					style={ {
						float: 'right',
						objectFit: 'cover',
						marginLeft: 8,
					} }
				/>
			) }
			<strong>{ p.name }</strong>
			<span>
				{ [ v ? v.price : p.price, ( v ?? p ).stock.label ]
					.filter( Boolean )
					.join( ' · ' ) }
			</span>
			{ p.variations.length > 0 && (
				<select
					aria-label={ t.choose }
					value={ pick }
					onChange={ ( e ) => {
						setPick( Number( e.currentTarget.value ) );
						setState( '' );
					} }
					style={ {
						display: 'block',
						margin: '6px 0',
						font: 'inherit',
						maxWidth: '100%',
					} }
				>
					<option value={ 0 }>{ t.choose }</option>
					{ p.variations.map( ( x ) => (
						<option key={ x.id } value={ x.id }>
							{ x.label }
						</option>
					) ) }
				</select>
			) }
			<div className="cdw-options" style={ { clear: 'both' } }>
				<a
					href={ p.url }
					target="_blank"
					rel="noopener noreferrer"
					className="cdw-link"
				>
					{ t.view }
				</a>
				<button
					type="button"
					disabled={ ! can || state === 'adding' }
					onClick={ () => void add() }
				>
					{ t.add }
				</button>
			</div>
			{ state === 'added' && (
				<span role="status">
					{ t.added } <a href={ p.cartUrl }>{ t.cart }</a>
				</span>
			) }
			{ state === 'error' && <span role="alert">{ t.failed }</span> }
		</div>
	);
}
