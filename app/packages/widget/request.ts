/**
 * Request form (CHN-49): fills every `.cliedesk-request` placeholder of the `[cliedesk_request]` shortcode with the
 * customer form of a conversation type. Plain HTML elements, so the theme styles it; labels, required marks, an
 * error summary that takes focus, and field errors linked with aria-describedby. Conditional fields are re-checked
 * by the server as values change. No framework.
 */
import { botApi } from './bot';
import { widgetUrl } from './url';

interface Texts {
	name: string;
	email: string;
	subject: string;
	message: string;
	send: string;
	sending: string;
	sent: string;
	error: string;
	fix: string;
	required: string;
	files: string;
	robot: string;
	loading: string;
	yes: string;
	choose: string;
	suggested?: string;
	helped?: string;
	glad?: string;
}

interface Config {
	api: string;
	nonce: string;
	type: string;
	product: string;
	/** PRT-05: where the form is (portal). */
	source?: string;
	/** PRT-13 (WooCommerce): an optional picker of the customer's own orders. */
	orders?: { label: string; none: string };
	texts: Texts;
}

/** PRT-04: a guest's email-code session (portal). */
const GUEST = 'cliedesk-portal-guest';

/**
 * PRT-13: the customer's own recent orders (signed in, or a guest verified by email code); none when not allowed.
 *
 * @param config Config.
 */
async function ownOrders(
	config: Config
): Promise<
	Array< { id: number; number: string; date: string | null; total: string } >
> {
	const headers: Record< string, string > = { Accept: 'application/json' };
	if ( config.nonce ) {
		headers[ 'X-WP-Nonce' ] = config.nonce;
	} else {
		try {
			const guest = window.sessionStorage.getItem( GUEST );
			if ( guest ) {
				headers[ 'X-Cliedesk-Guest' ] = guest;
			}
		} catch {
			// No session storage: no orders.
		}
	}
	const r = await fetch( widgetUrl( config.api, 'portal/orders', {} ), {
		headers,
		credentials: 'same-origin',
	} ).catch( () => null );
	const json = r?.ok ? await r.json().catch( () => null ) : null;
	return Array.isArray( json?.data?.items ) ? json.data.items : [];
}

export interface FormField {
	key: string;
	type: string;
	label: string;
	description: string;
	placeholder: string;
	multiple: boolean;
	options: Array< { key: string; label: string } > | null;
	visible: boolean;
	required: boolean;
}

interface FormInfo {
	type: { key: string; name: string };
	fields: FormField[];
	challenge: { provider: string; siteKey: string } | null;
	user: { name: string; email: string } | null;
	/** CRM-32: a customer in two or more organizations picks one (primary first). */
	organizations?: {
		label: string;
		items: Array< { id: number; name: string; primary: boolean } >;
	} | null;
}

type Values = Record< string, string | string[] | boolean >;

let seq = 0;

/**
 * KB-47: up to 3 articles for what the customer types; "That helped" replaces the form (a deflection).
 *
 * @param form Form.
 * @param text Message field.
 * @param help Help API base.
 * @param t    Texts.
 */
