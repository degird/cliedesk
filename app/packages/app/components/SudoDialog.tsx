/**
 * "Confirm your password" (recent authentication, security §4.3). Sensitive Actions answer 403
 * `cliedesk_reauth_required` when the last confirmation is older than the workspace limit (default 15 min); the API
 * client then waits here. The password goes to POST auth/confirm; a wrong one answers 403 `cliedesk_reauth_failed`.
 * After a confirmation the waiting request is retried; Cancel fails it with its original error.
 */
import {
	api,
	cancelSudo,
	completeSudo,
	isApiError,
	sudoStore,
} from '@cliedesk/data';
import { Button, Modal, TextField, announce } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import {
	useEffect,
	useState,
	useSyncExternalStore,
	type FormEvent,
} from 'react';
import { describeError } from './RouteError';

/**
 * Message for a failed confirmation.
 *
 * @param e Error.
 */
export function sudoErrorMessage( e: unknown ): string {
	if ( isApiError( e ) && e.code === 'cliedesk_reauth_failed' ) {
		return __( 'That password is not correct.', 'cliedesk' );
	}
	return describeError( e );
}

/**
 * Dialog (rendered once by the root layout).
 */
export function SudoDialog() {
	const { open } = useSyncExternalStore(
		sudoStore.subscribe,
		sudoStore.get,
		sudoStore.get
	);
	const [ password, setPassword ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const [ busy, setBusy ] = useState( false );
	useEffect( () => {
		if ( open ) {
			setPassword( '' );
			setError( null );
			setBusy( false );
		}
	}, [ open ] );
	if ( ! open ) {
		return null;
	}
	const submit = async ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! password ) {
			setError( __( 'Enter your password.', 'cliedesk' ) );
			return;
		}
		setBusy( true );
		setError( null );
		try {
			await api.post< { sudoUntil: string } >( 'auth/confirm', {
				body: { password },
			} );
			setPassword( '' );
			completeSudo();
		} catch ( err ) {
			setBusy( false );
			const msg = sudoErrorMessage( err );
			setError( msg );
			announce( msg, 'assertive' );
		}
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && cancelSudo() }
			title={ __( 'Confirm your password', 'cliedesk' ) }
			size="sm"
			footer={
				<>
					<Button onPress={ () => cancelSudo() }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-sudo"
						variant="primary"
						isLoading={ busy }
					>
						{ __( 'Confirm and continue', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-sudo"
				noValidate
				onSubmit={ ( e ) => void submit( e ) }
				className="flex flex-col gap-3"
			>
				<p className="text-fg-muted">
					{ __(
						'This change needs a recent password confirmation. Enter your WordPress password to continue.',
						'cliedesk'
					) }
				</p>
				<TextField
					label={ __( 'Password', 'cliedesk' ) }
					type="password"
					autoComplete="current-password"
					isRequired
					value={ password }
					onChange={ ( x ) => {
						setPassword( x );
						setError( null );
					} }
					errorMessage={ error }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
			</form>
		</Modal>
	);
}
