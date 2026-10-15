/**
 * Message bodies. The server stores HTML sanitised with wp_kses_post; the app still never injects markup. It
 * parses the HTML with DOMParser (inert: no scripts run, no resources load) and rebuilds an allow-listed subset as
 * React elements, so text is escaped by React and only safe attributes survive (links: http, https, mailto, tel).
 * Images (except our own signed file links), styles, forms, iframes and unknown elements are dropped (their text is kept). Without DOMParser, or
 * without HTML, the plain text is shown with its line breaks.
 */
import { getBoot } from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import { Fragment, type ReactNode } from 'react';

const BLOCK = new Set( [
	'p',
	'div',
	'blockquote',
	'pre',
	'ul',
	'ol',
	'li',
	'table',
	'thead',
	'tbody',
	'tr',
	'td',
	'th',
	'hr',
	'br',
] );
const INLINE = new Set( [
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'del',
	'code',
	'span',
	'sub',
	'sup',
	'small',
	'mark',
	'a',
] );
const HEADING = new Set( [ 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ] );
const DROP = new Set( [
	'script',
	'style',
	'iframe',
	'object',
	'embed',
	'template',
	'noscript',
	'svg',
	'math',
	'img',
	'video',
	'audio',
	'form',
	'input',
	'button',
	'select',
	'textarea',
	'head',
	'title',
	'meta',
	'link',
] );

const CLASSES: Record< string, string > = {
	p: 'my-2 first:mt-0 last:mb-0',
	blockquote: 'my-2 border-s-2 border-line-strong ps-3 text-fg-muted',
	pre: 'my-2 overflow-x-auto rounded-md bg-sunken p-2 font-mono text-sm',
	ul: 'my-2 list-disc ps-6',
	ol: 'my-2 list-decimal ps-6',
	table: 'my-2 border-collapse',
	td: 'border border-line px-2 py-1',
	th: 'border border-line px-2 py-1 font-semibold',
	code: 'rounded-sm bg-sunken px-1 font-mono text-sm',
	a: 'text-accent-fg underline underline-offset-2',
	hr: 'my-3 border-line',
};

/**
 * Whether a link target is allowed.
 *
 * @param href Raw href.
 */
export function safeHref( href: string | null ): string | null {
	if ( ! href ) {
		return null;
	}
	const v = href.trim();
	return /^(https?:|mailto:|tel:)/i.test( v ) ? v : null;
}

/**
 * SEC-22: a link's host when it is blocked or not trusted (this site and security.link_trusted are), else null.
 *
 * @param href Link.
 */
export function linkRisk(
	href: string
): { host: string; blocked: boolean } | null {
	let host = '';
	try {
		const u = new URL( href );
		if ( ! /^https?:$/.test( u.protocol ) ) {
			return null;
		}
		host = u.hostname.toLowerCase();
	} catch {
		return null;
	}
	const s = getBoot().settings ?? {};
	const list = ( key: string ) =>
		String( s[ key ] ?? '' )
			.toLowerCase()
			.split( /[\s,;]+/ )
			.map( ( d ) => d.replace( /^(\*\.|https?:\/\/)/, '' ) )
			.filter( Boolean );
	const hit = ( domains: string[] ) =>
		domains.some( ( d ) => host === d || host.endsWith( '.' + d ) );
	if ( hit( list( 'security.link_blocklist' ) ) ) {
		return { host, blocked: true };
	}
	return host === window.location.hostname.toLowerCase() ||
		hit( list( 'security.link_trusted' ) )
		? null
		: { host, blocked: false };
}

/**
 * Whether an image source is one of our own signed file links (inline email images, SEC-20). Other images are
 * never loaded (remote images can track readers).
 *
 * @param src Raw src.
 */
export function ownFileSrc( src: string | null ): string | null {
	if ( ! src ) {
		return null;
	}
	try {
		const url = new URL( src, window.location.href );
		return url.origin === window.location.origin &&
			url.searchParams.has( 'cliedesk_file' )
			? url.href
			: null;
	} catch {
		return null;
	}
}

/** Turns a text run into nodes (COP-18 entity highlights); never used inside links. */
export type Decorate = ( text: string, key: string ) => ReactNode;

