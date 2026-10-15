/**
 * Mentions of people and teams in notes (INB-57). The note composer is plain text: picking a person or team inserts "@Name" and
 * remembers the mention. When the HTML is built, each remembered "@Name" becomes
 * `<span data-mention="user:12">@Name</span>` (or `team:3`), with the name escaped; anything typed by hand stays
 * text. Mentions are read back from a saved draft's HTML.
 */
import { escapeHtml, textToHtml } from './html';

export interface Mention {
	/** `user:12` or `team:3`. */
	ref: string;
	/** Name without the "@". */
	label: string;
}

const REF = /^(user|team):\d{1,19}$/;

/**
 * The "@query" being typed before the caret, or null.
 *
 * @param text  Text.
 * @param caret Caret position.
 */
export function mentionAt(
	text: string,
	caret: number
): { start: number; query: string } | null {
	const before = text.slice( 0, caret );
	const m = /(^|\s)@([^\s@]{0,40})$/u.exec( before );
	if ( ! m ) {
		return null;
	}
	return { start: before.length - m[ 2 ]!.length - 1, query: m[ 2 ]! };
}

/**
 * Replace the "@query" at `start…caret` with "@Label ".
 *
 * @param text  Text.
 * @param start Index of the "@".
 * @param caret Caret.
 * @param label Name.
 */
export function insertMention(
	text: string,
	start: number,
	caret: number,
	label: string
): { text: string; caret: number } {
	const insert = `@${ label } `;
	return {
		text: text.slice( 0, start ) + insert + text.slice( caret ),
		caret: start + insert.length,
	};
}

function escapeRegExp( s: string ): string {
	return s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
}

/**
 * Note HTML with mention tokens.
 *
 * @param text     Plain text.
 * @param mentions Mentions picked in the composer.
 */
export function textToHtmlWithMentions(
	text: string,
	mentions: Mention[]
): string {
	const html = textToHtml( text );
	const byLabel = new Map< string, string >();
	for ( const m of mentions ) {
		if ( REF.test( m.ref ) && m.label.trim() ) {
			byLabel.set( escapeHtml( '@' + m.label ), m.ref );
		}
	}
	if ( ! byLabel.size ) {
		return html;
	}
	// One pass, longest names first, so "@Ana Maria" never also matches "@Ana".
	const re = new RegExp(
		`(${ [ ...byLabel.keys() ]
			.sort( ( a, b ) => b.length - a.length )
			.map( escapeRegExp )
			.join( '|' ) })(?![\\p{L}\\p{N}_])`,
		'gu'
	);
	return html.replace(
		re,
		( token ) =>
			`<span data-mention="${ escapeHtml(
				byLabel.get( token ) ?? ''
			) }">${ token }</span>`
	);
}

/**
 * Mentions in stored HTML (a saved note draft).
 *
 * @param html HTML.
 */
export function mentionsFromHtml( html: string ): Mention[] {
	if ( ! html || typeof DOMParser === 'undefined' ) {
		return [];
	}
	const doc = new DOMParser().parseFromString( html, 'text/html' );
	const out: Mention[] = [];
	doc.querySelectorAll( '[data-mention]' ).forEach( ( el ) => {
		const ref = el.getAttribute( 'data-mention' ) ?? '';
		const label = ( el.textContent ?? '' ).replace( /^@/, '' ).trim();
		if ( REF.test( ref ) && label ) {
			out.push( { ref, label } );
		}
	} );
	return out;
}
