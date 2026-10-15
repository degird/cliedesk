/**
 * Small shared pieces of the team screens: badges, the "reserved" lock hint, query error state and per-person
 * result lists.
 */
import { isApiError } from '@cliedesk/data';
import { ErrorState, Tooltip, UnstyledButton, cx } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { describeError } from '../components/RouteError';
import { formatDate, parseUtc } from '../workspace/api';
import type { Agent } from './api';
import { statusLabel } from './labels';

export type BadgeTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

const TONES: Record< BadgeTone, string > = {
	neutral: 'border-line text-fg-muted',
	accent: 'border-accent text-accent-fg',
	warning: 'border-warning-line bg-warning-subtle text-fg',
	danger: 'border-danger-line bg-danger-subtle text-fg',
	success: 'border-success-line bg-success-subtle text-fg',
};

/**
 * Text badge (never colour only).
 *
 * @param props          Props.
 * @param props.tone     Tone.
 * @param props.children Text.
 */
export function Badge( {
	tone = 'neutral',
	children,
}: {
	tone?: BadgeTone;
	children: ReactNode;
} ) {
	return (
		<span
			className={ cx(
				'inline-flex items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap',
				TONES[ tone ]
			) }
		>
			{ children }
		</span>
	);
}

/**
 * Status badges of a directory row: status, "Inactive 30+ days", "Overrides" and missing two-factor.
 *
 * @param props       Props.
 * @param props.agent Row.
 */
export function AgentBadges( { agent }: { agent: Agent } ) {
	let statusTone: BadgeTone = 'success';
	if ( agent.status === 'pending' ) {
		statusTone = 'warning';
	} else if ( agent.status === 'deactivated' ) {
		statusTone = 'neutral';
	} else if ( agent.status === 'invited' ) {
		statusTone = 'accent';
	}
	return (
		<span className="flex flex-wrap gap-1">
			<Badge tone={ statusTone }>{ statusLabel( agent.status ) }</Badge>
			{ agent.inactive && (
				<Badge tone="warning">
					{ __( 'Inactive 30+ days', 'cliedesk' ) }
				</Badge>
			) }
			{ agent.hasOverrides && (
				<Badge tone="accent">{ __( 'Overrides', 'cliedesk' ) }</Badge>
			) }
			{ agent.twoFactor === false && (
				<Badge tone="warning">
					{ __( 'No two-factor', 'cliedesk' ) }
				</Badge>
			) }
		</span>
	);
}

/**
 * Lock icon with a tooltip explaining why a control is disabled (the reason is also its accessible name, so it
 * never depends on hovering).
 *
 * @param props        Props.
 * @param props.reason Reason.
 */
export function LockHint( { reason }: { reason: string } ) {
	return (
		<Tooltip content={ reason }>
			<UnstyledButton
				aria-label={ reason }
				className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-muted outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus"
			>
				<Lock aria-hidden="true" size={ 14 } />
			</UnstyledButton>
		</Tooltip>
	);
}

/**
 * Error state of a failed query, with Retry.
 *
 * @param props         Props.
 * @param props.title   Title.
 * @param props.error   Error.
 * @param props.onRetry Retry.
 */
export function QueryError( {
	title,
	error,
	onRetry,
}: {
	title: string;
	error: unknown;
	onRetry: () => void;
} ) {
	return (
		<ErrorState
			title={ title }
			message={ describeError( error ) }
			code={ isApiError( error ) ? error.code : null }
			requestId={ isApiError( error ) ? error.requestId : null }
			onRetry={ onRetry }
		/>
	);
}

/**
 * Message of a failed mutation: the server's message for guard errors (422, 409), else the generic text.
 *
 * @param e Error.
 */
export function serverMessage( e: unknown ): string {
	if (
		isApiError( e ) &&
		e.message &&
		e.status !== 0 &&
		! e.code.startsWith( 'cliedesk_view_as_' )
	) {
		return e.message;
	}
	return describeError( e );
}

/**
 * Last login for display.
 *
 * @param value ISO date or null.
 */
export function lastLoginText( value: string | null ): string {
	if ( ! value || ! parseUtc( value ) ) {
		return __( 'Never', 'cliedesk' );
	}
	return formatDate( value, false );
}
