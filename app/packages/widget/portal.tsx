/**
 * Customer portal (PRT-02, PRT-04, PRT-10, PRT-11, PRT-12): the customer's requests with search and an open/closed
 * filter, one request with its public messages and a reply box, and "New request" (the request form). A guest's
 * magic link is exchanged for a 30-minute session kept in sessionStorage, and removed from the address bar. Plain
 * elements styled by the theme; headings take focus on every view change.
 */
import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { mount as mountRequest } from './request';
import type { WidgetNotice, WidgetSurvey } from './types';
import { widgetUrl } from './url';
import { CardBlocks, type ReplyCard } from './card';

// PRT-20: the WooCommerce order hub, loaded only where the shop has one.
const OrdersHub = lazy(
	() => import( /* webpackChunkName: "portal-orders" */ './portal-orders' )
);

// TEAM-21: the customer's custom records, loaded only where a record type is shown in the portal.
const RecordsList = lazy(
	() => import( /* webpackChunkName: "portal-records" */ './portal-records' )
);

export interface PortalTexts {
	title: string;
	loading: string;
	empty: string;
	signIn: string;
	guest: string;
	guestOnly?: string;
	/** Signed-in customers: "Signed in as %s" and a sign-out link. */
	signedInAs?: string;
	signOut?: string;
	readOnly?: string;
	colleague?: string;
	helpSearch?: string;
	popular?: string;
	noArticles?: string;
	newRequest: string;
	back: string;
	search: string;
	all: string;
	open: string;
	closed: string;
	filter: string;
	/** BRD-23: product filter label and "all" option. */
	product?: string;
	products?: string;
	you: string;
	team: string;
	reply: string;
	send: string;
	sent: string;
	error: string;
	ended: string;
	number: string;
	files: string;
	solve: string;
	solved: string;
	replyBy?: string;
	/** CNV-30: details (customer-visible fields). */
	details?: string;
	saveDetails?: string;
	savedDetails?: string;
	rate?: string;
	rated?: string;
	why?: string;
	comment?: string;
	/** PRT-04: guest sign-in by email code. */
	codeIntro?: string;
	codeEmail?: string;
	codeSend?: string;
	codeSent?: string;
	code?: string;
	codeCheck?: string;
	/** PRT-11: unread marker, sort and type filter. */
	unread?: string;
	sort?: string;
	sortRecent?: string;
	sortOldest?: string;
	sortNumber?: string;
	sortStatus?: string;
	type?: string;
	types?: string;
	/** PRT-12: attachments. */
	attach?: string;
	attachMax?: string;
	/** PRT-14: reopen window and follow-up. */
	closedNote?: string;
	followUp?: string;
	reopenNote?: string;
	/** PRT-13: type choice. */
	chooseType?: string;
	/** PRT-29: the full-screen portal (navigation, overview, sign-in, profile). */
	overview?: string;
	requests?: string;
	orders?: string;
	help?: string;
	profile?: string;
	hello?: string;
	welcome?: string;
	intro?: string;
	waiting?: string;
	resolved?: string;
	total?: string;
	needsReply?: string;
	recent?: string;
	byProduct?: string;
	seeAll?: string;
	nothingDue?: string;
	signInTitle?: string;
	withAccount?: string;
	signInNav?: string;
	or?: string;
	theme?: string;
	name?: string;
	email?: string;
	menu?: string;
}

export interface PortalConfig {
	api: string;
	nonce: string;
	signedIn: boolean;
	/** PRT-07: page language (dates, server messages). */
	lang?: string;
	/** PRT-05: anonymous | links | users. */
	access?: string;
	link: string;
	/** PRT-19: help search and popular articles; searchFirst hides New request until a search. */
	help?: { api: string; searchFirst: boolean };
	/** PRT-08: an entry point for one product (slug). */
	product?: string;
	login: string;
	/** Signed-in customers: their name and the sign-out address (back to the portal). */
	account?: { name: string; logout: string };
	request: Parameters< typeof mountRequest >[ 1 ];
	texts: PortalTexts;
	/** PRT-20 (WooCommerce): the order hub; `order` opens one order with "Get help" (PRT-16). */
	orders?: { order: number; texts: Record< string, string > };
	/** TEAM-21: the customer's custom records (read-only), when a record type is shown in the portal. */
	records?: { texts: Record< string, string > };
	/** PRT-04: guests may sign in with an email code. */
	guestCodes?: boolean;
	/** PRT-13: request types to choose from in "New request". */
	types?: Array< { key: string; name: string } >;
	/** PRT-29: the full-screen portal (`/support` with the layout "app"): brand and the customer's email. */
	app?: {
		name: string;
		logo: string;
		logoDark: string;
		home: string;
		email: string;
	};
}

