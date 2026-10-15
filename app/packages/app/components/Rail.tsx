import { can, hasModule } from '@cliedesk/data';
import { cx, Slot } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import type { KeyboardEvent } from 'react';
import { getNavItems, isEnabled, type NavItem } from '../registry';

/**
 * Move focus between rail links with the arrow keys (links stay tabbable).
 *
 * @param e Keyboard event.
 */
function onRailKey( e: KeyboardEvent< HTMLElement > ) {
	if (
		! [
			'ArrowDown',
			'ArrowUp',
			'ArrowLeft',
			'ArrowRight',
			'Home',
			'End',
		].includes( e.key )
	) {
		return;
	}
	const links = [
		...e.currentTarget.querySelectorAll< HTMLElement >( 'a[href], button' ),
	];
	const i = links.indexOf(
		e.currentTarget.ownerDocument.activeElement as HTMLElement
	);
	if ( i < 0 ) {
		return;
	}
	e.preventDefault();
	const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
	let next = forward ? i + 1 : i - 1;
	if ( e.key === 'Home' ) {
		next = 0;
	} else if ( e.key === 'End' ) {
		next = links.length - 1;
	}
	links[ ( next + links.length ) % links.length ]?.focus();
}

function Count( { count, label }: { count: number; label?: string } ) {
	return (
		<span className="cd-tabular absolute end-1 top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[0.625rem] leading-4 text-on-accent">
			{ label ? (
				<>
					<span className="sr-only">{ label }</span>
					<span aria-hidden="true">{ count }</span>
				</>
			) : (
				count
			) }
		</span>
	);
}

function HookBadge( { item }: { item: NavItem } ) {
	const useCount = item.useBadge as () => number | null;
	const count = useCount();
	return count ? (
		<Count count={ count } label={ item.badgeLabel?.( count ) } />
	) : null;
}

function RailLink( { item }: { item: NavItem } ) {
	const Icon = item.icon;
	const count = item.useBadge ? null : ( item.badge?.() ?? null );
	return (
		<li>
			<Link
				to={ item.to }
				activeOptions={ { exact: item.to === '/' } }
				title={ item.shortLabel ? item.label : undefined }
				className={ cx(
					'relative flex flex-col items-center gap-0.5 rounded-md px-0.5 py-1.5 text-[0.6875rem] font-medium text-fg-muted outline-none',
					'hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-focus',
					'data-[status=active]:bg-accent-subtle data-[status=active]:text-accent-fg'
				) }
			>
				{ Icon && <Icon size={ 20 } aria-hidden="true" /> }
				{ item.shortLabel ? (
					<>
						<span
							aria-hidden="true"
							className="max-w-full truncate"
						>
							{ item.shortLabel }
						</span>
						<span className="sr-only">{ item.label }</span>
					</>
				) : (
					<span className="max-w-full truncate">{ item.label }</span>
				) }
				{ item.useBadge ? <HookBadge item={ item } /> : null }
				{ count ? (
					<Count
						count={ count }
						label={ item.badgeLabel?.( count ) }
					/>
				) : null }
			</Link>
		</li>
	);
}

/**
 * Global navigation rail (§5.1, §5.2). Only registered routes appear (no dead links). The AI item is the
 * `nav.ai` slot: a PRO badge for admins while Pro is not licensed (O14), Pro's item when it is.
 */
export function Rail() {
	const items = getNavItems().filter(
		( i ) => can( i.capability ) && hasModule( i.module ) && isEnabled( i )
	);
	const main = items.filter( ( i ) => i.area !== 'footer' );
	const footer = items.filter( ( i ) => i.area === 'footer' );
	return (
		// Arrow keys move between the rail's links (roving focus, §8.3); the links stay tabbable.
		// eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
		<nav
			data-cd-rail
			aria-label={ __( 'Main', 'cliedesk' ) }
			onKeyDown={ onRailKey }
			className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface md:sticky md:top-0 md:h-screen md:w-(--cd-rail-w) md:flex-col md:border-t-0 md:border-e"
		>
			<ul className="flex flex-1 justify-around gap-1 p-1.5 md:flex-col md:px-1 md:justify-start">
				{ main.map( ( item ) => (
					<RailLink key={ item.id } item={ item } />
				) ) }
				{ can( 'cliedesk_manage_settings' ) && (
					<li>
						<Slot
							name="nav.ai"
							className="[&_button]:flex-col [&_button]:px-1 [&_button]:text-xs"
						/>
					</li>
				) }
			</ul>
			{ footer.length > 0 && (
				<ul className="flex gap-1 p-1.5 md:flex-col md:px-1">
					{ footer.map( ( item ) => (
						<RailLink key={ item.id } item={ item } />
					) ) }
				</ul>
			) }
		</nav>
	);
}
