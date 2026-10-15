/**
 * Side panel layout editor (INB-66): the sections in order (Move up / Move down), whether each shows and whether it
 * starts collapsed. Used by "Customize panel" (my own layout) and by the admin layouts in Settings. "Approvals" is
 * listed only when Pro fills the `conversation.approvals` slot (TEAM-26 is Pro); its place in the order is kept.
 */
import { Checkbox, IconButton, useSlotHasFills } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { moveIn } from '../routes/settings/order';
import { orderedSections, panelSectionLabel, type PanelLayout } from './panel';

/**
 * A layout with every section listed in order.
 *
 * @param layout Layout, or null for the built-in one.
 */
export function fullLayout( layout: PanelLayout | null ): PanelLayout {
	return {
		order: orderedSections( layout ),
		collapsed: layout?.collapsed ?? [],
		hidden: layout?.hidden ?? [],
	};
}

const toggled = ( list: string[], key: string, on: boolean ) =>
	on
		? [ ...list.filter( ( k ) => k !== key ), key ]
		: list.filter( ( k ) => k !== key );

/**
 * Editor.
 *
 * @param props          Props.
 * @param props.value    Layout (every section listed, see fullLayout).
 * @param props.onChange New layout.
 */
export function PanelOrderEditor( {
	value,
	onChange,
}: {
	value: PanelLayout;
	onChange: ( next: PanelLayout ) => void;
} ) {
	const approvals = useSlotHasFills( 'conversation.approvals' );
	const keys = value.order.filter( ( k ) => approvals || k !== 'approvals' );
	const move = ( key: string, step: -1 | 1 ) => {
		const next = moveIn( keys, key, step );
		const at = value.order.indexOf( 'approvals' );
		if ( keys.length !== value.order.length && at >= 0 ) {
			next.splice( at, 0, 'approvals' );
		}
		return next;
	};
	return (
		<ol
			aria-label={ __( 'Side panel sections', 'cliedesk' ) }
			className="flex flex-col divide-y divide-line rounded-lg border border-line"
		>
			{ keys.map( ( key, i ) => {
				const label = panelSectionLabel( key );
				const shown = ! value.hidden.includes( key );
				return (
					<li
						key={ key }
						className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
					>
						<span className="min-w-40 flex-1 text-sm font-medium">
							{ label }
						</span>
						<Checkbox
							isSelected={ shown }
							onChange={ ( on ) =>
								onChange( {
									...value,
									hidden: toggled( value.hidden, key, ! on ),
								} )
							}
						>
							{ sprintf(
								/* translators: %s: section name. */
								__( 'Show %s', 'cliedesk' ),
								label
							) }
						</Checkbox>
						<Checkbox
							isSelected={ value.collapsed.includes( key ) }
							isDisabled={ ! shown }
							onChange={ ( on ) =>
								onChange( {
									...value,
									collapsed: toggled(
										value.collapsed,
										key,
										on
									),
								} )
							}
						>
							{ sprintf(
								/* translators: %s: section name. */
								__( 'Collapse %s', 'cliedesk' ),
								label
							) }
						</Checkbox>
						<span className="flex gap-1">
							<IconButton
								size="sm"
								label={ sprintf(
									/* translators: %s: section name. */
									__( 'Move %s up', 'cliedesk' ),
									label
								) }
								icon={ <ArrowUp size={ 14 } /> }
								isDisabled={ 0 === i }
								onPress={ () =>
									onChange( {
										...value,
										order: move( key, -1 ),
									} )
								}
							/>
							<IconButton
								size="sm"
								label={ sprintf(
									/* translators: %s: section name. */
									__( 'Move %s down', 'cliedesk' ),
									label
								) }
								icon={ <ArrowDown size={ 14 } /> }
								isDisabled={ i === keys.length - 1 }
								onPress={ () =>
									onChange( {
										...value,
										order: move( key, 1 ),
									} )
								}
							/>
						</span>
					</li>
				);
			} ) }
		</ol>
	);
}
