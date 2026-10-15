import { getBoot, type ThemePref } from '@cliedesk/data';
import {
	Menu,
	MenuGroup,
	MenuItem,
	MenuSeparator,
	themeStore,
	UnstyledButton as AriaButton,
	type DensityPref,
	type MotionPref,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useNavigate } from '@tanstack/react-router';
import {
	CircleUser,
	LifeBuoy,
	Monitor,
	Moon,
	Rows2,
	Rows4,
	Sun,
	UserRound,
} from 'lucide-react';
import { useSyncExternalStore, type Key, type ReactNode } from 'react';
import { prefsStore, savePrefs, type Prefs } from '../prefs';
import { overlayStore } from '../state';

/** Path of "My profile" (Settings → Team & roles). */
export const MY_PROFILE_PATH = '/settings/team/profile';

/** Font sizes offered (plan.frontend-ux.md §7.8). */
export const FONT_SCALES = [ 0.9, 1, 1.1, 1.25 ];

function choice( onPick: ( key: string ) => void ) {
	return ( keys: 'all' | Set< Key > ) => {
		const [ key ] = keys === 'all' ? [] : [ ...keys ];
		if ( key !== undefined ) {
			onPick( String( key ) );
		}
	};
}

function Group( {
	title,
	value,
	onPick,
	children,
}: {
	title: string;
	value: string;
	onPick: ( key: string ) => void;
	children: ReactNode;
} ) {
	return (
		<MenuGroup
			title={ title }
			selectionMode="single"
			selectedKeys={ [ value ] }
			disallowEmptySelection
			onSelectionChange={ choice( onPick ) }
		>
			{ children }
		</MenuGroup>
	);
}

/**
 * Profile menu (§5.1): My profile and display preferences (INB-08): theme, density, font size, reduced motion and
 * spell check (INB-54).
 * Changes apply at once and are saved to the server (PATCH me/prefs), so they follow the user across devices.
 */
export function UserMenu() {
	const boot = getBoot();
	const navigate = useNavigate();
	const theme = useSyncExternalStore(
		themeStore.subscribe,
		themeStore.get,
		themeStore.get
	);
	const store = prefsStore();
	const prefs = useSyncExternalStore(
		store.subscribe,
		store.get,
		store.get
	) as Prefs;
	const name = boot.user?.name ?? '';
	const scale =
		FONT_SCALES.find(
			( s ) => Math.abs( s - ( prefs.fontScale || 1 ) ) < 0.01
		) ?? 1;
	return (
		<Menu
			aria-label={ __( 'Account', 'cliedesk' ) }
			trigger={
				<AriaButton
					aria-label={ sprintf(
						/* translators: %s: user display name. */
						__( 'Account menu for %s', 'cliedesk' ),
						name
					) }
					className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full border border-line bg-sunken text-fg-muted outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus"
				>
					{ boot.user?.avatar ? (
						<img
							src={ boot.user.avatar }
							alt=""
							className="size-full object-cover"
						/>
					) : (
						<UserRound aria-hidden="true" size={ 18 } />
					) }
				</AriaButton>
			}
		>
			<MenuGroup>
				<MenuItem
					id="profile"
					icon={ <CircleUser size={ 16 } /> }
					onAction={ () => void navigate( { to: MY_PROFILE_PATH } ) }
				>
					{ __( 'My profile', 'cliedesk' ) }
				</MenuItem>
				<MenuItem
					id="help"
					icon={ <LifeBuoy size={ 16 } /> }
					onAction={ () => overlayStore.set( 'help' ) }
				>
					{ __( 'Help', 'cliedesk' ) }
				</MenuItem>
			</MenuGroup>
			<MenuSeparator />
			<Group
				title={ __( 'Theme', 'cliedesk' ) }
				value={ theme }
				onPick={ ( k ) => savePrefs( { theme: k as ThemePref } ) }
			>
				<MenuItem id="light" icon={ <Sun size={ 16 } /> }>
					{ __( 'Light', 'cliedesk' ) }
				</MenuItem>
				<MenuItem id="dark" icon={ <Moon size={ 16 } /> }>
					{ __( 'Dark', 'cliedesk' ) }
				</MenuItem>
				<MenuItem id="system" icon={ <Monitor size={ 16 } /> }>
					{ __( 'System', 'cliedesk' ) }
				</MenuItem>
			</Group>
			<MenuSeparator />
			<Group
				title={ __( 'Density', 'cliedesk' ) }
				value={ prefs.density }
				onPick={ ( k ) => savePrefs( { density: k as DensityPref } ) }
			>
				<MenuItem id="comfortable" icon={ <Rows2 size={ 16 } /> }>
					{ __( 'Comfortable', 'cliedesk' ) }
				</MenuItem>
				<MenuItem id="compact" icon={ <Rows4 size={ 16 } /> }>
					{ __( 'Compact', 'cliedesk' ) }
				</MenuItem>
			</Group>
			<MenuSeparator />
			<Group
				title={ __( 'Text size', 'cliedesk' ) }
				value={ `scale-${ scale }` }
				onPick={ ( k ) =>
					savePrefs( {
						fontScale: Number( k.replace( 'scale-', '' ) ),
					} )
				}
			>
				{ FONT_SCALES.map( ( s ) => (
					<MenuItem key={ s } id={ `scale-${ s }` }>
						{ sprintf(
							/* translators: %d: percentage. */
							__( '%d%%', 'cliedesk' ),
							Math.round( s * 100 )
						) }
					</MenuItem>
				) ) }
			</Group>
			<MenuSeparator />
			<Group
				title={ __( 'Motion', 'cliedesk' ) }
				// Ids are unique across the whole menu (Theme has "system" too).
				value={ `motion-${ prefs.reducedMotion }` }
				onPick={ ( k ) =>
					savePrefs( {
						reducedMotion: k.replace( 'motion-', '' ) as MotionPref,
					} )
				}
			>
				<MenuItem id="motion-system">
					{ __( 'Like my system', 'cliedesk' ) }
				</MenuItem>
				<MenuItem id="motion-on">
					{ __( 'Reduce motion', 'cliedesk' ) }
				</MenuItem>
				<MenuItem id="motion-off">
					{ __( 'Full motion', 'cliedesk' ) }
				</MenuItem>
			</Group>
			<MenuSeparator />
			<Group
				title={ __( 'Spell check', 'cliedesk' ) }
				// INB-54: the browser's checker in the composer; on unless I turn it off.
				value={
					prefs.layout.spellCheck === false ? 'spell-off' : 'spell-on'
				}
				onPick={ ( k ) =>
					savePrefs( { layout: { spellCheck: k === 'spell-on' } } )
				}
			>
				<MenuItem id="spell-on">{ __( 'On', 'cliedesk' ) }</MenuItem>
				<MenuItem id="spell-off">{ __( 'Off', 'cliedesk' ) }</MenuItem>
			</Group>
		</Menu>
	);
}
