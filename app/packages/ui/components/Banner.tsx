import { __ } from '@wordpress/i18n';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../cx';
import { IconButton } from './IconButton';
import { StatusIcon, TONE_BOX, type Tone } from './StatusIcon';

export interface BannerProps {
	tone?: Tone;
	title: ReactNode;
	children?: ReactNode;
	actions?: ReactNode;
	onDismiss?: () => void;
	/** `alert` for urgent banners; default `status`. */
	role?: 'status' | 'alert' | 'region';
	/** One line (title, text and actions inline) for notices that stay on screen. */
	compact?: boolean;
	className?: string;
}

/**
 * Banner / inline alert: icon + title text, never colour only (§7.10).
 *
 * @param props Props.
 */
export function Banner( {
	tone = 'info',
	title,
	children,
	actions,
	onDismiss,
	role = 'status',
	compact = false,
	className,
}: BannerProps ) {
	if ( compact ) {
		return (
			<div
				role={ role }
				className={ cx(
					'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-1.5 text-sm text-fg',
					TONE_BOX[ tone ],
					className
				) }
			>
				<StatusIcon tone={ tone } />
				<p className="min-w-0 flex-1 basis-64">
					<span className="font-semibold">{ title }</span>
					{ children && (
						<span className="text-fg-muted"> { children }</span>
					) }
				</p>
				{ actions && (
					<div className="flex shrink-0 flex-wrap gap-2">
						{ actions }
					</div>
				) }
				{ onDismiss && (
					<IconButton
						size="sm"
						label={ __( 'Dismiss', 'cliedesk' ) }
						icon={ <X size={ 14 } /> }
						onPress={ onDismiss }
					/>
				) }
			</div>
		);
	}
	return (
		<div
			role={ role }
			className={ cx(
				'flex items-start gap-3 rounded-lg border px-4 py-3 text-fg',
				TONE_BOX[ tone ],
				className
			) }
		>
			<StatusIcon tone={ tone } />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="font-semibold">{ title }</p>
				{ children && (
					<div className="text-fg-muted">{ children }</div>
				) }
				{ actions && (
					<div className="mt-1 flex flex-wrap gap-2">{ actions }</div>
				) }
			</div>
			{ onDismiss && (
				<IconButton
					size="sm"
					label={ __( 'Dismiss', 'cliedesk' ) }
					icon={ <X size={ 14 } /> }
					onPress={ onDismiss }
				/>
			) }
		</div>
	);
}

export interface SafeModeBannerProps {
	/** Admins get the action (e.g. a link to Setup Health or the confirm button). */
	action?: ReactNode;
	className?: string;
}

/**
 * Safe-mode banner: shown to all users, not dismissible (§5.1).
 *
 * @param props Props.
 */
export function SafeModeBanner( { action, className }: SafeModeBannerProps ) {
	return (
		<Banner
			tone="warning"
			compact
			className={ className }
			title={ __( 'Safe mode is on', 'cliedesk' ) }
			actions={ action }
		>
			{ __(
				'Outgoing email, automations and other side effects are paused because this site looks like a copy or staging site. An administrator can confirm that this is the production site.',
				'cliedesk'
			) }
		</Banner>
	);
}
