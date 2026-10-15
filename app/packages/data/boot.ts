/**
 * Boot payload (plan.frontend-ux.md §3.11): read once from `window.cliedeskBoot`, validated with Zod (mini),
 * normalised (missing optional keys get safe defaults) and deep-frozen into a module store. No Zustand (§4.9).
 */
import * as z from 'zod/mini';
import { viewAsStore, type ViewAsSession } from './viewAs';

export type ThemePref = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type ProState =
	| 'free_only'
	| 'pro_inactive'
	| 'unlicensed'
	| 'licensed'
	| 'expired'
	| 'revoked'
	| 'incompatible';
export type ProVariant = 'row' | 'chip' | 'card';

export interface ProManifestEntry {
	id: string;
	slot: string;
	label: string;
	description: string;
	example?: string;
	group?: string;
	docs?: string;
	plan?: string;
	variant?: ProVariant;
}

export interface BootProduct {
	id: number;
	uid: string;
	slug: string;
	name: string;
	color?: string;
	icon?: string;
	brandId: number | null;
	status: string;
}

/** My own columns of a view's table (INB-03): order, hidden columns and widths in px. */
export interface TableColumnPrefs {
	order?: string[];
	hidden?: string[];
	widths?: Record< string, number >;
}

export interface BootPayload {
	version: string;
	app: {
		slug: string;
		basePath: string;
		url: string;
		pretty: boolean;
		loginMode: 'wp' | 'app';
	};
	/** INB-01: `nonceUrl` is the app's own session path (never admin-ajax); `adminUrl` is wp-admin for links. */
	rest: {
		root: string;
		nonce: string | null;
		nonceUrl: string;
		adminUrl?: string;
	};
	user: {
		id: number;
		name: string;
		avatar: string;
		roleKey: string;
		caps: string[];
		productScope: 'all' | number[];
	} | null;
	prefs: {
		theme: ThemePref;
		density: Density;
		fontScale: number;
		font: 'inter' | 'system' | 'dyslexic';
		reducedMotion: 'system' | 'on' | 'off';
		shortcuts: { enabled: boolean; map: Record< string, string > };
		timezone: string;
		layout: {
			inboxMode: string;
			/** Width of the inbox list next to the conversation pane, px. */
			paneWidth: number;
			sidebarHidden: boolean;
			/** Contact list columns (CRM-36); empty or missing: the defaults. */
			contactColumns?: string[];
			/** Play mode: what happens after a send (INB-26). */
			playAfterSend?: 'next' | 'list' | 'stay';
			/** Conversation timeline newest first (INB-35). */
			timelineNewestFirst?: boolean;
			/** Times in the customer's time zone in a conversation (INB-39). */
			customerTime?: boolean;
			/** BRD-12: products the inbox shows (empty or missing: all). */
			inboxProducts?: number[];
			/** Browser spell check in the composer (INB-54); missing: on. */
			spellCheck?: boolean;
			/** My own side panel layout (INB-66); null or missing: my team's. */
			panel?: {
				order: string[];
				collapsed: string[];
				hidden: string[];
			} | null;
			/** My table columns per view (INB-03). */
			tableColumns?: Record< string, TableColumnPrefs >;
		};
	};
	workspace: {
		name: string;
		timezone: string;
		locale: string;
		weekStart: number;
		accent: string | null;
		/** ADM-05: saved address, else the store address. */
		address: string;
		/** The workspace brand (Settings → Workspace → Brand). */
		brandId: number | null;
	};
	products: BootProduct[];
	productsTruncated: boolean;
	i18n: { locale: string; lang: string; rtl: boolean };
	modules: string[];
	features: Record< string, boolean >;
	pro: {
		installed: boolean;
		active: boolean;
		licensed: boolean;
		state: ProState;
		plan: string | null;
		manifest: ProManifestEntry[];
		links: {
			upgrade?: string;
			learnMore?: string;
			activateLicence?: string;
			plugins?: string | null;
			[ key: string ]: string | null | undefined;
		};
	};
	safeMode: boolean;
	emergency: {
		automationPaused: boolean;
		aiOff?: boolean;
		lockdown: boolean;
		constants: string[];
		/** Two-factor enforcement for this user (SEC-01). */
		twoFactor?: {
			/** Required and not set up yet. */
			required: boolean;
			configured?: boolean | null;
			graceUntil: string | null;
			blocked: boolean;
		};
		/** Why lockdown is on (when it is). */
		lockdownReason?: string;
		/** A Cliedesk security release is waiting (sent only to people who can update plugins). */
		securityUpdate?: { version: string; notice: string } | null;
	};
	health: { critical: number };
	/** Settings marked "exposed" by the server (`module.key` → value). Optional extension of §3.11. */
	settings?: Record< string, unknown >;
}