export interface Card {
	uid: string;
	number: number;
	subject: string;
	product?: string;
	status: string;
	open: boolean;
	/** PRT-29: the team waits for the customer's answer. */
	waiting?: boolean;
	/** PRT-17/18: a colleague's request, who asked, and whether the customer may answer it. */
	mine?: boolean;
	from?: string;
	canAct?: boolean;
	lastAt: string | null;
	/** PRT-11: type name and a reply the customer has not opened yet. */
	type?: string;
	unread?: boolean;
}

interface Message {
	id: number;
	from: 'customer' | 'team';
	name: string;
	text: string;
	at: string;
	files: Array< { name: string; url: string } >;
	/** DEV-20: a card in a team reply. */
	card?: ReplyCard | null;
}

type View =
	{ name: 'list' } | { name: 'detail'; uid: string } | { name: 'new' };

const STORE = 'cliedesk-portal-session';
/** PRT-04: a guest's email-code session (shared with the order hub). */
const GUEST = 'cliedesk-portal-guest';

export class PortalClient {
	token = '';

	guest = '';

	constructor( private config: PortalConfig ) {
		try {
			this.token = window.sessionStorage.getItem( STORE ) ?? '';
			this.guest = window.sessionStorage.getItem( GUEST ) ?? '';
		} catch {
			this.token = '';
		}
	}

	/** PRT-04: a guest signed in (magic link or email code). */
	get session(): boolean {
		return !! ( this.token || this.guest );
	}

	/**
	 * PRT-04: ask for a sign-in code by email.
	 *
	 * @param email Email address.
	 */
	async askCode( email: string ): Promise< string > {
		return (
			await this.call< { challenge: string } >(
				'POST',
				'portal/sign-in',
				{
					email,
				}
			)
		).challenge;
	}

	/**
	 * PRT-04: check the code; the session lasts 30 minutes.
	 *
	 * @param challenge Challenge.
	 * @param code      Code.
	 */
	async checkCode( challenge: string, code: string ): Promise< void > {
		const r = await this.call< { token: string } >(
			'POST',
			'portal/sign-in/code',
			{ challenge, code }
		);
		this.guest = r.token;
		try {
			window.sessionStorage.setItem( GUEST, r.token );
		} catch {
			// Private mode: the session lasts this page view.
		}
	}

	async call< T >(
		method: 'GET' | 'POST',
		path: string,
		body?: unknown,
		query: Record< string, string > = {}
	): Promise< T > {
		const headers: Record< string, string > = {
			Accept: 'application/json',
		};
		if ( this.config.nonce ) {
			headers[ 'X-WP-Nonce' ] = this.config.nonce;
		}
		if ( this.token ) {
			headers[ 'X-Cliedesk-Portal' ] = this.token;
		} else if ( this.guest && ! this.config.signedIn ) {
			headers[ 'X-Cliedesk-Guest' ] = this.guest;
		}
		// PRT-12: files go as multipart (the browser sets the boundary).
		let payload: BodyInit | undefined;
		if ( body instanceof window.FormData ) {
			payload = body;
		} else if ( body ) {
			headers[ 'Content-Type' ] = 'application/json';
			payload = JSON.stringify( body );
		}
		const r = await fetch(
			widgetUrl( this.config.api, path, {
				...( this.config.lang ? { lang: this.config.lang } : {} ),
				...query,
			} ),
			{
				method,
				headers,
				credentials: 'same-origin',
				body: payload,
			}
		);
		const json = await r.json().catch( () => ( {} ) );
		if ( ! r.ok ) {
			throw Object.assign( new Error( json?.message ?? 'error' ), {
				status: r.status,
			} );
		}
		return json.data as T;
	}

	/** PRT-07: page language. */
	get lang(): string | undefined {
		return this.config.lang || undefined;
	}

	async exchange( link: string ): Promise< string > {
		const r = await this.call< { token: string; uid: string } >(
			'POST',
			'portal/session',
			{ link }
		);
		this.token = r.token;
		try {
			window.sessionStorage.setItem( STORE, r.token );
		} catch {
			// Private mode: the session lasts this page view.
		}
		return r.uid;
	}
}

/**
 * "Rate this conversation" (CSX-02).
 *
 * @param props        Props.
 * @param props.survey Survey.
 * @param props.t      Texts.
 * @param props.onRate Save.
 */
