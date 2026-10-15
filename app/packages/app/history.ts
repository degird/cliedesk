/**
 * Plain-permalink support (plan.frontend-ux.md §3.4, §3.12). Without pretty permalinks the server answers
 * `/?cliedesk=/dash/c/1042`; the app runs on hash history, so that URL becomes `/?cliedesk=/dash/#/c/1042`.
 */

/**
 * Rewrite a plain-permalink deep link to its hash form. Returns null when nothing needs to change.
 *
 * @param href     Current URL.
 * @param basePath App base path, e.g. `/dash`.
 */
export function rewritePlainPermalink(
	href: string,
	basePath: string
): string | null {
	const url = new URL( href );
	const target = url.searchParams.get( 'cliedesk' );
	if ( target === null ) {
		return null;
	}
	const base = '/' + basePath.replace( /^\/+|\/+$/g, '' );
	let rest = target;
	if ( rest === base || rest.startsWith( base + '/' ) ) {
		rest = rest.slice( base.length );
	}
	rest = '/' + rest.replace( /^\/+/, '' );
	const appRoot = base + '/';
	if ( rest === '/' && target === appRoot ) {
		return null; // Already the app root; the hash (if any) carries the route.
	}
	url.searchParams.set( 'cliedesk', appRoot );
	const existingHash = url.hash.replace( /^#/, '' );
	url.hash = rest === '/' && existingHash ? existingHash : rest;
	// URLSearchParams encodes "/" — keep the readable form the server also accepts.
	return url
		.toString()
		.replace(
			/cliedesk=%2F([^&#]*)/,
			( _m, p: string ) => 'cliedesk=/' + p.replace( /%2F/g, '/' )
		);
}
