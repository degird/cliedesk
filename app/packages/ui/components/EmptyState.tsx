import { __, sprintf } from '@wordpress/i18n';
import { Copy, Inbox } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { StatusIcon } from './StatusIcon';

export interface EmptyStateProps {
	title: string;
	description?: ReactNode;
	icon?: ReactNode;
	/** Up to two actions. */
	actions?: ReactNode;
	headingLevel?: 2 | 3;
}

/**
 * Empty state: icon in a tinted circle, title, one sentence, up to two actions (§7.11).
 *
 * @param props Props.
 */
export function EmptyState( {
	title,
	description,
	icon,
	actions,
	headingLevel = 2,
}: EmptyStateProps ) {
	const H = `h${ headingLevel }` as 'h2';
	return (
		<div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
			<span
				aria-hidden="true"
				className="flex size-16 items-center justify-center rounded-full bg-accent-subtle text-accent-fg"
			>
				{ icon ?? <Inbox size={ 32 } strokeWidth={ 1.75 } /> }
			</span>
			<H className="text-xl font-semibold text-fg">{ title }</H>
			{ description && (
				<p className="max-w-prose text-fg-muted">{ description }</p>
			) }
			{ actions && (
				<div className="flex flex-wrap justify-center gap-2">
					{ actions }
				</div>
			) }
		</div>
	);
}

export interface ErrorStateProps {
	title?: string;
	/** What happened and what to do. */
	message?: string;
	code?: string | null;
	requestId?: string | null;
	onRetry?: () => void;
	actions?: ReactNode;
	headingLevel?: 1 | 2 | 3;
}

/**
 * Error state with Retry and a "Details" section holding the code and request id (+ Copy details).
 *
 * @param props Props.
 */
export function ErrorState( {
	title,
	message,
	code,
	requestId,
	onRetry,
	actions,
	headingLevel = 2,
}: ErrorStateProps ) {
	const [ copied, setCopied ] = useState( false );
	const H = `h${ headingLevel }` as 'h2';
	const details = [
		code && `code: ${ code }`,
		requestId && `request_id: ${ requestId }`,
	]
		.filter( Boolean )
		.join( '\n' );
	return (
		<div
			role="alert"
			className="flex flex-col items-start gap-3 rounded-lg border border-danger-line bg-danger-subtle p-5 text-fg"
		>
			<div className="flex items-start gap-3">
				<StatusIcon tone="danger" />
				<div className="flex flex-col gap-1">
					<H tabIndex={ -1 } className="text-lg font-semibold">
						{ title ?? __( 'Something went wrong', 'cliedesk' ) }
					</H>
					{ message && <p className="text-fg-muted">{ message }</p> }
				</div>
			</div>
			{ details && (
				<details className="w-full text-sm text-fg-muted">
					<summary className="cursor-pointer">
						{ __( 'Details', 'cliedesk' ) }
					</summary>
					<pre className="mt-2 font-mono text-sm whitespace-pre-wrap">
						{ details }
					</pre>
					{ requestId && (
						<p className="mt-1">
							{
								/* translators: %s: request id. */ sprintf(
									__( 'Request ID: %s', 'cliedesk' ),
									requestId
								)
							}
						</p>
					) }
				</details>
			) }
			<div className="flex flex-wrap gap-2">
				{ onRetry && (
					<Button variant="primary" onPress={ onRetry }>
						{ __( 'Retry', 'cliedesk' ) }
					</Button>
				) }
				{ details && (
					<Button
						variant="secondary"
						iconStart={ <Copy aria-hidden="true" size={ 14 } /> }
						onPress={ () => {
							void navigator.clipboard
								?.writeText(
									`${ message ?? '' }\n${ details }`
								)
								.then( () => setCopied( true ) );
						} }
					>
						{ copied
							? __( 'Copied', 'cliedesk' )
							: __( 'Copy details', 'cliedesk' ) }
					</Button>
				) }
				{ actions }
			</div>
		</div>
	);
}
