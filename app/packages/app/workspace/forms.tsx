/**
 * Form helpers shared by the workspace, product and brand screens (plan.frontend-ux.md §8.6): an error summary
 * that takes focus and links to each field, server field-error mapping and a conflict banner.
 */
import { isApiError } from '@cliedesk/data';
import { announce, Banner, Button, ErrorState } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useRef } from 'react';
import { describeError } from '../components/RouteError';
import { isConflict } from './api';

export interface SummaryItem {
	/** DOM id of the field the link focuses. */
	fieldId: string;
	message: string;
}

/**
 * Error summary (role="alert"): receives focus whenever `items` changes and is not empty.
 *
 * @param props       Props.
 * @param props.items Errors.
 */
export function ErrorSummary( { items }: { items: SummaryItem[] } ) {
	const ref = useRef< HTMLDivElement >( null );
	useEffect( () => {
		if ( items.length ) {
			ref.current?.focus();
		}
	}, [ items ] );
	if ( ! items.length ) {
		return null;
	}
	return (
		<div
			ref={ ref }
			tabIndex={ -1 }
			role="alert"
			className="rounded-lg border border-danger-line bg-danger-subtle p-4 outline-none"
		>
			<p className="font-semibold">
				{ sprintf(
					/* translators: %d: number of errors. */
					_n(
						'There is %d error to fix:',
						'There are %d errors to fix:',
						items.length,
						'cliedesk'
					),
					items.length
				) }
			</p>
			<ul className="mt-1 list-disc ps-5">
				{ items.map( ( m ) => (
					<li key={ `${ m.fieldId }:${ m.message }` }>
						<a
							href={ `#${ m.fieldId }` }
							className="text-danger underline underline-offset-2"
							onClick={ ( ev ) => {
								ev.preventDefault();
								focusField( m.fieldId );
							} }
						>
							{ m.message }
						</a>
					</li>
				) ) }
			</ul>
		</div>
	);
}

/**
 * Focus a field by id; for wrappers (radio groups, pickers) the first focusable element inside.
 *
 * @param id DOM id.
 */
export function focusField( id: string ): void {
	const el = document.getElementById( id );
	if ( ! el ) {
		return;
	}
	const focusable = el.matches( 'input, textarea, button, select, a[href]' )
		? el
		: el.querySelector< HTMLElement >(
				'input:not([disabled]), textarea, button:not([disabled]), [tabindex="0"]'
			);
	( focusable ?? el ).focus();
}

/**
 * Field errors of an API error (`error.fields`), or an empty object.
 *
 * @param e Error.
 */
export function apiFieldErrors( e: unknown ): Record< string, string > {
	return isApiError( e ) ? ( e.fields ?? {} ) : {};
}

/**
 * First matching message among several possible keys (camelCase input names, snake_case stored names,
 * `values.` prefixes from the settings API).
 *
 * @param fields Field errors.
 * @param keys   Candidate keys.
 */
export function pickError(
	fields: Record< string, string >,
	...keys: string[]
): string | null {
	for ( const k of keys ) {
		const v = fields[ k ] ?? fields[ `values.${ k }` ];
		if ( v ) {
			return v;
		}
	}
	return null;
}

/**
 * Banner for a stale-version save: someone else changed the item.
 *
 * @param props          Props.
 * @param props.onReload Reload the latest version.
 * @param props.message  Message (a general one by default).
 */
export function ConflictBanner( {
	onReload,
	message,
}: {
	onReload: () => void;
	message?: string;
} ) {
	return (
		<Banner
			tone="warning"
			role="alert"
			title={
				message ??
				__(
					'Someone else changed this in the meantime. Reload to see their changes.',
					'cliedesk'
				)
			}
			actions={
				<Button variant="primary" onPress={ onReload }>
					{ __( 'Reload', 'cliedesk' ) }
				</Button>
			}
		/>
	);
}

/**
 * Error for a failed save that has no field errors (or a conflict, which has its own banner).
 *
 * @param props       Props.
 * @param props.error Error.
 * @param props.title Title.
 */
export function SaveError( {
	error,
	title,
}: {
	error: unknown;
	title?: string;
} ) {
	if (
		! error ||
		isConflict( error ) ||
		Object.keys( apiFieldErrors( error ) ).length
	) {
		return null;
	}
	return (
		<ErrorState
			headingLevel={ 3 }
			title={ title ?? __( 'Could not save', 'cliedesk' ) }
			message={ describeError( error ) }
			code={ isApiError( error ) ? error.code : null }
			requestId={ isApiError( error ) ? error.requestId : null }
		/>
	);
}

/**
 * Announce a result to screen readers (polite) — for results not visible at the focus position.
 *
 * @param text Text.
 */
export function announceResult( text: string ): void {
	announce( text, 'polite' );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Client check for a colour (the server validates again).
 *
 * @param value Input.
 */
export function validateHex( value: string ): string | null {
	return value === '' || HEX.test( value.trim() )
		? null
		: __( 'Use a colour like #2861E6.', 'cliedesk' );
}

/**
 * Client check for an http(s) URL; empty is allowed.
 *
 * @param value Input.
 */
export function validateUrl( value: string ): string | null {
	const v = value.trim();
	if ( v === '' ) {
		return null;
	}
	try {
		const u = new URL( v );
		if ( /^https?:$/.test( u.protocol ) && u.hostname ) {
			return null;
		}
	} catch {}
	return __(
		'Enter a full address such as https://example.com.',
		'cliedesk'
	);
}

/**
 * Client check for an email address; empty is allowed.
 *
 * @param value Input.
 */
export function validateEmail( value: string ): string | null {
	const v = value.trim();
	return v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( v )
		? null
		: __( 'Enter a valid email address.', 'cliedesk' );
}

/**
 * Client check for a slug.
 *
 * @param value Input.
 */
export function validateSlug( value: string ): string | null {
	return value === '' || /^[a-z0-9][a-z0-9-]{0,99}$/.test( value )
		? null
		: __(
				'Use lowercase letters, numbers and hyphens, starting with a letter or number.',
				'cliedesk'
			);
}

/**
 * Required text with a maximum length.
 *
 * @param value    Input.
 * @param max      Maximum characters.
 * @param required Required.
 */
export function validateText(
	value: string,
	max: number,
	required = false
): string | null {
	if ( required && value.trim() === '' ) {
		return __( 'Enter a name.', 'cliedesk' );
	}
	return value.length > max
		? sprintf(
				/* translators: %d: maximum number of characters. */
				__( 'Enter up to %d characters.', 'cliedesk' ),
				max
			)
		: null;
}
