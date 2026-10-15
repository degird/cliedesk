/**
 * Customer card configuration (CRM-18): types, query keys and calls.
 *
 * - GET cards/{contact|organization} → {context, role, items: [{key, label, collapsed}], hidden, first}: the layout
 *   for me (my role's layout, else the default), with my own hidden and collapsed cards.
 * - PUT cards/{context}/mine {hidden?, collapsed?, first?} → the same layout.
 * - GET cards/{context}/config → {default: [{key, label?}], roles: {role: [...]}, available: [{key, label}]}
 *   (cliedesk_manage_settings).
 * - PUT cards/{context}/config {role?, items} → the configuration. Without `role` it saves the default; an empty
 *   list for a role removes the role's layout (it uses the default again).
 *
 * Keys: ['cards', context], ['cards', context, 'config'].
 */
import { api, queryOptions } from '@cliedesk/data';

export type CardContext = 'contact' | 'organization';
export const CARD_CONTEXTS: CardContext[] = [ 'contact', 'organization' ];

export interface CardItem {
	key: string;
	label: string;
	collapsed: boolean;
}

export interface CardLayout {
	context: CardContext;
	role: string | null;
	items: CardItem[];
	hidden: string[];
	first: CardContext;
}

export interface ConfigItem {
	key: string;
	label?: string;
}

export interface CardConfig {
	default: ConfigItem[];
	roles: Record< string, ConfigItem[] >;
	available: Array< { key: string; label: string } >;
}

export const cardKeys = {
	all: [ 'cards' ] as const,
	layout: ( c: CardContext ) => [ 'cards', c ] as const,
	config: ( c: CardContext ) => [ 'cards', c, 'config' ] as const,
};

const strings = ( v: unknown ): string[] =>
	Array.isArray( v )
		? v.filter( ( x ): x is string => typeof x === 'string' )
		: [];

const isContext = ( v: unknown ): v is CardContext =>
	v === 'contact' || v === 'organization';

/**
 * Layout with safe defaults.
 *
 * @param d       Data from the API.
 * @param context Context asked for.
 */
export function normaliseLayout(
	d: Partial< CardLayout > | undefined,
	context: CardContext
): CardLayout {
	return {
		context,
		role: typeof d?.role === 'string' ? d.role : null,
		items: Array.isArray( d?.items )
			? d.items
					.filter( ( i ) => i && typeof i.key === 'string' )
					.map( ( i ) => ( {
						key: i.key,
						label: typeof i.label === 'string' ? i.label : i.key,
						collapsed: !! i.collapsed,
					} ) )
			: [],
		hidden: strings( d?.hidden ),
		first: isContext( d?.first ) ? d.first : 'contact',
	};
}

const configItems = ( v: unknown ): ConfigItem[] =>
	Array.isArray( v )
		? v
				.filter(
					( i ): i is ConfigItem =>
						!! i && typeof ( i as ConfigItem ).key === 'string'
				)
				.map( ( i ) =>
					typeof i.label === 'string' && i.label !== ''
						? { key: i.key, label: i.label }
						: { key: i.key }
				)
		: [];

/**
 * Configuration with safe defaults (an empty PHP map arrives as a list).
 *
 * @param d Data from the API.
 */
export function normaliseConfig(
	d: Partial< CardConfig > | undefined
): CardConfig {
	const roles: Record< string, ConfigItem[] > = {};
	if (
		d?.roles &&
		typeof d.roles === 'object' &&
		! Array.isArray( d.roles )
	) {
		for ( const [ role, items ] of Object.entries( d.roles ) ) {
			roles[ role ] = configItems( items );
		}
	}
	return {
		default: configItems( d?.default ),
		roles,
		available: Array.isArray( d?.available )
			? d.available.filter(
					( a ) =>
						a &&
						typeof a.key === 'string' &&
						typeof a.label === 'string'
				)
			: [],
	};
}

export const cardLayoutQuery = ( context: CardContext ) =>
	queryOptions( {
		queryKey: cardKeys.layout( context ),
		queryFn: async ( { signal } ) =>
			normaliseLayout(
				(
					await api.get< CardLayout >( `cards/${ context }`, {
						signal,
					} )
				).data,
				context
			),
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );

/**
 * Save my own hidden and collapsed cards, or which card comes first.
 *
 * @param context Context.
 * @param body    Changes.
 */
export async function saveMyCards(
	context: CardContext,
	body: { hidden?: string[]; collapsed?: string[]; first?: CardContext }
): Promise< CardLayout > {
	return normaliseLayout(
		( await api.put< CardLayout >( `cards/${ context }/mine`, { body } ) )
			.data,
		context
	);
}

export const cardConfigQuery = ( context: CardContext ) =>
	queryOptions( {
		queryKey: cardKeys.config( context ),
		queryFn: async ( { signal } ) =>
			normaliseConfig(
				(
					await api.get< CardConfig >( `cards/${ context }/config`, {
						signal,
					} )
				).data
			),
	} );

/**
 * Save the default layout (no role) or a role's layout; an empty list resets a role to the default.
 *
 * @param context Context.
 * @param role    Role key, or null for the default.
 * @param items   Items in order.
 */
export async function saveCardConfig(
	context: CardContext,
	role: string | null,
	items: ConfigItem[]
): Promise< CardConfig > {
	return normaliseConfig(
		(
			await api.put< CardConfig >( `cards/${ context }/config`, {
				body: { ...( role ? { role } : {} ), items },
			} )
		).data
	);
}

/** Contact card attributes the app renders from the contact itself (no profile request). */
export const CONTACT_BUILTINS = [
	'email',
	'phone',
	'organization',
	'owner',
	'language',
	'timezone',
	'location',
	'wordpress',
	'conversations',
];

export interface ProfileSection {
	key: string;
	label: string;
	items: Array< { label: string; value: string | number | null } >;
}

export interface ContactProfile {
	tags: Array< { id: number; name: string; color: string | null } >;
	segments: Array< { id: number; name: string } >;
	/** Extension sections (cliedesk_contact_profile); a section whose key is a card attribute fills that card. */
	sections: ProfileSection[];
	/** The linked WordPress user (INB-65). */
	wordpress?: { userId: number; login: string; roles: string[] } | null;
}

/**
 * Whether a contact card item needs the profile (tags, segments and extension attributes).
 *
 * @param key Card item key.
 */
export const needsProfile = ( key: string ) =>
	key === 'wordpress' ||
	( ! key.startsWith( 'field:' ) && ! CONTACT_BUILTINS.includes( key ) );

/**
 * GET contacts/{id}/profile: tags, segments and extension sections for the contact card.
 *
 * @param id Contact.
 */
export const contactProfileQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'contact', id, 'profile' ] as const,
		queryFn: async ( { signal } ): Promise< ContactProfile > => {
			const d = (
				await api.get< Partial< ContactProfile > >(
					`contacts/${ id }/profile`,
					{ signal }
				)
			).data;
			return {
				tags: Array.isArray( d?.tags ) ? d.tags : [],
				segments: Array.isArray( d?.segments ) ? d.segments : [],
				sections: Array.isArray( d?.sections ) ? d.sections : [],
				wordpress:
					d?.wordpress && typeof d.wordpress === 'object'
						? {
								userId: Number( d.wordpress.userId ),
								login: String( d.wordpress.login ?? '' ),
								roles: Array.isArray( d.wordpress.roles )
									? d.wordpress.roles.map( String )
									: [],
							}
						: null,
			};
		},
	} );
