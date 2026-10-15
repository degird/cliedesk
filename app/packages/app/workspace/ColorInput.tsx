/**
 * Hex colour input with a swatch preview (brand and product identity colours).
 */
import { TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ColorInputProps {
	id: string;
	label: string;
	value: string;
	onChange: ( value: string ) => void;
	onBlur?: () => void;
	errorMessage?: string | null;
	description?: string;
	isDisabled?: boolean;
	placeholder?: string;
}

/**
 * Colour field: `#RRGGBB` text plus a swatch (the swatch is decorative; the value is in the text).
 *
 * @param props Props.
 */
export function ColorInput( {
	id,
	label,
	value,
	onChange,
	onBlur,
	errorMessage,
	description,
	isDisabled,
	placeholder,
}: ColorInputProps ) {
	const shown = HEX.test( value ) ? value : ( placeholder ?? '' );
	return (
		<div className="flex items-start gap-2">
			<span
				aria-hidden="true"
				data-testid={ `${ id }-swatch` }
				className="mt-6 size-(--cd-control-h) shrink-0 rounded-md border border-line-strong bg-sunken"
				style={
					HEX.test( shown ) ? { backgroundColor: shown } : undefined
				}
			/>
			<TextField
				id={ id }
				className="min-w-0 flex-1"
				label={ label }
				description={
					description ?? __( 'Format: #RRGGBB', 'cliedesk' )
				}
				value={ value }
				placeholder={ placeholder }
				onChange={ onChange }
				onBlur={ onBlur }
				errorMessage={ errorMessage }
				isDisabled={ isDisabled }
				autoComplete="off"
				spellCheck="false"
			/>
		</div>
	);
}
