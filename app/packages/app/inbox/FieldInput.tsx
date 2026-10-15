/**
 * One custom field input (CNV-26…28): the typed control for a field definition, shared by the field editor and the
 * type's form in "New conversation" (CNV-31). Drafts are what the controls hold; `fromDraft` turns them into API
 * values.
 */
import { Checkbox, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import type { FieldDef } from './api';

export const NONE = '_none';

export const readOnlyHint = () => __( 'Read-only for you', 'cliedesk' );

const TEXT_TYPES = [
	'text',
	'long_text',
	'url',
	'regex_text',
	'date',
	'datetime',
];
const NUMBER_TYPES = [ 'number', 'decimal', 'money' ];
const OPTION_TYPES = [ 'select', 'nested_select', 'multi_select' ];

/**
 * Editable form of a stored value.
 *
 * @param def   Definition.
 * @param value Stored value.
 */
export function toDraft( def: FieldDef, value: unknown ): unknown {
	if ( def.type === 'boolean' ) {
		return value === true;
	}
	if ( def.type === 'multi_select' ) {
		return Array.isArray( value ) ? value.map( String ) : [];
	}
	if ( def.type === 'money' ) {
		const v = value as { amount?: unknown } | null;
		return v && v.amount !== undefined ? String( v.amount ) : '';
	}
	if ( value === null || value === undefined ) {
		return '';
	}
	return typeof value === 'object'
		? JSON.stringify( value )
		: String( value );
}

/**
 * API value of a draft (null clears).
 *
 * @param def      Definition.
 * @param draft    Draft.
 * @param original Stored value (money keeps its currency).
 */
export function fromDraft(
	def: FieldDef,
	draft: unknown,
	original: unknown
): unknown {
	if ( def.type === 'boolean' ) {
		return draft === true;
	}
	if ( def.type === 'multi_select' ) {
		return Array.isArray( draft ) && draft.length ? draft : null;
	}
	const s = String( draft ?? '' ).trim();
	if ( s === '' || s === NONE ) {
		return null;
	}
	switch ( def.type ) {
		case 'number':
			return /^-?\d+$/.test( s ) ? parseInt( s, 10 ) : s;
		case 'decimal':
			return Number.isFinite( Number( s ) ) ? Number( s ) : s;
		case 'money': {
			const o = original as { currency?: string } | null;
			const currency =
				o?.currency ??
				( typeof def.settings?.currency === 'string'
					? def.settings.currency
					: undefined );
			return currency ? { amount: s, currency } : { amount: s };
		}
	}
	return s;
}

/**
 * Whether the editor can change a field type.
 *
 * @param type Field type.
 */
export function isEditableType( type: string ): boolean {
	return (
		TEXT_TYPES.includes( type ) ||
		NUMBER_TYPES.includes( type ) ||
		OPTION_TYPES.includes( type ) ||
		type === 'boolean'
	);
}

const withRequired = ( label: string, required: boolean ) =>
	required
		? sprintf(
				/* translators: %s: field label. */
				__( '%s (required)', 'cliedesk' ),
				label
			)
		: label;

/**
 * The input of one editable field.
 *
 * @param props          Props.
 * @param props.def      Definition.
 * @param props.id       Element id (error summary target).
 * @param props.draft    Draft value.
 * @param props.onChange New draft.
 * @param props.required Required now.
 * @param props.readOnly Not editable.
 * @param props.locked   Read-only for this person (TEAM-20): shows the hint.
 * @param props.error    Error message.
 * @param props.currency Currency of a money value.
 */
export function FieldInput( {
	def,
	id,
	draft,
	onChange,
	required,
	readOnly = false,
	locked = false,
	error,
	currency,
}: {
	def: FieldDef;
	id: string;
	draft: unknown;
	onChange: ( v: unknown ) => void;
	required: boolean;
	readOnly?: boolean;
	locked?: boolean;
	error: string | null;
	currency?: string;
} ) {
	const hint = locked ? (
		<p className="text-sm text-fg-muted">{ readOnlyHint() }</p>
	) : null;
	if ( def.type === 'boolean' ) {
		return (
			<div className="flex flex-col gap-1">
				<Checkbox
					id={ id }
					isSelected={ draft === true }
					isReadOnly={ readOnly }
					onChange={ ( on ) => onChange( on ) }
				>
					{ withRequired( def.label, required ) }
				</Checkbox>
				{ hint }
				{ error && <p className="text-sm text-danger">{ error }</p> }
			</div>
		);
	}
	if ( def.type === 'multi_select' ) {
		const sel = ( draft as string[] ) ?? [];
		return (
			<fieldset id={ id } className="flex flex-col gap-1">
				<legend className="pb-1 text-sm font-medium">
					{ withRequired( def.label, required ) }
				</legend>
				{ ( def.options ?? [] )
					.filter( ( o ) => ! o.archived )
					.map( ( o ) => (
						<Checkbox
							key={ o.key }
							isReadOnly={ readOnly }
							isSelected={ sel.includes( o.key ) }
							onChange={ ( on ) =>
								onChange(
									on
										? [ ...sel, o.key ]
										: sel.filter( ( x ) => x !== o.key )
								)
							}
						>
							{ o.path || o.label }
						</Checkbox>
					) ) }
				{ hint }
				{ error && <p className="text-sm text-danger">{ error }</p> }
			</fieldset>
		);
	}
	if ( def.type === 'select' || def.type === 'nested_select' ) {
		return (
			<Select
				id={ id }
				label={ def.label }
				description={ locked ? readOnlyHint() : undefined }
				isRequired={ required }
				isDisabled={ readOnly }
				value={ String( draft || NONE ) }
				onChange={ ( x ) => onChange( x === NONE ? '' : x ) }
				errorMessage={ error }
				options={ [
					{ id: NONE, label: __( 'Not set', 'cliedesk' ) },
					...( def.options ?? [] )
						.filter( ( o ) => ! o.archived )
						.map( ( o ) => ( {
							id: o.key,
							label: o.path || o.label,
						} ) ),
				] }
			/>
		);
	}
	let description: string | undefined;
	if ( locked ) {
		description = readOnlyHint();
	} else if ( def.type === 'date' ) {
		description = __( 'Format: YYYY-MM-DD', 'cliedesk' );
	} else if ( def.type === 'datetime' ) {
		description = __( 'Format: YYYY-MM-DDTHH:MM:SSZ (UTC)', 'cliedesk' );
	} else if ( def.type === 'money' && currency ) {
		description = sprintf(
			/* translators: %s: currency code. */
			__( 'Amount in %s', 'cliedesk' ),
			currency
		);
	}
	return (
		<TextField
			id={ id }
			label={ def.label }
			description={ description }
			isRequired={ required }
			isReadOnly={ readOnly }
			multiline={ def.type === 'long_text' }
			rows={ 3 }
			inputMode={
				NUMBER_TYPES.includes( def.type ) ? 'decimal' : undefined
			}
			value={ String( draft ?? '' ) }
			onChange={ ( x ) => onChange( x ) }
			errorMessage={ error }
		/>
	);
}
