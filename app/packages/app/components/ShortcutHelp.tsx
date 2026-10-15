/**
 * Shortcut sheet ("?", INB-07): the shortcuts registered on the current screen, grouped, with a filter. Says when
 * single-key shortcuts are off and where to change that (My profile). Each shortcut can be remapped: the new keys
 * are checked (format and conflicts with every shortcut seen) and saved in prefs.shortcuts.map (PATCH me/prefs).
 */
import { Button, Modal, TextField, announce } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import {
	Fragment,
	useState,
	useSyncExternalStore,
	type FormEvent,
} from 'react';
import { savePrefs } from '../prefs';
import {
	effectiveKeys,
	findConflict,
	getShortcuts,
	getShortcutsVersion,
	hasModifier,
	keyLabel,
	mapKey,
	shortcutMap,
	shortcutsEnabled,
	subscribeShortcuts,
	validKeys,
	type ShortcutDef,
} from '../shortcuts';

/**
 * Normalise typed keys: lower-case modifiers and letters, single spaces ("Mod+Y" → "mod+y").
 *
 * @param raw Typed text.
 */
export function normaliseKeys( raw: string ): string {
	return raw
		.trim()
		.split( /\s+/ )
		.map( ( step ) =>
			step
				.split( '+' )
				.map( ( p ) =>
					p.length === 1 || /^(mod|alt|shift|ctrl|cmd)$/i.test( p )
						? p.toLowerCase().replace( /^(ctrl|cmd)$/, 'mod' )
						: p
				)
				.join( '+' )
		)
		.join( ' ' );
}

/**
 * Check new keys for a shortcut: an error message, or null when they can be saved.
 *
 * @param d    Shortcut.
 * @param keys Normalised keys.
 */
export function remapError( d: ShortcutDef, keys: string ): string | null {
	if ( ! validKeys( keys ) ) {
		return __(
			'Use one key, a key with mod, alt or shift (mod+y), or two keys in a row (g y).',
			'cliedesk'
		);
	}
	const other = findConflict( d.id, keys );
	if ( other ) {
		return sprintf(
			/* translators: %s: name of the other shortcut. */
			__( 'Already used by “%s”.', 'cliedesk' ),
			other.label
		);
	}
	return null;
}

function saveMap( next: Record< string, string > ) {
	shortcutMap.set( next );
	savePrefs( { shortcutMap: next } );
}

function Remap( { d, onDone }: { d: ShortcutDef; onDone: () => void } ) {
	const [ value, setValue ] = useState( effectiveKeys( d ) );
	const [ error, setError ] = useState< string | null >( null );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const keys = normaliseKeys( value );
		const err = remapError( d, keys );
		setError( err );
		if ( err ) {
			return;
		}
		const next = { ...shortcutMap.get() };
		if ( keys === d.keys ) {
			delete next[ mapKey( d.id ) ];
		} else {
			next[ mapKey( d.id ) ] = keys;
		}
		saveMap( next );
		announce(
			sprintf(
				/* translators: 1: action, 2: keys. */
				__( '%1$s is now %2$s.', 'cliedesk' ),
				d.label,
				keyLabel( keys ).join( ' ' )
			)
		);
		onDone();
	};
	return (
		<form
			noValidate
			onSubmit={ submit }
			className="flex flex-wrap items-end gap-2 rounded-md border border-line p-2"
		>
			<TextField
				className="min-w-48 flex-1"
				label={ sprintf(
					/* translators: %s: action. */
					__( 'New keys for “%s”', 'cliedesk' ),
					d.label
				) }
				description={ sprintf(
					/* translators: %s: default keys. */
					__(
						'For example y, shift+y, mod+y or g y. Default: %s',
						'cliedesk'
					),
					d.keys
				) }
				value={ value }
				onChange={ ( x ) => {
					setValue( x );
					setError( null );
				} }
				errorMessage={ error }
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus
			/>
			<Button type="submit" variant="primary" size="sm">
				{ __( 'Save keys', 'cliedesk' ) }
			</Button>
			<Button size="sm" onPress={ onDone }>
				{ __( 'Cancel', 'cliedesk' ) }
			</Button>
		</form>
	);
}
import { MY_PROFILE_PATH } from './UserMenu';

function Keys( { keys }: { keys: string } ) {
	const steps = keyLabel( keys );
	return (
		<span className="inline-flex flex-wrap items-center gap-1">
			{ steps.map( ( s, i ) => (
				<Fragment key={ i }>
					{ i > 0 && (
						<span className="text-xs text-fg-muted">
							{ __( 'then', 'cliedesk' ) }
						</span>
					) }
					<kbd className="rounded-sm border border-line-strong bg-sunken px-1.5 font-sans text-sm">
						{ s }
					</kbd>
				</Fragment>
			) ) }
		</span>
	);
}

