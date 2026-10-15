/**
 * Cliedesk headless JS SDK (DEV-11, Free): talk to the Widget API from your own front end or app — no UI included.
 * Start a conversation, send messages and files, read replies and watch for new ones, rate the conversation and
 * record events. Visitors are anonymous until you pass a signed identity token (SEC-07) made on your server.
 *
 *     import { createCliedesk } from '@cliedesk/sdk';
 *     const desk = createCliedesk( { api: 'https://shop.example/wp-json/cliedesk/v1/widget/', product: 'general' } );
 *     const { uid } = await desk.start( { text: 'Hello', email: 'ann@example.com' } );
 *     const stop = desk.watch( uid, ( m ) => console.log( m.from, m.text ) );
 *
 * Published to npm as @cliedesk/sdk; built by tools/sdk-package/build.mjs.
 */
import { WidgetClient } from '../widget/client';
import type { WidgetMessage } from '../widget/types';

export type { WidgetMessage } from '../widget/types';

export interface CliedeskOptions {
	/** Widget API base, e.g. https://shop.example/wp-json/cliedesk/v1/widget/ */
	api: string;
	/** Product slug. */
	product: string;
	/** Signed identity token from your server (SEC-07); without it the visitor is anonymous. */
	identity?: string;
	/** Custom fetch (tests, React Native). */
	fetch?: typeof fetch;
	/** Where the visitor secret is kept (default: localStorage when available). */
	storage?: Pick< Storage, 'getItem' | 'setItem' > | null;
}

/**
 * Create a client.
 *
 * @param options Options.
 */
export function createCliedesk( options: CliedeskOptions ) {
	const client = new WidgetClient(
		{
			api: options.api,
			product: options.product,
			identity: options.identity,
			privacy: 'standard',
		},
		options.fetch ?? ( ( ...a ) => fetch( ...a ) ),
		options.storage === undefined ? undefined : options.storage
	);
	return {
		/** The visitor's conversations. */
		conversations: () => client.conversations(),
		/** Start a conversation. */
		start: ( input: Parameters< WidgetClient[ 'start' ] >[ 0 ] ) =>
			client.start( input ),
		/** Send a message (with uploaded file ids). */
		send: ( uid: string, text: string, files: number[] = [] ) =>
			client.send( uid, text, files ),
		/** Upload a file to a conversation; pass the id to send(). */
		upload: ( uid: string, file: File ) => client.upload( uid, file ),
		/** Messages after an id (0: all). */
		messages: ( uid: string, after = 0 ) => client.messages( uid, after ),
		/** Rate the conversation (CSAT). */
		rate: (
			uid: string,
			body: { rating: number; reasons?: string[]; comment?: string }
		) => client.rate( uid, body ),
		/** Record a customer event (DEV-12). */
		track: (
			name: string,
			properties: Record< string, string | number | boolean > = {}
		) => client.track( name, properties ),
		/**
		 * Call `onMessage` for each new message of a conversation (polling). Returns a function that stops.
		 *
		 * @param uid       Conversation.
		 * @param onMessage Callback.
		 * @param every     Poll interval in ms (default 5000).
		 */
		watch: (
			uid: string,
			onMessage: ( m: WidgetMessage ) => void,
			every = 5000
		): ( () => void ) => {
			let last = 0;
			let stopped = false;
			const tick = async () => {
				try {
					const r = await client.messages( uid, last );
					for ( const m of r.items ) {
						if ( m.id > last ) {
							last = m.id;
							onMessage( m );
						}
					}
				} catch {
					// Network trouble: try again on the next tick.
				}
			};
			void tick();
			const timer = setInterval( () => ! stopped && void tick(), every );
			return () => {
				stopped = true;
				clearInterval( timer );
			};
		},
	};
}
