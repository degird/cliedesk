/**
 * Chat widget loader (CHN-07, CHN-16; plan.frontend-ux.md §10.1). Budget ≤ 8 KB gzip, no framework.
 *
 * - Waits for `load` + idle, then renders the launcher button inside a Shadow DOM host `<cliedesk-widget>`.
 * - The panel bundle is prefetched on idle and runs on first open.
 * - Config comes from the script tag (`data-config`, on the workspace site) or `GET widget/config` (other sites:
 *   `data-api` + `data-product`).
 * - JS API (DEV-10): `Cliedesk( 'open' | 'close' | 'toggle' | 'hide' | 'show' | 'track' | 'runWorkflow', … )` with a
 *   queue for calls made before the loader ran, the same as methods, `Cliedesk.isOpen()` and `Cliedesk.on( event, fn )`
 *   for ready, open, close, conversation-started and message. SEC-07: `Cliedesk.identify( token )` or `data-identity`
 *   with a token signed by the site's server.
 * - SEC-12: in consent mode nothing starts until the WP Consent API (or `Cliedesk( 'consent' )`) allows the
 *   category; in private mode nothing is stored before the visitor opens the chat.
 */
import type { WidgetConfig, PanelApi, PanelStart } from './types';
import { STYLES, adoptStyles } from './styles';
import { emit, stat, widgetUrl } from './url';
import { WidgetClient, setContext } from './client';

type Command = [ string, ...unknown[] ];

declare global {
	interface Window {
		Cliedesk?: ( ( ...args: unknown[] ) => void ) & {
			q?: Command[];
			runWorkflow?: ( id: number ) => Promise< boolean >;
			track?: (
				name: string,
				properties?: Record< string, string | number | boolean >
			) => Promise< boolean >;
			open?: () => void;
			close?: () => void;
			toggle?: () => void;
			hide?: () => void;
			show?: () => void;
			isOpen?: () => boolean;
			setContext?: typeof setContext;
			prefill?: ( text: string ) => void;
			reset?: () => void;
			identify?: ( token: string ) => void;
			on?: (
				name: string,
				fn: ( detail: unknown ) => void
			) => () => void;
			off?: ( name: string, fn: ( detail: unknown ) => void ) => void;
			startConversation?: ( input: {
				message: string;
				subject?: string;
				fields?: Record< string, string >;
			} ) => Promise< string | null >;
			sendMessage?: ( text: string ) => Promise< boolean >;
			showArticle?: ( id: number ) => void;
			search?: ( query: string ) => void;
			setFields?: ( fields: Record< string, string > ) => void;
			setLocale?: ( locale: string ) => void;
			setProduct?: ( product: string ) => void;
			unreadCount?: () => number;
		};
		__cliedeskPanel?: PanelApi;
	}
}

const script = document.currentScript as HTMLScriptElement | null;

function readConfig(): Promise< WidgetConfig | null > {
	const inline = script?.dataset.config;
	if ( inline ) {
		try {
			return Promise.resolve( JSON.parse( inline ) as WidgetConfig );
		} catch {
			return Promise.resolve( null );
		}
	}
	const apiBase = script?.dataset.api;
	if ( ! apiBase ) {
		return Promise.resolve( null );
	}
	const product = script?.dataset.product ?? '';
	return fetch(
		widgetUrl( apiBase, 'config', {
			product,
			lang: navigator.language || '',
		} ),
		{
			credentials: 'omit',
		}
	)
		.then( ( r ) => ( r.ok ? r.json() : null ) )
		.then( ( j ) =>
			j?.data
				? ( {
						...j.data,
						// SEC-07: a token the site's server signed, on the script tag.
						identity: script?.dataset.identity ?? '',
					} as WidgetConfig )
				: null
		)
		.catch( () => null );
}

function idle( fn: () => void ): void {
	const run = () => {
		if ( typeof window.requestIdleCallback === 'function' ) {
			window.requestIdleCallback( fn, { timeout: 2000 } );
		} else {
			window.setTimeout( fn, 200 );
		}
	};
	if ( document.readyState === 'complete' ) {
		run();
	} else {
		window.addEventListener( 'load', run, { once: true } );
	}
}

function loadPanel( url: string ): Promise< PanelApi > {
	if ( window.__cliedeskPanel ) {
		return Promise.resolve( window.__cliedeskPanel );
	}
	return new Promise( ( resolve, reject ) => {
		const s = document.createElement( 'script' );
		s.src = url;
		s.async = true;
		s.onload = () =>
			window.__cliedeskPanel
				? resolve( window.__cliedeskPanel )
				: reject( new Error( 'panel' ) );
		s.onerror = () => reject( new Error( 'panel' ) );
		document.head.appendChild( s );
	} );
}

