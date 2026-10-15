/**
 * ULID-like ids (26 chars, Crockford base32, time-sortable) for Idempotency-Key and request ids.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomBytes( n: number ): Uint8Array {
	const bytes = new Uint8Array( n );
	const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
	if ( c && typeof c.getRandomValues === 'function' ) {
		c.getRandomValues( bytes );
	} else {
		for ( let i = 0; i < n; i++ ) {
			bytes[ i ] = Math.floor( Math.random() * 256 );
		}
	}
	return bytes;
}

/**
 * Create a ULID.
 *
 * @param now Milliseconds since the epoch (tests).
 */
export function ulid( now: number = Date.now() ): string {
	let time = '';
	let t = now;
	for ( let i = 0; i < 10; i++ ) {
		time = ALPHABET.charAt( t % 32 ) + time;
		t = Math.floor( t / 32 );
	}
	let rand = '';
	for ( const b of randomBytes( 16 ) ) {
		rand += ALPHABET.charAt( b % 32 );
	}
	return time + rand;
}