function PortalSurvey( {
	survey,
	t,
	onRate,
}: {
	survey: WidgetSurvey;
	t: PortalTexts;
	onRate: ( body: {
		rating: number;
		reasons?: string[];
		comment?: string;
	} ) => Promise< unknown >;
} ) {
	const [ reasons, setReasons ] = useState< string[] >( survey.chosen );
	const [ comment, setComment ] = useState( survey.comment );
	const picked = survey.choices.find( ( c ) => c.value === survey.rating );
	return (
		<section aria-labelledby="cdp-rate" className="cdp-rate">
			<h3 id="cdp-rate">{ t.rate }</h3>
			<p>{ survey.question }</p>
			<p>
				{ survey.choices.map( ( c ) => (
					<button
						key={ c.value }
						type="button"
						aria-pressed={ survey.rating === c.value }
						title={ c.label }
						onClick={ () => void onRate( { rating: c.value } ) }
					>
						<span aria-hidden="true">{ c.symbol }</span> { c.label }
					</button>
				) ) }
			</p>
			{ picked && (
				<form
					onSubmit={ ( e ) => {
						e.preventDefault();
						void onRate( {
							rating: picked.value,
							reasons,
							comment,
						} );
					} }
				>
					<p role="status">{ t.rated }</p>
					{ ! picked.positive && survey.reasons.length > 0 && (
						<fieldset>
							<legend>{ t.why }</legend>
							{ survey.reasons.map( ( r ) => (
								<label
									key={ r.key }
									htmlFor={ `cdp-why-${ r.key }` }
								>
									<input
										id={ `cdp-why-${ r.key }` }
										type="checkbox"
										checked={ reasons.includes( r.key ) }
										onChange={ ( e ) =>
											setReasons( ( all ) =>
												e.currentTarget.checked
													? [ ...all, r.key ]
													: all.filter(
															( x ) => x !== r.key
														)
											)
										}
									/>{ ' ' }
									{ r.label }
								</label>
							) ) }
						</fieldset>
					) }
					<label htmlFor="cdp-csat-comment">{ t.comment }</label>
					<textarea
						id="cdp-csat-comment"
						value={ comment }
						maxLength={ 2000 }
						onChange={ ( e ) =>
							setComment( e.currentTarget.value )
						}
					/>
					<button type="submit">{ t.send }</button>
				</form>
			) }
		</section>
	);
}

/**
 * A request's status as a badge (PRT-29): its own class for open, waiting for the customer, or closed.
 *
 * @param props      Props.
 * @param props.card The request.
 */
export function StatusBadge( {
	card,
}: {
	card: Pick< Card, 'status' | 'open' | 'waiting' >;
} ) {
	let state = 'closed';
	if ( card.waiting ) {
		state = 'waiting';
	} else if ( card.open ) {
		state = 'open';
	}
	return (
		<span className={ `cdp-status cdp-status-${ state }` }>
			{ card.status }
		</span>
	);
}

function useFocus( dep: unknown ) {
	const ref = useRef< HTMLHeadingElement >( null );
	useEffect( () => {
		ref.current?.focus();
	}, [ dep ] );
	return ref;
}

