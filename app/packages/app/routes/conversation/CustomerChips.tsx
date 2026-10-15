/**
 * Customer chips next to the customer name (INB-39): their local time and language. Local time comes from the
 * contact's timezone (profile, Woo address or IP, set on the server); without one it says "unknown" rather than
 * guessing. Loaded lazily to keep the conversation chunk small.
 */
import { getBoot } from '@cliedesk/data';
import { Switch } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Contact } from '../../inbox/api';
import { Pill } from '../../inbox/components';
import { setTimeZoneOverride } from '../../inbox/labels';
import { prefsStore, savePrefs } from '../../prefs';

const locale = () =>
	( getBoot().workspace?.locale || 'en' ).replace( '_', '-' );

/**
 * Time now in a timezone, or null when the zone is missing or invalid.
 *
 * @param zone IANA timezone.
 * @param now  Current time.
 */
export function localTime( zone: string | null, now: Date ): string | null {
	if ( ! zone ) {
		return null;
	}
	try {
		return new Intl.DateTimeFormat( locale(), {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: zone,
		} ).format( now );
	} catch {
		return null;
	}
}

/**
 * Name of a language code (e.g. "de_DE" → "German (Germany)"), or the code itself.
 *
 * @param code Language code.
 */
export function languageName( code: string ): string {
	try {
		return (
			new Intl.DisplayNames( [ locale() ], { type: 'language' } ).of(
				code.replace( '_', '-' )
			) ?? code
		);
	} catch {
		return code;
	}
}

/**
 * Local time and language of the customer.
 *
 * @param props         Props.
 * @param props.contact The customer.
 */
export default function CustomerChips( { contact }: { contact: Contact } ) {
	const [ now, setNow ] = useState( () => new Date() );
	useEffect( () => {
		const t = window.setInterval( () => setNow( new Date() ), 60_000 );
		return () => window.clearInterval( t );
	}, [] );
	const time = localTime( contact.timezone, now );
	// INB-39: my switch to show every time in this conversation in the customer's time zone.
	const store = prefsStore();
	const prefs = useSyncExternalStore( store.subscribe, store.get, store.get );
	const customerTime = !! prefs?.layout?.customerTime && !! time;
	useEffect( () => {
		setTimeZoneOverride( customerTime ? contact.timezone : null );
		if ( customerTime ) {
			// Redraw the times already on screen.
			const current = store.get();
			if ( current ) {
				store.set( { ...current } );
			}
		}
		return () => setTimeZoneOverride( null );
	}, [ customerTime, contact.timezone, store ] );
	return (
		<>
			<ul
				aria-label={ __( 'About the customer', 'cliedesk' ) }
				className="flex flex-wrap gap-1"
			>
				<li>
					<Pill>
						{ time
							? sprintf(
									/* translators: %s: the customer's local time, e.g. 14:05. */
									__( 'Local time %s', 'cliedesk' ),
									time
								)
							: __( 'Local time unknown', 'cliedesk' ) }
					</Pill>
				</li>
				{ contact.language && (
					<li>
						<Pill>{ languageName( contact.language ) }</Pill>
					</li>
				) }
			</ul>
			{ time && (
				<Switch
					isSelected={ customerTime }
					onChange={ ( on ) => {
						setTimeZoneOverride( on ? contact.timezone : null );
						savePrefs( { layout: { customerTime: on } } );
					} }
				>
					{ __(
						'Show times in the customer’s time zone',
						'cliedesk'
					) }
				</Switch>
			) }
		</>
	);
}
