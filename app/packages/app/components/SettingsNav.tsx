import { can, hasModule } from '@cliedesk/data';
import { TextField, cx, getSlotFills } from '@cliedesk/ui';
import { Link, useRouterState } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import {
	Building2,
	ChevronDown,
	Code,
	Inbox,
	MessagesSquare,
	Settings2,
	ShieldCheck,
	ShoppingBag,
	Sparkles,
	Users,
	Zap,
	type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getSettingsSections, type SettingsSection } from '../registry';

/**
 * The name of a settings area (ADM-02).
 *
 * @param s A section of the area.
 */
function areaName( s: SettingsSection ): string {
	return (
		{
			workspace: __( 'Workspace & brands', 'cliedesk' ),
			channels: __( 'Channels', 'cliedesk' ),
			team: __( 'Team', 'cliedesk' ),
			conversations: __( 'Conversations', 'cliedesk' ),
			automation: __( 'Automation', 'cliedesk' ),
			ai: __( 'AI', 'cliedesk' ),
			commerce: __( 'Commerce', 'cliedesk' ),
			security: __( 'Privacy & security', 'cliedesk' ),
			developer: __( 'Developer', 'cliedesk' ),
		}[ s.area ] ??
		s.areaLabel ??
		s.area
	);
}

/** Sections the user may open, grouped by area in order. */
export function visibleSettingsAreas(): Array< {
	area: string;
	label: string;
	sections: SettingsSection[];
} > {
	const out: Array< {
		area: string;
		label: string;
		sections: SettingsSection[];
	} > = [];
	for ( const s of getSettingsSections() ) {
		if ( ! can( s.capability ) || ! hasModule( s.module ) ) {
			continue;
		}
		// A host section shows only while an extension fills its slot (Pro: SLA policies).
		if (
			s.slot &&
			! getSlotFills( s.slot ).some(
				( f ) => hasModule( f.module ) && can( f.capability )
			)
		) {
			continue;
		}
		let group = out.find( ( g ) => g.area === s.area );
		if ( ! group ) {
			group = {
				area: s.area,
				label: areaName( s ),
				sections: [],
			};
			out.push( group );
		}
		group.sections.push( s );
	}
	return out;
}

/** Icon of each built-in area; areas added by add-ons get a generic one. */
const AREA_ICONS: Record< string, LucideIcon > = {
	workspace: Building2,
	channels: MessagesSquare,
	team: Users,
	conversations: Inbox,
	automation: Zap,
	ai: Sparkles,
	commerce: ShoppingBag,
	security: ShieldCheck,
	developer: Code,
};

const DEFAULT_OPEN = 'workspace';

/**
 * Settings secondary sidebar (§5.6): a search, then the areas as collapsible groups of their sections.
 * Workspace & brands and the area of the open page start expanded; a search shows every match. It scrolls on its own
 * (from md it stays in view below the top bar), with the search on top and the open page's link kept in view.
 */
export function SettingsNav() {
	const areas = visibleSettingsAreas();
	const pathname = useRouterState( { select: ( r ) => r.location.pathname } );
	const current = /\/settings\/([^/]+)/.exec( pathname )?.[ 1 ] ?? '';
	const ref = useRef< HTMLElement >( null );
	const [ open, setOpen ] = useState(
		() => new Set( [ DEFAULT_OPEN, current ] )
	);
	const [ query, setQuery ] = useState( '' );
	// Opening a page of another area (link, ⌘K, address) expands its group.
	useEffect( () => {
		setOpen( ( o ) =>
			o.has( current ) ? o : new Set( o ).add( current )
		);
	}, [ current ] );
	// Keep the open page's link in view when the list scrolls (the nav is the link's offsetParent).
	const activeShown = open.has( current );
	useEffect( () => {
		const nav = ref.current;
		const link = nav?.querySelector< HTMLElement >(
			'[data-status="active"]'
		);
		if ( ! nav || ! link || nav.scrollHeight <= nav.clientHeight ) {
			return;
		}
		// 56 px: the search field that stays on top of the list.
		const top = link.offsetTop;
		if (
			top < nav.scrollTop + 56 ||
			top + link.offsetHeight > nav.scrollTop + nav.clientHeight
		) {
			nav.scrollTop = top - nav.clientHeight / 3;
		}
	}, [ pathname, activeShown ] );
	const q = query.trim().toLowerCase();
	const shown = q
		? areas
				.map( ( a ) => ( {
					...a,
					sections: a.label.toLowerCase().includes( q )
						? a.sections
						: a.sections.filter( ( s ) =>
								s.label.toLowerCase().includes( q )
							),
				} ) )
				.filter( ( a ) => a.sections.length > 0 )
		: areas;
	const toggle = ( area: string ) =>
		setOpen( ( o ) => {
			const next = new Set( o );
			if ( ! next.delete( area ) ) {
				next.add( area );
			}
			return next;
		} );
	return (
		<nav
			ref={ ref }
			aria-label={ __( 'Settings', 'cliedesk' ) }
			// Scrolls on its own (scrolling it never scrolls the page): on phones at most half the screen above the
			// page, from md beside the page, stuck below the top bar. `relative`/`sticky` make it the links' offsetParent.
			className="relative flex max-h-[50dvh] flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-3 md:sticky md:top-(--cd-topbar-h) md:max-h-[calc(100dvh-var(--cd-topbar-h))]"
		>
			<TextField
				className="sticky top-0 z-[1] -mx-3 bg-surface px-3 pt-3 pb-2"
				label={ __( 'Search settings', 'cliedesk' ) }
				labelHidden
				placeholder={ __( 'Search settings', 'cliedesk' ) }
				inputMode="search"
				value={ query }
				onChange={ setQuery }
			/>
			{ shown.length === 0 && (
				<p role="status" className="px-2 text-sm text-fg-muted">
					{ __( 'No settings match.', 'cliedesk' ) }
				</p>
			) }
			{ shown.map( ( a ) => {
				const expanded = q !== '' || open.has( a.area );
				const Icon = AREA_ICONS[ a.area ] ?? Settings2;
				const id = `cd-settings-area-${ a.area }`;
				return (
					<div key={ a.area }>
						<button
							type="button"
							aria-expanded={ expanded }
							aria-controls={ id }
							onClick={ () => toggle( a.area ) }
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm font-semibold text-fg outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
						>
							<Icon
								aria-hidden="true"
								size={ 16 }
								className="shrink-0 text-fg-muted"
							/>
							<span className="min-w-0 flex-1 truncate">
								{ a.label }
							</span>
							<ChevronDown
								aria-hidden="true"
								size={ 14 }
								className={ cx(
									'shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none',
									! expanded && '-rotate-90 rtl:rotate-90'
								) }
							/>
						</button>
						<ul
							id={ id }
							hidden={ ! expanded }
							className="flex flex-col gap-0.5 pb-1 ps-6"
						>
							{ a.sections.map( ( s ) => (
								<li key={ s.id }>
									<Link
										to={ `/settings/${ s.area }/${ s.id }` }
										className={ cx(
											'block truncate rounded-md px-2 py-1.5 text-sm text-fg outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus',
											'data-[status=active]:bg-accent-subtle data-[status=active]:font-medium data-[status=active]:text-accent-fg'
										) }
									>
										{ s.label }
									</Link>
								</li>
							) ) }
						</ul>
					</div>
				);
			} ) }
		</nav>
	);
}
