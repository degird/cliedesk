/**
 * Saved reply picker in the composer (MAC-08, MAC-09, MAC-11): pure helpers. The picker opens on `\` or `!` after a
 * space or at the start, on `/` at the start of a line, or with ⌘K/Ctrl+K (which types a `\`). Search, typo
 * tolerance, recently-used order and the availability rules (mode, channel, type, queue, product) run on the server
 * (GET saved-replies?conversationId&mode&q&sort=relevance); the language filter runs here on the variants.
 */
import type { SavedReply } from '../macros/api';

/** Longest query after the trigger. */
const MAX_QUERY = 40;

/**
 * The trigger being typed before the caret (`\query`, `!query`, or `/query` at a line start), or null.
 *
 * @param text  Text.
 * @param caret Caret position.
 */
export function replyTriggerAt(
	text: string,
	caret: number
): { start: number; query: string } | null {
	const before = text.slice( 0, caret );
	const m =
		new RegExp(
			`(^|\\s)[\\\\!]([^\\s\\\\!]{0,${ MAX_QUERY }})$`,
			'u'
		).exec( before ) ??
		new RegExp( `(^|\\n)/([^\\s/]{0,${ MAX_QUERY }})$`, 'u' ).exec(
			before
		);
	if ( ! m ) {
		return null;
	}
	const query = m[ 2 ] ?? '';
	return { start: before.length - query.length - 1, query };
}

/**
 * Base language of a locale (`de_AT` → `de`).
 *
 * @param locale Locale.
 */
export const baseLanguage = ( locale: string ): string =>
	locale.toLowerCase().split( /[-_]/ )[ 0 ] ?? '';

/**
 * Whether a saved reply has text in the language (exact or same base language).
 *
 * @param reply    Saved reply.
 * @param language Conversation language.
 */
export function hasLanguage( reply: SavedReply, language: string ): boolean {
	const base = baseLanguage( language );
	return reply.variants.some(
		( v ) =>
			v.language.toLowerCase() === language.toLowerCase() ||
			baseLanguage( v.language ) === base
	);
}

/**
 * Replies shown for the language: with no language known, all of them.
 *
 * @param replies  Replies.
 * @param language Conversation language, or null.
 * @param all      Show every language.
 */
export function filterByLanguage(
	replies: SavedReply[],
	language: string | null,
	all: boolean
): SavedReply[] {
	if ( all || ! language ) {
		return replies;
	}
	return replies.filter( ( r ) => hasLanguage( r, language ) );
}

/**
 * Text of the variant the server will use, for the preview: the language, else the default language, else the first.
 *
 * @param reply    Saved reply.
 * @param language Conversation language, or null.
 */
export function previewHtml(
	reply: SavedReply,
	language: string | null
): string {
	const v = reply.variants;
	const base = language ? baseLanguage( language ) : null;
	return (
		(
			( language &&
				( v.find(
					( x ) => x.language.toLowerCase() === language.toLowerCase()
				) ??
					v.find(
						( x ) => baseLanguage( x.language ) === base
					) ) ) ||
			v.find( ( x ) => x.language === reply.defaultLanguage ) ||
			v[ 0 ]
		)?.html ?? ''
	);
}

/**
 * Replace `start…caret` with the inserted text.
 *
 * @param text   Text.
 * @param start  Index of the trigger.
 * @param caret  Caret.
 * @param insert Inserted text.
 */
export function insertAt(
	text: string,
	start: number,
	caret: number,
	insert: string
): { text: string; caret: number } {
	return {
		text: text.slice( 0, start ) + insert + text.slice( caret ),
		caret: start + insert.length,
	};
}

/**
 * INB-67: put the saved replies a context rule recommends first, in the rule's order; the rest keep their order.
 *
 * @param list        Saved replies.
 * @param recommended Recommended ids.
 */
export function recommendedFirst< T extends { id: number } >(
	list: T[],
	recommended: number[]
): T[] {
	if ( ! recommended.length ) {
		return list;
	}
	const rank = ( r: T ) => {
		const i = recommended.indexOf( r.id );
		return i < 0 ? recommended.length : i;
	};
	return [ ...list ].sort( ( a, b ) => rank( a ) - rank( b ) );
}
