/**
 * Chat widget panel (CHN-07, CHN-17): Home (greeting, the visitor's conversations), a new conversation, and a
 * conversation with polling while it is open. Written against the React API and built with preact/compat
 * (budget ≤ 32 KB gzip). Non-modal dialog on desktop (no focus trap), Esc closes; messages are a polite live log;
 * all text is rendered as text.
 */
import { CardBlocks } from './card';
import {
	createContext,
	lazy,
	Suspense,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { botApi } from './bot';
import { emit, stat, widgetUrl } from './url';
import type { WidgetClient } from './client';
import type {
	WidgetConfig,
	WidgetConversation,
	WidgetMessage,
	WidgetChallenge,
	WidgetOffline,
	WidgetTexts,
	WidgetWithin,
	WidgetSurvey,
	WidgetNotice,
	WidgetQueue,
} from './types';
import { mount as mountRequest } from './request';

// COM-25: product cards load only when a message has one.
const ProductCard = lazy(
	() => import( /* webpackChunkName: "product-card" */ './ProductCard' )
);

export const POLL_MS = 4000;

/**
 * CHN-13: the mode for a page address: the first rule whose pattern it contains (or matches, with * as wildcard).
 *
 * @param config Config.
 * @param href   Page address.
 */
export function pageMode(
	config: WidgetConfig,
	href: string
): { mode: 'search' | 'form'; type: string } | null {
	for ( const r of config.pageModes ?? [] ) {
		const hit = r.pattern.includes( '*' )
			? new RegExp(
					'^' +
						r.pattern
							.split( '*' )
							.map( ( p ) =>
								p.replace( /[.+?^${}()|[\]\\]/g, '\\$&' )
							)
							.join( '.*' ) +
						'$',
					'i'
				).test( href )
			: href.toLowerCase().includes( r.pattern.toLowerCase() );
		if ( hit ) {
			return { mode: r.mode, type: r.type };
		}
	}
	// CHN-15: search before contact everywhere else.
	return config.searchFirst ? { mode: 'search', type: 'request' } : null;
}

/** True in the settings preview: nothing moves focus. */
const Preview = createContext( false );

type View =
	| { name: 'home' }
	| { name: 'new'; text?: string }
	| { name: 'chat'; uid: string }
	// DEV-10: Cliedesk.showArticle() and Cliedesk.search().
	| { name: 'help'; article?: number; q?: string };

const Icon = ( { d, flip }: { d: string; flip?: boolean } ) => (
	<svg
		aria-hidden="true"
		className={ flip ? 'cdw-flip' : undefined }
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
	>
		<path d={ d } />
	</svg>
);

export function ChatPanel( {
	config,
	client,
	onClose,
	preview = false,
	start,
}: {
	config: WidgetConfig;
	client: WidgetClient;
	onClose: () => void;
	/** Settings preview: never moves focus. */
	preview?: boolean;
	/** DEV-10: open on a new conversation with this text (Cliedesk.prefill), an article or a help search. */
	start?: View;
} ) {
	const t = config.texts;
	const [ view, setView ] = useState< View >( start ?? { name: 'home' } );
	// CHN-08: the space shown on the home view (tabs when there are several).
	const spaces = config.spaces ?? [ 'home' ];
	const [ space, setSpace ] = useState(
		spaces.includes( config.defaultSpace ?? 'home' )
			? ( config.defaultSpace ?? 'home' )
			: 'home'
	);
	const cards = config.cards ?? [];
	const mode = useMemo(
		() => pageMode( config, window.location.href ),
		[ config ]
	);
	const [ error, setError ] = useState< string | null >( null );
	const [ offline, setOffline ] = useState< WidgetOffline >( null );
	const [ notice, setNotice ] = useState< string | null >( null );
	const [ challenge, setChallenge ] = useState< WidgetChallenge >( null );
	const panel = useRef< HTMLDivElement >( null );

	useEffect( () => {
		if ( ! preview ) {
			panel.current?.focus();
		}
	}, [ preview ] );

	return (
		// The dialog container handles Esc for everything inside it (CHN-17).
		// eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
		<div
			id="cdw-panel"
			ref={ panel }
			role="dialog"
			aria-modal={ modal() && ! preview ? true : undefined }
			aria-label={ t.title }
			lang={ config.lang }
			dir={ config.dir }
			tabIndex={ -1 }
			className={ `cdw-panel cdw-${ config.position }${
				config.fullPage ? ' cdw-full' : ''
			}` }
			onKeyDown={ ( e ) => {
				if ( e.key === 'Escape' ) {
					e.stopPropagation();
					onClose();
				}
				trapFocus( e, panel.current );
			} }
		>
			<div className="cdw-head">
				{ view.name !== 'home' && (
					<button
						type="button"
						className="cdw-icon"
						aria-label={ t.back }
						onClick={ () => setView( { name: 'home' } ) }
					>
						<Icon d="M15 18l-6-6 6-6" flip />
					</button>
				) }
				{ config.logo && (
					<img className="cdw-logo" src={ config.logo } alt="" />
				) }
				<h2>{ t.title }</h2>
				<button
					type="button"
					className="cdw-icon"
					aria-label={ t.close }
					onClick={ onClose }
				>
					<Icon d="M18 6L6 18M6 6l12 12" />
				</button>
			</div>
			<Preview.Provider value={ preview }>
				{ error && (
					<p
						className="cdw-error"
						role="alert"
						style={ { margin: '8px 16px' } }
					>
						{ error }
					</p>
				) }
				{ view.name === 'help' && (
					<HelpSearch
						config={ config }
						article={ view.article }
						query={ view.q }
						onContact={
							config.canStart === false
								? undefined
								: () => setView( { name: 'new' } )
						}
					/>
				) }
				{ view.name === 'home' && mode?.mode === 'search' && (
					<HelpSearch
						config={ config }
						onContact={
							config.canStart === false
								? undefined
								: () => setView( { name: 'new' } )
						}
					/>
				) }
				{ view.name === 'home' &&
					mode?.mode === 'form' &&
					config.request && (
						<RequestForm config={ config } type={ mode.type } />
					) }
				{ view.name === 'home' && ! mode && spaces.length > 1 && (
					<div className="cdw-spaces">
						{ spaces.map( ( s ) => (
							<button
								key={ s }
								type="button"
								aria-pressed={ space === s }
								onClick={ () => setSpace( s ) }
							>
								{
									{
										home: t.spaceHome,
										messages: t.spaceMessages,
										help: t.spaceHelp,
									}[ s ]
								}
							</button>
						) ) }
					</div>
				) }
				{ view.name === 'home' && ! mode && space === 'help' && (
					<HelpSearch config={ config } />
				) }
				{ view.name === 'home' &&
					! mode &&
					space === 'home' &&
					cards.length > 0 && (
						<Cards
							config={ config }
							onNew={ () => setView( { name: 'new' } ) }
						/>
					) }
				{ view.name === 'home' &&
					! mode &&
					( space === 'messages' ||
						( space === 'home' && ! cards.length ) ) && (
						<Home
							config={ config }
							client={ client }
							offline={ offline }
							onOffline={ setOffline }
							onChallenge={ setChallenge }
							onOpen={ ( uid ) =>
								setView( { name: 'chat', uid } )
							}
							onNew={ ( text ) =>
								setView( { name: 'new', text } )
							}
							onError={ setError }
						/>
					) }
				{ view.name === 'new' && offline && (
					<OfflineForm
						config={ config }
						client={ client }
						challenge={ challenge }
						offline={ offline }
						onStarted={ ( uid ) => {
							emit( 'conversation-started', { uid } );
							setError( null );
							setNotice( config.texts.gotIt );
							setView( { name: 'chat', uid } );
						} }
					/>
				) }
				{ view.name === 'new' && ! offline && (
					<NewChat
						initial={ view.text }
						config={ config }
						client={ client }
						challenge={ challenge }
						onStarted={ ( uid ) => {
							emit( 'conversation-started', { uid } );
							setError( null );
							setView( { name: 'chat', uid } );
						} }
						onError={ setError }
						onHelped={ () => setView( { name: 'home' } ) }
					/>
				) }
				{ view.name === 'chat' && (
					<Chat
						config={ config }
						client={ client }
						uid={ view.uid }
						notice={ notice }
						onError={ setError }
					/>
				) }
			</Preview.Provider>
			{ config.credit && <p className="cdw-credit">{ t.credit }</p> }
		</div>
	);
}

/**
 * "We're away" text, with when the team is back in the visitor's own time and language (CHN-29).
 *
 * @param t       Texts.
 * @param offline Offline state.
 */
/**
 * Reply promise (SLA-20): "We'll reply by Tuesday 10:00" in the visitor's time when the SLA gives a time further away
 * than an hour, else "within minutes / hours / a day".
 *
 * @param t       Texts.
 * @param replyBy Reply-by time (ISO) or null.
 * @param within  Target label or null.
 * @param now     Now (ms).
 */
export function promiseText(
	t: WidgetTexts,
	replyBy: string | null | undefined,
	within: WidgetWithin | undefined,
	now = Date.now()
): string | null {
	if ( replyBy && Date.parse( replyBy ) - now > 3600 * 1000 ) {
		const when = new Intl.DateTimeFormat( undefined, {
			weekday: 'long',
			hour: '2-digit',
			minute: '2-digit',
		} ).format( new Date( replyBy ) );
		return t.replyBy.replace( '%s', when );
	}
	switch ( within ) {
		case 'minutes':
			return t.replyMinutes;
		case 'hours':
			return t.replyHours;
		case 'day':
			return t.replyDay;
		case 'days':
			return t.replyDays;
	}
	return null;
}

/**
 * CSAT card (CSX-02): choose a rating; after a low rating, why, and a comment.
 *
 * @param props        Props.
 * @param props.survey Survey.
 * @param props.t      Texts.
 * @param props.onRate Save.
 */
export function SurveyCard( {
	survey,
	t,
	onRate,
}: {
	survey: WidgetSurvey;
	t: WidgetTexts;
	onRate: ( body: {
		rating: number;
		reasons?: string[];
		comment?: string;
	} ) => Promise< unknown >;
} ) {
	const [ reasons, setReasons ] = useState< string[] >( survey.chosen );
	const [ comment, setComment ] = useState( survey.comment );
	const [ busy, setBusy ] = useState( false );
	const picked = survey.choices.find( ( c ) => c.value === survey.rating );
	const send = ( body: {
		rating: number;
		reasons?: string[];
		comment?: string;
	} ) => {
		setBusy( true );
		void onRate( body ).finally( () => setBusy( false ) );
	};
	return (
		<div className="cdw-survey" role="group" aria-label={ survey.question }>
			<p className="cdw-greet">{ survey.question }</p>
			<div className="cdw-choices">
				{ survey.choices.map( ( c ) => (
					<button
						key={ c.value }
						type="button"
						aria-pressed={ survey.rating === c.value }
						disabled={ busy }
						title={ c.label }
						onClick={ () => send( { rating: c.value } ) }
					>
						<span aria-hidden="true">{ c.symbol }</span>
						<span className="cdw-sr">{ c.label }</span>
					</button>
				) ) }
			</div>
			{ picked && (
				<form
					onSubmit={ ( e ) => {
						e.preventDefault();
						send( { rating: picked.value, reasons, comment } );
					} }
				>
					<p className="cdw-greet" role="status">
						{ t.csatThanks }
					</p>
					{ ! picked.positive && survey.reasons.length > 0 && (
						<fieldset>
							<legend>{ t.csatWhy }</legend>
							{ survey.reasons.map( ( r ) => (
								<label
									key={ r.key }
									htmlFor={ `cdw-why-${ r.key }` }
								>
									<input
										id={ `cdw-why-${ r.key }` }
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
					<label htmlFor="cdw-csat-comment">{ t.csatComment }</label>
					<textarea
						id="cdw-csat-comment"
						value={ comment }
						maxLength={ 2000 }
						onChange={ ( e ) =>
							setComment( e.currentTarget.value )
						}
					/>
					<button type="submit" disabled={ busy }>
						{ t.send }
					</button>
				</form>
			) }
		</div>
	);
}

export function awayText( t: WidgetTexts, offline: WidgetOffline ): string {
	if ( ! offline?.opensAt ) {
		return offline?.closure || t.away;
	}
	// SLA-26: a closure names the reopening day.
	const when = new Intl.DateTimeFormat(
		undefined,
		offline.closure !== undefined
			? { weekday: 'long', day: 'numeric', month: 'long' }
			: { weekday: 'long', hour: '2-digit', minute: '2-digit' }
	).format( new Date( offline.opensAt ) );
	const back = t.awayUntil.replace( '%s', when );
	return offline.closure ? `${ offline.closure } ${ back }` : back;
}

/**
 * CHN-26: "You are number 3 in line. About 6 min."
 *
 * @param t     Texts.
 * @param queue Place in line.
 */
export function queueText(
	t: WidgetConfig[ 'texts' ],
	queue: WidgetQueue
): string {
	const place = ( t.queuePosition ?? 'You are number %d in line.' ).replace(
		'%d',
		String( queue.position )
	);
	return queue.etaMinutes === null
		? place
		: `${ place } ${ ( t.queueEta ?? 'About %d min.' ).replace(
				'%d',
				String( queue.etaMinutes )
			) }`;
}

/**
 * CHN-33: subject, order number and fields from the chat link, sent with the first message.
 *
 * @param config Config.
 */
function linkPrefill( config: WidgetConfig ) {
	const p = config.prefill;
	if ( ! p || ( ! p.subject && ! p.order && ! p.fields ) ) {
		return {};
	}
	return {
		prefill: {
			...( p.subject ? { subject: p.subject } : {} ),
			...( p.order ? { order: p.order } : {} ),
			...( p.fields ? { fields: p.fields } : {} ),
		},
	};
}

/**
 * CHN-08: Home cards in the admin's order.
 *
 * @param props        Props.
 * @param props.config Config.
 * @param props.onNew  Start a conversation.
 */
function Cards( {
	config,
	onNew,
}: {
	config: WidgetConfig;
	onNew: () => void;
} ) {
	const t = config.texts;
	return (
		<div className="cdw-body">
			<p className="cdw-greet">{ t.greeting }</p>
			{ ( config.cards ?? [] ).map( ( c, i ) => (
				<section key={ i } className="cdw-card">
					{ c.title && <h3>{ c.title }</h3> }
					{ c.type === 'start' && config.canStart !== false && (
						<button
							type="button"
							className="cdw-start"
							onClick={ onNew }
						>
							{ c.text || t.newChat }
						</button>
					) }
					{ c.type === 'search' && <HelpSearch config={ config } /> }
					{ c.type === 'text' && c.text && <p>{ c.text }</p> }
					{ c.type === 'link' && c.url && (
						<a
							href={ c.url }
							target="_blank"
							rel="noopener noreferrer"
						>
							{ c.text || c.url }
						</a>
					) }
				</section>
			) ) }
		</div>
	);
}

/**
 * CHN-08: search the help center from the widget (public articles; opens them in a new tab).
 *
 * @param props        Props.
 * @param props.config Config.
 */
export function HelpSearch( {
	config,
	onContact,
	article,
	query = '',
}: {
	config: WidgetConfig;
	/** CHN-13 search first: the contact button appears after a search. */
	onContact?: () => void;
	/** DEV-10: open this article at once (Cliedesk.showArticle). */
	article?: number;
	/** DEV-10: start with this search (Cliedesk.search). */
	query?: string;
} ) {
	const t = config.texts;
	const [ q, setQ ] = useState( query );
	const [ found, setFound ] = useState< Array< {
		id: number;
		title: string;
		url: string;
		excerpt?: string;
		/** KB-27: article, or product. */
		source?: string;
	} > | null >( null );
	// KB-46: popular articles before a search, and one article read inline.
	const [ top, setTop ] = useState<
		Array< {
			id: number;
			title: string;
			url: string;
		} >
	>( [] );
	const [ reading, setReading ] = useState< {
		title: string;
		url: string;
		html: string;
	} | null >( null );
	const help = config.api.replace( /widget\/?$/, '' ) + 'help/';
	useEffect( () => {
		fetch( help + 'top', { credentials: 'omit' } )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.then( ( j ) => setTop( Array.isArray( j?.data ) ? j.data : [] ) )
			.catch( () => setTop( [] ) );
	}, [ help ] );
	const read = ( id: number ) =>
		fetch( help + 'articles/' + id, { credentials: 'omit' } )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.then( ( j ) => j?.data && setReading( j.data ) )
			.catch( () => undefined );
	useEffect( () => {
		if ( article ) {
			void read( article );
		}
		// Only the article asked for when the panel opened.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ article ] );
	useEffect( () => {
		if ( q.trim().length < 2 ) {
			setFound( null );
			return;
		}
		let live = true;
		const timer = window.setTimeout( () => {
			// RPT-30: a help search (counts only).
			stat( config.api, config.product, 'search' );
			fetch(
				config.api.replace( /widget\/?$/, '' ) +
					'help/search?surface=widget&q=' +
					encodeURIComponent( q.trim() ),
				{ credentials: 'omit' }
			)
				.then( ( r ) => ( r.ok ? r.json() : null ) )
				.then(
					( j ) =>
						live &&
						setFound( Array.isArray( j?.data ) ? j.data : [] )
				)
				.catch( () => live && setFound( [] ) );
		}, 300 );
		return () => {
			live = false;
			window.clearTimeout( timer );
		};
	}, [ q, config.api, config.product ] );
	if ( reading ) {
		return (
			<div className="cdw-body cdw-help">
				<button
					type="button"
					className="cdw-link"
					onClick={ () => setReading( null ) }
				>
					← { t.back }
				</button>
				<article className="cdw-article">
					<h3>{ reading.title }</h3>
					<div
						// Article HTML from this site, filtered by wp_kses_post on the server.
						dangerouslySetInnerHTML={ { __html: reading.html } }
					/>
					<a
						href={ reading.url }
						target="_blank"
						rel="noopener noreferrer"
					>
						{ t.openArticle }
					</a>
				</article>
				{ onContact && (
					<button
						type="button"
						className="cdw-start"
						onClick={ onContact }
					>
						{ t.stillHelp }
					</button>
				) }
			</div>
		);
	}
	const shown = found ?? top;
	return (
		<div className="cdw-body cdw-help">
			<input
				type="search"
				aria-label={ t.helpSearch }
				placeholder={ t.helpSearch }
				value={ q }
				onChange={ ( e ) => setQ( e.currentTarget.value ) }
			/>
			{ found && found.length === 0 && <p>{ t.noArticles }</p> }
			{ found && onContact && (
				<button
					type="button"
					className="cdw-start"
					onClick={ onContact }
				>
					{ t.stillHelp }
				</button>
			) }
			{ ! found && top.length > 0 && <h3>{ t.popularArticles }</h3> }
			{ shown.length > 0 && (
				<ul className="cdw-list">
					{ shown.map( ( a ) => (
						<li
							key={
								( ( a as { source?: string } ).source ?? '' ) +
								a.id
							}
						>
							<a
								href={ a.url }
								target="_blank"
								rel="noopener noreferrer"
								onClick={ ( e ) => {
									// KB-27: products open their page.
									if (
										'source' in a &&
										a.source === 'product'
									) {
										return;
									}
									e.preventDefault();
									void read( a.id );
								} }
							>
								{ a.title }
							</a>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}

/**
 * CHN-13 form first: the typed request form inside the widget.
 *
 * @param props        Props.
 * @param props.config Config.
 * @param props.type   Conversation type key.
 */
function RequestForm( {
	config,
	type,
}: {
	config: WidgetConfig;
	type: string;
} ) {
	const box = useRef< HTMLDivElement >( null );
	useEffect( () => {
		if ( box.current && config.request ) {
			void mountRequest( box.current, { ...config.request, type } );
		}
	}, [ config.request, type ] );
	return <div className="cdw-body" ref={ box } />;
}

/**
 * CHN-21: record a voice note (stops at the configured limit) and hand it over as a file to attach.
 *
 * @param props        Props.
 * @param props.config Config.
 * @param props.onDone Recorded file.
 */
export function VoiceButton( {
	config,
	onDone,
}: {
	config: WidgetConfig;
	onDone: ( f: File ) => void;
} ) {
	const t = config.texts;
	const limit = config.voiceSeconds ?? 0;
	const [ seconds, setSeconds ] = useState< number | null >( null );
	const [ failed, setFailed ] = useState( false );
	const rec = useRef< MediaRecorder | null >( null );
	const timer = useRef< number | null >( null );
	const stop = () => {
		if ( timer.current !== null ) {
			window.clearInterval( timer.current );
			timer.current = null;
		}
		if ( rec.current && rec.current.state !== 'inactive' ) {
			rec.current.stop();
		}
	};
	useEffect( () => stop, [] );
	if (
		limit < 1 ||
		typeof window.MediaRecorder === 'undefined' ||
		! navigator.mediaDevices?.getUserMedia
	) {
		return null;
	}
	const start = async () => {
		setFailed( false );
		try {
			const stream = await navigator.mediaDevices.getUserMedia( {
				audio: true,
			} );
			const r = new window.MediaRecorder( stream );
			const chunks: Blob[] = [];
			r.ondataavailable = ( e ) => chunks.push( e.data );
			r.onstop = () => {
				stream.getTracks().forEach( ( track ) => track.stop() );
				setSeconds( null );
				const type = r.mimeType || 'audio/webm';
				onDone(
					new File(
						chunks,
						`voice-note-${ Date.now() }.${ type.includes( 'ogg' ) ? 'ogg' : 'webm' }`,
						{ type }
					)
				);
			};
			rec.current = r;
			r.start();
			setSeconds( 0 );
			timer.current = window.setInterval( () => {
				setSeconds( ( s ) => {
					const next = ( s ?? 0 ) + 1;
					if ( next >= limit ) {
						stop();
					}
					return next;
				} );
			}, 1000 );
		} catch {
			setFailed( true );
		}
	};
	if ( seconds !== null ) {
		return (
			<button type="button" className="cdw-link" onClick={ stop }>
				{ ( t.stopVoice ?? '' )
					.replace( '%1$d', String( seconds ) )
					.replace( '%2$d', String( limit ) ) }
			</button>
		);
	}
	return (
		<>
			<button
				type="button"
				className="cdw-link"
				onClick={ () => void start() }
			>
				{ t.voiceNote }
			</button>
			{ failed && <span role="alert">{ t.noMicrophone }</span> }
		</>
	);
}

/** PRT-28: conversations already reopened on this page. */
const resumed = new Set< string >();

function Home( {
	config,
	client,
	offline,
	onOffline,
	onChallenge,
	onOpen,
	onNew,
	onError,
}: {
	config: WidgetConfig;
	client: WidgetClient;
	offline: WidgetOffline;
	onOffline: ( o: WidgetOffline ) => void;
	onChallenge: ( c: WidgetChallenge ) => void;
	onOpen: ( uid: string ) => void;
	onNew: ( text?: string ) => void;
	onError: ( e: string | null ) => void;
} ) {
	const t = config.texts;
	const [ items, setItems ] = useState< WidgetConversation[] | null >( null );
	const [ promise, setPromise ] = useState< string | null >( null );
	const [ closed, setClosed ] = useState< WidgetOffline >( null );
	const [ notices, setNotices ] = useState< WidgetNotice[] >( [] );
	useEffect( () => {
		let live = true;
		client
			.conversations()
			.then( ( r ) => {
				if ( ! live ) {
					return;
				}
				onError( null );
				onOffline( r.offline ?? null );
				onChallenge( r.challenge ?? null );
				setNotices( r.notices ?? [] );
				setPromise(
					r.promise ?? promiseText( t, r.replyBy, r.within ) ?? null
				);
				// CHN-12: out of hours, say when the team is back.
				setClosed(
					r.hours && ! r.hours.open
						? { opensAt: r.hours.opensAt }
						: null
				);
				// PRT-28: reopen a recently active conversation once per page; after a quiet time the widget stays on
				// home and the conversation is in the list.
				// Without the server's answer (older versions), a single open conversation opens directly.
				const only = r.items.length === 1 ? r.items[ 0 ] : undefined;
				const resume =
					r.resume === undefined && only?.open ? only.uid : r.resume;
				if ( r.resume === undefined && resume ) {
					onOpen( resume );
				} else if ( r.resume && ! resumed.has( r.resume ) ) {
					resumed.add( r.resume );
					onOpen( r.resume );
				} else {
					setItems( r.items );
				}
			} )
			.catch( () => {
				if ( live ) {
					onError( t.error );
					setItems( [] );
				}
			} );
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- load once.
	}, [] );
	return (
		<div className="cdw-body">
			{ notices.map( ( n ) => (
				<div
					key={ n.uid }
					className={ `cdw-notice cdw-notice-${ n.kind }` }
					role="status"
				>
					<strong>{ n.title }</strong>
					{ n.body && <p>{ n.body }</p> }
				</div>
			) ) }
			<p className="cdw-greet">
				{ offline
					? [ awayText( t, offline ), offline.hide ? null : t.leave ]
							.filter( Boolean )
							.join( ' ' )
					: [
							t.greeting,
							closed ? awayText( t, closed ) : null,
							promise,
						]
							.filter( Boolean )
							.join( ' ' ) }
			</p>
			{ items && items.length > 0 && (
				<ul className="cdw-list">
					{ items.map( ( c ) => (
						<li key={ c.uid }>
							<button
								type="button"
								className="cdw-item"
								onClick={ () => onOpen( c.uid ) }
							>
								{ c.subject }
								{ c.status && <small> · { c.status }</small> }
							</button>
							{ c.portalUrl && (
								<a
									href={ c.portalUrl }
									className="cdw-link"
									target="_top"
								>
									{ t.openInPortal }
								</a>
							) }
						</li>
					) ) }
				</ul>
			) }
			{ ! offline && ( config.quickReplies?.length ?? 0 ) > 0 && (
				<div className="cdw-quick">
					{ config.quickReplies?.map( ( q ) => (
						<button
							key={ q }
							type="button"
							onClick={ () => onNew( q ) }
						>
							{ q }
						</button>
					) ) }
				</div>
			) }
			{ ! offline?.hide && config.canStart !== false && (
				<div>
					<button
						type="button"
						className="cdw-send"
						onClick={ () => onNew() }
					>
						{ t.newChat }
					</button>
				</div>
			) }
			{ ! config.identity && t.verifyLink && (
				<VerifyEmail
					config={ config }
					client={ client }
					onDone={ () =>
						void client
							.conversations()
							.then( ( r ) => setItems( r.items ) )
							.catch( () => undefined )
					}
				/>
			) }
		</div>
	);
}

/**
 * CHN-25, CHN-33: a guest confirms an email with a code from that inbox; then the conversations of that email show
 * on this device too, and a prefilled email is no longer only a claim.
 *
 * @param props        Props.
 * @param props.config Config.
 * @param props.client Client.
 * @param props.onDone Called once confirmed.
 */
export function VerifyEmail( {
	config,
	client,
	onDone,
}: {
	config: WidgetConfig;
	client: WidgetClient;
	onDone: () => void;
} ) {
	const t = config.texts;
	const [ step, setStep ] = useState< 'link' | 'email' | 'code' | 'done' >(
		'link'
	);
	const [ email, setEmail ] = useState( config.prefill?.email ?? '' );
	const [ code, setCode ] = useState( '' );
	const [ challenge, setChallenge ] = useState( '' );
	const [ note, setNote ] = useState< string | null >( null );
	if ( step === 'done' ) {
		return (
			<p className="cdw-greet" role="status">
				{ t.verified }
			</p>
		);
	}
	if ( step === 'link' ) {
		return (
			<button
				type="button"
				className="cdw-link"
				onClick={ () => setStep( 'email' ) }
			>
				{ config.prefill?.email
					? ( t.confirmEmail ?? '' ).replace(
							'%s',
							config.prefill.email
						)
					: t.verifyLink }
			</button>
		);
	}
	const submit = async () => {
		setNote( null );
		try {
			if ( step === 'email' ) {
				const r = await client.verify( { email } );
				setChallenge( r.challenge );
				setStep( 'code' );
			} else {
				await client.verify( { challenge, code } );
				setStep( 'done' );
				onDone();
			}
		} catch ( e ) {
			setNote( ( e as Error ).message || t.error );
		}
	};
	return (
		<form
			className="cdw-row"
			onSubmit={ ( e ) => {
				e.preventDefault();
				void submit();
			} }
		>
			{ step === 'email' ? (
				<input
					className="cdw-field"
					type="email"
					required
					aria-label={ t.yourEmail }
					placeholder={ t.yourEmail }
					value={ email }
					onChange={ ( e ) => setEmail( e.target.value ) }
				/>
			) : (
				<input
					className="cdw-field"
					inputMode="numeric"
					autoComplete="one-time-code"
					required
					aria-label={ t.verifyCode }
					placeholder={ t.verifyCode }
					value={ code }
					onChange={ ( e ) => setCode( e.target.value ) }
				/>
			) }
			<button type="submit" className="cdw-send">
				{ step === 'email' ? t.verifySend : t.save }
			</button>
			{ note && (
				<p className="cdw-error" role="alert">
					{ note }
				</p>
			) }
		</form>
	);
}

function Composer( {
	config,
	onSend,
	extra,
	onTyping,
	canSendEmpty = false,
	initial = '',
	onText,
}: {
	config: WidgetConfig;
	/** Text to start with (a quick reply, PRO-12). */
	initial?: string;
	/** KB-47: the text as the visitor types. */
	onText?: ( text: string ) => void;
	onSend: ( text: string ) => Promise< void >;
	extra?: ReactNode;
	/** Files are attached: an empty text may be sent. */
	canSendEmpty?: boolean;
	/** Called while the visitor types (at most every 3 s). */
	onTyping?: () => void;
} ) {
	const t = config.texts;
	const [ text, setText ] = useState( initial );
	const [ busy, setBusy ] = useState( false );
	const field = useRef< HTMLTextAreaElement >( null );
	const lastPing = useRef( 0 );
	const preview = useContext( Preview );
	useEffect( () => {
		if ( ! preview ) {
			field.current?.focus();
		}
	}, [ preview ] );
	const submit = async () => {
		const value = text.trim();
		if ( ( ! value && ! canSendEmpty ) || busy ) {
			return;
		}
		setBusy( true );
		try {
			await onSend( value );
			setText( '' );
		} catch {
			// The caller shows the error; the text stays for another try.
		} finally {
			setBusy( false );
			field.current?.focus();
		}
	};
	return (
		<form
			className="cdw-foot"
			onSubmit={ ( e ) => {
				e.preventDefault();
				void submit();
			} }
		>
			{ extra }
			<div className="cdw-row">
				<textarea
					ref={ field }
					className="cdw-field"
					rows={ 1 }
					maxLength={ 5000 }
					aria-label={ t.placeholder }
					placeholder={ t.placeholder }
					value={ text }
					onChange={ ( e ) => {
						setText( e.currentTarget.value );
						onText?.( e.currentTarget.value );
						if (
							onTyping &&
							Date.now() - lastPing.current > 3000
						) {
							lastPing.current = Date.now();
							onTyping();
						}
					} }
					onKeyDown={ ( e ) => {
						if ( e.key === 'Enter' && ! e.shiftKey ) {
							e.preventDefault();
							void submit();
						}
					} }
				/>
				<button
					type="submit"
					className="cdw-send"
					disabled={ busy || ( ! text.trim() && ! canSendEmpty ) }
				>
					{ t.send }
				</button>
			</div>
		</form>
	);
}

/**
 * KB-47: up to 3 articles for what the visitor types (none for refund, billing or cancel words); "That helped"
 * ends the contact without a conversation and counts as a deflection.
 *
 * @param props          Props.
 * @param props.config   Config.
 * @param props.text     Typed text.
 * @param props.onHelped An article helped.
 */
export function Suggestions( {
	config,
	text,
	onHelped,
}: {
	config: WidgetConfig;
	text: string;
	onHelped: () => void;
} ) {
	const t = config.texts;
	const help = config.api.replace( /widget\/?$/, '' ) + 'help/';
	const [ list, setList ] = useState<
		Array< {
			id: number;
			title: string;
			url: string;
		} >
	>( [] );
	useEffect( () => {
		if ( text.trim().length < 4 ) {
			setList( [] );
			return;
		}
		let live = true;
		const timer = window.setTimeout( () => {
			fetch(
				widgetUrl( help, 'suggest', {
					q: text.trim(),
					page: window.location.href.slice( 0, 500 ),
				} ),
				{ credentials: 'omit' }
			)
				.then( ( r ) => ( r.ok ? r.json() : null ) )
				.then(
					( j ) =>
						live &&
						setList( Array.isArray( j?.data ) ? j.data : [] )
				)
				.catch( () => live && setList( [] ) );
		}, 500 );
		return () => {
			live = false;
			window.clearTimeout( timer );
		};
	}, [ text, help ] );
	if ( ! list.length ) {
		return null;
	}
	return (
		<div className="cdw-suggest" role="status">
			<p>{ t.suggested }</p>
			<ul className="cdw-list">
				{ list.map( ( a ) => (
					<li key={ a.id }>
						<a
							href={ a.url }
							target="_blank"
							rel="noopener noreferrer"
						>
							{ a.title }
						</a>{ ' ' }
						<button
							type="button"
							className="cdw-link"
							onClick={ () => {
								void fetch( help + 'feedback', {
									method: 'POST',
									credentials: 'omit',
									headers: {
										'Content-Type': 'application/json',
									},
									body: JSON.stringify( {
										post: a.id,
										vote: '1',
										reason: 'deflected',
									} ),
								} ).catch( () => undefined );
								onHelped();
							} }
						>
							{ t.helped }
						</button>
					</li>
				) ) }
			</ul>
		</div>
	);
}

function NewChat( {
	config,
	client,
	challenge = null,
	initial,
	onStarted,
	onError,
	onHelped,
}: {
	initial?: string;
	config: WidgetConfig;
	client: WidgetClient;
	challenge?: WidgetChallenge;
	onStarted: ( uid: string ) => void;
	onError: ( e: string | null ) => void;
	/** KB-47: an article helped; no conversation is created. */
	onHelped?: () => void;
} ) {
	const t = config.texts;
	const [ draft, setDraft ] = useState( initial ?? '' );
	const [ name, setName ] = useState( config.prefill?.name ?? '' );
	const [ email, setEmail ] = useState( config.prefill?.email ?? '' );
	const [ missing, setMissing ] = useState( false );
	const [ token, setToken ] = useState( '' );
	// CHN-18: ask up front only when the setting says so.
	const askNow =
		config.askEmail === 'optional' || config.askEmail === 'required';
	return (
		<>
			<div className="cdw-body">
				<p className="cdw-greet">{ t.greeting }</p>
				{ missing && (
					<p className="cdw-error" role="alert">
						{ t.emailNeeded }
					</p>
				) }
				{ challenge && (
					<BotCheck challenge={ challenge } onToken={ setToken } />
				) }
				<Suggestions
					config={ config }
					text={ draft }
					onHelped={ () => onHelped?.() }
				/>
			</div>
			<Composer
				config={ config }
				initial={ initial }
				onText={ setDraft }
				onSend={ async ( text ) => {
					if (
						config.askEmail === 'required' &&
						! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( email.trim() )
					) {
						setMissing( true );
						throw new Error( 'email' );
					}
					setMissing( false );
					if ( challenge && ! token ) {
						onError( t.robot );
						throw new Error( 'robot' );
					}
					try {
						const r = await client.start( {
							text,
							...linkPrefill( config ),
							...( token ? { captcha: token } : {} ),
							...( name.trim() ? { name: name.trim() } : {} ),
							...( email.trim() ? { email: email.trim() } : {} ),
						} );
						onStarted( r.uid );
					} catch ( e ) {
						onError( t.error );
						throw e;
					}
				} }
				extra={
					askNow && (
						<div className="cdw-row">
							<input
								className="cdw-field"
								aria-label={ t.name }
								placeholder={ t.name }
								autoComplete="name"
								value={ name }
								onChange={ ( e ) =>
									setName( e.currentTarget.value )
								}
							/>
							<input
								className="cdw-field"
								type="email"
								aria-label={ t.email }
								placeholder={ t.email }
								autoComplete="email"
								required={ config.askEmail === 'required' }
								aria-invalid={ missing || undefined }
								value={ email }
								onChange={ ( e ) =>
									setEmail( e.currentTarget.value )
								}
							/>
						</div>
					)
				}
			/>
		</>
	);
}

/**
 * Bot check (SEC-19): Turnstile or hCaptcha, rendered in the panel; the token goes with the first message.
 *
 * @param props           Props.
 * @param props.challenge Provider and site key.
 * @param props.onToken   Called with the token ('' when it expires).
 */
function BotCheck( {
	challenge,
	onToken,
}: {
	challenge: NonNullable< WidgetChallenge >;
	onToken: ( token: string ) => void;
} ) {
	const box = useRef< HTMLDivElement >( null );
	const preview = useContext( Preview );
	useEffect( () => {
		if ( preview ) {
			return;
		}
		let live = true;
		void botApi( challenge.provider ).then( ( api ) => {
			if ( live && api && box.current ) {
				api.render( box.current, {
					sitekey: challenge.siteKey,
					callback: onToken,
					'expired-callback': () => onToken( '' ),
				} );
			}
		} );
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- render once per challenge.
	}, [ challenge.provider, challenge.siteKey, preview ] );
	return <div ref={ box } className="cdw-bot" />;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Offline capture (CHN-29): topic, message and email; the answer comes by email.
 *
 * @param props           Props.
 * @param props.config    Config.
 * @param props.client    Client.
 * @param props.offline   Offline state.
 * @param props.onStarted Called with the new conversation.
 */
function OfflineForm( {
	config,
	client,
	challenge = null,
	offline,
	onStarted,
}: {
	config: WidgetConfig;
	client: WidgetClient;
	challenge?: WidgetChallenge;
	offline: WidgetOffline;
	onStarted: ( uid: string ) => void;
} ) {
	const t = config.texts;
	const topics = config.topics ?? [];
	const [ topic, setTopic ] = useState( '' );
	const [ text, setText ] = useState( '' );
	const [ email, setEmail ] = useState( '' );
	const [ problem, setProblem ] = useState< string | null >( null );
	const [ busy, setBusy ] = useState( false );
	const [ token, setToken ] = useState( '' );
	const submit = async () => {
		if ( ! EMAIL.test( email.trim() ) ) {
			setProblem( t.emailNeeded );
			return;
		}
		if ( challenge && ! token ) {
			setProblem( t.robot );
			return;
		}
		setProblem( null );
		setBusy( true );
		try {
			const r = await client.start( {
				text: text.trim(),
				email: email.trim(),
				...linkPrefill( config ),
				...( topic ? { topic } : {} ),
				...( token ? { captcha: token } : {} ),
			} );
			onStarted( r.uid );
		} catch {
			setProblem( t.error );
			setBusy( false );
		}
	};
	return (
		<form
			className="cdw-body"
			noValidate
			onSubmit={ ( e ) => {
				e.preventDefault();
				void submit();
			} }
		>
			<p className="cdw-greet">{ `${ awayText( t, offline ) } ${ t.leave }` }</p>
			{ topics.length > 0 && (
				<fieldset className="cdw-topics">
					<legend>{ t.topic }</legend>
					{ topics.map( ( x, i ) => (
						<label
							key={ x }
							className="cdw-topic"
							htmlFor={ `cdw-topic-${ i }` }
						>
							<input
								id={ `cdw-topic-${ i }` }
								type="radio"
								name="cdw-topic"
								value={ x }
								checked={ topic === x }
								onChange={ () => setTopic( x ) }
							/>
							{ x }
						</label>
					) ) }
				</fieldset>
			) }
			<textarea
				className="cdw-field"
				rows={ 3 }
				maxLength={ 5000 }
				aria-label={ t.details }
				placeholder={ t.details }
				value={ text }
				onChange={ ( e ) => setText( e.currentTarget.value ) }
			/>
			<input
				className="cdw-field"
				type="email"
				aria-label={ t.yourEmail }
				placeholder={ t.yourEmail }
				autoComplete="email"
				required
				aria-invalid={ problem === t.emailNeeded || undefined }
				value={ email }
				onChange={ ( e ) => setEmail( e.currentTarget.value ) }
			/>
			{ challenge && (
				<BotCheck challenge={ challenge } onToken={ setToken } />
			) }
			{ problem && (
				<p className="cdw-error" role="alert">
					{ problem }
				</p>
			) }
			<div>
				<button
					type="submit"
					className="cdw-send"
					disabled={ busy || ! text.trim() }
				>
					{ t.send }
				</button>
			</div>
		</form>
	);
}

function Files( {
	config,
	pending,
	onAdd,
	onRemove,
}: {
	config: WidgetConfig;
	pending: Array< { id: number; name: string } >;
	onAdd: ( files: File[] ) => void;
	onRemove: ( id: number ) => void;
} ) {
	const t = config.texts;
	const input = useRef< HTMLInputElement >( null );
	return (
		<div
			className="cdw-row"
			style={ { flexWrap: 'wrap', alignItems: 'center' } }
		>
			<input
				ref={ input }
				type="file"
				multiple
				hidden
				aria-hidden="true"
				tabIndex={ -1 }
				onChange={ ( e ) => {
					const list = Array.from( e.currentTarget.files ?? [] );
					e.currentTarget.value = '';
					if ( list.length ) {
						onAdd( list );
					}
				} }
			/>
			<VoiceButton config={ config } onDone={ ( f ) => onAdd( [ f ] ) } />
			<button
				type="button"
				className="cdw-link"
				onClick={ () => input.current?.click() }
			>
				{ t.attach }
			</button>
			{ pending.map( ( p ) => (
				<span key={ p.id } className="cdw-chip">
					{ p.name }
					<button
						type="button"
						className="cdw-icon"
						aria-label={ t.remove.replace( '%s', p.name ) }
						onClick={ () => onRemove( p.id ) }
					>
						×
					</button>
				</span>
			) ) }
		</div>
	);
}

/** How long a visitor waits without an answer before the widget asks for their email (CHN-18). */
export const ASK_AFTER_MS = 2 * 60 * 1000;

/**
 * Whether to ask for the visitor's email now.
 *
 * @param mode     Setting.
 * @param hasEmail The conversation already has an address.
 * @param messages Messages so far.
 * @param now      Current time (ms).
 */
/**
 * CHN-24: whether the team read the conversation after a message (read markers on).
 *
 * @param seenAt When the team last read it (ISO), or null.
 * @param at     Message time (ISO).
 */
export function wasSeen( seenAt: string | null, at: string ): boolean {
	return !! seenAt && !! at && Date.parse( seenAt ) >= Date.parse( at );
}

/**
 * CHN-17: on a small screen the panel is full screen and modal, so Tab stays inside it (no trap on desktop).
 *
 * @param e     Key event.
 * @param panel The panel.
 */
export function trapFocus(
	e: { key: string; shiftKey: boolean; preventDefault: () => void },
	panel: HTMLElement | null
): void {
	if ( e.key !== 'Tab' || ! panel || ! modal() ) {
		return;
	}
	const items = Array.from(
		panel.querySelectorAll< HTMLElement >(
			'button:not([disabled]),[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
		)
	);
	if ( ! items.length ) {
		return;
	}
	const root = panel.getRootNode() as Document | ShadowRoot;
	const active = root.activeElement;
	const first = items[ 0 ];
	const lastItem = items[ items.length - 1 ];
	if ( e.shiftKey && ( active === first || active === panel ) ) {
		e.preventDefault();
		lastItem?.focus();
	} else if ( ! e.shiftKey && active === lastItem ) {
		e.preventDefault();
		first?.focus();
	}
}

/**
 * Whether the panel is full screen (below 640 px), where it acts as a modal dialog.
 */
export function modal(): boolean {
	return (
		typeof window.matchMedia === 'function' &&
		window.matchMedia( '(max-width: 639px)' ).matches
	);
}

export function shouldAskEmail(
	mode: WidgetConfig[ 'askEmail' ],
	hasEmail: boolean,
	messages: WidgetMessage[],
	now: number
): boolean {
	if ( mode === 'off' || hasEmail ) {
		return false;
	}
	const last = messages[ messages.length - 1 ];
	if ( mode !== 'after_wait' ) {
		return messages.length > 0;
	}
	// Only while the visitor's last message has waited 2 minutes without an answer.
	return (
		!! last &&
		last.from === 'visitor' &&
		now - Date.parse( last.at ) >= ASK_AFTER_MS
	);
}

function EmailPrompt( {
	config,
	client,
	uid,
	onSaved,
}: {
	config: WidgetConfig;
	client: WidgetClient;
	uid: string;
	onSaved: () => void;
} ) {
	const t = config.texts;
	const [ email, setEmail ] = useState( '' );
	const [ error, setError ] = useState( false );
	return (
		<form
			className="cdw-row"
			style={ { padding: '0 16px 8px' } }
			onSubmit={ ( e ) => {
				e.preventDefault();
				void client
					.email( uid, email.trim() )
					.then( onSaved )
					.catch( () => setError( true ) );
			} }
		>
			<input
				className="cdw-field"
				type="email"
				autoComplete="email"
				aria-label={ t.askEmail }
				placeholder={ t.askEmail }
				aria-invalid={ error || undefined }
				value={ email }
				onChange={ ( e ) => setEmail( e.currentTarget.value ) }
			/>
			<button type="submit" className="cdw-send">
				{ t.save }
			</button>
		</form>
	);
}

function Chat( {
	config,
	client,
	uid,
	notice = null,
	onError,
}: {
	config: WidgetConfig;
	client: WidgetClient;
	uid: string;
	/** A first note, e.g. after offline capture. */
	notice?: string | null;
	onError: ( e: string | null ) => void;
} ) {
	const t = config.texts;
	const [ messages, setMessages ] = useState< WidgetMessage[] >( [] );
	const [ hasEmail, setHasEmail ] = useState( true );
	const [ typing, setTyping ] = useState( '' );
	const [ seenAt, setSeenAt ] = useState< string | null >( null );
	const [ replyBy, setReplyBy ] = useState< string | null >( null );
	const [ survey, setSurvey ] = useState< WidgetSurvey | null >( null );
	const [ queue, setQueue ] = useState< WidgetQueue | null >( null );
	const [ choice, setChoice ] = useState< 'ask' | 'wait' | 'email' >( 'ask' );
	const [ pending, setPending ] = useState<
		Array< { id: number; name: string } >
	>( [] );
	const addFiles = async ( files: File[] ) => {
		if ( pending.length + files.length > 5 ) {
			setNote( t.tooMany );
			return;
		}
		for ( const file of files ) {
			try {
				const r = await client.upload( uid, file );
				setPending( ( old ) => [ ...old, { id: r.id, name: r.name } ] );
			} catch ( e ) {
				setNote( `${ file.name }: ${ ( e as Error ).message }` );
			}
		}
	};
	const [ note, setNote ] = useState< string | null >( notice );
	const [ now, setNow ] = useState( () => Date.now() );
	const last = useRef( 0 );
	const log = useRef< HTMLDivElement >( null );

	const poll = useCallback( async () => {
		try {
			const r = await client.messages( uid, last.current );
			onError( null );
			setHasEmail( r.hasEmail );
			setTyping( r.typing ?? '' );
			setSeenAt( r.seenAt ?? null );
			setReplyBy( r.replyBy ?? null );
			setQueue( r.queue ?? null );
			// INB-41: replies the agent corrected.
			const edits = new Map(
				( r.edited ?? [] ).map( ( e ) => [ e.id, e.text ] )
			);
			if ( edits.size ) {
				setMessages( ( old ) =>
					old.map( ( m ) =>
						edits.has( m.id ) && edits.get( m.id ) !== m.text
							? { ...m, text: edits.get( m.id ) as string }
							: m
					)
				);
			}
			setSurvey( ( s ) => ( s?.rating ? s : ( r.survey ?? null ) ) );
			setNow( Date.now() );
			const newest = r.items[ r.items.length - 1 ];
			if ( newest ) {
				const before = last.current;
				last.current = newest.id;
				// DEV-10: tell the page about new replies from the team.
				if ( before > 0 ) {
					r.items
						.filter( ( m ) => m.id > before && m.from === 'team' )
						.forEach( ( m ) =>
							emit( 'message', { id: m.id, text: m.text } )
						);
				}
				setMessages( ( old ) => {
					const seen = new Set( old.map( ( m ) => m.id ) );
					return [
						...old,
						...r.items.filter( ( m ) => ! seen.has( m.id ) ),
					];
				} );
			}
		} catch {
			onError( t.error );
		}
	}, [ client, uid, onError, t.error ] );

	const sendText = async ( text: string ) => {
		try {
			await client.send(
				uid,
				text,
				pending.map( ( p ) => p.id )
			);
			setPending( [] );
			await poll();
		} catch ( e ) {
			onError( t.error );
			throw e;
		}
	};

	useEffect( () => {
		void poll();
		const timer = window.setInterval( () => {
			if ( ! document.hidden ) {
				void poll();
			}
		}, POLL_MS );
		return () => window.clearInterval( timer );
	}, [ poll ] );

	useEffect( () => {
		const el = log.current;
		if ( el ) {
			el.scrollTop = el.scrollHeight;
		}
	}, [ messages ] );

	const replyLine = replyBy ? promiseText( t, replyBy, null, now ) : null;
	return (
		<>
			<div
				className="cdw-body"
				ref={ log }
				role="log"
				aria-live="polite"
				aria-label={ t.title }
			>
				{ messages.map( ( m, i ) => (
					<div key={ m.id } className={ `cdw-msg cdw-${ m.from }` }>
						<span className="cdw-who">
							{ m.bot && config.assistant?.avatar && (
								<img
									className="cdw-avatar"
									src={ config.assistant.avatar }
									alt=""
									width={ 16 }
									height={ 16 }
								/>
							) }
							{ ! m.bot && m.avatar && (
								<img
									className="cdw-avatar"
									src={ m.avatar }
									alt=""
									width={ 16 }
									height={ 16 }
								/>
							) }
							{ m.from === 'visitor' ? t.you : m.name || t.team }
						</span>
						{ m.replyTo?.excerpt && (
							<blockquote className="cdw-quote">
								{ m.replyTo.excerpt }
							</blockquote>
						) }
						{ m.text }
						{ ( m.files ?? [] ).map( ( file ) =>
							/^(audio\/|video\/webm)/.test( file.mime ?? '' ) ? (
								<audio
									key={ file.url }
									controls
									preload="none"
									src={ file.url }
									aria-label={ file.name }
									className="cdw-audio"
								>
									<track kind="captions" />
								</audio>
							) : (
								<a
									key={ file.url }
									href={ file.url }
									target="_blank"
									rel="noopener noreferrer"
									className="cdw-file"
								>
									{ file.name }
								</a>
							)
						) }
						{ i === messages.length - 1 &&
							m.from === 'visitor' &&
							wasSeen( seenAt, m.at ) && (
								<span className="cdw-who">
									{ t.seen ??
										/* i18n-ignore: fallback only, PHP always sends the translated label */ 'Seen' }
								</span>
							) }
						{ m.rich && (
							<Rich
								api={ config.api }
								rich={ m.rich }
								last={ i === messages.length - 1 }
								onPick={ ( label ) =>
									void sendText( label ).catch(
										() => undefined
									)
								}
								onCard={ ( n, values ) =>
									client
										.card( uid, m.id, n, values )
										.then( () => undefined )
								}
							/>
						) }
					</div>
				) ) }
				{ survey && (
					<SurveyCard
						survey={ survey }
						t={ t }
						onRate={ ( body ) =>
							client
								.rate( uid, body )
								.then( setSurvey )
								.catch( () => onError( t.error ) )
						}
					/>
				) }
				{ ! typing && queue && (
					<p className="cdw-greet" role="status">
						{ queueText( t, queue ) }
					</p>
				) }
				{ ! typing &&
					queue?.offerEmail &&
					! hasEmail &&
					choice === 'ask' && (
						<div className="cdw-greet">
							<p>{ t.queueChoice }</p>
							<div className="cdw-row">
								<button
									type="button"
									className="cdw-link"
									onClick={ () => setChoice( 'wait' ) }
								>
									{ t.keepWaiting }
								</button>
								<button
									type="button"
									className="cdw-send"
									onClick={ () => setChoice( 'email' ) }
								>
									{ t.emailInstead }
								</button>
							</div>
						</div>
					) }
				{ ! typing && ! queue && replyLine && (
					<p className="cdw-greet">{ replyLine }</p>
				) }
				{ typing && (
					<p className="cdw-greet" aria-hidden="true">
						{ t.typing.replace( '%s', typing ) }
					</p>
				) }
				{ note && (
					<p className="cdw-greet" role="status">
						{ note }
					</p>
				) }
			</div>
			{ ( shouldAskEmail( config.askEmail, hasEmail, messages, now ) ||
				( choice === 'email' && ! hasEmail ) ) && (
				<EmailPrompt
					config={ config }
					client={ client }
					uid={ uid }
					onSaved={ () => {
						setHasEmail( true );
						setNote( t.emailSaved );
					} }
				/>
			) }
			{ messages.length > 0 && (
				<NotifyMe config={ config } client={ client } />
			) }
			{ hasEmail && messages.length > 0 && (
				<div style={ { padding: '0 16px 4px' } }>
					<button
						type="button"
						className="cdw-link"
						onClick={ () =>
							void client
								.transcript( uid )
								.then( () => setNote( t.sentCopy ) )
								.catch( () => onError( t.error ) )
						}
					>
						{ t.transcript }
					</button>
				</div>
			) }
			<Composer
				config={ config }
				canSendEmpty={ pending.length > 0 }
				extra={
					<Files
						config={ config }
						pending={ pending }
						onAdd={ ( files ) => void addFiles( files ) }
						onRemove={ ( id ) =>
							setPending( ( old ) =>
								old.filter( ( p ) => p.id !== id )
							)
						}
					/>
				}
				onTyping={ () =>
					void client.typing( uid ).catch( () => undefined )
				}
				onSend={ sendText }
			/>
		</>
	);
}

/**
 * CHN-22: link cards, and quick-reply buttons on the latest message (a click sends the label).
 *
 * @param props        Props.
 * @param props.rich   Rich parts.
 * @param props.last   This is the latest message.
 * @param props.onPick Send an option.
 */
/**
 * Bytes of a base64url key.
 *
 * @param key Key.
 */
function keyBytes( key: string ): Uint8Array< ArrayBuffer > {
	const raw = window.atob(
		key.replace( /-/g, '+' ).replace( /_/g, '/' ) +
			'='.repeat( ( 4 - ( key.length % 4 ) ) % 4 )
	);
	const out = new Uint8Array( new ArrayBuffer( raw.length ) );
	for ( let i = 0; i < raw.length; i++ ) {
		out[ i ] = raw.charCodeAt( i );
	}
	return out;
}

/**
 * APP-16: "Notify me when you reply" — a browser notification for new replies on this device (opt-in; the service
 * worker has its own folder so it never replaces the site's).
 *
 * @param props        Props.
 * @param props.config Config.
 * @param props.client Client.
 */
export function NotifyMe( {
	config,
	client,
}: {
	config: WidgetConfig;
	client: WidgetClient;
} ) {
	const t = config.texts;
	const push = config.push;
	const [ on, setOn ] = useState< boolean | null >( null );
	const can =
		!! push &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window &&
		Notification.permission !== 'denied';
	const scope = push ? push.worker.replace( /[^/]*$/, '' ) : '';
	useEffect( () => {
		if ( ! can ) {
			return;
		}
		void navigator.serviceWorker
			.getRegistration( scope )
			.then( ( reg ) => reg?.pushManager.getSubscription() )
			.then( ( sub ) => setOn( !! sub ) )
			.catch( () => setOn( false ) );
	}, [ can, scope ] );
	if ( ! can || ! push || on === null ) {
		return null;
	}
	const toggle = async () => {
		const reg = await navigator.serviceWorker.register( push.worker, {
			scope,
		} );
		const current = await reg.pushManager.getSubscription();
		if ( on && current ) {
			await client.push( { endpoint: current.endpoint, remove: true } );
			await current.unsubscribe();
			setOn( false );
			return;
		}
		if ( ( await Notification.requestPermission() ) !== 'granted' ) {
			return;
		}
		const sub =
			current ??
			( await reg.pushManager.subscribe( {
				userVisibleOnly: true,
				applicationServerKey: keyBytes( push.key ),
			} ) );
		const json = sub.toJSON();
		await client.push( { endpoint: sub.endpoint, keys: json.keys } );
		setOn( true );
	};
	return (
		<div style={ { padding: '0 16px 4px' } }>
			<button
				type="button"
				className="cdw-link"
				onClick={ () => void toggle().catch( () => undefined ) }
			>
				{ on ? t.notifyOff : t.notifyMe }
			</button>
		</div>
	);
}

/**
 * CHN-22: a short form inside a team message; the answer goes back as "Label: value" lines (the same text an email
 * customer would type), and the server keeps it as the form's answer.
 *
 * @param props        Props.
 * @param props.form   Form.
 * @param props.onSend Send the answer text.
 */
export function InlineForm( {
	form,
	onSend,
}: {
	form: NonNullable< NonNullable< WidgetMessage[ 'rich' ] >[ 'form' ] >;
	onSend: ( text: string ) => void;
} ) {
	const [ values, setValues ] = useState< Record< string, string > >( {} );
	const [ sent, setSent ] = useState( false );
	if ( sent ) {
		return null;
	}
	return (
		<form
			className="cdw-inline-form"
			aria-label={ form.title || undefined }
			onSubmit={ ( e ) => {
				e.preventDefault();
				setSent( true );
				onSend(
					form.fields
						.map(
							( f ) => `${ f.label }: ${ values[ f.key ] ?? '' }`
						)
						.join( '\n' )
				);
			} }
		>
			{ form.title && <strong>{ form.title }</strong> }
			{ form.fields.map( ( f ) => (
				<label key={ f.key } htmlFor={ `cdw-form-${ f.key }` }>
					{ f.label }
					<input
						id={ `cdw-form-${ f.key }` }
						className="cdw-field"
						type={ f.type === 'number' ? 'number' : f.type }
						required
						value={ values[ f.key ] ?? '' }
						onChange={ ( e ) =>
							setValues( ( v ) => ( {
								...v,
								[ f.key ]: e.target.value,
							} ) )
						}
					/>
				</label>
			) ) }
			<button type="submit" className="cdw-send">
				{ form.submit || '→' }
			</button>
		</form>
	);
}

export function Rich( {
	api,
	rich,
	last,
	onPick,
	onCard,
}: {
	api?: string;
	rich: NonNullable< WidgetMessage[ 'rich' ] >;
	last: boolean;
	onPick: ( label: string ) => void;
	/** DEV-20: run a card button or form. */
	onCard?: (
		index: number,
		values?: Record< string, string | boolean >
	) => Promise< void >;
} ) {
	const cards = rich.cards ?? [];
	return (
		<>
			{ rich.card && onCard && (
				<CardBlocks card={ rich.card } onPress={ onCard } />
			) }
			<div
				className={ cards.length > 1 ? 'cdw-carousel' : undefined }
				role={ cards.length > 1 ? 'group' : undefined }
			>
				{ cards.map( ( c ) => {
					const link = (
						<a
							key={ c.url }
							href={ c.url }
							target="_blank"
							rel="noopener noreferrer"
							className="cdw-card"
						>
							<strong>{ c.title }</strong>
							{ c.text && <span>{ c.text }</span> }
						</a>
					);
					// COM-25: a product card, read live from the shop.
					return c.product && api ? (
						<Suspense key={ c.url } fallback={ link }>
							<ProductCard api={ api } card={ c } />
						</Suspense>
					) : (
						link
					);
				} ) }
			</div>
			{ last && rich.form && (
				<InlineForm form={ rich.form } onSend={ onPick } />
			) }
			{ last && ( rich.options ?? [] ).length > 0 && (
				<div className="cdw-options">
					{ ( rich.options ?? [] ).map( ( o ) => (
						<button
							key={ o }
							type="button"
							onClick={ () => onPick( o ) }
						>
							{ o }
						</button>
					) ) }
				</div>
			) }
		</>
	);
}
