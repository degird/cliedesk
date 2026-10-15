import { __, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import {
	Button as AriaButton,
	type ButtonProps as AriaButtonProps,
} from 'react-aria-components/Button';
import { cx, focusRing } from '../cx';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<
	AriaButtonProps,
	'className' | 'children' | 'aria-label'
> {
	/** Required accessible name, also shown as the tooltip (§7.7). */
	label: string;
	icon: ReactNode;
	variant?: 'ghost' | 'secondary';
	size?: 'sm' | 'md' | 'lg';
	/** Shortcut shown in the tooltip. */
	shortcut?: string;
	className?: string;
}

const SIZE = {
	sm: 'size-(--cd-control-h-sm)',
	md: 'size-(--cd-control-h)',
	lg: 'size-(--cd-control-h-lg)',
};

/**
 * Icon-only button: aria-label is required by type, and a tooltip repeats it.
 *
 * @param props Props.
 */
export function IconButton( {
	label,
	icon,
	variant = 'ghost',
	size = 'md',
	shortcut,
	className,
	...rest
}: IconButtonProps ) {
	const withShortcut = sprintf(
		// translators: 1: button label, 2: keyboard shortcut.
		__( '%1$s (%2$s)', 'cliedesk' ),
		label,
		shortcut ?? ''
	);
	const tip = shortcut ? withShortcut : label;
	return (
		<Tooltip content={ tip }>
			<AriaButton
				{ ...rest }
				aria-label={ label }
				className={ cx(
					'inline-flex shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors data-[hovered]:bg-sunken data-[hovered]:text-fg data-[pressed]:bg-selected data-[disabled]:opacity-60',
					variant === 'secondary' &&
						'border border-line-strong bg-surface',
					SIZE[ size ],
					focusRing,
					className
				) }
			>
				<span aria-hidden="true" className="inline-flex">
					{ icon }
				</span>
			</AriaButton>
		</Tooltip>
	);
}
