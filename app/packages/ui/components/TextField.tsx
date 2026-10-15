import {
	Input,
	TextField as AriaTextField,
	type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components/TextField';
import { TextArea } from 'react-aria-components/TextArea';
import { cx } from '../cx';
import {
	FieldDescription,
	FieldErrorText,
	FieldLabel,
	inputClass,
	textAreaClass,
} from './Field';

export interface TextFieldProps extends Omit<
	AriaTextFieldProps,
	'className' | 'children'
> {
	label: string;
	description?: string;
	/** Server or client error; marks the field invalid and is linked by aria-describedby. */
	errorMessage?: string | null;
	placeholder?: string;
	inputMode?:
		'text' | 'numeric' | 'decimal' | 'email' | 'url' | 'search' | 'tel';
	className?: string;
	/** Multi-line text (a textarea). */
	multiline?: boolean;
	/** Visible rows when multiline. */
	rows?: number;
	/** Language of the text, so the browser checks it with the right dictionary. */
	lang?: string;
	/** Hide the label visually (it stays the accessible name). */
	labelHidden?: boolean;
}

/**
 * Text input with a visible label, help and error text (§8.6).
 *
 * @param props Props.
 */
export function TextField( {
	label,
	description,
	errorMessage,
	placeholder,
	inputMode,
	className,
	isRequired,
	multiline,
	rows = 3,
	lang,
	labelHidden = false,
	...rest
}: TextFieldProps ) {
	return (
		<AriaTextField
			{ ...rest }
			isRequired={ isRequired }
			isInvalid={ !! errorMessage || rest.isInvalid }
			validationBehavior="aria"
			className={ cx( 'flex flex-col gap-1', className ) }
		>
			<FieldLabel isRequired={ isRequired } hidden={ labelHidden }>
				{ label }
			</FieldLabel>
			{ multiline ? (
				<TextArea
					placeholder={ placeholder }
					rows={ rows }
					lang={ lang }
					className={ textAreaClass }
				/>
			) : (
				<Input
					placeholder={ placeholder }
					inputMode={ inputMode }
					lang={ lang }
					className={ inputClass }
				/>
			) }
			<FieldDescription>{ description }</FieldDescription>
			<FieldErrorText>{ errorMessage }</FieldErrorText>
		</AriaTextField>
	);
}