function convert( node: Node, key: string, deco?: Decorate ): ReactNode {
	if ( node.nodeType === 3 ) {
		return deco ? deco( node.textContent ?? '', key ) : node.textContent;
	}
	if ( node.nodeType !== 1 ) {
		return null;
	}
	const el = node as Element;
	const tag = el.tagName.toLowerCase();
	const image = tag === 'img' ? ownFileSrc( el.getAttribute( 'src' ) ) : null;
	if ( image ) {
		return (
			<img
				key={ key }
				src={ image }
				alt={ el.getAttribute( 'alt' ) ?? '' }
				loading="lazy"
				referrerPolicy="no-referrer"
				className="my-2 max-h-96 max-w-full rounded-md"
			/>
		);
	}
	if ( DROP.has( tag ) ) {
		return null;
	}
	const children = Array.from( el.childNodes ).map( ( c, i ) =>
		convert( c, `${ key }.${ i }`, tag === 'a' ? undefined : deco )
	);
	if ( tag === 'br' ) {
		return <br key={ key } />;
	}
	if ( tag === 'hr' ) {
		return <hr key={ key } className={ CLASSES.hr } />;
	}
	if ( tag === 'a' ) {
		const href = safeHref( el.getAttribute( 'href' ) );
		const risk = href ? linkRisk( href ) : null;
		if ( risk ) {
			// SEC-22: a blocked link is not clickable; an untrusted one shows where it really goes.
			const note = risk.blocked
				? /* translators: %s: domain. */ __(
						'(blocked link: %s)',
						'cliedesk'
					)
				: /* translators: %s: domain. */ __(
						'(untrusted: %s)',
						'cliedesk'
					);
			const mark = (
				<span className="ms-1 text-xs text-warning">
					{ sprintf( note, risk.host ) }
				</span>
			);
			return risk.blocked ? (
				<Fragment key={ key }>
					{ children }
					{ mark }
				</Fragment>
			) : (
				<Fragment key={ key }>
					<a
						href={ href ?? undefined }
						className={ CLASSES.a }
						target="_blank"
						rel="noopener noreferrer nofollow"
					>
						{ children }
					</a>
					{ mark }
				</Fragment>
			);
		}
		return href ? (
			<a
				key={ key }
				href={ href }
				className={ CLASSES.a }
				target="_blank"
				rel="noopener noreferrer nofollow"
			>
				{ children }
			</a>
		) : (
			<Fragment key={ key }>{ children }</Fragment>
		);
	}
	if ( HEADING.has( tag ) ) {
		// Headings inside a message would break the page outline: show them as bold paragraphs.
		return (
			<p key={ key } className="my-2 font-semibold">
				{ children }
			</p>
		);
	}
	if ( BLOCK.has( tag ) || INLINE.has( tag ) ) {
		const Tag = ( tag === 'b' ? 'strong' : tag ) as 'span';
		return (
			<Tag key={ key } className={ CLASSES[ tag ] }>
				{ children }
			</Tag>
		);
	}
	return <Fragment key={ key }>{ children }</Fragment>;
}

/**
 * Plain text with its line breaks.
 *
 * @param text Text.
 */
export function textWithBreaks( text: string ): ReactNode {
	const lines = text.split( /\r?\n/ );
	return lines.map( ( line, i ) => (
		<Fragment key={ i }>
			{ line }
			{ i < lines.length - 1 && <br /> }
		</Fragment>
	) );
}

/**
 * Allow-listed React tree for an HTML string.
 *
 * @param html HTML.
 * @param text Plain-text fallback.
 */
export function htmlToReact(
	html: string | null,
	text: string,
	deco?: Decorate
): ReactNode {
	if ( ! html || typeof DOMParser === 'undefined' ) {
		return textWithBreaks( text );
	}
	const doc = new DOMParser().parseFromString( html, 'text/html' );
	return Array.from( doc.body.childNodes ).map( ( n, i ) =>
		convert( n, String( i ), deco )
	);
}

/**
 * Message body.
 *
 * @param props          Props.
 * @param props.html     HTML from the server.
 * @param props.text     Plain text.
 * @param props.decorate Highlights in text runs (COP-18).
 */