/**
 * Render the launcher and set up the JS API.
 *
 * @param config Config.
 */
export function start( config: WidgetConfig ): void {
	const host = document.createElement( 'cliedesk-widget' );
	const root = host.attachShadow( { mode: 'open' } );
	// CHN-16: a constructed stylesheet and CSSOM properties, so a strict CSP needs no 'unsafe-inline'.
	adoptStyles( root, STYLES );
	host.style.setProperty( '--cdw-accent', config.color );
	// CHN-10: theme and offsets; CHN-17: right-to-left languages mirror the side.
	if ( config.theme === 'light' || config.theme === 'dark' ) {
		host.classList.add( `cdw-theme-${ config.theme }` );
	}
	if ( config.offset ) {
		host.style.setProperty( '--cdw-x', `${ config.offset[ 0 ] }px` );
		host.style.setProperty( '--cdw-y', `${ config.offset[ 1 ] }px` );
	}
	if ( config.dir === 'rtl' ) {
		config.position = config.position === 'left' ? 'right' : 'left';
	}

	const launcher = document.createElement( 'button' );
	launcher.type = 'button';
	launcher.className = `cdw-launcher cdw-${ config.position }${
		config.launcher === 'label' ? ' cdw-label' : ''
	}`;
	launcher.setAttribute( 'part', 'launcher' );
	launcher.setAttribute( 'aria-label', config.texts.open );
	launcher.setAttribute( 'aria-expanded', 'false' );
	launcher.setAttribute( 'aria-controls', 'cdw-panel' );
	launcher.innerHTML =
		'<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
	if ( config.launcher === 'label' ) {
		const label = document.createElement( 'span' );
		label.textContent = config.texts.title;
		launcher.appendChild( label );
	}
	root.appendChild( launcher );

	const mount = document.createElement( 'div' );
	root.appendChild( mount );
	document.body.appendChild( host );

	let panel: PanelApi | null = null;
	let open = false;
	// DEV-10: the view the next open starts on (Cliedesk.prefill, showArticle, search).
	let startView: PanelStart | undefined;
	// DEV-10: team messages that arrived while the chat was closed (Cliedesk.unreadCount, unread:change).
	let unread = 0;
	// DEV-10: the conversation the page's own calls continue, and fields for the next one (untrusted, SEC-08).
	let lastUid: string | null = null;
	let pendingFields: Record< string, string > = {};
	const onClose = () => {
		if ( config.fullPage ) {
			return; // CHN-33: the hosted page stays open.
		}
		setOpen( false );
		launcher.focus();
	};
	const setOpen = ( next: boolean ) => {
		if ( next === open ) {
			return;
		}
		open = next;
		emit( open ? 'open' : 'close' );
		if ( open && unread > 0 ) {
			unread = 0;
			emit( 'unread:change', { count: 0 } );
		}
		launcher.setAttribute( 'aria-expanded', String( open ) );
		launcher.setAttribute(
			'aria-label',
			open ? config.texts.close : config.texts.open
		);
		if ( open ) {
			stat( config.api, config.product, 'open' );
			loadPanel( config.panel )
				.then( ( p ) => {
					panel = p;
					p.open( mount, config, onClose, startView );
					startView = undefined;
				} )
				.catch( () => {
					open = false;
					launcher.setAttribute( 'aria-expanded', 'false' );
				} );
		} else {
			panel?.close( mount );
		}
	};
	launcher.addEventListener( 'click', () => setOpen( ! open ) );
	// Prefetch the panel on idle so the first open is instant.
	idle( () => {
		const link = document.createElement( 'link' );
		link.rel = 'prefetch';
		link.href = config.panel;
		document.head.appendChild( link );
	} );

	// DEV-10: a page asks to start a rule on the visitor's open conversation (Pro's "A page asks for it" rules, AUT-21;
	// without Pro the server answers false).
	const runWorkflow = ( id: number ): Promise< boolean > => {
		const client = new WidgetClient( config );
		// SEC-12: private mode starts no session before the visitor opens the chat.
		if ( config.privacy === 'private' && ! client.hasSession() ) {
			return Promise.resolve( false );
		}
		return client.runWorkflow( id ).catch( () => false );
	};
	// DEV-12: a page records a customer event (only for visitors who already have a session).
	const track = (
		name: string,
		properties: Record< string, string | number | boolean > = {}
	): Promise< boolean > => {
		const client = new WidgetClient( config );
		if ( ! client.hasSession() ) {
			return Promise.resolve( false );
		}
		return client.track( name, properties ).catch( () => false );
	};
	const run = ( cmd: string, arg?: unknown, more?: unknown ) => {
		if ( cmd === 'runWorkflow' ) {
			void runWorkflow( Number( arg ) );
		} else if ( cmd === 'track' ) {
			void track(
				String( arg ),
				( more ?? {} ) as Record< string, string | number | boolean >
			);
		} else if ( cmd === 'open' ) {
			setOpen( true );
		} else if ( cmd === 'close' ) {
			setOpen( false );
		} else if ( cmd === 'toggle' ) {
			setOpen( ! open );
		} else if ( cmd === 'hide' || cmd === 'show' ) {
			show( cmd === 'show' );
		} else if ( cmd === 'setContext' ) {
			setContext( arg as Record< string, string > );
		} else if ( cmd === 'prefill' ) {
			prefill( String( arg ?? '' ) );
		} else if ( cmd === 'reset' ) {
			reset();
		} else if ( cmd === 'identify' ) {
			identify( String( arg ?? '' ) );
		}
	};
	// DEV-10: open on a new conversation with the text ready to send.
	const prefill = ( text: string ) =>
		openOn( { name: 'new', text: text.slice( 0, 5000 ) } );
	// DEV-10: open the panel on a view (a new conversation, an article or a help search).
	const openOn = ( view: PanelStart ) => {
		startView = view;
		if ( open && panel ) {
			panel.open( mount, config, onClose, startView );
			startView = undefined;
		} else {
			setOpen( true );
		}
	};
	// DEV-10: start a conversation from the page's own UI (no panel); resolves to its id.
	const startConversation = ( input: {
		message: string;
		subject?: string;
		fields?: Record< string, string >;
	} ): Promise< string | null > =>
		new WidgetClient( config )
			.start( {
				text: String( input.message ?? '' ).slice( 0, 5000 ),
				prefill: {
					...( input.subject ? { subject: input.subject } : {} ),
					fields: { ...pendingFields, ...( input.fields ?? {} ) },
				},
			} )
			.then( ( r ) => {
				lastUid = r.uid;
				emit( 'conversation-started', { uid: r.uid } );
				emit( 'conversation:started', { uid: r.uid } );
				return r.uid;
			} )
			.catch( () => null );
	// DEV-10: send a message in the visitor's open conversation (or start one).
	const sendMessage = async ( text: string ): Promise< boolean > => {
		const client = new WidgetClient( config );
		try {
			let uid = lastUid;
			if ( ! uid && client.hasSession() ) {
				const list = await client.conversations();
				uid =
					list.resume ??
					list.items.find( ( c ) => c.open )?.uid ??
					null;
			}
			if ( ! uid ) {
				return (
					null !== ( await startConversation( { message: text } ) )
				);
			}
			lastUid = uid;
			const r = await client.send( uid, text.slice( 0, 5000 ) );
			emit( 'message:sent', { uid, id: r.id } );
			return true;
		} catch {
			return false;
		}
	};
	window.addEventListener( 'cliedesk:message', ( e ) => {
		emit( 'message:received', ( e as CustomEvent ).detail );
		if ( ! open ) {
			emit( 'unread:change', { count: ++unread } );
		}
	} );
	// DEV-10: forget this visitor (e.g. when the site's user signs out).
	const reset = () => {
		setOpen( false );
		setContext( null );
		config.identity = '';
		window.__cliedeskPanel?.forget?.();
		try {
			window.localStorage.removeItem(
				`cliedesk:visitor:${ config.product }`
			);
			window.sessionStorage.removeItem(
				`cliedesk:visitor:${ config.product }`
			);
		} catch {
			// Storage blocked: nothing kept.
		}
		emit( 'reset' );
	};
	// SEC-07: the visitor is this customer (a token signed by the site's server); '' goes back to guest.
	const identify = ( token: string ) => {
		if ( token !== ( config.identity ?? '' ) ) {
			config.identity = token;
			window.__cliedeskPanel?.forget?.();
		}
	};
	// DEV-10: hide or show the launcher (a custom launcher can still open the chat).
	const show = ( on: boolean ) => {
		launcher.hidden = ! on;
		if ( ! on ) {
			setOpen( false );
		}
	};
	const listeners = new WeakMap<
		( detail: unknown ) => void,
		( e: Event ) => void
	>();
	const queued = window.Cliedesk?.q ?? [];
	window.Cliedesk = Object.assign(
		( ...args: unknown[] ) =>
			run( String( args[ 0 ] ), args[ 1 ], args[ 2 ] ),
		{
			runWorkflow,
			track,
			// DEV-10: methods for custom launchers and SPAs.
			open: () => setOpen( true ),
			close: () => setOpen( false ),
			toggle: () => setOpen( ! open ),
			hide: () => show( false ),
			show: () => show( true ),
			isOpen: () => open,
			setContext,
			prefill,
			reset,
			identify,
			startConversation,
			sendMessage,
			showArticle: ( id: number ) => {
				openOn( { name: 'help', article: Number( id ) } );
				emit( 'article:viewed', { id: Number( id ) } );
			},
			search: ( query: string ) =>
				openOn( { name: 'help', q: String( query ).slice( 0, 200 ) } ),
			setFields: ( fields: Record< string, string > ) => {
				pendingFields = { ...pendingFields, ...fields };
			},
			setLocale: ( locale: string ) => {
				config.lang = String( locale );
			},
			setProduct: ( product: string ) => {
				config.product = String( product );
				window.__cliedeskPanel?.forget?.();
			},
			unreadCount: () => unread,
			// Events: ready, open, close, conversation-started (conversation:started), message (message:received),
			// message:sent, article:viewed, unread:change, reset. Returns a function that stops listening.
			on: ( name: string, fn: ( detail: unknown ) => void ) => {
				const h = ( e: Event ) => fn( ( e as CustomEvent ).detail );
				listeners.set( fn, h );
				window.addEventListener( `cliedesk:${ name }`, h );
				return () =>
					window.removeEventListener( `cliedesk:${ name }`, h );
			},
			off: ( name: string, fn: ( detail: unknown ) => void ) => {
				const h = listeners.get( fn );
				if ( h ) {
					window.removeEventListener( `cliedesk:${ name }`, h );
				}
			},
		}
	);
	queued.forEach( ( [ cmd, arg, more ] ) => run( cmd, arg, more ) );
	emit( 'ready' );
	stat( config.api, config.product, 'load' );
	if ( config.fullPage ) {
		launcher.hidden = true;
		setOpen( true );
	} else {
		// CRM-20: the page this visitor is on (returning visitors only; never private or Do Not Track).
		void new WidgetClient( config ).pageView().catch( () => false );
	}
	document.addEventListener( 'click', ( e ) => {
		const t = e.target as Element | null;
		if ( t?.closest?.( '[data-cliedesk-open]' ) ) {
			e.preventDefault();
			setOpen( true );
		}
	} );
}

