/**
 * Role comparison matrix (TEAM-13): roles side by side, capabilities grouped by area. A read-only ARIA grid with
 * one tab stop: arrow keys move between cells, Home/End to the row ends, Ctrl+Home/End to the corners. The header
 * row and the capability column stay visible while scrolling.
 */
import { cx } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { Check, Minus } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { groupByArea, type Capability, type Role } from './api';
import { areaLabel, roleName } from './labels';

/**
 * Whether a role holds a capability (the Owner holds every one).
 *
 * @param role Role.
 * @param cap  Capability key.
 */
export function roleHas( role: Role, cap: string ): boolean {
	return role.type === 'owner' || role.caps.includes( cap );
}

export function RoleMatrix( {
	roles,
	capabilities,
}: {
	roles: Role[];
	capabilities: Capability[];
} ) {
	const groups = groupByArea( capabilities );
	// Navigable rows: the header row (0) and one per capability; columns: 0 = capability, 1… = roles.
	const rows = capabilities.length + 1;
	const cols = roles.length + 1;
	const [ pos, setPos ] = useState< [ number, number ] >( [ 1, 1 ] );
	const tableRef = useRef< HTMLTableElement >( null );

	const focusCell = ( r: number, c: number ) => {
		const row = Math.max( 0, Math.min( rows - 1, r ) );
		const col = Math.max( 0, Math.min( cols - 1, c ) );
		setPos( [ row, col ] );
		tableRef.current
			?.querySelector< HTMLElement >( `[data-cell="${ row }:${ col }"]` )
			?.focus();
	};

	const onKeyDown = ( e: KeyboardEvent< HTMLTableElement > ) => {
		const rtl =
			getComputedStyle( e.currentTarget ).direction === 'rtl' ||
			document.documentElement.dir === 'rtl';
		const [ r, c ] = pos;
		const page = 10;
		const moves: Record< string, () => void > = {
			ArrowDown: () => focusCell( r + 1, c ),
			ArrowUp: () => focusCell( r - 1, c ),
			ArrowRight: () => focusCell( r, rtl ? c - 1 : c + 1 ),
			ArrowLeft: () => focusCell( r, rtl ? c + 1 : c - 1 ),
			PageDown: () => focusCell( r + page, c ),
			PageUp: () => focusCell( r - page, c ),
			Home: () => ( e.ctrlKey ? focusCell( 0, 0 ) : focusCell( r, 0 ) ),
			End: () =>
				e.ctrlKey
					? focusCell( rows - 1, cols - 1 )
					: focusCell( r, cols - 1 ),
		};
		const move = moves[ e.key ];
		if ( move ) {
			e.preventDefault();
			move();
		}
	};

	const cellProps = ( r: number, c: number ) => ( {
		'data-cell': `${ r }:${ c }`,
		tabIndex: pos[ 0 ] === r && pos[ 1 ] === c ? 0 : -1,
		onFocus: () => setPos( [ r, c ] ),
	} );

	const focusClass =
		'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus';

	let rowIndex = 0;
	return (
		<div className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-surface">
			<table
				ref={ tableRef }
				role="grid"
				aria-readonly="true"
				aria-label={ __( 'Compare roles', 'cliedesk' ) }
				aria-rowcount={ rows + groups.length }
				onKeyDown={ onKeyDown }
				className="w-full border-separate border-spacing-0 text-start text-sm"
			>
				<thead>
					<tr>
						<th
							scope="col"
							{ ...cellProps( 0, 0 ) }
							className={ cx(
								'sticky start-0 top-0 z-20 border-b border-line bg-surface px-3 py-2 text-start font-medium text-fg-muted',
								focusClass
							) }
						>
							{ __( 'Permission', 'cliedesk' ) }
						</th>
						{ roles.map( ( role, i ) => (
							<th
								key={ role.key }
								scope="col"
								{ ...cellProps( 0, i + 1 ) }
								className={ cx(
									'sticky top-0 z-10 min-w-24 border-b border-line bg-surface px-3 py-2 text-center font-medium',
									focusClass
								) }
							>
								<bdi>{ roleName( role.key, roles ) }</bdi>
							</th>
						) ) }
					</tr>
				</thead>
				{ groups.map( ( g ) => (
					<tbody key={ g.area }>
						<tr>
							<th
								scope="colgroup"
								colSpan={ cols }
								className="sticky start-0 border-b border-line bg-sunken px-3 py-1.5 text-start text-xs font-semibold tracking-wide text-fg-muted uppercase"
							>
								{ areaLabel( g.area ) }
							</th>
						</tr>
						{ g.caps.map( ( cap ) => {
							rowIndex++;
							const r = rowIndex;
							return (
								<tr key={ cap.key } className="group">
									<th
										scope="row"
										{ ...cellProps( r, 0 ) }
										title={ cap.description }
										className={ cx(
											'sticky start-0 z-[1] border-b border-line bg-surface px-3 py-1.5 text-start font-normal group-hover:bg-sunken',
											focusClass
										) }
									>
										{ cap.label }
									</th>
									{ roles.map( ( role, i ) => {
										const has = roleHas( role, cap.key );
										return (
											<td
												key={ role.key }
												role="gridcell"
												{ ...cellProps( r, i + 1 ) }
												data-has={ has ? 'yes' : 'no' }
												className={ cx(
													'border-b border-line px-3 py-1.5 text-center group-hover:bg-sunken',
													focusClass
												) }
											>
												{ has ? (
													<Check
														aria-hidden="true"
														size={ 16 }
														className="inline text-success"
													/>
												) : (
													<Minus
														aria-hidden="true"
														size={ 16 }
														className="inline text-fg-subtle"
													/>
												) }
												<span className="sr-only">
													{ has
														? __(
																'Allowed',
																'cliedesk'
															)
														: __(
																'Not allowed',
																'cliedesk'
															) }
												</span>
											</td>
										);
									} ) }
								</tr>
							);
						} ) }
					</tbody>
				) ) }
			</table>
		</div>
	);
}