function suggest(
	form: HTMLFormElement,
	text: HTMLTextAreaElement,
	help: string,
	t: Texts
): void {
	const box = el( 'div', {
		class: 'cliedesk-request__suggest',
		role: 'status',
	} );
	text.after( box );
	let timer = 0;
	text.addEventListener( 'input', () => {
		window.clearTimeout( timer );
		timer = window.setTimeout( () => {
			const q = text.value.trim();
			if ( q.length < 4 ) {
				box.replaceChildren();
				return;
			}
			void fetch(
				`${ help }suggest?q=${ encodeURIComponent( q.slice( 0, 300 ) ) }&page=${ encodeURIComponent( window.location.href.slice( 0, 500 ) ) }`,
				{ credentials: 'same-origin' }
			)
				.then( ( r ) => ( r.ok ? r.json() : null ) )
				.then( ( j ) => {
					const list: Array< {
						id: number;
						title: string;
						url: string;
					} > = Array.isArray( j?.data ) ? j.data : [];
					box.replaceChildren(
						...( list.length
							? [ el( 'p', {}, t.suggested ?? '' ) ]
							: [] ),
						...list.map( ( a ) => {
							const done = el(
								'button',
								{ type: 'button' },
								t.helped ?? ''
							);
							done.addEventListener( 'click', () => {
								void fetch( `${ help }feedback`, {
									method: 'POST',
									credentials: 'same-origin',
									headers: {
										'Content-Type': 'application/json',
									},
									body: JSON.stringify( {
										post: a.id,
										vote: '1',
										reason: 'deflected',
									} ),
								} ).catch( () => undefined );
								form.replaceWith(
									el( 'p', { role: 'status' }, t.glad ?? '' )
								);
							} );
							const line = el( 'p' );
							line.append(
								el(
									'a',
									{
										href: a.url,
										target: '_blank',
										rel: 'noopener',
									},
									a.title
								),
								' ',
								done
							);
							return line;
						} )
					);
				} )
				.catch( () => undefined );
		}, 500 );
	} );
}

function el< K extends keyof HTMLElementTagNameMap >(
	tag: K,
	attrs: Record< string, string > = {},
	text = ''
): HTMLElementTagNameMap[ K ] {
	const node = document.createElement( tag );
	for ( const [ k, v ] of Object.entries( attrs ) ) {
		node.setAttribute( k, v );
	}
	if ( text ) {
		node.textContent = text;
	}
	return node;
}

async function call< T >(
	config: Config,
	method: 'GET' | 'POST',
	query: Record< string, string >,
	body?: unknown
): Promise< {
	ok: boolean;
	status: number;
	data: T;
	fields: Record< string, string >;
} > {
	const headers: Record< string, string > = { Accept: 'application/json' };
	if ( config.nonce ) {
		headers[ 'X-WP-Nonce' ] = config.nonce;
	} else if ( config.orders ) {
		try {
			// PRT-13: a verified guest's picked order is checked against their session.
			const guest = window.sessionStorage.getItem( GUEST );
			if ( guest ) {
				headers[ 'X-Cliedesk-Guest' ] = guest;
			}
		} catch {
			// No session storage.
		}
	}
	let payload: BodyInit | undefined;
	if ( body instanceof window.FormData ) {
		payload = body; // The browser sets the multipart boundary.
	} else if ( body ) {
		headers[ 'Content-Type' ] = 'application/json';
		payload = JSON.stringify( body );
	}
	const r = await fetch( widgetUrl( config.api, 'request-form', query ), {
		method,
		headers,
		credentials: 'same-origin',
		body: payload,
	} );
	const json = await r.json().catch( () => ( {} ) );
	return {
		ok: r.ok,
		status: r.status,
		data: json?.data as T,
		fields: ( json?.data?.fields as Record< string, string > ) ?? {},
	};
}

/**
 * Current value of a custom field from the form.
 *
 * @param form  Form.
 * @param field Field.
 */
function readValue(
	form: HTMLFormElement,
	field: FormField
): string | string[] | boolean {
	const named = form.querySelectorAll<
		HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
	>( `[name="values.${ field.key }"]` );
	if ( field.type === 'boolean' ) {
		return ( named[ 0 ] as HTMLInputElement | undefined )?.checked ?? false;
	}
	if ( field.type === 'multi_select' ) {
		return Array.from( named )
			.filter( ( n ) => ( n as HTMLInputElement ).checked )
			.map( ( n ) => n.value );
	}
	return named[ 0 ]?.value ?? '';
}

/**
 * The control of one custom field.
 *
 * @param field Field.
 * @param id    Element id.
 * @param texts Texts.
 */
