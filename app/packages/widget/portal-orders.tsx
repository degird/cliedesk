/**
 * The order hub in the customer portal (WooCommerce shops), loaded only where the portal has it:
 *
 * - PRT-20: the customer's recent orders with their latest shipment, and one order's summary (items, totals,
 *   addresses, payment).
 * - PRT-21: the shipment timeline from the tracking plugin, the "not shipped yet" message, and a delay notice once
 *   the expected delivery date has passed.
 * - PRT-24: "Report a problem": scenarios that fit the order's status, each with an answer and "Did this help?";
 *   "No" sends a request with the order linked (and photos when the scenario asks for them).
 * - PRT-16: "Get help with this order" with a topic (also opened from My Account: `?cliedesk_order=ID`).
 * - PRT-27: resend the invoice or the download links.
 * - SEC-11: guests verify first (order number + email → 6-digit code); the 30-minute token is kept in sessionStorage.
 */
import { Fragment, useEffect, useState, type FormEvent } from 'react';
import type { PortalConfig } from './portal';
import { widgetUrl } from './url';

type Texts = Record< string, string >;

interface Shipment {
	carrier: string;
	number: string;
	url: string | null;
	statusLabel: string;
	eta: string | null;
	events: Array< { text: string; at: string | null; location: string } >;
}

interface OrderCard {
	id: number;
	number: string;
	date: string | null;
	status: string;
	total: string;
	shipment: Shipment | null;
}

interface OrderDetail extends OrderCard {
	lines: Array< { name: string; quantity: number; total: string } >;
	totals: Record< string, string >;
	billing: string[];
	shipping: { method: string; address: string[] };
	payment: string;
	shipments: Shipment[];
	notice: string;
	scenarios: Array< {
		key: string;
		label: string;
		answer: string;
		photos: boolean;
	} >;
	resend: { invoice: boolean; downloads: boolean };
	topics: Array< { key: string; label: string } >;
}

const GUEST = 'cliedesk-portal-guest';

export class OrdersClient {
	token = '';

	constructor( private config: PortalConfig ) {
		try {
			this.token = window.sessionStorage.getItem( GUEST ) ?? '';
		} catch {
			this.token = '';
		}
	}

	keep( token: string ): void {
		this.token = token;
		try {
			if ( token ) {
				window.sessionStorage.setItem( GUEST, token );
			} else {
				window.sessionStorage.removeItem( GUEST );
			}
		} catch {
			// Kept in memory only.
		}
	}

	async call< T >(
		method: 'GET' | 'POST',
		path: string,
		body?: FormData
	): Promise< T > {
		const headers: Record< string, string > = {
			Accept: 'application/json',
		};
		if ( this.config.nonce ) {
			headers[ 'X-WP-Nonce' ] = this.config.nonce;
		}
		if ( this.token ) {
			headers[ 'X-Cliedesk-Guest' ] = this.token;
		}
		const r = await fetch(
			widgetUrl(
				this.config.api,
				path,
				this.config.lang ? { lang: this.config.lang } : {}
			),
			{ method, headers, credentials: 'same-origin', body }
		);
		const json = await r.json().catch( () => ( {} ) );
		if ( ! r.ok ) {
			const e = new Error( json?.message ?? String( r.status ) );
			( e as Error & { status?: number } ).status = r.status;
			throw e;
		}
		return json.data as T;
	}
}

/**
 * Form data from plain values.
 *
 * @param values Values.
 * @param files  Files (field files[]).
 */
export function form(
	values: Record< string, string >,
	files: File[] = []
): FormData {
	const data = new FormData();
	Object.entries( values ).forEach( ( [ k, v ] ) => data.set( k, v ) );
	files.forEach( ( f ) => data.append( 'files[]', f ) );
	return data;
}

const fill = ( text: string | undefined, value: string | number ) =>
	( text ?? '' ).replace( /%[sd]/, String( value ) );

