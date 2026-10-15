/**
 * In-browser alerts (APP-08): a short sound for new notifications (per device: for chats assigned to me, for every
 * notification, or off; a mute switch silences it), and the unread count on the tab's icon. No sound during the
 * person's quiet hours (APP-14). The sound is made with Web Audio, so no file is loaded.
 */

export type SoundChoice = 'assigned' | 'all' | 'off';

const SOUND_KEY = 'cliedesk.alerts.sound';
const MUTE_KEY = 'cliedesk.alerts.muted';

/** Notification kinds that count as "a chat was assigned to me". */
const ASSIGNED = [ 'assigned', 'agent_added' ];

function read( key: string ): string | null {
	try {
		return window.localStorage.getItem( key );
	} catch {
		return null;
	}
}

function write( key: string, value: string ): void {
	try {
		window.localStorage.setItem( key, value );
	} catch {
		// Private windows: the choice lasts for this page only.
	}
}

/** When this device plays a sound. */
export function soundChoice(): SoundChoice {
	const v = read( SOUND_KEY );
	return v === 'all' || v === 'off' ? v : 'assigned';
}

export function setSoundChoice( v: SoundChoice ): void {
	write( SOUND_KEY, v );
}

/** Whether sounds are muted on this device. */
export function isMuted(): boolean {
	return read( MUTE_KEY ) === '1';
}

export function setMuted( on: boolean ): void {
	write( MUTE_KEY, on ? '1' : '0' );
}

/**
 * Whether new notifications of these kinds play a sound.
 *
 * @param kinds Kinds of the new notifications.
 * @param quiet The person's quiet hours are on now.
 */
export function shouldChime( kinds: string[], quiet: boolean ): boolean {
	const choice = soundChoice();
	if ( quiet || isMuted() || choice === 'off' || kinds.length === 0 ) {
		return false;
	}
	return choice === 'all' || kinds.some( ( k ) => ASSIGNED.includes( k ) );
}

/** Whether a new notification of this kind is a newly assigned chat (shown even while the tab is visible). */
export const isAssigned = ( kind: string ) => ASSIGNED.includes( kind );

/** Two short tones. */
export function chime(): void {
	const Ctx =
		typeof window !== 'undefined'
			? ( window.AudioContext ??
				(
					window as unknown as {
						webkitAudioContext?: typeof AudioContext;
					}
				 ).webkitAudioContext )
			: undefined;
	if ( ! Ctx ) {
		return;
	}
	try {
		const ctx = new Ctx();
		[ 880, 660 ].forEach( ( freq, i ) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const start = ctx.currentTime + i * 0.18;
			osc.frequency.value = freq;
			gain.gain.setValueAtTime( 0.15, start );
			gain.gain.exponentialRampToValueAtTime( 0.001, start + 0.16 );
			osc.connect( gain ).connect( ctx.destination );
			osc.start( start );
			osc.stop( start + 0.17 );
		} );
		window.setTimeout( () => void ctx.close(), 600 );
	} catch {
		// Autoplay rules can refuse sound before the first click.
	}
}

/**
 * The tab icon with the unread count (an SVG icon; the site's own icon comes back at zero).
 *
 * @param count Unread count.
 */
export function faviconBadge( count: number ): void {
	if ( typeof document === 'undefined' ) {
		return;
	}
	let link = document.querySelector< HTMLLinkElement >(
		'link[rel~="icon"][data-cd-badge]'
	);
	const original = document.querySelector< HTMLLinkElement >(
		'link[rel~="icon"]:not([data-cd-badge])'
	);
	if ( count <= 0 ) {
		link?.remove();
		if ( original ) {
			original.disabled = false;
		}
		return;
	}
	if ( ! link ) {
		link = document.createElement( 'link' );
		link.rel = 'icon';
		link.type = 'image/svg+xml';
		link.setAttribute( 'data-cd-badge', '' );
		document.head.appendChild( link );
	}
	const text = count > 99 ? '99+' : String( count );
	const size = text.length > 2 ? 11 : 14;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2b4acb"/><circle cx="22" cy="10" r="10" fill="#d92d20"/><text x="22" y="15" font-family="Arial,sans-serif" font-size="${ size }" font-weight="700" fill="#fff" text-anchor="middle">${ text }</text></svg>`;
	link.href = 'data:image/svg+xml,' + encodeURIComponent( svg );
	if ( original ) {
		// Browsers use the last icon; move ours after the site's.
		document.head.appendChild( link );
	}
}
