import { isApiError } from '@cliedesk/data';
import { ErrorState } from '@cliedesk/ui';
import {
	Link,
	useRouter,
	type ErrorComponentProps,
} from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';

/**
 * Message for an error (what happened, what to do), without exposing internals.
 *
 * @param error Error.
 */
export function describeError( error: unknown ): string {
	if ( isApiError( error ) ) {
		if ( error.isNetwork ) {
			return __(
				'Cliedesk could not reach the server. Check your connection and try again.',
				'cliedesk'
			);
		}
		if ( error.code === 'cliedesk_view_as_readonly' ) {
			return __( 'Nothing can be changed during a preview', 'cliedesk' );
		}
		if ( error.code === 'cliedesk_view_as_expired' ) {
			return __( 'The preview has ended', 'cliedesk' );
		}
		if ( error.status === 403 ) {
			return __( 'You do not have permission to do this.', 'cliedesk' );
		}
		return (
			error.message ||
			__( 'The server reported an error. Try again.', 'cliedesk' )
		);
	}
	if ( error instanceof Error && error.name === 'ChunkLoadError' ) {
		return __(
			'Cliedesk was updated. Reload to get the new version.',
			'cliedesk'
		);
	}
	return __(
		'An unexpected error stopped this screen. Try again.',
		'cliedesk'
	);
}

/**
 * Route error boundary: shell and navigation stay; the screen shows the error with Retry and Go home (§4.11).
 *
 * @param props       Props.
 * @param props.error Error.
 * @param props.reset Reset.
 */
export function RouteError( { error, reset }: ErrorComponentProps ) {
	const router = useRouter();
	return (
		<div className="p-6">
			<ErrorState
				headingLevel={ 1 }
				title={ __( 'This screen could not load', 'cliedesk' ) }
				message={ describeError( error ) }
				code={ isApiError( error ) ? error.code : null }
				requestId={ isApiError( error ) ? error.requestId : null }
				onRetry={ () => {
					reset();
					void router.invalidate();
				} }
				actions={
					<Link
						to="/"
						className="inline-flex h-(--cd-control-h) items-center px-2 text-accent-fg underline-offset-2 hover:underline"
					>
						{ __( 'Go home', 'cliedesk' ) }
					</Link>
				}
			/>
		</div>
	);
}
