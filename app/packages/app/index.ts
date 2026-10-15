/**
 * @cliedesk/app — shell, router, registries (window.cliedesk.app). Pro and add-ons import this package as an
 * external and register routes, nav items, slot fills, settings sections, commands and entity invalidations
 * before DOMContentLoaded.
 */
import '../../styles/app.css';
import { registerCore } from './core';
import { scheduleMount } from './mount';

export {
	registerRoute,
	registerNavItem,
	registerSettingsSection,
	registerCommand,
	getRoutes,
	getNavItems,
	getSettingsSections,
	getCommands,
	subscribe,
	getVersion,
	type RouteDef,
	type NavItem,
	type SettingsSection,
	type Command,
	type LazyComponent,
} from './registry';
export { registerSlotFill, Slot, useSlotHasFills } from '@cliedesk/ui';
export { registerEntityInvalidation } from '@cliedesk/data';
export { mount, getChangeFeed, getRouter } from './mount';
export { PageHeader } from './components/PageHeader';
export {
	useMultiProduct,
	isMultiProduct,
	loadedActiveCount,
} from './multiProduct';
export { RouteError } from './components/RouteError';
export { registerMacroStep, type MacroStepType } from './macros/extensions';
export { registerRoutedReason, type RoutedReason } from './inbox/routedReasons';
// Shared by Free and Pro settings screens: the settings query and the Action error banner.
export { settingsQuery } from './queries';
export { ActionError } from './components/ActionError';
export { rewritePlainPermalink } from './history';
export {
	Link,
	Outlet,
	useNavigate,
	useParams,
	useSearch,
	useRouterState,
	notFound,
	redirect,
} from '@tanstack/react-router';

/**
 * Extension API version (= CLIEDESK_EXTENSION_API, ADR-0001). Pro and add-ons read
 * `window.cliedesk.app.extensionApi` and refuse to register when the major differs.
 */
export const extensionApi = '1.0';

registerCore();
scheduleMount();