const str = ( d = '' ) => z.catch( z.string(), d );
const bool = ( d = false ) => z.catch( z.boolean(), d );
const num = ( d = 0 ) => z.catch( z.number(), d );
const strList = () => z.catch( z.array( z.string() ), [] );

const manifestEntry = z.object( {
	id: z.string(),
	slot: z.string(),
	label: z.string(),
	description: z.string(),
	example: z.optional( z.string() ),
	group: z.optional( z.string() ),
	docs: z.optional( z.string() ),
	plan: z.optional( z.string() ),
	variant: z.optional(
		z.catch( z.enum( [ 'row', 'chip', 'card' ] ), 'row' )
	),
} );

const schema = z.object( {
	version: str( '0.0.0' ),
	app: z.catch(
		z.object( {
			slug: str( 'dash' ),
			basePath: str( '/dash' ),
			url: str( '/dash/' ),
			pretty: bool( true ),
			loginMode: z.catch( z.enum( [ 'wp', 'app' ] ), 'wp' ),
		} ),
		{
			slug: 'dash',
			basePath: '/dash',
			url: '/dash/',
			pretty: true,
			loginMode: 'wp',
		}
	),
	rest: z.catch(
		z.object( {
			root: str( '/wp-json/' ),
			nonce: z.catch( z.nullable( z.string() ), null ),
			nonceUrl: str( '/dash/__session' ),
			adminUrl: str( '/wp-admin/' ),
		} ),
		{
			root: '/wp-json/',
			nonce: null,
			nonceUrl: '/dash/__session',
			adminUrl: '/wp-admin/',
		}
	),
	user: z.catch(
		z.nullable(
			z.object( {
				id: num( 0 ),
				name: str(),
				avatar: str(),
				roleKey: str(),
				caps: strList(),
				productScope: z.catch(
					z.union( [ z.literal( 'all' ), z.array( z.number() ) ] ),
					'all'
				),
			} )
		),
		null
	),
	prefs: z.catch(
		z.object( {
			theme: z.catch( z.enum( [ 'light', 'dark', 'system' ] ), 'system' ),
			density: z.catch(
				z.enum( [ 'comfortable', 'compact' ] ),
				'comfortable'
			),
			fontScale: num( 1 ),
			font: z.catch(
				z.enum( [ 'inter', 'system', 'dyslexic' ] ),
				'system'
			),
			reducedMotion: z.catch(
				z.enum( [ 'system', 'on', 'off' ] ),
				'system'
			),
			shortcuts: z.catch(
				z.object( {
					enabled: bool( true ),
					map: z.catch( z.record( z.string(), z.string() ), {} ),
				} ),
				{ enabled: true, map: {} }
			),
			timezone: str( 'UTC' ),
			layout: z.catch(
				z.object( {
					inboxMode: str( 'split' ),
					paneWidth: num( 420 ),
					sidebarHidden: bool( false ),
					contactColumns: z.optional(
						z.catch( z.array( z.string() ), [] )
					),
					playAfterSend: z.optional(
						z.catch( z.enum( [ 'next', 'list', 'stay' ] ), 'next' )
					),
					timelineNewestFirst: z.optional(
						z.catch( z.boolean(), false )
					),
					customerTime: z.optional( z.catch( z.boolean(), false ) ),
					inboxProducts: z.optional(
						z.catch( z.array( z.number() ), [] )
					),
					spellCheck: z.optional( z.catch( z.boolean(), true ) ),
					panel: z.optional(
						z.catch(
							z.nullable(
								z.object( {
									order: z.array( z.string() ),
									collapsed: z.array( z.string() ),
									hidden: z.array( z.string() ),
								} )
							),
							null
						)
					),
					tableColumns: z.optional(
						z.catch(
							z.record(
								z.string(),
								z.object( {
									order: z.optional( z.array( z.string() ) ),
									hidden: z.optional( z.array( z.string() ) ),
									widths: z.optional(
										z.record( z.string(), z.number() )
									),
								} )
							),
							{}
						)
					),
				} ),
				{ inboxMode: 'split', paneWidth: 420, sidebarHidden: false }
			),
		} ),
		{
			theme: 'system',
			density: 'comfortable',
			fontScale: 1,
			font: 'system',
			reducedMotion: 'system',
			shortcuts: { enabled: true, map: {} },
			timezone: 'UTC',
			layout: {
				inboxMode: 'split',
				paneWidth: 420,
				sidebarHidden: false,
			},
		}
	),
	workspace: z.catch(
		z.object( {
			name: str(),
			timezone: str( 'UTC' ),
			locale: str( 'en_US' ),
			weekStart: num( 1 ),
			accent: z.catch( z.nullable( z.string() ), null ),
			address: str(),
			brandId: z.catch( z.nullable( z.number() ), null ),
		} ),
		{
			name: '',
			timezone: 'UTC',
			locale: 'en_US',
			weekStart: 1,
			accent: null,
			address: '',
			brandId: null,
		}
	),
	products: z.catch(
		z.array(
			z.object( {
				id: z.number(),
				uid: str(),
				slug: str(),
				name: z.string(),
				color: z.optional( z.string() ),
				icon: z.optional( z.string() ),
				brandId: z.catch( z.nullable( z.number() ), null ),
				status: str( 'active' ),
			} )
		),
		[]
	),
	productsTruncated: bool(),
	i18n: z.catch(
		z.object( {
			locale: str( 'en_US' ),
			lang: str( 'en-US' ),
			rtl: bool(),
		} ),
		{ locale: 'en_US', lang: 'en-US', rtl: false }
	),
	modules: strList(),
	features: z.catch( z.record( z.string(), z.boolean() ), {} ),
	pro: z.catch(
		z.object( {
			installed: bool(),
			active: bool(),
			licensed: bool(),
			state: z.catch(
				z.enum( [
					'free_only',
					'pro_inactive',
					'unlicensed',
					'licensed',
					'expired',
					'revoked',
					'incompatible',
				] ),
				'free_only'
			),
			plan: z.catch( z.nullable( z.string() ), null ),
			// One malformed entry must not drop the others.
			manifest: z.catch( z.array( z.unknown() ), [] ),
			links: z.catch(
				z.record( z.string(), z.nullable( z.string() ) ),
				{}
			),
		} ),
		{
			installed: false,
			active: false,
			licensed: false,
			state: 'free_only',
			plan: null,
			manifest: [],
			links: {},
		}
	),
	safeMode: bool(),
	emergency: z.catch(
		z.object( {
			automationPaused: bool(),
			aiOff: z.optional( z.catch( z.boolean(), false ) ),
			lockdown: bool(),
			constants: strList(),
			twoFactor: z.optional(
				z.catch(
					z.object( {
						required: bool(),
						configured: z.catch( z.nullable( z.boolean() ), null ),
						graceUntil: z.catch( z.nullable( z.string() ), null ),
						blocked: bool(),
					} ),
					{
						required: false,
						configured: null,
						graceUntil: null,
						blocked: false,
					}
				)
			),
			lockdownReason: z.optional( z.catch( z.string(), '' ) ),
			securityUpdate: z.optional(
				z.catch(
					z.nullable( z.object( { version: str(), notice: str() } ) ),
					null
				)
			),
		} ),
		{ automationPaused: false, lockdown: false, constants: [] }
	),
	health: z.catch( z.object( { critical: num( 0 ) } ), { critical: 0 } ),
	settings: z.optional( z.catch( z.record( z.string(), z.unknown() ), {} ) ),
} );

