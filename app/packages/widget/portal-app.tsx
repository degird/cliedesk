/**
 * The full-screen customer portal (PRT-29, `/support` with the layout "app"): the helpdesk's look, light and dark,
 * around the portal's own views — Overview, Requests (one request, New request), Orders, Help and Profile. Loaded
 * only on that page (lazy chunk); the portal page and block keep the theme-styled portal. Views live in the address
 * hash (#/requests/UID…), so reload, back and forward work without server routes.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import {
	Detail,
	GuestCode,
	List,
	NewRequest,
	SelfService,
	StatusBadge,
	guestsMayAsk,
	type Card,
	type PortalClient,
	type PortalConfig,
	type PortalTexts,
} from './portal';

const OrdersHub = lazy(
	() => import( /* webpackChunkName: "portal-orders" */ './portal-orders' )
);
const RecordsList = lazy(
	() => import( /* webpackChunkName: "portal-records" */ './portal-records' )
);

/** Lucide paths (24×24, stroke) of the few icons the shell uses. */
const ICONS: Record< string, string > = {
	overview: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
	requests:
		'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
	orders: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
	// i18n-ignore: SVG path data, not text.
	help: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
	profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
	new: 'M12 5v14M5 12h14',
	'sign-in':
		'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
	theme: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
};

function Icon( { name }: { name: string } ) {
	return (
		<svg
			className="cdx-ico"
			viewBox="0 0 24 24"
			aria-hidden="true"
			focusable="false"
		>
			<path d={ ICONS[ name ] } />
		</svg>
	);
}

type Route =
	| {
			view:
				| 'overview'
				| 'requests'
				| 'new'
				| 'orders'
				| 'help'
				| 'profile'
				| 'sign-in';
	  }
	| { view: 'request'; uid: string };

/**
 * The view in the address hash (#/requests/UID, #/new…).
 *
 * @param hash Location hash.
 */
