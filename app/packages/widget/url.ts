/**
 * URL helper shared by the loader and the panel.
 */
/**
 * Widget API URL. Works with pretty permalinks (…/wp-json/cliedesk/v1/widget/) and without them
 * (…/index.php?rest_route=/cliedesk/v1/widget/), where query parameters must follow with "&".
 *
 * @param base  API base from the config.
 * @param path  Route below the base.
 * @param query Query parameters.
 */
export function widgetUrl(
	base: string,
	path: string,
	query: Record< string, string > = {}
): string {
	const [ head = '', search ] = base.split( '?' );
	let url = head;
	const params = new URLSearchParams( search ?? '' );
	const route = params.get( 'rest_route' );
	if ( route !== null ) {
		params.set( 'rest_route', route.replace( /\/?$/, '/' ) + path );
	} else {
		url = url.replace( /\/?$/, '/' ) + path;
	}
	for ( const [ k, v ] of Object.entries( query ) ) {
		params.set( k, v );
	}
	const qs = params.toString().replace( /%2F/gi, '/' );
	return qs ? `${ url }?${ qs }` : url;
}

/**
 * RPT-30: count a widget event for this page path (a beacon with counts only: no visitor id, no query string).
 *
 * @param api     API base from the config.
 * @param product Product key.
 * @param event   load, open or search.
 */
export function stat(
	api: string,
	product: string,
	event: 'load' | 'open' | 'search'
): void {
	try {
		const url = widgetUrl( api, 'stats', {
			product,
			event,
			page: window.location.pathname.slice( 0, 255 ),
		} );
		if ( typeof navigator.sendBeacon === 'function' ) {
			navigator.sendBeacon( url );
			return;
		}
		void fetch( url, {
			method: 'POST',
			keepalive: true,
			credentials: 'omit',
		} ).catch( () => undefined );
	} catch {
		// Counting never breaks the page.
	}
}

/**
 * DEV-10: tell the page about the widget (`Cliedesk.on( name, callback )` listens).
 *
 * @param name   Event: ready, open, close, conversation-started, message.
 * @param detail Event data.
 */
export function emit( name: string, detail: unknown = null ): void {
	window.dispatchEvent( new CustomEvent( `cliedesk:${ name }`, { detail } ) );
}
