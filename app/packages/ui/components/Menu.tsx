import type { ReactElement, ReactNode } from 'react';
import {
	Header,
	Menu as AriaMenu,
	MenuItem as AriaMenuItem,
	MenuSection,
	MenuTrigger,
	Popover,
	type MenuItemProps as AriaMenuItemProps,
	type MenuProps as AriaMenuProps,
} from 'react-aria-components/Menu';
import { Separator } from 'react-aria-components/Separator';
import { cx } from '../cx';

export interface MenuProps< T extends object > extends Omit<
	AriaMenuProps< T >,
	'className'
> {
	trigger: ReactElement;
	placement?: 'bottom start' | 'bottom end' | 'top start' | 'top end';
}

/**
 * Menu button + menu (role="menu", typeahead, arrow keys).
 *
 * @param props Props.
 */
export function Menu< T extends object >( {
	trigger,
	placement = 'bottom end',
	...rest
}: MenuProps< T > ) {
	return (
		<MenuTrigger>
			{ trigger }
			<Popover
				placement={ placement }
				offset={ 6 }
				className="z-[1000] min-w-48 rounded-lg border border-line bg-raised p-1 text-fg shadow-2"
			>
				<AriaMenu { ...rest } className="outline-none" />
			</Popover>
		</MenuTrigger>
	);
}

export interface MenuItemProps extends Omit<
	AriaMenuItemProps,
	'className' | 'children'
> {
	children: ReactNode;
	icon?: ReactNode;
}

/**
 * Menu item; checkable when the menu has a selection mode.
 *
 * @param props Props.
 */
export function MenuItem( { children, icon, ...rest }: MenuItemProps ) {
	return (
		<AriaMenuItem
			{ ...rest }
			className={ cx(
				'group flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-base text-fg outline-none',
				'data-[focused]:bg-sunken data-[disabled]:text-fg-disabled'
			) }
		>
			{ ( { isSelected, selectionMode } ) => (
				<>
					{ selectionMode !== 'none' && (
						<span
							aria-hidden="true"
							className="inline-flex w-4 justify-center text-accent-fg"
						>
							{ isSelected ? '✓' : '' }
						</span>
					) }
					{ icon && (
						<span
							aria-hidden="true"
							className="inline-flex text-fg-muted"
						>
							{ icon }
						</span>
					) }
					<span className="flex-1">{ children }</span>
				</>
			) }
		</AriaMenuItem>
	);
}

/**
 * Labelled group of menu items.
 *
 * @param props          Props.
 * @param props.title    Section title.
 * @param props.children Items.
 */
export function MenuGroup( {
	title,
	children,
	...rest
}: { title?: string; children: ReactNode } & Record< string, unknown > ) {
	return (
		<MenuSection { ...rest }>
			{ title && (
				<Header className="px-2 pb-1 pt-2 text-xs font-semibold text-fg-subtle">
					{ title }
				</Header>
			) }
			{ children }
		</MenuSection>
	);
}

/** Visual separator inside menus. */
export function MenuSeparator() {
	return <Separator className="my-1 border-t border-line" />;
}
