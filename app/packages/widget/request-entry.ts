/**
 * Request form entry (CHN-49): build/widget/request.js.
 */
import { start } from './request';

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', start );
} else {
	start();
}
