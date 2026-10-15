/**
 * Nested "all" / "any" condition group, shared by the contact filter builder (CRM-37) and the arrival rule editor
 * (SEC-17). The group owns the match select, "Add condition", "Add group" and "Remove group"; each screen renders its
 * own leaves (an `<li>` per node) and creates its own nodes.
 */
import { Button, Select } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { Plus, Trash2 } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

export type MatchMode = 'all' | 'any';

export interface TreeGroup< N extends { kind: string; id: string } > {
	kind: 'group';
	id: string;
	mode: MatchMode;
	children: Array< TreeGroup< N > | N >;
}

export interface ConditionGroupText {
	/** Legend of the outermost group. */
	rootLegend: string;
	/** Text of an empty outermost group. */
	rootEmpty: string;
}

export interface ConditionGroupProps< N extends { kind: string; id: string } > {
	group: TreeGroup< N >;
	depth: number;
	/** "Add group" is offered while depth < maxDepth. */
	maxDepth: number;
	text: ConditionGroupText;
	/** One `<li>` for a leaf (or any other non-group node). */
	renderNode: ( node: N, setNode: ( next: N | null ) => void ) => ReactNode;
	newLeaf: () => N;
	newGroup: ( mode: MatchMode, children: N[] ) => TreeGroup< N >;
	onChange: ( g: TreeGroup< N > ) => void;
	onRemove?: () => void;
}

/**
 * Replace (or with null remove) a direct child.
 *
 * @param group Group.
 * @param id    Child id.
 * @param next  Replacement.
 */
function setChild< N extends { kind: string; id: string } >(
	group: TreeGroup< N >,
	id: string,
	next: TreeGroup< N > | N | null
): TreeGroup< N > {
	return {
		...group,
		children: group.children.flatMap( ( c ) => {
			if ( c.id !== id ) {
				return [ c ];
			}
			return next === null ? [] : [ next ];
		} ),
	};
}

const isGroup = < N extends { kind: string; id: string } >(
	n: TreeGroup< N > | N
): n is TreeGroup< N > => n.kind === 'group';

/**
 * Group editor (recursive).
 *
 * @param props Props.
 */
export function ConditionGroup< N extends { kind: string; id: string } >(
	props: ConditionGroupProps< N >
) {
	const {
		group,
		depth,
		maxDepth,
		text,
		renderNode,
		newLeaf,
		newGroup,
		onChange,
		onRemove,
	} = props;
	return (
		<fieldset className="flex flex-col gap-3 rounded-lg border border-line-strong p-3">
			<legend className="px-1 text-sm font-semibold">
				{ depth === 0 ? text.rootLegend : __( 'Group', 'cliedesk' ) }
			</legend>
			<div className="flex flex-wrap items-end gap-2">
				<Select
					className="min-w-60"
					label={ __( 'Match', 'cliedesk' ) }
					value={ group.mode }
					onChange={ ( m ) =>
						onChange( { ...group, mode: m as MatchMode } )
					}
					options={ [
						{
							id: 'all',
							label: __( 'All of these conditions', 'cliedesk' ),
						},
						{
							id: 'any',
							label: __( 'Any of these conditions', 'cliedesk' ),
						},
					] }
				/>
				{ onRemove && (
					<Button
						variant="ghost"
						iconStart={ <Trash2 aria-hidden="true" size={ 14 } /> }
						onPress={ onRemove }
					>
						{ __( 'Remove group', 'cliedesk' ) }
					</Button>
				) }
			</div>
			{ group.children.length > 0 ? (
				<ul className="flex flex-col gap-2">
					{ group.children.map( ( c ) =>
						isGroup( c ) ? (
							<li key={ c.id }>
								<ConditionGroup
									{ ...props }
									group={ c }
									depth={ depth + 1 }
									onChange={ ( g ) =>
										onChange( setChild( group, c.id, g ) )
									}
									onRemove={ () =>
										onChange(
											setChild( group, c.id, null )
										)
									}
								/>
							</li>
						) : (
							<Fragment key={ c.id }>
								{ renderNode( c, ( next ) =>
									onChange( setChild( group, c.id, next ) )
								) }
							</Fragment>
						)
					) }
				</ul>
			) : (
				<p className="text-sm text-fg-muted">
					{ depth === 0
						? text.rootEmpty
						: __( 'This group is empty.', 'cliedesk' ) }
				</p>
			) }
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					iconStart={ <Plus aria-hidden="true" size={ 14 } /> }
					onPress={ () =>
						onChange( {
							...group,
							children: [ ...group.children, newLeaf() ],
						} )
					}
				>
					{ __( 'Add condition', 'cliedesk' ) }
				</Button>
				{ depth < maxDepth && (
					<Button
						size="sm"
						variant="ghost"
						iconStart={ <Plus aria-hidden="true" size={ 14 } /> }
						onPress={ () =>
							onChange( {
								...group,
								children: [
									...group.children,
									newGroup(
										group.mode === 'all' ? 'any' : 'all',
										[ newLeaf() ]
									),
								],
							} )
						}
					>
						{ __( 'Add group', 'cliedesk' ) }
					</Button>
				) }
			</div>
		</fieldset>
	);
}
