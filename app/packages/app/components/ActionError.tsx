/**
 * The banner for a failed Action, shared by Free and Pro screens (exported from @cliedesk/app). Kept apart from the
 * inbox components so the start-up bundle stays small.
 */
import { isApiError } from '@cliedesk/data';
import { Banner } from '@cliedesk/ui';
import { describeError } from './RouteError';

/**
 * Message of a failed action: the server's message for guard errors (422, 409, 400), else the generic text.
 *
 * @param e Error.
 */
export function actionMessage( e: unknown ): string {
	if ( isApiError( e ) && e.message && e.status !== 0 && e.status !== 403 ) {
		return e.message;
	}
	if (
		! isApiError( e ) &&
		e instanceof Error &&
		e.name === 'Error' &&
		e.message
	) {
		return e.message;
	}
	return describeError( e );
}

/**
 * Banner for a failed action, listing the server's field messages (e.g. the fields that block resolving).
 *
 * @param props           Props.
 * @param props.error     Error.
 * @param props.title     Title.
 * @param props.onDismiss Dismiss.
 * @param props.labels    Labels for field keys (e.g. custom field labels).
 */
export function ActionError( {
	error,
	title,
	onDismiss,
	labels = {},
}: {
	error: unknown;
	title?: string;
	onDismiss?: () => void;
	labels?: Record< string, string >;
} ) {
	if ( ! error ) {
		return null;
	}
	const fields = isApiError( error ) ? error.fields : {};
	const entries = Object.entries( fields );
	return (
		<Banner
			tone="danger"
			role="alert"
			title={ title ?? actionMessage( error ) }
			onDismiss={ onDismiss }
		>
			{ title && <p>{ actionMessage( error ) }</p> }
			{ entries.length > 0 && (
				<ul className="mt-1 list-disc ps-5">
					{ entries.map( ( [ k, msg ] ) => {
						const key = k.replace( /^(values\.|field:)/, '' );
						const label = labels[ key ];
						return (
							<li key={ k }>
								{ label ? `${ label }: ${ msg }` : msg }
							</li>
						);
					} ) }
				</ul>
			) }
		</Banner>
	);
}