export function parseRoute( hash: string ): Route | null {
	const [ view = '', uid = '' ] = hash.replace( /^#\/?/, '' ).split( '/' );
	if ( 'requests' === view && /^[0-9A-Z]{26}$/.test( uid ) ) {
		return { view: 'request', uid };
	}
	return [
		'overview',
		'requests',
		'new',
		'orders',
		'help',
		'profile',
		'sign-in',
	].includes( view )
		? ( { view } as Route )
		: null;
}

const go = ( path: string ) => {
	window.location.hash = '#/' + path;
};

/**
 * Light or dark, shared with the helpdesk app (localStorage `cliedesk.theme`, read before the first paint).
 */
function toggleTheme(): void {
	const html = document.documentElement;
	const next =
		html.getAttribute( 'data-theme' ) === 'dark' ? 'light' : 'dark';
	html.setAttribute( 'data-theme', next );
	try {
		window.localStorage.setItem( 'cliedesk.theme', next );
	} catch {
		// Storage blocked: the choice lasts this page view.
	}
}

/**
 * "2 hours ago", in the portal's language.
 *
 * @param iso  Date.
 * @param lang Language.
 */
function ago( iso: string | null, lang?: string ): string {
	if ( ! iso ) {
		return '';
	}
	const seconds = ( new Date( iso ).getTime() - Date.now() ) / 1000;
	const steps: Array< [ Intl.RelativeTimeFormatUnit, number ] > = [
		[ 'second', 60 ],
		[ 'minute', 60 ],
		[ 'hour', 24 ],
		[ 'day', 30 ],
		[ 'month', 12 ],
		[ 'year', Infinity ],
	];
	let value = seconds;
	for ( const [ unit, size ] of steps ) {
		if ( Math.abs( value ) < size ) {
			return new Intl.RelativeTimeFormat( lang, {
				numeric: 'auto',
			} ).format( Math.round( value ), unit );
		}
		value /= size;
	}
	return '';
}

interface Summary {
	open: number;
	waiting: number;
	resolved: number;
	products: Array< {
		slug: string;
		name: string;
		open: number;
		waiting: number;
		resolved: number;
	} >;
}

function RequestRows( {
	items,
	client,
	empty,
}: {
	items: Card[] | null;
	client: PortalClient;
	empty: string;
} ) {
	if ( items === null ) {
		return null;
	}
	if ( items.length === 0 ) {
		return <p className="cdx-empty">{ empty }</p>;
	}
	return (
		<ul className="cdx-rows">
			{ items.map( ( c ) => (
				<li key={ c.uid }>
					<a className="cdx-row" href={ `#/requests/${ c.uid }` }>
						<span
							className={ c.unread ? 'cdx-dot is-on' : 'cdx-dot' }
							aria-hidden="true"
						/>
						<span className="cdx-row-title">{ c.subject }</span>
						<span className="cdx-row-meta">
							#{ c.number }
							{ c.type ? ` · ${ c.type }` : '' }
						</span>
						<span className="cdx-row-end">
							<StatusBadge card={ c } />
							<time dateTime={ c.lastAt ?? '' }>
								{ ago( c.lastAt, client.lang ) }
							</time>
						</span>
					</a>
				</li>
			) ) }
		</ul>
	);
}

/**
 * Overview: counts, what needs the customer's reply, recent requests, requests by product and popular help.
 *
 * @param props        Props.
 * @param props.config Portal configuration.
 * @param props.client Portal client.
 */
function Overview( {
	config,
	client,
}: {
	config: PortalConfig;
	client: PortalClient;
} ) {
	const t = config.texts;
	const [ sum, setSum ] = useState< Summary | null >( null );
	const [ due, setDue ] = useState< Card[] | null >( null );
	const [ recent, setRecent ] = useState< Card[] | null >( null );
	const [ error, setError ] = useState( '' );
	useEffect( () => {
		const list = ( query: Record< string, string > ) =>
			client
				.call< { items: Card[] } >(
					'GET',
					'portal/conversations',
					undefined,
					{ limit: '5', ...query }
				)
				.then( ( r ) => r.items );
		Promise.all( [
			client.call< Summary >( 'GET', 'portal/summary' ),
			list( { state: 'waiting' } ),
			list( {} ),
		] )
			.then( ( [ s, w, r ] ) => {
				setSum( s );
				setDue( w );
				setRecent( r );
			} )
			.catch( () => setError( t.error ) );
	}, [ client, t.error ] );
	const first = ( config.account?.name ?? '' ).split( ' ' )[ 0 ] ?? '';
	const stats: Array< [ string, number, string ] > = sum
		? [
				[ t.open, sum.open, 'open' ],
				[ t.waiting ?? '', sum.waiting, 'waiting' ],
				[ t.resolved ?? '', sum.resolved, 'resolved' ],
				[ t.total ?? '', sum.open + sum.resolved, 'total' ],
			]
		: [];
	return (
		<>
			<PageHead
				title={
					first && t.hello
						? t.hello.replace( '%s', first )
						: ( t.welcome ?? t.title )
				}
				intro={ t.intro }
				action={ <NewButton t={ t } /> }
			/>
			{ error && (
				<p className="cdx-alert" role="alert">
					{ error }
				</p>
			) }
			{ ! sum && ! error && <p role="status">{ t.loading }</p> }
			{ sum && (
				<>
					<div className="cdx-stats">
						{ stats.map( ( [ label, n, key ] ) => (
							<div
								key={ key }
								className={ `cdx-card cdx-stat is-${ key }` }
							>
								<span className="cdx-stat-label">
									{ label }
								</span>
								<span className="cdx-stat-value">{ n }</span>
							</div>
						) ) }
					</div>
					<div className="cdx-split">
						<div className="cdx-stack">
							<section
								className="cdx-card"
								aria-labelledby="cdx-due"
							>
								<header className="cdx-card-head">
									<h2 id="cdx-due">{ t.needsReply }</h2>
								</header>
								<RequestRows
									items={ due }
									client={ client }
									empty={ t.nothingDue ?? t.empty }
								/>
							</section>
							<section
								className="cdx-card"
								aria-labelledby="cdx-recent"
							>
								<header className="cdx-card-head">
									<h2 id="cdx-recent">{ t.recent }</h2>
									<a href="#/requests">{ t.seeAll }</a>
								</header>
								<RequestRows
									items={ recent }
									client={ client }
									empty={ t.empty }
								/>
							</section>
						</div>
						<div className="cdx-stack">
							{ sum.products.length > 0 && (
								<section
									className="cdx-card"
									aria-labelledby="cdx-products"
								>
									<header className="cdx-card-head">
										<h2 id="cdx-products">
											{ t.byProduct }
										</h2>
									</header>
									<ul className="cdx-bars">
										{ sum.products.map( ( p ) => {
											const all =
												p.open + p.resolved || 1;
											return (
												<li key={ p.slug }>
													<span className="cdx-bars-label">
														<span>{ p.name }</span>
														<span>
															{ p.open }{ ' ' }
															{ t.open } ·{ ' ' }
															{ p.resolved }{ ' ' }
															{ t.resolved }
														</span>
													</span>
													<span
														className="cdx-bar"
														aria-hidden="true"
													>
														<i
															className="is-open"
															style={ {
																width: `${ ( ( p.open - p.waiting ) / all ) * 100 }%`,
															} }
														/>
														<i
															className="is-waiting"
															style={ {
																width: `${ ( p.waiting / all ) * 100 }%`,
															} }
														/>
														<i
															className="is-resolved"
															style={ {
																width: `${ ( p.resolved / all ) * 100 }%`,
															} }
														/>
													</span>
												</li>
											);
										} ) }
									</ul>
								</section>
							) }
							{ config.help && (
								<section
									className="cdx-card cdx-card-pad"
									aria-label={ t.help }
								>
									<SelfService
										api={ config.help.api }
										t={ t }
										onSearched={ () => undefined }
									/>
								</section>
							) }
						</div>
					</div>
				</>
			) }
		</>
	);
}

function PageHead( {
	title,
	intro,
	action,
}: {
	title: string;
	intro?: string;
	action?: ReactNode;
} ) {
	return (
		<header className="cdx-head">
			<div>
				<h1 tabIndex={ -1 }>{ title }</h1>
				{ intro && <p>{ intro }</p> }
			</div>
			{ action }
		</header>
	);
}

function NewButton( { t }: { t: PortalTexts } ) {
	return (
		<a className="cdx-btn cdx-btn-primary" href="#/new">
			<Icon name="new" />
			{ t.newRequest }
		</a>
	);
}

/**
 * Signed out: sign in with an account, or with an email code (guests), or send a request when guests may.
 *
 * @param props        Props.
 * @param props.config Portal configuration.
 * @param props.client Portal client.
 * @param props.onIn   Signed in with a code.
 */
function SignIn( {
	config,
	client,
	onIn,
}: {
	config: PortalConfig;
	client: PortalClient;
	onIn: () => void;
} ) {
	const t = config.texts;
	return (
		<section className="cdx-card cdx-signin" aria-labelledby="cdx-signin">
			<h1 id="cdx-signin" tabIndex={ -1 }>
				{ t.signInTitle ?? t.signIn }
			</h1>
			<p>
				{ guestsMayAsk( config )
					? t.guest
					: ( t.guestOnly ?? t.guest ) }
			</p>
			<a
				className="cdx-btn cdx-btn-primary cdx-btn-block"
				href={ config.login }
			>
				<Icon name="sign-in" />
				{ t.withAccount ?? t.signIn }
			</a>
			{ config.guestCodes && (
				<>
					<p className="cdx-or">
						<span>{ t.or }</span>
					</p>
					<GuestCode client={ client } t={ t } onDone={ onIn } />
				</>
			) }
			{ guestsMayAsk( config ) && (
				<p className="cdx-signin-new">
					<a href="#/new">{ t.newRequest }</a>
				</p>
			) }
		</section>
	);
}

/**
 * Profile: who is signed in, their records (when shared with the portal), and sign out.
 *
 * @param props        Props.
 * @param props.config Portal configuration.
 * @param props.onOut  Sign out of a guest session.
 */
function Profile( {
	config,
	onOut,
}: {
	config: PortalConfig;
	onOut: () => void;
} ) {
	const t = config.texts;
	return (
		<>
			<PageHead title={ t.profile ?? '' } />
			<div className="cdx-stack">
				{ config.account && (
					<section className="cdx-card cdx-card-pad">
						<dl className="cdx-props">
							<dt>{ t.name }</dt>
							<dd>{ config.account.name }</dd>
							{ config.app?.email && (
								<>
									<dt>{ t.email }</dt>
									<dd>{ config.app.email }</dd>
								</>
							) }
						</dl>
					</section>
				) }
				{ config.records && (
					<Suspense fallback={ null }>
						<section className="cdx-card cdx-card-pad">
							<RecordsList config={ config } />
						</section>
					</Suspense>
				) }
				<section className="cdx-card cdx-card-pad">
					{ config.account ? (
						<a className="cdx-btn" href={ config.account.logout }>
							{ t.signOut }
						</a>
					) : (
						<button
							type="button"
							className="cdx-btn"
							onClick={ onOut }
						>
							{ t.signOut }
						</button>
					) }
				</section>
			</div>
		</>
	);
}

/**
 * The full-screen portal.
 *
 * @param props        Props.
 * @param props.config Portal configuration.
 * @param props.client Portal client.
 */
export default function PortalApp( {
	config,
	client,
}: {
	config: PortalConfig;
	client: PortalClient;
} ) {
	const t = config.texts;
	const [ inside, setInside ] = useState( config.signedIn || client.session );
	const [ route, setRoute ] = useState< Route | null >( () =>
		parseRoute( window.location.hash )
	);
	const [ error, setError ] = useState( '' );
	useEffect( () => {
		const on = () => setRoute( parseRoute( window.location.hash ) );
		window.addEventListener( 'hashchange', on );
		// A magic link from an email: exchange it for a session, open its request, take it out of the address.
		if ( config.link ) {
			client
				.exchange( config.link )
				.then( ( uid ) => {
					setInside( true );
					go( `requests/${ uid }` );
				} )
				.catch( () => setError( t.ended ) );
			try {
				const url = new URL( window.location.href );
				url.searchParams.delete( 'cliedesk_portal' );
				window.history.replaceState( null, '', url.toString() );
			} catch {
				// Keep the address as it is.
			}
		} else {
			// PRT-09: "Open in portal" from the widget opens that request.
			const wanted = new URLSearchParams( window.location.search ).get(
				'cliedesk_request'
			);
			if ( wanted && /^[0-9A-Z]{26}$/.test( wanted ) ) {
				go( `requests/${ wanted }` );
			}
		}
		return () => window.removeEventListener( 'hashchange', on );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- once on load.
	}, [] );
	useEffect( () => {
		document
			.querySelector< HTMLElement >( '.cdx-main h1, .cdx-main h2' )
			?.focus();
		window.scrollTo( 0, 0 );
	}, [ route ] );

	const guestNew = guestsMayAsk( config );
	// Signed out, only the help, a new request (when guests may) and the sign-in are open.
	let view = route?.view ?? ( inside ? 'overview' : 'sign-in' );
	if (
		! inside &&
		! [ 'help', 'sign-in', ...( guestNew ? [ 'new' ] : [] ) ].includes(
			view
		)
	) {
		view = 'sign-in';
	}
	if ( inside && 'sign-in' === view ) {
		view = 'overview';
	}
	// The menu: what this visitor can open (orders and help only when the site has them).
	const nav = (
		inside
			? [
					[ 'overview', t.overview ],
					[ 'requests', t.requests ],
					[ 'orders', config.orders ? t.orders : '' ],
					[ 'help', config.help ? t.help : '' ],
					[ 'profile', t.profile ],
				]
			: [
					[ 'help', config.help ? t.help : '' ],
					[ 'new', guestNew ? t.newRequest : '' ],
					[ 'sign-in', t.signInNav ?? t.signIn ],
				]
	).filter( ( [ , label ] ) => !! label ) as Array< [ string, string ] >;
	// One request and New request belong to Requests (signed in).
	const current =
		inside && ( 'request' === view || 'new' === view ) ? 'requests' : view;
	const signOut = () => {
		try {
			window.sessionStorage.removeItem( 'cliedesk-portal-session' );
			window.sessionStorage.removeItem( 'cliedesk-portal-guest' );
		} catch {
			// Nothing stored.
		}
		window.location.hash = '';
		window.location.reload();
	};
	const brand = config.app;

	let body: ReactNode = null;
	if ( 'sign-in' === view ) {
		body = (
			<SignIn
				config={ config }
				client={ client }
				onIn={ () => {
					setInside( true );
					go( 'overview' );
				} }
			/>
		);
	} else if ( 'overview' === view ) {
		body = <Overview config={ config } client={ client } />;
	} else if ( 'requests' === view ) {
		body = (
			<List
				client={ client }
				t={ t }
				fixed={ config.product }
				onOpen={ ( uid ) => go( `requests/${ uid }` ) }
				onNew={ () => go( 'new' ) }
			/>
		);
	} else if ( 'request' === view && route && 'uid' in route ) {
		body = (
			<Detail
				key={ route.uid }
				client={ client }
				t={ t }
				uid={ route.uid }
				onBack={ () => go( 'requests' ) }
				onOpen={ ( uid ) => go( `requests/${ uid }` ) }
			/>
		);
	} else if ( 'new' === view ) {
		body = (
			<NewRequest
				config={ config }
				onBack={ inside ? () => go( 'requests' ) : null }
			/>
		);
	} else if ( 'orders' === view && config.orders ) {
		body = (
			<>
				<PageHead title={ t.orders ?? '' } />
				<Suspense fallback={ <p role="status">{ t.loading }</p> }>
					<OrdersHub config={ config } />
				</Suspense>
			</>
		);
	} else if ( 'help' === view && config.help ) {
		body = (
			<>
				<PageHead title={ t.help ?? '' } />
				<section className="cdx-card cdx-card-pad">
					<SelfService
						api={ config.help.api }
						t={ t }
						onSearched={ () => undefined }
					/>
				</section>
			</>
		);
	} else if ( 'profile' === view ) {
		body = <Profile config={ config } onOut={ signOut } />;
	}

	return (
		<div className="cdx-shell">
			<nav className="cdx-rail" aria-label={ t.menu }>
				<a
					className="cdx-rail-brand"
					href={ brand?.home ?? '/' }
					title={ brand?.name }
				>
					{ brand?.logo ? (
						<picture>
							<source
								srcSet={ brand.logoDark }
								media="(prefers-color-scheme: dark)"
							/>
							<img src={ brand.logo } alt={ brand.name } />
						</picture>
					) : (
						<span aria-hidden="true">
							{ ( brand?.name ?? '' )
								.slice( 0, 1 )
								.toUpperCase() }
						</span>
					) }
				</a>
				{ nav.map( ( [ key, label ] ) => (
					<a
						key={ key }
						href={ `#/${ key }` }
						className="cdx-rail-item"
						aria-current={ current === key ? 'page' : undefined }
					>
						<Icon name={ key } />
						<span>{ label }</span>
					</a>
				) ) }
			</nav>
			<div className="cdx-col">
				<header className="cdx-top">
					<span className="cdx-top-name">{ brand?.name }</span>
					<button
						type="button"
						className="cdx-iconbtn"
						aria-label={ t.theme }
						title={ t.theme }
						onClick={ toggleTheme }
					>
						<Icon name="theme" />
					</button>
					{ inside && config.account && (
						<a
							className="cdx-avatar"
							href="#/profile"
							title={ config.account.name }
						>
							{ config.account.name.slice( 0, 1 ).toUpperCase() }
						</a>
					) }
				</header>
				<main id="cdx-main" className="cdx-main">
					{ error && (
						<p className="cdx-alert" role="alert">
							{ error }
						</p>
					) }
					{ body }
				</main>
			</div>
		</div>
	);
}