export function control(
	field: FormField,
	id: string,
	texts: Texts
): HTMLElement {
	const name = `values.${ field.key }`;
	if ( field.type === 'long_text' ) {
		return el( 'textarea', { id, name, rows: '4' } );
	}
	if ( field.type === 'boolean' ) {
		const box = el( 'input', { id, name, type: 'checkbox' } );
		return box;
	}
	if ( field.type === 'multi_select' ) {
		const group = el( 'span', { id, class: 'cliedesk-request__choices' } );
		( field.options ?? [] ).forEach( ( o, i ) => {
			const oid = `${ id }-${ i }`;
			const label = el( 'label', { for: oid } );
			label.append(
				el( 'input', {
					id: oid,
					name,
					type: 'checkbox',
					value: o.key,
				} ),
				` ${ o.label }`
			);
			group.append( label );
		} );
		return group;
	}
	if ( field.options ) {
		const select = el( 'select', { id, name } );
		select.append( el( 'option', { value: '' }, texts.choose ) );
		for ( const o of field.options ) {
			select.append( el( 'option', { value: o.key }, o.label ) );
		}
		return select;
	}
	const type =
		{
			number: 'number',
			decimal: 'number',
			money: 'number',
			date: 'date',
			datetime: 'datetime-local',
			url: 'url',
		}[ field.type ] ?? 'text';
	const input = el( 'input', { id, name, type } );
	if ( field.placeholder ) {
		input.placeholder = field.placeholder;
	}
	return input;
}

function row(
	form: HTMLElement,
	id: string,
	label: string,
	input: HTMLElement,
	required: boolean,
	texts: Texts,
	description = ''
): HTMLElement {
	const wrap = el( 'p', { class: 'cliedesk-request__row', 'data-for': id } );
	const lab = el( 'label', { for: id }, label );
	if ( required ) {
		lab.append(
			' ',
			el(
				'span',
				{ class: 'cliedesk-request__required' },
				texts.required
			)
		);
		input.setAttribute( 'aria-required', 'true' );
	}
	wrap.append( lab, el( 'br' ), input );
	if ( description ) {
		const d = el( 'small', { id: `${ id }-desc` }, description );
		input.setAttribute( 'aria-describedby', d.id );
		wrap.append( el( 'br' ), d );
	}
	form.append( wrap );
	return wrap;
}

/**
 * Show field errors and an error summary that takes focus.
 *
 * @param form   Form.
 * @param ids    Element id per error key.
 * @param errors Errors by key.
 * @param texts  Texts.
 */
function showErrors(
	form: HTMLFormElement,
	ids: Record< string, string >,
	errors: Record< string, string >,
	texts: Texts
): void {
	form.querySelectorAll( '.cliedesk-request__error' ).forEach( ( n ) =>
		n.remove()
	);
	form.querySelectorAll( '[aria-invalid]' ).forEach( ( n ) =>
		n.removeAttribute( 'aria-invalid' )
	);
	const summary = form.querySelector< HTMLElement >(
		'.cliedesk-request__summary'
	);
	if ( ! summary ) {
		return;
	}
	summary.textContent = '';
	const keys = Object.keys( errors );
	if ( ! keys.length ) {
		summary.hidden = true;
		return;
	}
	summary.hidden = false;
	summary.append( el( 'strong', {}, texts.fix ) );
	const list = el( 'ul' );
	for ( const key of keys ) {
		const id = ids[ key ];
		const message = errors[ key ] as string;
		const item = el( 'li' );
		if ( id ) {
			const link = el( 'a', { href: `#${ id }` }, message );
			item.append( link );
			const input = form.querySelector( `#${ id }` );
			const err = el(
				'span',
				{ id: `${ id }-err`, class: 'cliedesk-request__error' },
				message
			);
			input?.setAttribute( 'aria-invalid', 'true' );
			input?.setAttribute(
				'aria-describedby',
				[ input.getAttribute( 'aria-describedby' ), err.id ]
					.filter( Boolean )
					.join( ' ' )
			);
			input?.parentElement?.append( err );
		} else {
			item.textContent = message;
		}
		list.append( item );
	}
	summary.append( list );
	summary.focus();
}

