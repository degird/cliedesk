import { __, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import { FieldError } from 'react-aria-components/FieldError';
import { Label } from 'react-aria-components/Label';
import { Text } from 'react-aria-components/Text';
import { cx } from '../cx';

export const inputClass = cx(
	'h-(--cd-control-h) w-full min-w-0 rounded-md border border-line-strong bg-surface px-(--cd-control-px) text-base text-fg',
	'placeholder:text-fg-subtle outline-none',
	'data-[focused]:outline-2 data-[focused]:outline-offset-1 data-[focused]:outline-focus',
	'data-[invalid]:border-danger data-[disabled]:bg-sunken data-[disabled]:text-fg-disabled'
);

/** Multi-line input: same look as `inputClass`, with a flexible height. */
export const textAreaClass = cx(
	'min-h-20 w-full min-w-0 rounded-md border border-line-strong bg-surface px-(--cd-control-px) py-2 text-base text-fg',
	'placeholder:text-fg-subtle outline-none',
	'data-[focused]:outline-2 data-[focused]:outline-offset-1 data-[focused]:outline-focus',
	'data-[invalid]:border-danger data-[disabled]:bg-sunken data-[disabled]:text-fg-disabled'
);

/**
 * Field label; required fields say "(required)" in text, not only with a symbol (§8.6).
 *
 * @param props            Props.
 * @param props.children   Label text.
 * @param props.isRequired Required.
 * @param props.hidden     Visually hidden.
 */
export function FieldLabel( {
	children,
	isRequired,
	hidden = false,
}: {
	children: ReactNode;
	isRequired?: boolean;
	/** Visually hidden (still read by screen readers), e.g. in a table row that names the field. */
	hidden?: boolean;
} ) {
	return (
		<Label className={ hidden ? 'sr-only' : 'text-sm font-medium text-fg' }>
			{ isRequired && typeof children === 'string'
				? /* translators: %s: field label. */ sprintf(
						__( '%s (required)', 'cliedesk' ),
						children
					)
				: children }
		</Label>
	);
}

/**
 * Help text linked through aria-describedby.
 *
 * @param props          Props.
 * @param props.children Text.
 */
export function FieldDescription( { children }: { children?: ReactNode } ) {
	return children ? (
		<Text slot="description" className="text-sm text-fg-subtle">
			{ children }
		</Text>
	) : null;
}

/**
 * Error text under the field (with an icon-like prefix so colour is not the only signal).
 *
 * @param props          Props.
 * @param props.children Message.
 */
export function FieldErrorText( { children }: { children?: ReactNode } ) {
	return (
		<FieldError className="flex items-start gap-1 text-sm text-danger">
			<span aria-hidden="true">!</span>
			<span>{ children }</span>
		</FieldError>
	);
}
