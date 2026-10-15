import type { ReactNode } from 'react';
import {
	Button as AriaButton,
	type ButtonProps as AriaButtonProps,
} from 'react-aria-components/Button';
import { cx, focusRing } from '../cx';
import { Spinner } from './Spinner';

export type ButtonVariant =
	'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<
	AriaButtonProps,
	'className' | 'children'
> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	/** Shows a spinner, keeps the label (and width), sets aria-busy and ignores presses. */
	isLoading?: boolean;
	iconStart?: ReactNode;
	iconEnd?: ReactNode;
	className?: string;
	children?: ReactNode;
}

const VARIANTS: Record< ButtonVariant, string > = {
	primary:
		'bg-accent text-on-accent data-[hovered]:bg-accent-hover data-[pressed]:bg-accent-active',
	secondary:
		'border border-line-strong bg-surface text-fg data-[hovered]:bg-sunken data-[pressed]:bg-selected',
	ghost: 'text-fg data-[hovered]:bg-sunken data-[pressed]:bg-selected',
	danger: 'bg-danger-solid text-on-accent data-[hovered]:brightness-95 data-[pressed]:brightness-90',
	link: 'text-accent-fg underline-offset-2 data-[hovered]:underline px-0',
};

export const SIZES: Record< ButtonSize, string > = {
	sm: 'h-(--cd-control-h-sm) px-2 text-sm gap-1',
	md: 'h-(--cd-control-h) px-(--cd-control-px) text-base gap-1.5',
	lg: 'h-(--cd-control-h-lg) px-4 text-base gap-2',
};

/**
 * Button (React Aria). Variants per plan.frontend-ux.md §7.10.
 *
 * @param props Props.
 */
export function Button( {
	variant = 'secondary',
	size = 'md',
	isLoading = false,
	iconStart,
	iconEnd,
	className,
	children,
	onPress,
	...rest
}: ButtonProps ) {
	return (
		<AriaButton
			{ ...rest }
			onPress={ isLoading ? undefined : onPress }
			isPending={ isLoading || undefined }
			// React Aria filters aria-busy from props; set it on the element (§7.10: aria-busy while loading).
			ref={ ( el: HTMLButtonElement | null ) => {
				if ( el ) {
					if ( isLoading ) {
						el.setAttribute( 'aria-busy', 'true' );
					} else {
						el.removeAttribute( 'aria-busy' );
					}
				}
			} }
			className={ cx(
				'relative inline-flex min-w-6 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors select-none',
				'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
				focusRing,
				VARIANTS[ variant ],
				variant !== 'link' && SIZES[ size ],
				className
			) }
		>
			{ isLoading ? <Spinner size={ 14 } /> : iconStart }
			{ children }
			{ iconEnd }
		</AriaButton>
	);
}
