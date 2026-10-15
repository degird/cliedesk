/**
 * Absolute links to app screens (copy-link buttons, "open in a new tab"), right for pretty permalinks (browser
 * history under the base path) and plain permalinks (hash history).
 */
import type { AnyRouter } from '@tanstack/react-router';

export interface LinkTarget {
	to: string;
	params?: Record< string, string >;
	search?: Record< string, unknown >;
	hash?: string;
}

/**
 * Absolute URL of an app location.
 *
 * @param router Router.
 * @param target Target.
 */
export function absoluteHref( router: AnyRouter, target: LinkTarget ): string {
	const loc = router.buildLocation( target as never ) as {
		href: string;
		publicHref?: string;
	};
	const href = router.history.createHref( loc.publicHref ?? loc.href );
	return new URL( href, window.location.href ).toString();
}

/**
 * Deep link to one message (INB-04): `/c/1042#m-88`. Opening it scrolls to the message and highlights it.
 *
 * @param router    Router.
 * @param number    Conversation number.
 * @param messageId Message id.
 */
export function messageHref(
	router: AnyRouter,
	number: number,
	messageId: number
): string {
	return absoluteHref( router, {
		to: '/c/$number',
		params: { number: String( number ) },
		hash: `m-${ messageId }`,
	} );
}

/**
 * Message id from a location hash (`m-88`, with or without `#`).
 *
 * @param hash Hash.
 */
export function messageIdFromHash( hash: string | undefined ): number | null {
	const m = /^#?m-(\d{1,19})$/.exec( hash ?? '' );
	return m ? Number( m[ 1 ] ) : null;
}

/**
 * Copy text to the clipboard. Resolves false when the browser refuses.
 *
 * @param text Text.
 */
export async function copyText( text: string ): Promise< boolean > {
	try {
		await navigator.clipboard.writeText( text );
		return true;
	} catch {
		return false;
	}
}
