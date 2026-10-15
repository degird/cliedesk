/**
 * Bot check providers (SEC-19): load Turnstile or hCaptcha once, for the chat widget and the request form.
 */
const BOT_SCRIPTS: Record< string, string > = {
	turnstile:
		'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
	hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit',
};

export type BotApi = {
	render: (
		el: HTMLElement,
		opts: {
			sitekey: string;
			callback: ( token: string ) => void;
			'expired-callback'?: () => void;
		}
	) => unknown;
};

/**
 * Load the provider script once and resolve with its render API.
 *
 * @param provider turnstile | hcaptcha.
 */
export function botApi( provider: string ): Promise< BotApi | null > {
	const name = provider === 'hcaptcha' ? 'hcaptcha' : 'turnstile';
	const w = window as unknown as Record< string, BotApi | undefined >;
	if ( w[ name ] ) {
		return Promise.resolve( w[ name ] ?? null );
	}
	return new Promise( ( resolve ) => {
		const src = BOT_SCRIPTS[ name ] as string;
		let tag = document.querySelector< HTMLScriptElement >(
			`script[src="${ src }"]`
		);
		if ( ! tag ) {
			tag = document.createElement( 'script' );
			tag.src = src;
			tag.async = true;
			document.head.appendChild( tag );
		}
		tag.addEventListener( 'load', () => resolve( w[ name ] ?? null ) );
		tag.addEventListener( 'error', () => resolve( null ) );
	} );
}
