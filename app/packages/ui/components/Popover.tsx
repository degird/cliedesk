import type { ReactElement, ReactNode } from 'react';
import {
	Dialog,
	DialogTrigger,
	Popover as AriaPopover,
	type PopoverProps as AriaPopoverProps,
} from 'react-aria-components/Popover';
import { cx } from '../cx';

export interface PopoverProps {
	/** The trigger: a React Aria Button (or a component rendering one). */
	trigger: ReactElement;
	children: ReactNode;
	/** Accessible name of the popover dialog. */
	label: string;
	placement?: AriaPopoverProps[ 'placement' ];
	className?: string;
	/** Controlled open state (optional). */
	isOpen?: boolean;
	onOpenChange?: ( open: boolean ) => void;
}

/**
 * Non-modal popover dialog; Esc or outside click closes; focus returns to the trigger.
 *
 * @param props Props.
 */
export function Popover( {
	trigger,
	children,
	label,
	placement = 'bottom start',
	className,
	isOpen,
	onOpenChange,
}: PopoverProps ) {
	return (
		<DialogTrigger isOpen={ isOpen } onOpenChange={ onOpenChange }>
			{ trigger }
			<AriaPopover
				placement={ placement }
				offset={ 6 }
				className={ cx(
					'z-[1000] w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-raised text-fg shadow-2',
					className
				) }
			>
				<Dialog aria-label={ label } className="p-4 outline-none">
					{ children }
				</Dialog>
			</AriaPopover>
		</DialogTrigger>
	);
}