export function List( {
	client,
	t,
	fixed = '',
	help,
	onOpen,
	onNew,
}: {
	client: PortalClient;
	t: PortalTexts;
	fixed?: string;
	help?: PortalConfig[ 'help' ];
	onOpen: ( uid: string ) => void;
	onNew?: () => void;
} ) {
	const [ items, setItems ] = useState< Card[] | null >( null );
	const [ notices, setNotices ] = useState< WidgetNotice[] >( [] );
	const [ q, setQ ] = useState( '' );
	const [ state, setState ] = useState( '' );
	const [ product, setProduct ] = useState( fixed );
	const [ products, setProducts ] = useState<
		Array< { slug: string; name: string } >
	>( [] );
	// PRT-11: sort and type filter.
	const [ sort, setSort ] = useState( 'recent' );
	const [ type, setType ] = useState( '' );
	const [ types, setTypes ] = useState<
		Array< { key: string; name: string } >
	>( [] );
	const [ error, setError ] = useState( '' );
	const [ searched, setSearched ] = useState( false );
	const heading = useFocus( 'list' );
	useEffect( () => {
		let live = true;
		const timer = window.setTimeout( () => {
			client
				.call< {
					items: Card[];
					notices?: WidgetNotice[];
					products?: Array< { slug: string; name: string } >;
					types?: Array< { key: string; name: string } >;
				} >( 'GET', 'portal/conversations', undefined, {
					q,
					state,
					product,
					sort,
					type,
				} )
				.then(
					( r ) =>
						live &&
						( setItems( r.items ),
						setNotices( r.notices ?? [] ),
						setProducts( r.products ?? [] ),
						setTypes( r.types ?? [] ),
						setError( '' ) )
				)
				.catch( () => live && setError( t.error ) );
		}, 250 );
		return () => {
			live = false;
			window.clearTimeout( timer );
		};
	}, [ client, q, state, product, sort, type, t.error ] );
	return (
		<section aria-labelledby="cdp-title">
			<h2 id="cdp-title" ref={ heading } tabIndex={ -1 }>
				{ t.title }
			</h2>
			{ help && (
				<SelfService
					api={ help.api }
					t={ t }
					onSearched={ () => setSearched( true ) }
				/>
			) }
			{ notices.map( ( n ) => (
				<div
					key={ n.uid }
					className={ `cdp-notice cdp-notice-${ n.kind }` }
					role="status"
				>
					<strong>{ n.title }</strong>
					{ n.body && <p>{ n.body }</p> }
				</div>
			) ) }
			<div className="cdp-bar">
				<label htmlFor="cdp-q" className="screen-reader-text">
					{ t.search }
				</label>
				<input
					id="cdp-q"
					type="search"
					placeholder={ t.search }
					value={ q }
					onChange={ ( e ) => setQ( e.currentTarget.value ) }
				/>
				<label htmlFor="cdp-state">{ t.filter }</label>
				<select
					id="cdp-state"
					value={ state }
					onChange={ ( e ) => setState( e.currentTarget.value ) }
				>
					<option value="">{ t.all }</option>
					<option value="open">{ t.open }</option>
					{ t.waiting && (
						<option value="waiting">{ t.waiting }</option>
					) }
					<option value="closed">{ t.closed }</option>
				</select>
				{ ! fixed && ( products.length > 0 || product ) && (
					<>
						<label htmlFor="cdp-product">{ t.product }</label>
						<select
							id="cdp-product"
							value={ product }
							onChange={ ( e ) =>
								setProduct( e.currentTarget.value )
							}
						>
							<option value="">{ t.products }</option>
							{ products.map( ( pr ) => (
								<option key={ pr.slug } value={ pr.slug }>
									{ pr.name }
								</option>
							) ) }
						</select>
					</>
				) }
				{ ( types.length > 0 || type ) && (
					<>
						<label htmlFor="cdp-type">{ t.type }</label>
						<select
							id="cdp-type"
							value={ type }
							onChange={ ( e ) =>
								setType( e.currentTarget.value )
							}
						>
							<option value="">{ t.types }</option>
							{ types.map( ( ty ) => (
								<option key={ ty.key } value={ ty.key }>
									{ ty.name }
								</option>
							) ) }
						</select>
					</>
				) }
				{ t.sort && (
					<>
						<label htmlFor="cdp-sort">{ t.sort }</label>
						<select
							id="cdp-sort"
							value={ sort }
							onChange={ ( e ) =>
								setSort( e.currentTarget.value )
							}
						>
							<option value="recent">{ t.sortRecent }</option>
							<option value="oldest">{ t.sortOldest }</option>
							<option value="number">{ t.sortNumber }</option>
							<option value="status">{ t.sortStatus }</option>
						</select>
					</>
				) }
				{ onNew && ( ! help?.searchFirst || searched ) && (
					<button type="button" onClick={ onNew }>
						{ t.newRequest }
					</button>
				) }
			</div>
			{ error && <p role="alert">{ error }</p> }
			{ items === null && ! error && <p>{ t.loading }</p> }
			{ items && items.length === 0 && <p>{ t.empty }</p> }
			{ items &&
				items.length > 0 &&
				groups( items, product ? [] : products ).map( ( g ) => (
					<Fragment key={ g.slug }>
						{ g.name && <h3>{ g.name }</h3> }
						<ul className="cdp-list">
							{ g.items.map( ( c ) => (
								<li key={ c.uid } className="cdp-item">
									<button
										type="button"
										className="cdp-link"
										onClick={ () => onOpen( c.uid ) }
									>
										<strong>{ c.subject }</strong>
									</button>
									<span>
										{ c.unread && t.unread && (
											<>
												<strong className="cdp-unread">
													{ t.unread }
												</strong>{ ' ' }
												·{ ' ' }
											</>
										) }
										{ t.number.replace(
											'%d',
											String( c.number )
										) }{ ' ' }
										· <StatusBadge card={ c } />
										{ c.type ? ` · ${ c.type }` : '' }
										{ c.from && t.colleague
											? ` · ${ t.colleague.replace( '%s', c.from ) }`
											: '' }
										{ c.lastAt
											? ` · ${ new Date(
													c.lastAt
												).toLocaleDateString(
													client.lang
												) }`
											: '' }
									</span>
								</li>
							) ) }
						</ul>
					</Fragment>
				) ) }
		</section>
	);
}

/**
 * PRT-19: the self-service part of the portal home: a help search and the most read articles.
 *
 * @param props            Props.
 * @param props.api        Help API base.
 * @param props.t          Texts.
 * @param props.onSearched The customer searched (search first).
 */
