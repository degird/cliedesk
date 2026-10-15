/**
 * App registries (plan.frontend-ux.md §4.2): routes, navigation, settings sections, commands. Shared by Free
 * modules, Pro and third parties through `window.cliedesk.app`. Reactive (`subscribe` / `getVersion`).
 * Routes and nav items must be registered before mount; later route registrations are ignored with a warning.
 * Slot fills live in @cliedesk/ui (re-exported here); entity invalidations live in @cliedesk/data.
 */
import type { ComponentType } from 'react';

export type LazyComponent = () => Promise< { default: ComponentType< any > } >;

export interface RouteDef {
	id: string;
	/** Path below the app base, e.g. `/settings/$area/$section`. */
	path: string;
	component: LazyComponent;
	layout?: 'shell' | 'bare';
	/** Used for document.title. */
	title: string;
	capability?: string;
	module?: string;
	/** Extra UI condition, e.g. an exposed setting (`boot.settings`); checked on navigation. */
	enabled?: () => boolean;
}

export interface NavItem {
	id: string;
	label: string;
	/** Short rail text when the label does not fit (the full label stays the accessible name and tooltip). */
	shortLabel?: string;
	to: string;
	icon?: ComponentType< {
		size?: number | string;
		'aria-hidden'?: boolean | 'true' | 'false';
	} >;
	area?: 'main' | 'footer';
	order?: number;
	capability?: string;
	module?: string;
	/** Extra UI condition, e.g. an exposed setting (`boot.settings`). */
	enabled?: () => boolean;
	badge?: () => number | null;
	/** React hook returning the badge count (re-renders the rail when it changes); wins over `badge`. */
	useBadge?: () => number | null;
	/** Accessible text for the badge, e.g. "%d waiting" (defaults to the number). */
	badgeLabel?: ( count: number ) => string;
}

export interface SettingsSection {
	area: string;
	/** Label of the area (the first registration for an area wins). */
	areaLabel?: string;
	areaOrder?: number;
	id: string;
	label: string;
	description?: string;
	order?: number;
	capability?: string;
	module?: string;
	/** Use the full content width (tables, matrices) instead of the reading width. */
	wide?: boolean;
	/** ADM-04: its documentation page (path below cliedesk.com/docs/ or a full https address). */
	docs?: string;
	/** A section that hosts an extension's screen: listed only while this slot has a visible fill. */
	slot?: string;
	component: LazyComponent;
}

export interface Command {
	id: string;
	label: string;
	group?: string;
	keywords?: string[];
	shortcut?: string;
	capability?: string;
	run: () => void;
}

const routes = new Map< string, RouteDef >();
const nav = new Map< string, NavItem >();
const sections = new Map< string, SettingsSection >();
const commands = new Map< string, Command >();
const listeners = new Set< () => void >();
let version = 0;
let locked = false;

function changed(): void {
	version++;
	listeners.forEach( ( l ) => l() );
}

function warn( message: string ): void {
	// eslint-disable-next-line no-console
	console.warn( `[cliedesk] ${ message }` );
}

/**
 * Register a route (before mount).
 *
 * @param def Route.
 */
export function registerRoute( def: RouteDef ): void {
	if ( locked ) {
		warn( `route "${ def.id }" registered after mount was ignored` );
		return;
	}
	routes.set( def.id, { layout: 'shell', ...def } );
	changed();
}

/**
 * Register a navigation item (before mount). Only for routes that exist: no dead links.
 *
 * @param item Item.
 */
export function registerNavItem( item: NavItem ): void {
	if ( locked ) {
		warn( `nav item "${ item.id }" registered after mount was ignored` );
		return;
	}
	nav.set( item.id, { area: 'main', order: 50, ...item } );
	changed();
}

/**
 * Register a settings section, served at `/settings/{area}/{id}`.
 *
 * @param section Section.
 */
export function registerSettingsSection( section: SettingsSection ): void {
	sections.set( `${ section.area }/${ section.id }`, section );
	changed();
}

/**
 * Register a command (command palette comes in a later milestone; the registry is ready).
 *
 * @param command Command.
 */
export function registerCommand( command: Command ): () => void {
	commands.set( command.id, command );
	changed();
	return () => {
		commands.delete( command.id );
		changed();
	};
}

export const getRoutes = (): RouteDef[] => [ ...routes.values() ];

/**
 * Whether a route or nav item's own `enabled` condition holds (capability and module are checked separately).
 *
 * @param item Route or nav item.
 */
export const isEnabled = ( item: { enabled?: () => boolean } ): boolean =>
	item.enabled ? item.enabled() : true;
export const getNavItems = (): NavItem[] =>
	[ ...nav.values() ].sort(
		( a, b ) => ( a.order ?? 50 ) - ( b.order ?? 50 )
	);
/** ADM-02: the settings areas in order; other areas (add-ons) follow by their areaOrder. */
export const SETTINGS_AREAS = [
	'workspace',
	'channels',
	'team',
	'conversations',
	'automation',
	'ai',
	'commerce',
	'security',
	'developer',
];
const areaRank = ( s: SettingsSection ) => {
	const i = SETTINGS_AREAS.indexOf( s.area );
	return i < 0 ? 100 + ( s.areaOrder ?? 50 ) : i;
};
export const getSettingsSections = (): SettingsSection[] =>
	[ ...sections.values() ].sort(
		( a, b ) =>
			areaRank( a ) - areaRank( b ) ||
			( a.order ?? 50 ) - ( b.order ?? 50 )
	);
export const getCommands = (): Command[] => [ ...commands.values() ];

/**
 * Subscribe to registry changes.
 *
 * @param l Listener.
 */
export function subscribe( l: () => void ): () => void {
	listeners.add( l );
	return () => {
		listeners.delete( l );
	};
}

export const getVersion = (): number => version;

/** Called by mount: routes and nav are fixed from now on. */
export function lockRegistry(): void {
	locked = true;
}

/** Tests only. */
export function resetRegistryForTests(): void {
	routes.clear();
	nav.clear();
	sections.clear();
	commands.clear();
	locked = false;
	changed();
}
