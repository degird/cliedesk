import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import {
	Checkbox as AriaCheckbox,
	type CheckboxProps as AriaCheckboxProps,
} from 'react-aria-components/Checkbox';
import {
	Switch as AriaSwitch,
	type SwitchProps as AriaSwitchProps,
} from 'react-aria-components/Switch';
import { cx } from '../cx';

export interface CheckboxProps extends Omit<
	AriaCheckboxProps,
	'className' | 'children'
> {
	children: ReactNode;
	className?: string;
}

/**
 * Checkbox with a visible label.
 *
 * @param props Props.
 */
export function Checkbox( { children, className, ...rest }: CheckboxProps ) {
	return (
		<AriaCheckbox
			{ ...rest }
			className={ cx(
				'group inline-flex min-h-6 items-center gap-2 text-base text-fg data-[disabled]:text-fg-disabled',
				className
			) }
		>
			{ ( { isSelected, isIndeterminate } ) => (
				<>
					<span
						aria-hidden="true"
						className="flex size-4 items-center justify-center rounded-sm border border-line-strong bg-surface text-on-accent group-data-[selected]:border-accent group-data-[selected]:bg-accent group-data-[indeterminate]:border-accent group-data-[indeterminate]:bg-accent group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus"
					>
						{ isIndeterminate && (
							<Minus size={ 12 } strokeWidth={ 3 } />
						) }
						{ isSelected && ! isIndeterminate && (
							<Check size={ 12 } strokeWidth={ 3 } />
						) }
					</span>
					{ children }
				</>
			) }
		</AriaCheckbox>
	);
}

export interface SwitchProps extends Omit<
	AriaSwitchProps,
	'className' | 'children'
> {
	children: ReactNode;
	className?: string;
}

/**
 * On/off switch.
 *
 * @param props Props.
 */
export function Switch( { children, className, ...rest }: SwitchProps ) {
	return (
		<AriaSwitch
			{ ...rest }
			className={ cx(
				'group inline-flex min-h-6 items-center gap-2 text-base text-fg data-[disabled]:text-fg-disabled',
				className
			) }
		>
			<span
				aria-hidden="true"
				className="flex h-5 w-9 shrink-0 items-center rounded-full border border-line-strong bg-sunken p-0.5 transition-colors group-data-[selected]:border-accent group-data-[selected]:bg-accent group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus"
			>
				<span className="size-3.5 rounded-full bg-fg-muted transition-transform group-data-[selected]:translate-x-4 group-data-[selected]:bg-on-accent rtl:group-data-[selected]:-translate-x-4" />
			</span>
			{ children }
		</AriaSwitch>
	);
}
