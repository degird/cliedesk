import { __ } from '@wordpress/i18n';
import { ChevronDown } from 'lucide-react';
import type { Key } from 'react';
import { Button as AriaButton } from 'react-aria-components/Button';
import { ListBox, ListBoxItem } from 'react-aria-components/ListBox';
import { Popover } from 'react-aria-components/Popover';
import {
	Select as AriaSelect,
	SelectValue,
} from 'react-aria-components/Select';
import { cx } from '../cx';
import {
	FieldDescription,
	FieldErrorText,
	FieldLabel,
	inputClass,
} from './Field';

export interface SelectOption {
	id: string;
	label: string;
}

export interface SelectProps {
	label: string;
	options: SelectOption[];
	value: string | null;
	onChange: ( value: string ) => void;
	description?: string;
	errorMessage?: string | null;
	isRequired?: boolean;
	isDisabled?: boolean;
	className?: string;
	/** DOM id of the field (error summary links). */
	id?: string;
	/** Hide the label visually (it stays the accessible name). */
	labelHidden?: boolean;
	/** Label beside the field (compact property lists). */
	inline?: boolean;
}

/**
 * Single select (React Aria listbox).
 *
 * @param props Props.
 */
export function Select( {
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
	labelHidden = false,
	inline = false,
}: SelectProps ) {
	return (
		<AriaSelect
			id={ id }
			selectedKey={ value }
			// React Aria's own placeholder follows the browser language, not the site's.
			placeholder={ __( 'Select an item', 'cliedesk' ) }
			onSelectionChange={ ( k: Key | null ) =>
				k !== null && onChange( String( k ) )
			}
			isRequired={ isRequired }
			isDisabled={ isDisabled }
			isInvalid={ !! errorMessage }
			validationBehavior="aria"
			className={ cx(
				inline
					? 'grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 [&>:nth-child(n+3)]:col-start-2'
					: 'flex flex-col gap-1',
				className
			) }
		>
			<FieldLabel isRequired={ isRequired } hidden={ labelHidden }>
				{ label }
			</FieldLabel>
			<AriaButton
				className={ cx(
					inputClass,
					'inline-flex items-center justify-between gap-2 text-start',
					// `!` wins over inputClass's border and background (cx does not merge classes).
					inline &&
						'border-transparent! bg-transparent! data-[hovered]:border-line-strong! data-[disabled]:bg-transparent!'
				) }
			>
				<SelectValue className="truncate" />
				<ChevronDown aria-hidden="true" size={ 16 } />
			</AriaButton>
			<FieldDescription>{ description }</FieldDescription>
			<FieldErrorText>{ errorMessage }</FieldErrorText>
			<Popover className="z-[1000] min-w-(--trigger-width) rounded-lg border border-line bg-raised p-1 shadow-2">
				<ListBox items={ options } className="outline-none">
					{ ( item ) => (
						<ListBoxItem
							id={ item.id }
							textValue={ item.label }
							className="cursor-default rounded-sm px-2 py-1.5 text-base text-fg outline-none data-[focused]:bg-sunken data-[selected]:font-semibold data-[selected]:text-accent-fg"
						>
							{ item.label }
						</ListBoxItem>
					) }
				</ListBox>
			</Popover>
		</AriaSelect>
	);
}