/**
 * Shortcut sheet.
 *
 * @param props         Props.
 * @param props.onClose Close.
 */
export default function ShortcutHelp( { onClose }: { onClose: () => void } ) {
	useSyncExternalStore(
		subscribeShortcuts,
		getShortcutsVersion,
		getShortcutsVersion
	);
	const enabled = useSyncExternalStore(
		shortcutsEnabled.subscribe,
		shortcutsEnabled.get,
		shortcutsEnabled.get
	);
	const map = useSyncExternalStore(
		shortcutMap.subscribe,
		shortcutMap.get,
		shortcutMap.get
	);
	const [ filter, setFilter ] = useState( '' );
	const [ editing, setEditing ] = useState< string | null >( null );
	const f = filter.trim().toLowerCase();
	const list = getShortcuts().filter(
		( d ) =>
			! f ||
			d.label.toLowerCase().includes( f ) ||
			effectiveKeys( d ).toLowerCase().includes( f )
	);
	const groups = new Map< string, ShortcutDef[] >();
	for ( const d of list ) {
		groups.set( d.group, [ ...( groups.get( d.group ) ?? [] ), d ] );
	}
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Keyboard shortcuts', 'cliedesk' ) }
			footer={
				<Button variant="primary" onPress={ onClose }>
					{ __( 'Close', 'cliedesk' ) }
				</Button>
			}
		>
			<div className="flex flex-col gap-4">
				<p className="text-sm text-fg-muted">
					{ enabled
						? __(
								'Single-key shortcuts work when you are not typing in a field.',
								'cliedesk'
							)
						: __(
								'Single-key shortcuts are off. Shortcuts with Ctrl or ⌘ still work.',
								'cliedesk'
							) }{ ' ' }
					<Link
						to={ MY_PROFILE_PATH }
						onClick={ onClose }
						className="text-accent-fg underline underline-offset-2"
					>
						{ __( 'Change this in My profile', 'cliedesk' ) }
					</Link>
				</p>
				<TextField
					label={ __( 'Filter shortcuts', 'cliedesk' ) }
					value={ filter }
					onChange={ setFilter }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				{ Object.keys( map ).length > 0 && (
					<Button
						size="sm"
						className="self-start"
						onPress={ () => saveMap( {} ) }
					>
						{ __(
							'Reset all shortcuts to the defaults',
							'cliedesk'
						) }
					</Button>
				) }
				{ groups.size === 0 && (
					<p role="status" className="text-fg-muted">
						{ __( 'No shortcuts match.', 'cliedesk' ) }
					</p>
				) }
				{ [ ...groups.entries() ].map( ( [ group, defs ] ) => (
					<section
						key={ group }
						aria-label={ group }
						className="flex flex-col gap-2"
					>
						<h3 className="text-sm font-semibold">{ group }</h3>
						<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
							{ defs.map( ( d ) => {
								const keys = effectiveKeys( d );
								const remapped = !! map[ mapKey( d.id ) ];
								return (
									<Fragment key={ d.id }>
										<dt
											className={
												! enabled &&
												! hasModifier( keys )
													? 'text-fg-muted'
													: undefined
											}
										>
											{ d.label }
											{ remapped && (
												<span className="ms-1 text-xs text-fg-muted">
													{ __(
														'(changed)',
														'cliedesk'
													) }
												</span>
											) }
										</dt>
										<dd className="flex flex-wrap items-center gap-2">
											<Keys keys={ keys } />
											<Button
												size="sm"
												variant="ghost"
												aria-label={ sprintf(
													/* translators: %s: action. */
													__(
														'Change keys for “%s”',
														'cliedesk'
													),
													d.label
												) }
												onPress={ () =>
													setEditing( d.id )
												}
											>
												{ __( 'Change', 'cliedesk' ) }
											</Button>
											{ remapped && (
												<Button
													size="sm"
													variant="ghost"
													aria-label={ sprintf(
														/* translators: %s: action. */
														__(
															'Reset keys for “%s”',
															'cliedesk'
														),
														d.label
													) }
													onPress={ () => {
														const next = { ...map };
														delete next[
															mapKey( d.id )
														];
														saveMap( next );
													} }
												>
													{ __(
														'Reset',
														'cliedesk'
													) }
												</Button>
											) }
										</dd>
										{ editing === d.id && (
											<dd className="col-span-2">
												<Remap
													d={ d }
													onDone={ () =>
														setEditing( null )
													}
												/>
											</dd>
										) }
									</Fragment>
								);
							} ) }
						</dl>
					</section>
				) ) }
			</div>
		</Modal>
	);
}
