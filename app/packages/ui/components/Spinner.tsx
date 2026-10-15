import { __ } from '@wordpress/i18n';
import { cx } from '../cx';

export interface SpinnerProps {
	size?: number;
	/** Accessible label; omit when the spinner sits next to visible text. */
	label?: string;
	className?: string;
}

/**
 * Indeterminate progress indicator.
 *
 * @param props Props.
 */
export function Spinner( { size = 16, label, className }: SpinnerProps ) {
	return (
		<span
			role={ label ? 'progressbar' : undefined }
			aria-label={ label }
			aria-hidden={ label ? undefined : true }
			className={ cx(
				'inline-block shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin',
				className
			) }
			style={ { width: size, height: size } }
		/>
	);
}

export interface SkeletonProps {
	className?: string;
	lines?: number;
}

/**
 * Placeholder blocks while a region loads (the region itself carries aria-busy).
 *
 * @param props Props.
 */
export function Skeleton( { className, lines = 1 }: SkeletonProps ) {
	return (
		<span aria-hidden="true" className="flex flex-col gap-2">
			{ Array.from( { length: lines }, ( _, i ) => (
				<span
					key={ i }
					className={ cx(
						'block h-3 rounded-sm bg-sunken motion-safe:animate-pulse',
						i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full',
						className
					) }
				/>
			) ) }
		</span>
	);
}

/**
 * "Loading…" region for a whole screen.
 *
 * @param props       Props.
 * @param props.label Text.
 */
export function LoadingRegion( { label }: { label?: string } ) {
	return (
		<div aria-busy="true" className="flex flex-col gap-4 p-6">
			<span className="sr-only">
				{ label ?? __( 'Loading…', 'cliedesk' ) }
			</span>
			<Skeleton lines={ 3 } />
		</div>
	);
}