/**
 * Build one form.
 *
 * @param root   Placeholder.
 * @param config Config.
 */
export async function mount(
	root: HTMLElement,
	config: Config
): Promise< void > {
	const t = config.texts;
	root.setAttribute( 'aria-busy', 'true' );
	root.textContent = t.loading;
	const query = { type: config.type, product: config.product };
	const first = await call< FormInfo >( config, 'GET', query ).catch(
		() => null
	);
	root.removeAttribute( 'aria-busy' );
	if ( ! first?.ok ) {
		root.textContent = t.error;
		return;
	}
	const data = first.data;
	const n = ++seq;
	const id = ( k: string ) =>
		`cliedesk-request-${ n }-${ k.replace( /[^a-z0-9_-]/gi, '-' ) }`;
	const ids: Record< string, string > = {};
	const form = el( 'form', {
		class: 'cliedesk-request__form',
		novalidate: '',
	} );
	const summary = el( 'div', {
		class: 'cliedesk-request__summary',
		role: 'alert',
		tabindex: '-1',
	} );
	summary.hidden = true;
	form.append( summary );

	if ( ! data.user ) {
		ids.name = id( 'name' );
		row(
			form,
			ids.name,
			t.name,
			el( 'input', { id: ids.name, name: 'name', autocomplete: 'name' } ),
			false,
			t
		);
		ids.email = id( 'email' );
		row(
			form,
			ids.email,
			t.email,
			el( 'input', {
				id: ids.email,
				name: 'email',
				type: 'email',
				autocomplete: 'email',
			} ),
			true,
			t
		);
	}
	ids.subject = id( 'subject' );
	row(
		form,
		ids.subject,
		t.subject,
		el( 'input', { id: ids.subject, name: 'subject', maxlength: '191' } ),
		true,
		t
	);
	const rows: Record< string, HTMLElement > = {};
	for ( const field of data.fields ) {
		const fid = id( `v-${ field.key }` );
		ids[ `values.${ field.key }` ] = fid;
		const line = row(
			form,
			fid,
			field.label,
			control( field, fid, t ),
			field.required,
			t,
			field.description
		);
		line.hidden = ! field.visible;
		rows[ field.key ] = line;
	}
	// PRT-13: which of the customer's orders it is about (optional).
	let orderSelect: HTMLSelectElement | null = null;
	if ( config.orders ) {
		const orders = await ownOrders( config );
		if ( orders.length ) {
			ids.orderId = id( 'order' );
			orderSelect = el( 'select', { id: ids.orderId, name: 'orderId' } );
			orderSelect.append(
				el( 'option', { value: '' }, config.orders.none )
			);
			for ( const o of orders ) {
				orderSelect.append(
					el(
						'option',
						{ value: String( o.id ) },
						[
							'#' + o.number,
							o.date
								? new Date( o.date ).toLocaleDateString()
								: '',
							o.total,
						]
							.filter( Boolean )
							.join( ' · ' )
					)
				);
			}
			row(
				form,
				ids.orderId,
				config.orders.label,
				orderSelect,
				false,
				t
			);
		}
	}
	// CRM-32: which organization the request is for.
	let orgSelect: HTMLSelectElement | null = null;
	if ( data.organizations && data.organizations.items.length > 1 ) {
		ids.organizationId = id( 'organization' );
		orgSelect = el( 'select', {
			id: ids.organizationId,
			name: 'organizationId',
		} );
		for ( const o of data.organizations.items ) {
			orgSelect.append(
				el( 'option', { value: String( o.id ) }, o.name )
			);
		}
		row(
			form,
			ids.organizationId,
			data.organizations.label,
			orgSelect,
			false,
			t
		);
	}
	ids.message = id( 'message' );
	const text = el( 'textarea', {
		id: ids.message,
		name: 'message',
		rows: '6',
		maxlength: '5000',
	} );
	row( form, ids.message, t.message, text, true, t );
	suggest( form, text, config.api + 'help/', t );

	ids.files = id( 'files' );
	const picker = el( 'input', {
		id: ids.files,
		name: 'files',
		type: 'file',
		multiple: '',
	} );
	row( form, ids.files, t.files, picker, false, t );

	let token = '';
	if ( data.challenge ) {
		const box = el( 'div', { class: 'cliedesk-request__bot' } );
		form.append( box );
		const challenge = data.challenge;
		void botApi( challenge.provider ).then( ( api ) =>
			api?.render( box, {
				sitekey: challenge.siteKey,
				callback: ( v ) => ( token = v ),
				'expired-callback': () => ( token = '' ),
			} )
		);
	}
	const button = el( 'button', { type: 'submit' }, t.send );
	const actions = el( 'p' );
	actions.append( button );
	form.append( actions );

	const values = (): Values => {
		const out: Values = {};
		for ( const field of data.fields ) {
			if ( ! rows[ field.key ]?.hidden ) {
				out[ field.key ] = readValue( form, field );
			}
		}
		return out;
	};

	// Conditional fields: ask the server again when a custom field changes.
	let timer = 0;
	form.addEventListener( 'change', ( e ) => {
		const target = e.target as HTMLElement | null;
		if ( ! target?.getAttribute( 'name' )?.startsWith( 'values.' ) ) {
			return;
		}
		window.clearTimeout( timer );
		timer = window.setTimeout( async () => {
			const next = await call< FormInfo >( config, 'GET', {
				...query,
				values: JSON.stringify( values() ),
			} ).catch( () => null );
			for ( const field of next?.data?.fields ?? [] ) {
				const line = rows[ field.key ];
				if ( line ) {
					line.hidden = ! field.visible;
				}
			}
		}, 250 );
	} );

	form.addEventListener( 'submit', async ( e ) => {
		e.preventDefault();
		if ( data.challenge && ! token ) {
			showErrors( form, ids, { captcha: t.robot }, t );
			return;
		}
		const get = ( k: string ) =>
			( form.elements.namedItem( k ) as HTMLInputElement | null )
				?.value ?? '';
		button.disabled = true;
		button.textContent = t.sending;
		const fields = {
			type: config.type,
			product: config.product,
			name: get( 'name' ),
			email: get( 'email' ),
			subject: get( 'subject' ),
			message: get( 'message' ),
			values: values(),
			captcha: token,
			pageUrl: window.location.href,
			source: config.source ?? '',
			orderId: orderSelect?.value ?? '',
			organizationId: orgSelect?.value ?? '',
		};
		const chosen = Array.from( picker.files ?? [] );
		let body: unknown = fields;
		if ( chosen.length ) {
			const multipart = new window.FormData();
			for ( const [ k, v ] of Object.entries( fields ) ) {
				multipart.append(
					k,
					typeof v === 'string' ? v : JSON.stringify( v )
				);
			}
			chosen.forEach( ( file ) => multipart.append( 'files[]', file ) );
			body = multipart;
		}
		const r = await call< { number: number } >(
			config,
			'POST',
			query,
			body
		).catch( () => null );
		button.disabled = false;
		button.textContent = t.send;
		if ( r?.ok ) {
			const done = el(
				'p',
				{
					role: 'status',
					tabindex: '-1',
					class: 'cliedesk-request__sent',
				},
				t.sent.replace( '%d', String( r.data.number ) )
			);
			root.replaceChildren( done );
			done.focus();
			return;
		}
		showErrors(
			form,
			ids,
			r && Object.keys( r.fields ).length ? r.fields : { form: t.error },
			t
		);
	} );
	root.replaceChildren( form );
}

/**
 * Fill every placeholder on the page.
 */
export function start(): void {
	document
		.querySelectorAll< HTMLElement >( '.cliedesk-request[data-config]' )
		.forEach( ( root ) => {
			try {
				void mount(
					root,
					JSON.parse( root.dataset.config ?? '{}' ) as Config
				);
			} catch {
				// A broken placeholder leaves its <noscript> text.
			}
		} );
}
