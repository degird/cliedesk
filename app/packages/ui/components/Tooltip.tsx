import type { ReactElement, ReactNode } from 'react';
import {
	Tooltip as AriaTooltip,
	TooltipTrigger,
} from 'react-aria-components/Tooltip';

export interface TooltipProps {
	content: ReactNode;
	children: ReactElement;
	placement?: 'top' | 'bottom' | 'start' | 'end';
	delay?: number;
}

/**
 * Tooltip on hover and focus (500 ms), Esc closes. Never the only place for essential information.
 *
 * @param props Props.
 */
export function Tooltip( {
	content,
	children,
	placement = 'top',
	delay = 500,
}: TooltipProps ) {
	return (
		<TooltipTrigger delay={ delay }>
			{ children }
			<AriaTooltip
				placement={ placement }
				offset={ 6 }
				className="z-[1400] max-w-xs rounded-sm bg-fg px-2 py-1 text-xs text-canvas shadow-2"
			>
				{ content }
			</AriaTooltip>
		</TooltipTrigger>
	);
}
