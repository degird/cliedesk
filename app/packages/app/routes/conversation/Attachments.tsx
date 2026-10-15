/**
 * Files of a message (SEC-20, CHN-47): name, size and a short-lived signed download link; files that were refused
 * (type or size) are listed by name.
 */
import { __, _n, sprintf } from '@wordpress/i18n';
import { Paperclip } from 'lucide-react';
import type { Message } from '../../inbox/api';
import { FilePreview } from './FilePreview';

/**
 * Human file size.
 *
 * @param bytes Bytes.
 */
export function fileSize( bytes: number ): string {
	if ( bytes < 1024 ) {
		/* translators: %d: size in bytes. */
		return sprintf( __( '%d B', 'cliedesk' ), bytes );
	}
	if ( bytes < 1024 * 1024 ) {
		return sprintf(
			/* translators: %s: size in kilobytes. */
			__( '%s KB', 'cliedesk' ),
			String( Math.round( bytes / 1024 ) )
		);
	}
	return sprintf(
		/* translators: %s: size in megabytes. */
		__( '%s MB', 'cliedesk' ),
		( bytes / 1048576 ).toFixed( 1 )
	);
}

/**
 * Names of files that were not stored (meta.email.blockedFiles).
 *
 * @param m Message.
 */
export function blockedFilesOf( m: Message ): string[] {
	const email = m.meta?.email;
	if ( ! email || typeof email !== 'object' ) {
		return [];
	}
	const list = ( email as { blockedFiles?: unknown } ).blockedFiles;
	return Array.isArray( list )
		? list.filter( ( x ): x is string => typeof x === 'string' )
		: [];
}

export interface WidgetContext {
	pageUrl: string;
	pageTitle?: string;
	referrer?: string;
	device?: string;
	browser?: string;
	language?: string;
	/** CHN-32: checkout step and payment error. */
	checkout?: { step?: string; error?: string };
	/** DEV-10: Cliedesk.setContext() pairs from the site. */
	context?: Record< string, string >;
	/** CHN-19: WooCommerce product of the page and the cart. */
	shop?: {
		product?: number;
		name?: string;
		cart?: {
			items: Array< { id: number; name: string; qty: number } >;
			value?: string;
			currency?: string;
		};
	};
}

/**
 * CHN-19: the product page and the cart, in one line.
 *
 * @param shop Shop context.
 */
export function shopLine( shop: WidgetContext[ 'shop' ] ): string {
	if ( ! shop ) {
		return '';
	}
	const parts: string[] = [];
	if ( shop.product ) {
		parts.push(
			sprintf(
				/* translators: 1: product name, 2: product id. */
				__( 'Product: %1$s (#%2$d)', 'cliedesk' ),
				shop.name ?? '',
				shop.product
			)
		);
	}
	if ( shop.cart?.items.length ) {
		parts.push(
			sprintf(
				/* translators: 1: cart lines such as "Kettle × 2", 2: total with currency. */
				__( 'Cart: %1$s · %2$s', 'cliedesk' ),
				shop.cart.items
					.map( ( i ) => `${ i.name } × ${ i.qty }` )
					.join( ', ' ),
				`${ shop.cart.value ?? '' } ${ shop.cart.currency ?? '' }`.trim()
			)
		);
	}
	return parts.join( ' · ' );
}

/**
 * Where a widget message was sent from (CHN-19, meta.widget).
 *
 * @param m Message.
 */
export function widgetContextOf( m: Message ): WidgetContext | null {
	const w = m.meta?.widget;
	if ( ! w || typeof w !== 'object' ) {
		return null;
	}
	const ctx = w as Partial< WidgetContext >;
	return typeof ctx.pageUrl === 'string' &&
		/^https?:\/\//i.test( ctx.pageUrl )
		? ( ctx as WidgetContext )
		: null;
}

/**
 * The page and device a widget message came from.
 *
 * @param props         Props.
 * @param props.message Message.
 */
