import {
	cancelReauth,
	completeReauth,
	getBoot,
	reauthStore,
	refreshNonce,
} from '@cliedesk/data';
import { Button, Modal, toast } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useEffect, useState, useSyncExternalStore } from 'react';

export const REAUTH_FALLBACK_MS = 5000;

/** URL of the app's `_reauth` page (the server sends guests to the WordPress login first). */
export function reauthUrl(): string {
	const { app } = getBoot();
	if ( app.pretty ) {
		return app.url.replace( /\/?$/, '/' ) + '_reauth';
	}
	const url = new URL( app.url, window.location.href );
	url.searchParams.set( 'cliedesk', app.basePath + '/_reauth' );
	return url.toString();
}

/**
 * Re-authenticate dialog (§3.8): an iframe of the sign-in page that returns to `_reauth`, which posts
 * `{ type: 'cliedesk:reauth' }`. If the iframe cannot load within 5 s (X-Frame-Options), sign-in opens in a
 * new tab. The screen and drafts stay; the failed request is replayed once.
 */
export function ReauthDialog() {
	const state = useSyncExternalStore(
		reauthStore.subscribe,
		reauthStore.get,
		reauthStore.get
	);
	const [ showFallback, setShowFallback ] = useState( false );
	const [ checking, setChecking ] = useState( false );
	const [ stillOut, setStillOut ] = useState( false );

	useEffect( () => {
		if ( ! state.open || state.reason !== 'expired' ) {
			return undefined;
		}
		setShowFallback( false );
		setStillOut( false );
		const timer = window.setTimeout(
			() => setShowFallback( true ),
			REAUTH_FALLBACK_MS
		);
		const onMessage = async ( e: MessageEvent ) => {
			if (
				e.origin !== window.location.origin ||
				! e.data ||
				e.data.type !== 'cliedesk:reauth'
			) {
				return;
			}
			setChecking( true );
			const r = await refreshNonce();
			setChecking( false );
			if ( r.ok ) {
				completeReauth();
				toast( {
					tone: 'success',
					title: __( 'You are signed in again.', 'cliedesk' ),
				} );
			} else {
				setStillOut( true );
			}
		};
		window.addEventListener( 'message', onMessage );
		return () => {
			window.clearTimeout( timer );
			window.removeEventListener( 'message', onMessage );
		};
	}, [ state.open, state.reason ] );

	if ( ! state.open ) {
		return null;
	}

	if ( state.reason === 'blocked' ) {
		return (
			<Modal
				isOpen
				onOpenChange={ ( open ) => ! open && cancelReauth() }
				title={ __( 'Your security token expired', 'cliedesk' ) }
				role="alertdialog"
				size="sm"
				footer={
					<Button
						variant="primary"
						onPress={ () => window.location.reload() }
					>
						{ __( 'Reload', 'cliedesk' ) }
					</Button>
				}
			>
				<p>
					{ __(
						'Your security token expired. Reload to continue.',
						'cliedesk'
					) }
				</p>
			</Modal>
		);
	}

	return (
		<Modal
			isOpen
			isDismissable={ false }
			onOpenChange={ ( open ) => ! open && cancelReauth() }
			title={ __( 'Sign in again', 'cliedesk' ) }
			size="md"
			footer={
				<>
					<Button
						variant="secondary"
						onPress={ () => cancelReauth() }
					>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					{ showFallback && (
						<Button
							variant="primary"
							onPress={ () =>
								window.open( reauthUrl(), '_blank' )
							}
						>
							{ __( 'Open sign-in in a new tab', 'cliedesk' ) }
						</Button>
					) }
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<p>
					{ __(
						'Your session ended. Sign in again to continue — your drafts are kept.',
						'cliedesk'
					) }
				</p>
				{ stillOut && (
					<p role="alert" className="text-danger">
						{ __(
							'You are still signed out. Complete the sign-in, then try again.',
							'cliedesk'
						) }
					</p>
				) }
				{ checking && (
					<p role="status">
						{ __( 'Checking your session…', 'cliedesk' ) }
					</p>
				) }
				<iframe
					title={ __( 'Sign in', 'cliedesk' ) }
					src={ reauthUrl() }
					className="h-[480px] w-full rounded-md border border-line bg-surface"
				/>
			</div>
		</Modal>
	);
}