function Verify( {
	client,
	t,
	onDone,
}: {
	client: OrdersClient;
	t: Texts;
	onDone: () => void;
} ) {
	const [ challenge, setChallenge ] = useState( '' );
	const [ error, setError ] = useState( '' );
	const submit = ( e: FormEvent< HTMLFormElement > ) => {
		e.preventDefault();
		const f = new FormData( e.currentTarget );
		setError( '' );
		if ( ! challenge ) {
			void client
				.call< { challenge: string } >(
					'POST',
					'portal/verify',
					form( {
						email: String( f.get( 'email' ) ?? '' ),
						order: String( f.get( 'order' ) ?? '' ),
					} )
				)
				.then( ( r ) => setChallenge( r.challenge ) )
				.catch( ( x: Error ) => setError( x.message ) );
			return;
		}
		void client
			.call< { token: string } >(
				'POST',
				'portal/verify/code',
				form( { challenge, code: String( f.get( 'code' ) ?? '' ) } )
			)
			.then( ( r ) => {
				client.keep( r.token );
				onDone();
			} )
			.catch( ( x: Error ) => setError( x.message ) );
	};
	return (
		<form onSubmit={ submit } className="cdp-verify">
			<p>{ challenge ? t.codeSent : t.verifyIntro }</p>
			{ ! challenge ? (
				<Fragment key="ask">
					<label htmlFor="cdp-v-order">{ t.orderNumber }</label>
					<input
						id="cdp-v-order"
						name="order"
						required
						autoComplete="off"
					/>
					<label htmlFor="cdp-v-email">{ t.email }</label>
					<input
						id="cdp-v-email"
						name="email"
						type="email"
						required
						autoComplete="email"
					/>
				</Fragment>
			) : (
				<Fragment key="code">
					<label htmlFor="cdp-v-code">{ t.code }</label>
					<input
						id="cdp-v-code"
						name="code"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9 ]{6,7}"
						required
					/>
				</Fragment>
			) }
			{ error && <p role="alert">{ error }</p> }
			<button type="submit">
				{ challenge ? t.confirm : t.sendCode }
			</button>
		</form>
	);
}

function Timeline( { s, t }: { s: Shipment; t: Texts } ) {
	return (
		<div className="cdp-item">
			<div>
				<strong>{ s.carrier }</strong> { s.number } · { s.statusLabel }
				{ s.eta && <div>{ fill( t.eta, s.eta ) }</div> }
			</div>
			{ s.url && (
				<a href={ s.url } target="_blank" rel="noopener noreferrer">
					{ t.track }
				</a>
			) }
			{ s.events.length > 0 && (
				<ol style={ { width: '100%', margin: 0 } }>
					{ s.events.map( ( e, i ) => (
						<li key={ i }>
							{ e.text }
							{ e.location && ` · ${ e.location }` }
							{ e.at && (
								<>
									{ ' · ' }
									<time dateTime={ e.at }>{ e.at }</time>
								</>
							) }
						</li>
					) ) }
				</ol>
			) }
		</div>
	);
}

function HelpForm( {
	client,
	t,
	order,
	scenario,
	photos,
	topics,
}: {
	client: OrdersClient;
	t: Texts;
	order: number;
	scenario?: string;
	photos?: boolean;
	topics?: OrderDetail[ 'topics' ];
} ) {
	const [ sent, setSent ] = useState( 0 );
	const [ error, setError ] = useState( '' );
	const id = `cdp-h-${ scenario ?? 'topic' }`;
	if ( sent ) {
		return <p role="status">{ fill( t.sent, sent ) }</p>;
	}
	const submit = ( e: FormEvent< HTMLFormElement > ) => {
		e.preventDefault();
		const f = new FormData( e.currentTarget );
		const files = ( f.getAll( 'files' ) as File[] ).filter(
			( x ) => x && x.size > 0
		);
		void client
			.call< { number: number } >(
				'POST',
				`portal/orders/${ order }/help`,
				form(
					{
						message: String( f.get( 'message' ) ?? '' ),
						...( scenario
							? { scenario }
							: { topic: String( f.get( 'topic' ) ?? '' ) } ),
					},
					files
				)
			)
			.then( ( r ) => setSent( r.number ) )
			.catch( ( x: Error ) => setError( x.message ) );
	};
	return (
		<form onSubmit={ submit }>
			{ topics && (
				<>
					<label htmlFor={ `${ id }-topic` }>{ t.topic }</label>
					<select id={ `${ id }-topic` } name="topic" required>
						{ topics.map( ( o ) => (
							<option key={ o.key } value={ o.key }>
								{ o.label }
							</option>
						) ) }
					</select>
				</>
			) }
			<label htmlFor={ `${ id }-message` }>{ t.message }</label>
			<textarea
				id={ `${ id }-message` }
				name="message"
				rows={ 4 }
				required
			/>
			{ photos && (
				<>
					<label htmlFor={ `${ id }-files` }>{ t.photos }</label>
					<input
						id={ `${ id }-files` }
						name="files"
						type="file"
						accept="image/*"
						multiple
					/>
				</>
			) }
			{ error && <p role="alert">{ error }</p> }
			<button type="submit">{ t.send }</button>
		</form>
	);
}