export function PageContext( { message: m }: { message: Message } ) {
	const ctx = widgetContextOf( m );
	if ( ! ctx ) {
		return null;
	}
	let from = '';
	try {
		from = ctx.referrer ? new URL( ctx.referrer ).host : '';
	} catch {
		from = '';
	}
	const devices: Record< string, string > = {
		mobile: __( 'Mobile', 'cliedesk' ),
		desktop: __( 'Desktop', 'cliedesk' ),
	};
	const parts = [
		devices[ ctx.device ?? '' ] ?? '',
		ctx.browser ?? '',
		ctx.language ?? '',
		from
			? sprintf(
					/* translators: %s: website the visitor came from. */
					__( 'came from %s', 'cliedesk' ),
					from
				)
			: '',
	].filter( Boolean );
	return (
		<p className="text-xs text-fg-muted">
			{ ctx.checkout?.step && (
				<strong className="me-1">
					{ ctx.checkout.step === 'thank_you'
						? __( 'Order received page', 'cliedesk' )
						: __( 'Checkout', 'cliedesk' ) }
					{ ctx.checkout.error &&
						` · ${ sprintf(
							/* translators: %s: payment error shown to the customer. */
							__( 'Error: %s', 'cliedesk' ),
							ctx.checkout.error
						) }` }
					{ ' ·' }
				</strong>
			) }
			{ __( 'Sent from', 'cliedesk' ) }{ ' ' }
			<a
				href={ ctx.pageUrl }
				target="_blank"
				rel="noopener noreferrer nofollow"
				className="text-accent-fg underline"
			>
				<bdi>{ ctx.pageTitle || ctx.pageUrl }</bdi>
			</a>
			{ parts.length > 0 && ` · ${ parts.join( ' · ' ) }` }
			{ shopLine( ctx.shop ) && (
				<span className="block">{ shopLine( ctx.shop ) }</span>
			) }
			{ ctx.context &&
				Object.entries( ctx.context ).map( ( [ k, v ] ) => (
					<span key={ k } className="block">
						{ `${ k }: ${ v }` }
					</span>
				) ) }
		</p>
	);
}

/**
 * Attachments block.
 *
 * @param props         Props.
 * @param props.message Message.
 */
export function Attachments( { message: m }: { message: Message } ) {
	const files = m.attachments ?? [];
	const blocked = blockedFilesOf( m );
	if ( ! files.length && ! blocked.length ) {
		return null;
	}
	return (
		<div className="flex flex-col gap-1">
			{ files.length > 0 && (
				<ul
					aria-label={ __( 'Attachments', 'cliedesk' ) }
					className="flex flex-wrap gap-2"
				>
					{ files.map( ( f ) => (
						<li
							key={ f.id }
							className="flex flex-wrap items-center gap-1 rounded-md border border-line px-2 py-1 text-sm"
						>
							<Paperclip aria-hidden="true" size={ 14 } />
							{ f.url ? (
								<a
									href={ f.url }
									className="font-medium text-accent-fg underline"
									rel="noreferrer"
								>
									<bdi>{ f.name }</bdi>
								</a>
							) : (
								<bdi className="font-medium">{ f.name }</bdi>
							) }
							<span className="text-fg-muted">
								{ fileSize( f.size ) }
							</span>
							{ f.scan === 'infected' && (
								<span role="alert" className="text-danger">
									{ __(
										'Malware found. This file is quarantined and cannot be opened.',
										'cliedesk'
									) }
								</span>
							) }
							{ f.scan === 'unscanned' && (
								<span className="text-xs text-fg-muted">
									{ __( 'Not scanned', 'cliedesk' ) }
								</span>
							) }
							{ f.scan !== 'infected' && (
								<FilePreview file={ f } />
							) }
						</li>
					) ) }
				</ul>
			) }
			{ blocked.length > 0 && (
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: 1: number of files, 2: file names. */
						_n(
							'%1$d attachment was blocked: %2$s',
							'%1$d attachments were blocked: %2$s',
							blocked.length,
							'cliedesk'
						),
						blocked.length,
						blocked.join( ', ' )
					) }
				</p>
			) }
		</div>
	);
}
