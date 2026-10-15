import {
	Radio,
	RadioGroup as AriaRadioGroup,
} from 'react-aria-components/RadioGroup';
import { cx } from '../cx';
import { FieldDescription, FieldErrorText, FieldLabel } from './Field';

export interface RadioOption {
	id: string;
	label: string;
	/** Short help under the option (e.g. why it is disabled). */
	description?: string;
	isDisabled?: boolean;
}

export interface RadioGroupProps {
	label: string;
	options: RadioOption[];
	value: string | null;
	onChange: ( value: string ) => void;
	description?: string;
	errorMessage?: string | null;
	isRequired?: boolean;
	isDisabled?: boolean;
	className?: string;
	/** DOM id of the group (error summary links). */
	id?: string;
	/** Options side by side (arrow keys follow); default vertical. */
	orientation?: 'vertical' | 'horizontal';
}

/**
 * Radio group (React Aria): arrow keys move between options, one tab stop.
 *
 * @param props Props.
 */
export function RadioGroup( {
	label,
	options,
	value,
	onChange,
	description,
	errorMessage,
	isRequired,
	isDisabled,
	className,
	id,
	orientation = 'vertical',
}: RadioGroupProps ) {
	return (
		<AriaRadioGroup
			id={ id }
			orientation={ orientation }
			value={ value }
			onChange={ onChange }
			isRequired={ isRequired }
			isDisabled={ isDisabled }
			isInvalid={ !! errorMessage }
			validationBehavior="aria"
			className={ cx( 'flex flex-col gap-1', className ) }
		>
			<FieldLabel isRequired={ isRequired }>{ label }</FieldLabel>
			<FieldDescription>{ description }</FieldDescription>
			<div
				className={
					orientation === 'horizontal'
						? 'flex flex-wrap gap-x-4 gap-y-1.5'
						: 'flex flex-col gap-1.5'
				}
			>
				{ options.map( ( o ) => (
					<Radio
						key={ o.id }
						value={ o.id }
						isDisabled={ o.isDisabled }
						className="group flex min-h-6 items-start gap-2 text-base text-fg data-[disabled]:text-fg-disabled"
					>
						<span
							aria-hidden="true"
							className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface group-data-[selected]:border-accent group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus"
						>
							<span className="size-2 rounded-full group-data-[selected]:bg-accent" />
						</span>
						<span className="flex flex-col">
							<span>{ o.label }</span>
							{ o.description && (
								<span className="text-sm text-fg-subtle">
									{ o.description }
								</span>
							) }
						</span>
					</Radio>
				) ) }
			</div>
			<FieldErrorText>{ errorMessage }</FieldErrorText>
		</AriaRadioGroup>
	);
}