function Issues( {
	client,
	t,
	d,
}: {
	client: OrdersClient;
	t: Texts;
	d: OrderDetail;
} ) {
	const [ key, setKey ] = useState( '' );
	const [ helped, setHelped ] = useState< boolean | null >( null );
	const s = d.scenarios.find( ( x ) => x.key === key );
	return (
		<section>
			<h4>{ t.issue }</h4>
			<div className="cdp-bar">
				{ d.scenarios.map( ( x ) => (
					<button
						key={ x.key }
						type="button"
						aria-pressed={ x.key === key }
						onClick={ () => {
							setKey( x.key );
							setHelped( null );
						} }
					>
						{ x.label }
					</button>
				) ) }
			</div>
			{ s && (
				<div className="cdp-notice">
					<p>{ s.answer }</p>
					{ helped === null && (
						<p>
							{ t.helpful }{ ' ' }
							<button
								type="button"
								onClick={ () => setHelped( true ) }
							>
								{ t.yes }
							</button>{ ' ' }
							<button
								type="button"
								onClick={ () => setHelped( false ) }
							>
								{ t.no }
							</button>
						</p>
					) }
					{ helped === true && <p role="status">{ t.glad }</p> }
					{ helped === false && (
						<HelpForm
							client={ client }
							t={ t }
							order={ d.id }
							scenario={ s.key }
							photos={ s.photos }
						/>
					) }
				</div>
			) }
		</section>
	);
}

