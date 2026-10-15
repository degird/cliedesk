import type { ReactNode } from 'react';
import {
	Tab as AriaTab,
	TabList as AriaTabList,
	TabPanel as AriaTabPanel,
	Tabs as AriaTabs,
	type TabsProps as AriaTabsProps,
} from 'react-aria-components/Tabs';
import { cx } from '../cx';

/**
 * Tabs (arrow-key navigation; manual activation available via keyboardActivation="manual").
 *
 * @param props Props.
 */
export function Tabs( {
	className,
	...rest
}: Omit< AriaTabsProps, 'className' > & { className?: string } ) {
	return (
		<AriaTabs
			{ ...rest }
			className={ cx( 'flex flex-col gap-4', className ) }
		/>
	);
}

/**
 * Tab list.
 *
 * @param props          Props.
 * @param props.label    Accessible label.
 * @param props.children Tabs.
 */
export function TabList( {
	label,
	children,
}: {
	label: string;
	children: ReactNode;
} ) {
	return (
		<AriaTabList
			aria-label={ label }
			className="flex gap-1 border-b border-line"
		>
			{ children }
		</AriaTabList>
	);
}

/**
 * One tab.
 *
 * @param props          Props.
 * @param props.id       Id.
 * @param props.children Label.
 */
export function Tab( { id, children }: { id: string; children: ReactNode } ) {
	return (
		<AriaTab
			id={ id }
			className="-mb-px cursor-default border-b-2 border-transparent px-3 py-2 text-base font-medium text-fg-muted outline-none data-[hovered]:text-fg data-[selected]:border-accent data-[selected]:text-accent-fg data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus"
		>
			{ children }
		</AriaTab>
	);
}

/**
 * Tab panel.
 *
 * @param props          Props.
 * @param props.id       Id (matches the tab).
 * @param props.children Content.
 */
export function TabPanel( {
	id,
	children,
}: {
	id: string;
	children: ReactNode;
} ) {
	return (
		<AriaTabPanel
			id={ id }
			className="outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus"
		>
			{ children }
		</AriaTabPanel>
	);
}