export function RichText( {
	html,
	text,
	decorate,
}: {
	html: string | null;
	text: string;
	decorate?: Decorate;
} ) {
	return (
		<div className="break-words text-base text-fg">
			{ htmlToReact( html, text, decorate ) }
		</div>
	);
}

/**
 * Escape text for HTML (text and double-quoted attributes).
 *
 * @param s Text.
 */
export function escapeHtml( s: string ): string {
	return s
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}

/**
 * HTML for a plain-text composer body: escaped, paragraphs on blank lines, line breaks kept.
 *
 * @param text Text typed by the agent.
 */
export function textToHtml( text: string ): string {
	const esc = escapeHtml;
	// INB-44: **bold** and `code` inside a line.
	const inline = ( s: string ) =>
		esc( s )
			.replace( /`([^`\n]+)`/g, '<code>$1</code>' )
			.replace( /\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>' );
	const cells = ( row: string ) =>
		row
			.trim()
			.replace( /^\||\|$/g, '' )
			.split( '|' )
			.map( ( c ) => c.trim() );
	const lines = text.trim().split( /\r?\n/ );
	const out: string[] = [];
	let para: string[] = [];
	const flush = () => {
		if ( para.length ) {
			out.push( `<p>${ para.map( inline ).join( '<br>' ) }</p>` );
			para = [];
		}
	};
	for ( let i = 0; i < lines.length; i++ ) {
		const line = lines[ i ] ?? '';
		if ( /^\s*```/.test( line ) ) {
			// A fenced code block.
			flush();
			const code: string[] = [];
			while (
				++i < lines.length &&
				! /^\s*```/.test( lines[ i ] ?? '' )
			) {
				code.push( lines[ i ] ?? '' );
			}
			out.push( `<pre><code>${ esc( code.join( '\n' ) ) }</code></pre>` );
		} else if (
			line.includes( '|' ) &&
			/^\s*\|?\s*:?-{3,}/.test( lines[ i + 1 ] ?? '' )
		) {
			// A table: header, separator, rows.
			flush();
			const head = cells( line )
				.map( ( c ) => `<th>${ inline( c ) }</th>` )
				.join( '' );
			const rows: string[] = [];
			i++;
			while (
				i + 1 < lines.length &&
				( lines[ i + 1 ] ?? '' ).includes( '|' )
			) {
				i++;
				rows.push(
					`<tr>${ cells( lines[ i ] ?? '' )
						.map( ( c ) => `<td>${ inline( c ) }</td>` )
						.join( '' ) }</tr>`
				);
			}
			out.push(
				`<table><thead><tr>${ head }</tr></thead><tbody>${ rows.join(
					''
				) }</tbody></table>`
			);
		} else if ( /^\s*[-*] \S/.test( line ) ) {
			// A bulleted list.
			flush();
			const items = [ line ];
			while ( /^\s*[-*] \S/.test( lines[ i + 1 ] ?? '' ) ) {
				items.push( lines[ ++i ] ?? '' );
			}
			out.push(
				`<ul>${ items
					.map(
						( it ) =>
							`<li>${ inline( it.replace( /^\s*[-*] /, '' ) ) }</li>`
					)
					.join( '' ) }</ul>`
			);
		} else if ( line.trim() === '' ) {
			flush();
		} else {
			para.push( line );
		}
	}
	flush();
	return out.join( '' );
}

/**
 * Plain text of stored HTML (to put a draft back into the plain-text composer): paragraphs become blank lines,
 * <br> line breaks.
 *
 * @param html HTML.
 */
export function htmlToText( html: string ): string {
	if ( ! html ) {
		return '';
	}
	if ( typeof DOMParser === 'undefined' ) {
		return html.replace( /<[^>]*>/g, '' );
	}
	const doc = new DOMParser().parseFromString(
		html
			.replace( /<br\s*\/?>/gi, '\n' )
			.replace( /<\/(p|div|li|blockquote|h[1-6])>/gi, '\n\n' ),
		'text/html'
	);
	return ( doc.body.textContent ?? '' ).replace( /\n{3,}/g, '\n\n' ).trim();
}