function Detail( {
	client,
	t,
	id,
	help,
	onBack,
}: {
	client: OrdersClient;
	t: Texts;
	id: number;
	help: boolean;
	onBack: () => void;
} ) {
	const [ d, setD ] = useState< OrderDetail | null >( null );
	const [ error, setError ] = useState( '' );
	const [ status, setStatus ] = useState( '' );
	useEffect( () => {
		client
			.call< OrderDetail >( 'GET', `portal/orders/${ id }` )
			.then( setD )
			.catch( ( x: Error ) => setError( x.message ) );
	}, [ client, id ] );
	const resend = ( what: string ) =>
		void client
			.call( 'POST', `portal/orders/${ id }/resend`, form( { what } ) )
			.then( () => setStatus( t.emailed ?? '' ) )
			.catch( ( x: Error ) => setStatus( x.message ) );
	return (
		<section aria-labelledby="cdp-order">
			<button type="button" onClick={ onBack }>
				← { t.back }
			</button>
			{ error && <p role="alert">{ error }</p> }
			{ d && (
				<>
					<h3 id="cdp-order">
						{ fill( t.order, d.number ) } · { d.status }
					</h3>
					{ d.notice && (
						<div className="cdp-notice" role="status">
							{ d.notice }
						</div>
					) }
					{ d.shipments.length > 0 && (
						<>
							<h4>{ t.tracking }</h4>
							{ d.shipments.map( ( s ) => (
								<Timeline key={ s.number } s={ s } t={ t } />
							) ) }
						</>
					) }
					<h4>{ t.items }</h4>
					<ul>
						{ d.lines.map( ( l, i ) => (
							<li key={ i }>
								{ l.name } × { l.quantity } — { l.total }
							</li>
						) ) }
					</ul>
					<p>
						{ [
							[ t.subtotal, d.totals.subtotal ],
							[ t.shippingCost, d.totals.shipping ],
							[ t.discount, d.totals.discount ],
							[ t.tax, d.totals.tax ],
						]
							.filter( ( [ , v ] ) => v )
							.map( ( [ k, v ] ) => `${ k }: ${ v }` )
							.join( ' · ' ) }
						<br />
						<strong>
							{ t.total }: { d.totals.total }
						</strong>
					</p>
					<p>
						{ t.payment }: { d.payment }
						{ d.shipping.method && ` · ${ d.shipping.method }` }
					</p>
					{ d.shipping.address.length > 0 && (
						<p>
							<strong>{ t.shipTo }</strong>
							<br />
							{ d.shipping.address.join( ', ' ) }
						</p>
					) }
					<div className="cdp-bar">
						{ d.resend.invoice && (
							<button
								type="button"
								onClick={ () => resend( 'invoice' ) }
							>
								{ t.invoice }
							</button>
						) }
						{ d.resend.downloads && (
							<button
								type="button"
								onClick={ () => resend( 'downloads' ) }
							>
								{ t.downloads }
							</button>
						) }
					</div>
					{ status && <p role="status">{ status }</p> }
					{ d.scenarios.length > 0 && (
						<Issues client={ client } t={ t } d={ d } />
					) }
					<details open={ help }>
						<summary>{ t.help }</summary>
						<HelpForm
							client={ client }
							t={ t }
							order={ d.id }
							topics={ d.topics }
						/>
					</details>
				</>
			) }
		</section>
	);
}

/**
 * The order hub.
 *
 * @param props        Props.
 * @param props.config Portal config (with `orders`).
 */
export default function OrdersHub( { config }: { config: PortalConfig } ) {
	const t: Texts = config.orders?.texts ?? {};
	const [ client ] = useState( () => new OrdersClient( config ) );
	const [ verified, setVerified ] = useState(
		config.signedIn || !! client.token
	);
	const [ items, setItems ] = useState< OrderCard[] | null >( null );
	const [ open, setOpen ] = useState( config.orders?.order ?? 0 );
	useEffect( () => {
		if ( ! verified ) {
			return;
		}
		client
			.call< { items: OrderCard[] } >( 'GET', 'portal/orders' )
			.then( ( r ) => setItems( r.items ) )
			.catch( ( x: Error & { status?: number } ) => {
				if ( x.status === 403 ) {
					client.keep( '' );
					setVerified( false );
				}
			} );
	}, [ client, verified ] );
	return (
		<section className="cdp-orders" aria-labelledby="cdp-orders">
			<h2 id="cdp-orders">{ t.orders }</h2>
			{ ! verified && (
				<Verify
					client={ client }
					t={ t }
					onDone={ () => setVerified( true ) }
				/>
			) }
			{ verified && open > 0 && (
				<Detail
					client={ client }
					t={ t }
					id={ open }
					help={ open === config.orders?.order }
					onBack={ () => setOpen( 0 ) }
				/>
			) }
			{ verified && ! open && items && items.length === 0 && (
				<p>{ t.noOrders }</p>
			) }
			{ verified && ! open && items && items.length > 0 && (
				<ul className="cdp-list">
					{ items.map( ( o ) => (
						<li key={ o.id } className="cdp-item">
							<button
								type="button"
								className="cdp-link"
								onClick={ () => setOpen( o.id ) }
							>
								{ fill( t.order, o.number ) }
							</button>
							<span>
								{ [
									o.status,
									o.total,
									o.shipment
										? `${ o.shipment.carrier } · ${ o.shipment.statusLabel }`
										: '',
								]
									.filter( Boolean )
									.join( ' · ' ) }
							</span>
						</li>
					) ) }
				</ul>
			) }
		</section>
	);
}