export function SelfService( {
	api,
	t,
	onSearched,
}: {
	api: string;
	t: PortalTexts;
	onSearched: () => void;
} ) {
	type Article = { id: number; title: string; url: string };
	const [ q, setQ ] = useState( '' );
	const [ top, setTop ] = useState< Article[] >( [] );
	const [ found, setFound ] = useState< Article[] | null >( null );
	const get = ( path: string ) =>
		fetch( api + path, { credentials: 'same-origin' } )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.then( ( j ) =>
				Array.isArray( j?.data ) ? ( j.data as Article[] ) : []
			)
			.catch( () => [] as Article[] );
	useEffect( () => {
		void get( 'top' ).then( setTop );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- once.
	}, [ api ] );
	useEffect( () => {
		if ( q.trim().length < 2 ) {
			setFound( null );
			return;
		}
		let live = true;
		const timer = window.setTimeout( () => {
			void get(
				'search?surface=portal&q=' + encodeURIComponent( q.trim() )
			).then( ( list ) => {
				if ( live ) {
					setFound( list );
					onSearched();
				}
			} );
		}, 300 );
		return () => {
			live = false;
			window.clearTimeout( timer );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- onSearched is stable enough.
	}, [ q, api ] );
	const shown = found ?? top;
	return (
		<div className="cdp-help">
			<input
				type="search"
				aria-label={ t.helpSearch }
				placeholder={ t.helpSearch }
				value={ q }
				onChange={ ( e ) => setQ( e.currentTarget.value ) }
			/>
			{ found && found.length === 0 && <p>{ t.noArticles }</p> }
			{ ! found && top.length > 0 && <h3>{ t.popular }</h3> }
			{ shown.length > 0 && (
				<ul>
					{ shown.map( ( a ) => (
						<li key={ a.id }>
							<a href={ a.url }>{ a.title }</a>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}

/**
 * PRT-08: requests grouped by product (one unnamed group when there is only one product or a filter).
 *
 * @param items    Requests.
 * @param products Products of the customer.
 */
export function groups(
	items: Card[],
	products: Array< { slug: string; name: string } >
): Array< { slug: string; name: string; items: Card[] } > {
	if ( products.length < 2 ) {
		return [ { slug: '', name: '', items } ];
	}
	return products
		.map( ( p ) => ( {
			...p,
			items: items.filter( ( c ) => c.product === p.slug ),
		} ) )
		.filter( ( g ) => g.items.length > 0 );
}

export function Detail( {
	client,
	t,
	uid,
	onBack,
	onOpen,
}: {
	client: PortalClient;
	t: PortalTexts;
	uid: string;
	onBack: ( () => void ) | null;
	/** PRT-14: open the follow-up request. */
	onOpen?: ( uid: string ) => void;
} ) {
	const [ data, setData ] = useState<
		| ( Card & {
				items: Message[];
				replyBy?: string | null;
				survey?: WidgetSurvey | null;
				reopenUntil?: string | null;
				locked?: boolean;
				fileMaxMb?: number;
				fields?: PortalField[];
		  } )
		| null
	>( null );
	const [ edits, setEdits ] = useState< Record< string, string > >( {} );
	const files = useRef< HTMLInputElement >( null );
	const [ text, setText ] = useState( '' );
	const [ note, setNote ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const heading = useFocus( data ? uid : null );
	const load = () =>
		client
			.call<
				Card & {
					items: Message[];
					replyBy?: string | null;
					survey?: WidgetSurvey | null;
					reopenUntil?: string | null;
					locked?: boolean;
					fileMaxMb?: number;
					fields?: PortalField[];
				}
			>( 'GET', `portal/conversations/${ uid }` )
			.then( setData )
			.catch( ( e: { status?: number } ) =>
				setNote( e.status === 401 ? t.ended : t.error )
			);
	useEffect( () => {
		void load();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- load once per request.
	}, [ uid ] );
	return (
		<section aria-labelledby="cdp-detail">
			{ onBack && (
				<p>
					<button type="button" onClick={ onBack }>
						← { t.back }
					</button>
				</p>
			) }
			{ ! data && <p role="status">{ note || t.loading }</p> }
			{ data && (
				<>
					<h2 id="cdp-detail" ref={ heading } tabIndex={ -1 }>
						{ data.subject }
					</h2>
					<p className="cdp-meta">
						{ t.number.replace( '%d', String( data.number ) ) } ·{ ' ' }
						<StatusBadge card={ data } />
					</p>
					{ ( data.fields ?? [] ).length > 0 && (
						<div className="cdp-details">
							<h3>
								{ t.details ??
									/* i18n-ignore: fallback only, PHP always sends the translated label */ 'Details' }
							</h3>
							<dl>
								{ ( data.fields ?? [] ).map( ( f ) => (
									<div key={ f.key }>
										<dt>
											{ f.editable ? (
												<label
													htmlFor={ `cdp-f-${ f.key }` }
												>
													{ f.title }
												</label>
											) : (
												f.title
											) }
										</dt>
										<dd>
											{ f.editable ? (
												<input
													id={ `cdp-f-${ f.key }` }
													value={
														edits[ f.key ] ??
														fieldText( f.value )
													}
													onChange={ ( e ) =>
														setEdits( {
															...edits,
															[ f.key ]:
																e.target.value,
														} )
													}
												/>
											) : (
												fieldText( f.value )
											) }
										</dd>
									</div>
								) ) }
							</dl>
							{ Object.keys( edits ).length > 0 && (
								<button
									type="button"
									disabled={ busy }
									onClick={ () => {
										setBusy( true );
										client
											.call(
												'POST',
												`portal/conversations/${ uid }/fields`,
												{
													values: JSON.stringify(
														edits
													),
												}
											)
											.then( () => {
												setEdits( {} );
												setNote( t.savedDetails ?? '' );
												void load();
											} )
											.catch( () => setNote( t.error ) )
											.finally( () => setBusy( false ) );
									} }
								>
									{ t.saveDetails ??
										/* i18n-ignore: fallback only, PHP always sends the translated label */ 'Save' }
								</button>
							) }
						</div>
					) }
					{ data.open && data.replyBy && t.replyBy && (
						<p>
							{ t.replyBy.replace(
								'%s',
								new Intl.DateTimeFormat( undefined, {
									weekday: 'long',
									day: 'numeric',
									month: 'short',
									hour: '2-digit',
									minute: '2-digit',
								} ).format( new Date( data.replyBy ) )
							) }
						</p>
					) }
					{ data.open && data.canAct !== false && (
						<p>
							<button
								type="button"
								disabled={ busy }
								onClick={ () => {
									setBusy( true );
									client
										.call<
											Card & {
												survey?: WidgetSurvey | null;
											}
										>(
											'POST',
											`portal/conversations/${ uid }/resolve`,
											{}
										)
										.then( ( c ) => {
											setData( { ...data, ...c } );
											setNote( t.solved );
										} )
										.catch( ( e: Error ) =>
											setNote( e.message || t.error )
										)
										.finally( () => setBusy( false ) );
								} }
							>
								{ t.solve }
							</button>
						</p>
					) }
					{ data.survey && t.rate && data.canAct !== false && (
						<PortalSurvey
							survey={ data.survey }
							t={ t }
							onRate={ ( body ) =>
								client
									.call< WidgetSurvey >(
										'POST',
										`portal/conversations/${ uid }/csat`,
										body
									)
									.then( ( s ) =>
										setData( { ...data, survey: s } )
									)
									.catch( ( e: Error ) =>
										setNote( e.message || t.error )
									)
							}
						/>
					) }
					{ data.items.map( ( m ) => (
						<article
							key={ m.id }
							className={ `cdp-msg cdp-msg-${ m.from }` }
						>
							<p>
								<strong>
									{ customerName( m.from, data, t ) ||
										m.name ||
										t.team }
								</strong>{ ' ' }
								<time dateTime={ m.at }>
									{ new Date( m.at ).toLocaleString(
										client.lang
									) }
								</time>
							</p>
							<p style={ { whiteSpace: 'pre-wrap' } }>
								{ m.text }
							</p>
							{ m.card && (
								<CardBlocks
									card={ m.card }
									onPress={ ( n, values ) =>
										client
											.call(
												'POST',
												`portal/conversations/${ uid }/card`,
												{
													messageId: m.id,
													index: n,
													values: JSON.stringify(
														values ?? {}
													),
												}
											)
											.then( () => undefined )
									}
								/>
							) }
							{ m.files.length > 0 && (
								<ul aria-label={ t.files }>
									{ m.files.map( ( f ) => (
										<li key={ f.url }>
											<a
												href={ f.url }
												target="_blank"
												rel="noopener noreferrer"
											>
												{ f.name }
											</a>
										</li>
									) ) }
								</ul>
							) }
						</article>
					) ) }
					{ data.canAct === false && <p>{ t.readOnly }</p> }
					{ data.canAct !== false &&
						! data.open &&
						! data.locked &&
						data.reopenUntil &&
						t.reopenNote && (
							<p>
								{ t.reopenNote.replace(
									'%s',
									new Date(
										data.reopenUntil
									).toLocaleDateString( client.lang )
								) }
							</p>
						) }
					{ data.canAct !== false && (
						<form
							onSubmit={ ( e ) => {
								e.preventDefault();
								const chosen = Array.from(
									files.current?.files ?? []
								);
								if (
									( ! text.trim() && ! chosen.length ) ||
									busy
								) {
									return;
								}
								setBusy( true );
								// PRT-14: after the reopen window, a linked follow-up request instead.
								const path = data.locked
									? `portal/conversations/${ uid }/follow-up`
									: `portal/conversations/${ uid }`;
								let body: unknown = { text };
								if ( chosen.length && ! data.locked ) {
									const form = new window.FormData();
									form.append( 'text', text );
									chosen.forEach( ( f ) =>
										form.append( 'files[]', f )
									);
									body = form;
								}
								client
									.call< { uid?: string } >(
										'POST',
										path,
										body
									)
									.then( ( r ) => {
										setText( '' );
										if ( files.current ) {
											files.current.value = '';
										}
										setNote( t.sent );
										if ( r?.uid ) {
											onOpen?.( r.uid );
											return undefined;
										}
										return load();
									} )
									.catch( ( err: Error ) =>
										setNote( err.message || t.error )
									)
									.finally( () => setBusy( false ) );
							} }
						>
							{ data.locked && t.closedNote && (
								<p>{ t.closedNote }</p>
							) }
							<label htmlFor="cdp-reply">
								{ data.locked && t.followUp
									? t.followUp
									: t.reply }
							</label>
							<textarea
								id="cdp-reply"
								rows={ 5 }
								maxLength={ 5000 }
								value={ text }
								onChange={ ( e ) =>
									setText( e.currentTarget.value )
								}
							/>
							{ ! data.locked && t.attach && (
								<p>
									<label htmlFor="cdp-files">
										{ t.attach }
									</label>{ ' ' }
									<input
										id="cdp-files"
										ref={ files }
										type="file"
										multiple
										aria-describedby="cdp-files-max"
									/>{ ' ' }
									<small id="cdp-files-max">
										{ ( t.attachMax ?? '' ).replace(
											'%d',
											String( data.fileMaxMb ?? 10 )
										) }
									</small>
								</p>
							) }
							<p>
								<button type="submit" disabled={ busy }>
									{ data.locked && t.followUp
										? t.followUp
										: t.send }
								</button>
							</p>
							<p role="status">{ note }</p>
						</form>
					) }
				</>
			) }
		</section>
	);
}

/**
 * Who wrote a customer message: "You" on the customer's own request, the colleague's name on theirs (PRT-17).
 *
 * @param from Message side.
 * @param card The request.
 * @param t    Texts.
 */
export function customerName(
	from: string,
	card: Pick< Card, 'mine' | 'from' >,
	t: Pick< PortalTexts, 'you' >
): string {
	if ( from !== 'customer' ) {
		return '';
	}
	return card.mine === false && card.from ? card.from : t.you;
}

export function NewRequest( {
	config,
	onBack,
}: {
	config: PortalConfig;
	onBack: ( () => void ) | null;
} ) {
	const box = useRef< HTMLDivElement >( null );
	const heading = useFocus( 'new' );
	// PRT-13: the customer picks the request type when there are several.
	const [ type, setType ] = useState( config.request.type );
	useEffect( () => {
		if ( box.current ) {
			void mountRequest( box.current, { ...config.request, type } );
		}
	}, [ config.request, type ] );
	return (
		<section aria-labelledby="cdp-new">
			{ onBack && (
				<p>
					<button type="button" onClick={ onBack }>
						← { config.texts.back }
					</button>
				</p>
			) }
			<h2 id="cdp-new" ref={ heading } tabIndex={ -1 }>
				{ config.texts.newRequest }
			</h2>
			{ ( config.types?.length ?? 0 ) > 1 && (
				<p>
					<label htmlFor="cdp-new-type">
						{ config.texts.chooseType }
					</label>{ ' ' }
					<select
						id="cdp-new-type"
						value={ type }
						onChange={ ( e ) => setType( e.currentTarget.value ) }
					>
						{ config.types?.map( ( ty ) => (
							<option key={ ty.key } value={ ty.key }>
								{ ty.name }
							</option>
						) ) }
					</select>
				</p>
			) }
			<div ref={ box } />
		</section>
	);
}

/**
 * PRT-04: a guest gets a 6-digit code by email and signs in with it (30 minutes, SEC-11 limits).
 *
 * @param props        Props.
 * @param props.client Portal client.
 * @param props.t      Texts.
 * @param props.onDone Signed in.
 */
export function GuestCode( {
	client,
	t,
	onDone,
}: {
	client: PortalClient;
	t: PortalTexts;
	onDone: () => void;
} ) {
	const [ email, setEmail ] = useState( '' );
	const [ code, setCode ] = useState( '' );
	const [ challenge, setChallenge ] = useState( '' );
	const [ note, setNote ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const run = ( job: Promise< unknown > ) => {
		setBusy( true );
		job.catch( ( e: Error ) => setNote( e.message || t.error ) ).finally(
			() => setBusy( false )
		);
	};
	return (
		<form
			className="cdp-code"
			onSubmit={ ( e ) => {
				e.preventDefault();
				if ( busy ) {
					return;
				}
				if ( ! challenge ) {
					run(
						client.askCode( email ).then( ( c ) => {
							setChallenge( c );
							setNote( t.codeSent ?? '' );
						} )
					);
					return;
				}
				run( client.checkCode( challenge, code ).then( onDone ) );
			} }
		>
			<p>{ t.codeIntro }</p>
			{ ! challenge ? (
				<p>
					<label htmlFor="cdp-code-email">{ t.codeEmail }</label>{ ' ' }
					<input
						id="cdp-code-email"
						type="email"
						autoComplete="email"
						required
						value={ email }
						onChange={ ( e ) => setEmail( e.currentTarget.value ) }
					/>{ ' ' }
					<button type="submit" disabled={ busy }>
						{ t.codeSend }
					</button>
				</p>
			) : (
				<p>
					<label htmlFor="cdp-code">{ t.code }</label>{ ' ' }
					<input
						id="cdp-code"
						inputMode="numeric"
						autoComplete="one-time-code"
						maxLength={ 6 }
						required
						value={ code }
						onChange={ ( e ) => setCode( e.currentTarget.value ) }
					/>{ ' ' }
					<button type="submit" disabled={ busy }>
						{ t.codeCheck }
					</button>
				</p>
			) }
			<p role="status">{ note }</p>
		</form>
	);
}

/**
 * PRT-05: guests may send new requests only when anyone may use the portal.
 *
 * @param config Portal config.
 */
export function guestsMayAsk(
	config: Pick< PortalConfig, 'access' >
): boolean {
	return ( config.access ?? 'anonymous' ) === 'anonymous';
}

/**
 * The first view: the list for customers and link guests, the request form for other guests when they may ask.
 *
 * @param config  Portal config.
 * @param session A guest link session is open.
 */
export function listOrNew(
	config: Pick< PortalConfig, 'access' | 'signedIn' >,
	session: boolean
): View | null {
	if ( config.signedIn || session ) {
		return { name: 'list' };
	}
	return guestsMayAsk( config ) ? { name: 'new' } : null;
}

export function Portal( {
	config,
	client,
}: {
	config: PortalConfig;
	client: PortalClient;
} ) {
	const t = config.texts;
	const [ view, setView ] = useState< View | null >( null );
	const [ error, setError ] = useState( '' );
	useEffect( () => {
		if ( config.link ) {
			client
				.exchange( config.link )
				.then( ( uid ) => setView( { name: 'detail', uid } ) )
				.catch( () => setError( t.ended ) );
			try {
				const url = new URL( window.location.href );
				url.searchParams.delete( 'cliedesk_portal' );
				window.history.replaceState( null, '', url.toString() );
			} catch {
				// Keep the address as it is.
			}
			return;
		}
		// PRT-09: "Open in portal" from the widget opens that conversation.
		const wanted = new URLSearchParams( window.location.search ).get(
			'cliedesk_request'
		);
		const first = listOrNew( config, client.session );
		setView(
			first?.name === 'list' && wanted && /^[0-9A-Z]{26}$/.test( wanted )
				? { name: 'detail', uid: wanted }
				: first
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- once on load.
	}, [] );
	const canList = config.signedIn || client.session;
	const back = canList ? () => setView( { name: 'list' } ) : null;
	return (
		<div className="cdp">
			{ config.signedIn && config.account && t.signedInAs && (
				<p className="cdp-account">
					{ t.signedInAs.replace( '%s', config.account.name ) }{ ' ' }
					<a href={ config.account.logout }>{ t.signOut }</a>
				</p>
			) }
			{ error && <p role="alert">{ error }</p> }
			{ ! config.signedIn && (
				<p>
					{ guestsMayAsk( config )
						? t.guest
						: ( t.guestOnly ?? t.guest ) }{ ' ' }
					<a href={ config.login }>{ t.signIn }</a>
				</p>
			) }
			{ ! config.signedIn && ! client.session && config.guestCodes && (
				<GuestCode
					client={ client }
					t={ t }
					onDone={ () => setView( { name: 'list' } ) }
				/>
			) }
			{ config.orders && (
				<Suspense fallback={ null }>
					<OrdersHub config={ config } />
				</Suspense>
			) }
			{ config.records && canList && (
				<Suspense fallback={ null }>
					<RecordsList config={ config } />
				</Suspense>
			) }
			{ view?.name === 'list' && (
				<List
					client={ client }
					t={ t }
					fixed={ config.product }
					help={ config.help }
					onOpen={ ( uid ) => setView( { name: 'detail', uid } ) }
					onNew={
						config.signedIn || guestsMayAsk( config )
							? () => setView( { name: 'new' } )
							: undefined
					}
				/>
			) }
			{ view?.name === 'detail' && (
				<Detail
					client={ client }
					t={ t }
					uid={ view.uid }
					onBack={ back }
					onOpen={ ( uid ) => setView( { name: 'detail', uid } ) }
				/>
			) }
			{ view?.name === 'new' && (
				<NewRequest config={ config } onBack={ back } />
			) }
		</div>
	);
}

/** CNV-30: a field the customer sees on their request. */
interface PortalField {
	key: string;
	title: string;
	value: unknown;
	editable: boolean;
}

/**
 * A field value as text.
 *
 * @param value Value.
 */
function fieldText( value: unknown ): string {
	if ( null === value || undefined === value ) {
		return '';
	}
	return Array.isArray( value ) ? value.join( ', ' ) : String( value );
}