/**
 * SEC-12: whether the consent plugin (WP Consent API) allows a category.
 *
 * @param category Consent category.
 */
function consented( category: string ): boolean {
	const has = (
		window as Window & { wp_has_consent?: ( c: string ) => boolean }
	 ).wp_has_consent;
	return typeof has === 'function' && !! has( category );
}

/**
 * Run `go` now, or once consent is given in consent mode.
 *
 * @param config Config.
 * @param go     Start.
 */
export function whenConsented( config: WidgetConfig, go: () => void ): void {
	const category = config.consent || 'functional';
	if ( config.privacy !== 'consent' || consented( category ) ) {
		go();
		return;
	}
	let done = false;
	const once = () => {
		if ( ! done ) {
			done = true;
			go();
		}
	};
	document.addEventListener( 'wp_listen_for_consent_change', ( e ) => {
		const detail =
			( e as CustomEvent< Record< string, string > > ).detail ?? {};
		if ( detail[ category ] === 'allow' ) {
			once();
		}
	} );
	// The site's own banner can also say yes: Cliedesk( 'consent' ).
	const queue: Command[] = window.Cliedesk?.q ?? [];
	window.Cliedesk = Object.assign(
		( ...args: unknown[] ) => {
			if ( args[ 0 ] === 'consent' ) {
				once();
			} else {
				queue.push( args as Command );
			}
		},
		{ q: queue }
	);
	if ( queue.some( ( c ) => c[ 0 ] === 'consent' ) ) {
		once();
	}
}

idle( () => {
	void readConfig().then( ( config ) => {
		if ( config && ! document.querySelector( 'cliedesk-widget' ) ) {
			whenConsented( config, () => start( config ) );
		}
	} );
} );
