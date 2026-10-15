/**
 * Redaction (SEC-25) in the timeline.
 *
 * - "Redact…" (cliedesk_redact_content) in a message's More menu: POST messages/{id}/redact with the selected text
 *   (prefilled from the selection inside that message) and/or classes (emails, phone numbers, card numbers).
 *   Returns {redactionId|null, replaced}; the conversation is reloaded afterwards.
 * - A message whose body contains the server's mark "[redacted]" shows a "Redacted" marker. People who may see
 *   masked originals (cliedesk_view_masked_originals, with or without cliedesk_redact_content) get "View original":
 *   GET messages/{id}/redactions, then
 *   GET redactions/{id}/original (a sensitive Action: the API client asks for the password first when needed).
 */
import { can } from '@cliedesk/data';
import {
	Button,
	Menu,
	MenuItem,
	UnstyledButton,
	focusRing,
} from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { MoreHorizontal } from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { Message } from '../../inbox/api';
import { Pill } from '../../inbox/components';

export type RedactClass = 'email' | 'phone' | 'card';
export const REDACT_CLASSES: RedactClass[] = [ 'email', 'phone', 'card' ];
/** What the server puts in place of redacted text. */
export const REDACTED_MARK = '[redacted]';

export interface Redaction {
	id: number;
	class: string;
	createdBy: number | null;
	createdAt: string;
	hasOriginal: boolean;
	purgeAt: string | null;
}

/**
 * Label of a class.
 *
 * @param c Class.
 */
export function redactClassLabel( c: string ): string {
	switch ( c ) {
		case 'email':
			return __( 'Email addresses', 'cliedesk' );
		case 'phone':
			return __( 'Phone numbers', 'cliedesk' );
		case 'card':
			return __( 'Card numbers', 'cliedesk' );
		case 'text':
			return __( 'Selected text', 'cliedesk' );
		default:
			return c
				.split( ',' )
				.map( ( x ) => ( x === c ? x : redactClassLabel( x ) ) )
				.join( ', ' );
	}
}

/**
 * Text selected inside an element (empty when the selection is elsewhere).
 *
 * @param el Element.
 */
export function selectionWithin( el: Element | null ): string {
	const sel = el?.ownerDocument.defaultView?.getSelection?.() ?? null;
	if ( ! el || ! sel || sel.isCollapsed || ! sel.anchorNode ) {
		return '';
	}
	return el.contains( sel.anchorNode ) && el.contains( sel.focusNode )
		? sel.toString().trim()
		: '';
}

/**
 * Whether a message shows the redaction mark.
 *
 * @param m Message.
 */
export const isRedacted = ( m: Message ): boolean =>
	( m.text ?? '' ).includes( REDACTED_MARK ) ||
	( m.html ?? '' ).includes( REDACTED_MARK );

const RedactDialog = lazy( () =>
	import(
		/* webpackChunkName: "conversation-redact" */ './RedactDialogs'
	).then( ( m ) => ( { default: m.RedactDialog } ) )
);
const OriginalDialog = lazy( () =>
	import(
		/* webpackChunkName: "conversation-redact" */ './RedactDialogs'
	).then( ( m ) => ( { default: m.OriginalDialog } ) )
);

/**
 * "Redacted" marker, with "View original" for people allowed to see originals.
 *
 * @param props         Props.
 * @param props.message Message.
 */
export function RedactedMarker( { message }: { message: Message } ) {
	const [ open, setOpen ] = useState( false );
	if ( ! isRedacted( message ) ) {
		return null;
	}
	// Listing redactions and reading an original both work with cliedesk_view_masked_originals alone.
	const canView = can( 'cliedesk_view_masked_originals' );
	return (
		<>
			<Pill>{ __( 'Redacted', 'cliedesk' ) }</Pill>
			{ canView && (
				<Button
					size="sm"
					variant="ghost"
					onPress={ () => setOpen( true ) }
				>
					{ __( 'View original', 'cliedesk' ) }
				</Button>
			) }
			{ open && (
				<Suspense fallback={ null }>
					<OriginalDialog
						message={ message }
						onClose={ () => setOpen( false ) }
					/>
				</Suspense>
			) }
		</>
	);
}

