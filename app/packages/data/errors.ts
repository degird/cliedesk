/**
 * Typed API error (plan.frontend-ux.md §4.7), normalised from the Cliedesk envelope
 * `{ error: { code, message, status, fields, retry_after, request_id, details } }`, from the WordPress shape
 * `{ code, message, data: { status } }`, or from a non-JSON / network failure.
 */
export class CliedeskApiError extends Error {
	readonly code: string;
	readonly status: number;
	readonly fields: Record< string, string >;
	readonly retryAfter: number | null;
	readonly requestId: string | null;
	readonly details: unknown;

	constructor( init: {
		code: string;
		message: string;
		status: number;
		fields?: Record< string, string > | null;
		retryAfter?: number | null;
		requestId?: string | null;
		details?: unknown;
	} ) {
		super( init.message );
		this.name = 'CliedeskApiError';
		this.code = init.code;
		this.status = init.status;
		this.fields = init.fields ?? {};
		this.retryAfter = init.retryAfter ?? null;
		this.requestId = init.requestId ?? null;
		this.details = init.details ?? null;
	}

	/** Network error or timeout: no HTTP response. */
	get isNetwork(): boolean {
		return this.status === 0;
	}
}

/**
 * Type guard.
 *
 * @param e Anything thrown.
 */
export function isApiError( e: unknown ): e is CliedeskApiError {
	return e instanceof CliedeskApiError;
}