function deepFreeze< T >( value: T ): T {
	if ( value && typeof value === 'object' && ! Object.isFrozen( value ) ) {
		Object.freeze( value );
		for ( const key of Object.keys( value ) ) {
			deepFreeze( ( value as Record< string, unknown > )[ key ] );
		}
	}
	return value;
}

/**
 * Validate and normalise a raw payload. Never throws: invalid parts fall back to safe defaults.
 *
 * @param raw Raw value (usually `window.cliedeskBoot`).
 */
export function parseBoot( raw: unknown ): BootPayload {
	const input = raw && typeof raw === 'object' ? raw : {};
	const result = z.safeParse( schema, input );
	// Clone: Zod returns shared `catch` defaults, which must not be frozen in place.
	const parsed = JSON.parse(
		JSON.stringify( result.success ? result.data : z.parse( schema, {} ) )
	) as BootPayload;
	parsed.pro.manifest = ( parsed.pro.manifest as unknown[] ).flatMap(
		( entry ) => {
			const e = z.safeParse( manifestEntry, entry );
			return e.success ? [ e.data as ProManifestEntry ] : [];
		}
	);
	if ( ! parsed.app.basePath.startsWith( '/' ) ) {
		parsed.app.basePath = '/' + parsed.app.basePath;
	}
	parsed.app.basePath = parsed.app.basePath.replace( /\/+$/, '' );
	return deepFreeze( parsed );
}

