/**
 * Entity highlights in messages (COP-18, Free): email addresses, web addresses and order numbers in a message are
 * found by pattern (not inside links). An email opens a card with the matching contact (open, copy); a web address
 * opens a card to open it in a new tab or copy it; "#1042" or "order 1042" is marked only when a real WooCommerce
 * order has that number (looked up for people who may see orders), and its card opens the order or copies the
 * number. AI entity detection (SKUs, tracking numbers, amounts, dates) is Pro.
 *
 * - GET contacts?q={email}&limit=1 → {items: [{id, displayName, email}]}.
 * - GET orders?q={number}&limit=5 → {items: [{id, title, status, url}]} (WooCommerce active; 404 otherwise).
 */
import { api, can, useQuery } from '@cliedesk/data';
import { Button, Popover, UnstyledButton } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import type { Decorate } from '../../inbox/html';
import { announceResult } from '../../workspace/forms';

/** Email addresses in plain text (a practical pattern, not RFC 5322). */
export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Emails, web addresses and order numbers ("#1042", "order 1042"), in one pass. */
export const ENTITY =
	/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|(?:#|\b[Oo]rder\s+(?:#\s*)?)(\d{2,10})\b/g;

interface OrderRecord {
	id: string;
	title: string;
	status?: string;
	url?: string;
}

interface Contact {
	id: number;
	displayName: string;
	email: string | null;
}

function EmailCard( { email }: { email: string } ) {
	const q = useQuery( {
		queryKey: [ 'contacts', 'by-email', email.toLowerCase() ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Contact[] } >( 'contacts', {
					query: { q: email, limit: 1 },
					signal,
				} )
			).data?.items?.[ 0 ] ?? null,
		staleTime: 60_000,
		retry: false,
	} );
	const contact = q.data;
	return (
		<div className="flex max-w-xs flex-col gap-2 p-1 text-sm">
			<span className="font-medium break-all">{ email }</span>
			{ q.isPending && (
				<span className="text-fg-muted">
					{ __( 'Looking up…', 'cliedesk' ) }
				</span>
			) }
			{ ! q.isPending && ! contact && (
				<span className="text-fg-muted">
					{ __( 'Not a known contact.', 'cliedesk' ) }
				</span>
			) }
			<span className="flex flex-wrap gap-2">
				{ contact && (
					<Link
						to={ '/contacts/$contactId' as never }
						params={ { contactId: String( contact.id ) } as never }
						className="underline"
					>
						{ contact.displayName ||
							__( 'Open contact', 'cliedesk' ) }
					</Link>
				) }
				<Button size="sm" onPress={ () => copy( email ) }>
					{ __( 'Copy', 'cliedesk' ) }
				</Button>
			</span>
		</div>
	);
}

function copy( text: string ) {
	void navigator.clipboard
		?.writeText( text )
		.then( () => announceResult( __( 'Copied.', 'cliedesk' ) ) );
}

function Mark( { value, children }: { value: string; children: ReactNode } ) {
	return (
		<Popover
			label={ value }
			trigger={
				<UnstyledButton className="cd-entity rounded-sm bg-accent-subtle px-0.5 underline decoration-dotted outline-none focus-visible:outline-2 focus-visible:outline-focus">
					{ value }
				</UnstyledButton>
			}
		>
			{ children }
		</Popover>
	);
}

function UrlCard( { url }: { url: string } ) {
	return (
		<div className="flex max-w-xs flex-col gap-2 p-1 text-sm">
			<span className="font-medium break-all">{ url }</span>
			<span className="flex flex-wrap gap-2">
				<a
					href={ url }
					target="_blank"
					rel="noopener noreferrer nofollow"
					className="underline"
				>
					{ __( 'Open in a new tab', 'cliedesk' ) }
				</a>
				<Button size="sm" onPress={ () => copy( url ) }>
					{ __( 'Copy', 'cliedesk' ) }
				</Button>
			</span>
		</div>
	);
}

/**
 * An order number: marked only when a real order has it.
 *
 * @param props        Props.
 * @param props.text   The text as written ("#1042").
 * @param props.number The number.
 */
function OrderNumber( { text, number }: { text: string; number: string } ) {
	const allowed = can( 'cliedesk_view_orders' );
	const q = useQuery( {
		queryKey: [ 'orders', 'by-number', number ],
		queryFn: async ( { signal } ) =>
			(
				(
					await api.get< { items: OrderRecord[] } >( 'orders', {
						query: { q: number, limit: 5 },
						signal,
					} )
				).data?.items ?? []
			).find( ( o ) => o.title.endsWith( `#${ number }` ) ) ?? null,
		enabled: allowed,
		staleTime: 5 * 60_000,
		retry: false,
	} );
	const order = q.data;
	if ( ! order ) {
		return <>{ text }</>;
	}
	return (
		<Mark value={ text }>
			<div className="flex max-w-xs flex-col gap-2 p-1 text-sm">
				<span className="font-medium">{ order.title }</span>
				{ order.status && (
					<span className="text-fg-muted">{ order.status }</span>
				) }
				<span className="flex flex-wrap gap-2">
					{ order.url && (
						<a
							href={ order.url }
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							{ __( 'Open the order', 'cliedesk' ) }
						</a>
					) }
					<Button size="sm" onPress={ () => copy( number ) }>
						{ __( 'Copy', 'cliedesk' ) }
					</Button>
				</span>
			</div>
		</Mark>
	);
}

/**
 * Split a text run into plain text and marked emails, web addresses and order numbers.
 *
 * @param text Text.
 * @param key  React key prefix.
 */
export const decorateEntities: Decorate = ( text, key ) => {
	const out: ReactNode[] = [];
	let last = 0;
	for ( const m of text.matchAll( ENTITY ) ) {
		const at = m.index ?? 0;
		if ( at > last ) {
			out.push( text.slice( last, at ) );
		}
		const k = `${ key }-${ at }`;
		if ( m[ 1 ] ) {
			out.push(
				<Mark key={ k } value={ m[ 1 ] }>
					<EmailCard email={ m[ 1 ] } />
				</Mark>
			);
		} else if ( m[ 2 ] ) {
			out.push(
				<Mark key={ k } value={ m[ 2 ] }>
					<UrlCard url={ m[ 2 ] } />
				</Mark>
			);
		} else {
			out.push(
				<OrderNumber
					key={ k }
					text={ m[ 0 ] }
					number={ m[ 3 ] ?? '' }
				/>
			);
		}
		last = at + m[ 0 ].length;
	}
	if ( last === 0 ) {
		return text;
	}
	out.push( text.slice( last ) );
	return out;
};
