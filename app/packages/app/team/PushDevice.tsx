/**
 * Push notifications on this device (APP-09): asks the browser for permission, subscribes it with the site's Web
 * Push key and registers the subscription; switching off removes it. Shown on the person's own profile. APP-14: quiet
 * hours (no push then) and "hide message text in push", for all of the person's devices.
 */
import { api } from '@cliedesk/data';
import { Checkbox, Switch, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useEffect, useState } from 'react';

/**
 * Bytes of a base64url key.
 *
 * @param key Key.
 */
export function keyBytes( key: string ): Uint8Array< ArrayBuffer > {
	const pad = '='.repeat( ( 4 - ( key.length % 4 ) ) % 4 );
	const raw = window.atob(
		( key + pad ).replace( /-/g, '+' ).replace( /_/g, '/' )
	);
	const out = new Uint8Array( new ArrayBuffer( raw.length ) );
	for ( let i = 0; i < raw.length; i++ ) {
		out[ i ] = raw.charCodeAt( i );
	}
	return out;
}

const supported = () =>
	typeof window !== 'undefined' &&
	'serviceWorker' in navigator &&
	'PushManager' in window &&
	'Notification' in window;

interface Quiet {
	quiet: boolean;
	from: string;
	to: string;
	hideContent: boolean;
}

/**
 * APP-14: quiet hours and push privacy.
 */
export function QuietHours() {
	const [ v, setV ] = useState< Quiet | null >( null );
	useEffect( () => {
		void api
			.post< Quiet >( 'push/settings', { body: {} } )
			.then( ( r ) => setV( r.data ?? null ) )
			.catch( () => undefined );
	}, [] );
	if ( ! v ) {
		return null;
	}
	const save = ( patch: Partial< Quiet > ) => {
		const next = { ...v, ...patch };
		setV( next );
		if (
			/^([01]\d|2[0-3]):[0-5]\d$/.test( next.from ) &&
			/^([01]\d|2[0-3]):[0-5]\d$/.test( next.to )
		) {
			void api
				.post( 'push/settings', { body: next } )
				.catch( () => undefined );
		}
	};
	return (
		<div className="flex flex-col gap-2">
			<Checkbox
				isSelected={ v.quiet }
				onChange={ ( quiet ) => save( { quiet } ) }
			>
				{ __( 'Quiet hours: no push notifications', 'cliedesk' ) }
			</Checkbox>
			{ v.quiet && (
				<div className="flex flex-wrap gap-2">
					<TextField
						label={ __( 'From', 'cliedesk' ) }
						type="time"
						value={ v.from }
						onChange={ ( from ) => save( { from } ) }
					/>
					<TextField
						label={ __( 'To', 'cliedesk' ) }
						type="time"
						value={ v.to }
						onChange={ ( to ) => save( { to } ) }
					/>
				</div>
			) }
			<Checkbox
				isSelected={ v.hideContent }
				onChange={ ( hideContent ) => save( { hideContent } ) }
			>
				{ __(
					'Hide the message text in push notifications',
					'cliedesk'
				) }
			</Checkbox>
		</div>
	);
}

export function PushDevice() {
	const [ on, setOn ] = useState( false );
	const [ busy, setBusy ] = useState( false );
	const [ note, setNote ] = useState( '' );
	useEffect( () => {
		if ( ! supported() ) {
			return;
		}
		void navigator.serviceWorker.ready
			.then( ( reg ) => reg.pushManager.getSubscription() )
			.then( ( sub ) => setOn( !! sub ) )
			.catch( () => undefined );
	}, [] );
	if ( ! supported() ) {
		return (
			<p className="text-sm text-fg-muted">
				{ __(
					'This browser cannot show push notifications. Install the app or use another browser.',
					'cliedesk'
				) }
			</p>
		);
	}
	const enable = async () => {
		if ( ( await Notification.requestPermission() ) !== 'granted' ) {
			setNote(
				__(
					'Notifications are blocked for this site in the browser settings.',
					'cliedesk'
				)
			);
			return;
		}
		const key = (
			await api.get< { available: boolean; key: string } >( 'push/key' )
		).data;
		if ( ! key?.available ) {
			setNote(
				__( 'The server cannot send push notifications.', 'cliedesk' )
			);
			return;
		}
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.subscribe( {
			userVisibleOnly: true,
			applicationServerKey: keyBytes( key.key ),
		} );
		const json = sub.toJSON();
		await api.post( 'push/subscriptions', {
			body: { endpoint: json.endpoint, keys: json.keys },
		} );
		setOn( true );
		setNote( '' );
	};
	const disable = async () => {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if ( sub ) {
			await api.post( 'push/subscriptions/remove', {
				body: { endpoint: sub.endpoint },
			} );
			await sub.unsubscribe();
		}
		setOn( false );
	};
	return (
		<div className="flex flex-col gap-1">
			<Switch
				isSelected={ on }
				isDisabled={ busy }
				onChange={ ( want ) => {
					setBusy( true );
					( want ? enable() : disable() )
						.catch( () =>
							setNote(
								__(
									'Push could not be changed. Please try again.',
									'cliedesk'
								)
							)
						)
						.finally( () => setBusy( false ) );
				} }
			>
				{ __( 'Push notifications on this device', 'cliedesk' ) }
			</Switch>
			{ note && (
				<p role="status" className="text-sm text-fg-muted">
					{ note }
				</p>
			) }
			<QuietHours />
		</div>
	);
}