/**
 * The message's More menu (Forward this message…, Redact…), shown when one of them is available.
 *
 * @param props                Props.
 * @param props.message        Message.
 * @param props.conversationId Conversation id.
 * @param props.articleId      DOM id of the message (selection prefill).
 * @param props.onForward      Forward this message.
 */
export function MessageMenu( {
	message,
	conversationId,
	articleId,
	onForward,
	onSaveReply,
	onEdit,
}: {
	message: Message;
	conversationId: number;
	articleId: string;
	/** "Forward this message" (INB-47), when the message can be forwarded. */
	onForward?: () => void;
	/** "Save as saved reply" (MAC-12), on a sent reply when the person may create saved replies. */
	onSaveReply?: () => void;
	/** "Edit" (INB-41), on my own sent chat reply. */
	onEdit?: () => void;
} ) {
	const [ redacting, setRedacting ] = useState( false );
	const selected = useRef( '' );
	const allowed = can( 'cliedesk_redact_content' );
	// Remember the last text selected inside this message: opening the menu may collapse the selection.
	useEffect( () => {
		if ( ! allowed ) {
			return undefined;
		}
		const onChange = () => {
			const el = document.getElementById( articleId );
			const text = selectionWithin( el );
			const sel = el?.ownerDocument.defaultView?.getSelection?.();
			if ( text ) {
				selected.current = text;
			} else if ( sel && ! sel.isCollapsed ) {
				selected.current = ''; // Text selected somewhere else.
			}
		};
		document.addEventListener( 'selectionchange', onChange );
		return () =>
			document.removeEventListener( 'selectionchange', onChange );
	}, [ allowed, articleId ] );
	if ( ! allowed && ! onForward && ! onSaveReply && ! onEdit ) {
		return null;
	}
	const capture = () => {
		const text = selectionWithin( document.getElementById( articleId ) );
		if ( text ) {
			selected.current = text;
		}
	};
	return (
		<span onPointerDownCapture={ capture } onKeyDownCapture={ capture }>
			<Menu
				aria-label={ __( 'Message actions', 'cliedesk' ) }
				onAction={ ( k ) => {
					if ( k === 'redact' ) {
						setRedacting( true );
					} else if ( k === 'forward' ) {
						onForward?.();
					} else if ( k === 'save-reply' ) {
						onSaveReply?.();
					} else if ( k === 'edit' ) {
						onEdit?.();
					}
				} }
				trigger={
					<UnstyledButton
						aria-label={ __(
							'More actions for this message',
							'cliedesk'
						) }
						className={ `inline-flex size-(--cd-control-h-sm) items-center justify-center rounded-md text-fg-muted data-[hovered]:bg-sunken ${ focusRing }` }
					>
						<MoreHorizontal aria-hidden="true" size={ 16 } />
					</UnstyledButton>
				}
			>
				{ onEdit ? (
					<MenuItem id="edit">{ __( 'Edit…', 'cliedesk' ) }</MenuItem>
				) : null }
				{ onForward ? (
					<MenuItem id="forward">
						{ __( 'Forward this message…', 'cliedesk' ) }
					</MenuItem>
				) : null }
				{ onSaveReply ? (
					<MenuItem id="save-reply">
						{ __( 'Save as saved reply…', 'cliedesk' ) }
					</MenuItem>
				) : null }
				{ allowed ? (
					<MenuItem id="redact">
						{ __( 'Redact…', 'cliedesk' ) }
					</MenuItem>
				) : null }
			</Menu>
			{ redacting && (
				<Suspense fallback={ null }>
					<RedactDialog
						message={ message }
						conversationId={ conversationId }
						selected={ selected.current }
						onClose={ () => {
							setRedacting( false );
							selected.current = '';
						} }
					/>
				</Suspense>
			) }
		</span>
	);
}