/** Payload as received (window.cliedeskBoot, GET /session or tests). */
let base: BootPayload | null = null;
/** `base` with the permission preview applied (memoised per preview session). */
let current: BootPayload | null = null;
let currentFor: ViewAsSession | null = null;
const listeners = new Set< () => void >();

/**
 * The payload as the previewed person sees it (TEAM-18): their Cliedesk caps, first role and product scope replace
 * the signed-in user's. Name, avatar and id stay those of the signed-in user (the server answers as the previewed
 * person); the preview banner shows the previewed person's name and avatar.
 *
 * @param payload Payload.
 * @param preview Preview session.
 */
function withPreview(
	payload: BootPayload,
	preview: ViewAsSession | null
): BootPayload {
	if ( ! preview || ! payload.user ) {
		return payload;
	}
	const copy = JSON.parse( JSON.stringify( payload ) ) as BootPayload;
	if ( copy.user ) {
		copy.user.caps = [ ...preview.user.caps ];
		copy.user.roleKey = preview.user.roles[ 0 ] ?? copy.user.roleKey;
		if ( preview.user.productScope ) {
			copy.user.productScope = Array.isArray( preview.user.productScope )
				? [ ...preview.user.productScope ]
				: 'all';
		}
	}
	return deepFreeze( copy );
}

/**
 * The frozen boot payload. Reads `window.cliedeskBoot` on first use. During a permission preview the user's caps
 * are the previewed person's.
 */
export function getBoot(): BootPayload {
	if ( ! base ) {
		base = parseBoot(
			typeof window !== 'undefined' ? window.cliedeskBoot : undefined
		);
		current = null;
	}
	const preview = viewAsStore.get();
	if ( ! current || currentFor !== preview ) {
		current = withPreview( base, preview );
		currentFor = preview;
	}
	return current;
}

/**
 * A wp-admin URL (links to WordPress screens such as Media or a user's profile).
 *
 * @param path Path under wp-admin, e.g. `upload.php`.
 */
export function wpAdminUrl( path = '' ): string {
	const admin = getBoot().rest.adminUrl || '/wp-admin/';
	return ( admin.endsWith( '/' ) ? admin : `${ admin }/` ) + path;
}

/**
 * The payload without the permission preview (the signed-in user's own caps).
 */
export function getOwnBoot(): BootPayload {
	getBoot();
	return base as BootPayload;
}

/**
 * Replace the payload (after `GET /session`, or in tests). The new value is validated and frozen too.
 *
 * @param raw New raw payload; `undefined` resets to `window.cliedeskBoot` on next read.
 */
export function setBoot( raw: unknown ): void {
	base = raw === undefined ? null : parseBoot( raw );
	current = null;
	listeners.forEach( ( l ) => l() );
}

viewAsStore.subscribe( () => {
	current = null;
	listeners.forEach( ( l ) => l() );
} );

/**
 * Subscribe to boot replacement (for `useSyncExternalStore`).
 *
 * @param listener Listener.
 */
export function subscribeBoot( listener: () => void ): () => void {
	listeners.add( listener );
	return () => {
		listeners.delete( listener );
	};
}

/**
 * Whether the current user has a capability (UI only; the server re-checks every call).
 *
 * @param cap Capability.
 */
export function can( cap?: string ): boolean {
	if ( ! cap ) {
		return true;
	}
	return getBoot().user?.caps.includes( cap ) ?? false;
}

/**
 * Whether a module is active.
 *
 * @param id Module id.
 */
export function hasModule( id?: string ): boolean {
	return ! id || getBoot().modules.includes( id );
}

/**
 * Feature flag (labs).
 *
 * @param id Flag id.
 */
export function isFeatureOn( id: string ): boolean {
	return getBoot().features[ id ] === true;
}
