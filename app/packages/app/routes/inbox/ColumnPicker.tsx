/**
 * Column picker of the view editor (INB-18): the columns the person may use (views/vocabulary), chosen with a
 * checkbox and put in order with Move up / Move down. Columns already in the view that the vocabulary does not offer
 * (for example a field the person can no longer see) stay listed so they are not dropped by accident.
 */
import { Checkbox, IconButton } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { moveIn } from '../settings/order';

/**
 * Picker.
 *
 * @param props            Props.
 * @param props.id         Fieldset id (error links).
 * @param props.available  Columns offered.
 * @param props.value      Chosen column keys in order.
 * @param props.onChange   Change.
 * @param props.isDisabled Read-only.
 * @param props.error      Error message.
 */
export function ColumnPicker( {
	id,
	available,
	value,
	onChange,
	isDisabled = false,
	error,
}: {
	id: string;
	available: Array< { key: string; label: string } >;
	value: string[];
	onChange: ( keys: string[] ) => void;
	isDisabled?: boolean;
	error?: string;
} ) {
	const label = ( key: string ) =>
		available.find( ( c ) => c.key === key )?.label ?? key;
	const others = available.filter( ( c ) => ! value.includes( c.key ) );
	return (
		<fieldset id={ id } className="flex flex-col gap-2">
			<legend className="mb-1 text-sm font-medium">
				{ __( 'Columns', 'cliedesk' ) }
			</legend>
			<p className="text-sm text-fg-muted">
				{ __(
					'Shown in the table layout, in this order. None chosen: the default columns.',
					'cliedesk'
				) }
			</p>
			{ error && (
				<p className="text-sm text-danger" role="alert">
					{ error }
				</p>
			) }
			{ value.length > 0 && (
				<ol className="flex flex-col gap-1">
					{ value.map( ( key, i ) => (
						<li key={ key } className="flex items-center gap-1">
							<Checkbox
								className="flex-1"
								isSelected
								isDisabled={ isDisabled }
								onChange={ () =>
									onChange(
										value.filter( ( k ) => k !== key )
									)
								}
							>
								{ label( key ) }
							</Checkbox>
							<IconButton
								size="sm"
								label={ sprintf(
									/* translators: %s: column name. */
									__( 'Move %s up', 'cliedesk' ),
									label( key )
								) }
								icon={ <ArrowUp size={ 14 } /> }
								isDisabled={ isDisabled || 0 === i }
								onPress={ () =>
									onChange( moveIn( value, key, -1 ) )
								}
							/>
							<IconButton
								size="sm"
								label={ sprintf(
									/* translators: %s: column name. */
									__( 'Move %s down', 'cliedesk' ),
									label( key )
								) }
								icon={ <ArrowDown size={ 14 } /> }
								isDisabled={
									isDisabled || i === value.length - 1
								}
								onPress={ () =>
									onChange( moveIn( value, key, 1 ) )
								}
							/>
						</li>
					) ) }
				</ol>
			) }
			{ others.length > 0 && (
				<ul className="flex flex-wrap gap-x-4 gap-y-1">
					{ others.map( ( c ) => (
						<li key={ c.key }>
							<Checkbox
								isSelected={ false }
								isDisabled={ isDisabled }
								onChange={ () =>
									onChange( [ ...value, c.key ] )
								}
							>
								{ c.label }
							</Checkbox>
						</li>
					) ) }
				</ul>
			) }
		</fieldset>
	);
}
