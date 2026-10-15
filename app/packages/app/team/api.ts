/**
 * Team, roles and profiles (TEAM-01…14, TEAM-24): types, query keys and query options for the Settings → Team &
 * roles screens. Keys: ['team', …] (people, roles, permissions), ['teams', …] (teams) and ['profile'].
 */
import { api, getBoot, queryOptions, type QueryValue } from '@cliedesk/data';

export type Protection = 'admin' | 'owner' | null;

export interface Capability {
	key: string;
	area: string;
	label: string;
	description: string;
	protected: Protection;
	/** The current user holds it (only held capabilities can be given to others). */
	held: boolean;
}

export type RoleType = 'owner' | 'default' | 'custom' | 'external';

export type ConversationScope =
	'all' | 'teams' | 'mine_unassigned' | 'mine' | 'participant';

export interface Role {
	key: string;
	name: string;
	type: RoleType;
	caps: string[];
	userCount: number;
	conversationScope: ConversationScope;
	productLimit: number[] | null;
	editable: boolean;
	deletable: boolean;
	resettable: boolean;
	/** Views, saved replies and tags levels (TEAM-15/16), computed by the server from `caps`. */
	levels?: { views: string; replies: string; tags: string };
}

export interface RoleList {
	roles: Role[];
}

/** WordPress role key of the Owner (site administrator). */
export const OWNER_ROLE = 'administrator';
export const ADMIN_ROLE = 'cliedesk_admin';

export interface Permissions {
	id: number;
	name: string;
	roles: string[];
	otherRoles: string[];
	isOwner: boolean;
	granted: string[];
	revoked: string[];
	hasOverrides: boolean;
	effective: string[];
}

export type AgentStatus = 'active' | 'invited' | 'deactivated' | 'pending';
/** '' is the default view: everyone except deactivated people. */
export type StatusFilter = AgentStatus | 'all' | '';

export interface Agent {
	userId: number;
	name: string;
	email: string;
	avatar: string;
	jobTitle: string;
	roles: string[];
	teams: number[];
	status: AgentStatus;
	lastLogin: string | null;
	inactive: boolean;
	twoFactor: boolean | null;
	hasOverrides: boolean;
}

export interface AgentFilters {
	role: string;
	team: number | null;
	status: StatusFilter;
	/** No login for 30 days or more. */
	inactive: boolean;
	hasOverrides: boolean;
	search: string;
}

export const EMPTY_FILTERS: AgentFilters = {
	role: '',
	team: null,
	status: '',
	inactive: false,
	hasOverrides: false,
	search: '',
};

/** Days without login for the "inactive" filter and badge. */
export const INACTIVE_DAYS = 30;

export type BulkOp = 'set_role' | 'add_to_team' | 'deactivate';

export interface BulkResult {
	userId: number;
	ok: boolean;
	error?: string;
	code?: string;
}

export interface InviteRow {
	email: string;
	name?: string;
	role: string;
	teams?: number[];
}

export type InviteStatus = 'created' | 'upgraded' | 'unchanged' | 'error';

export interface InviteResult {
	row: number;
	email: string;
	status: InviteStatus;
	userId: number | null;
	error: string | null;
}

export interface ExportFile {
	filename: string;
	rows: number;
	csv: string;
}

/** RTE-07: how a team works its queue (sticky assignment is a Pro queue option). */
export type RoutingMethod = 'manual' | 'round_robin';

export const ROUTING_METHODS: RoutingMethod[] = [ 'manual', 'round_robin' ];

export interface Team {
	id: number;
	uid: string;
	name: string;
	icon: string | null;
	description: string;
	leadUserId: number | null;
	isPrivate: boolean;
	alias: string;
	archived: boolean;
	version: number;
	memberCount?: number;
}

export interface TeamMember {
	userId: number;
	name: string;
	isLead: boolean;
	isDefault: boolean;
	/** Can reply to customers (Collaborators join for mentions only). */
	agent: boolean;
}

export interface TeamDetail extends Team {
	routingMethod: RoutingMethod;
	capacity: { chat?: number; email?: number };
	signature: string;
	/** Default choice of the send button (INB-49): send, resolve, wait or snooze. */
	postSend?: string;
	/** Default shortcut keys for members (INB-07): map key → keys. */
	shortcutMap?: Record< string, string >;
	queueId: number | null;
	/** Products of the team (BRD-14; set with Pro). */
	productIds: number[];
	members: TeamMember[];
}

export interface TeamInput {
	name?: string;
	icon?: string;
	description?: string;
	leadUserId?: number | null;
	isPrivate?: boolean;
	routingMethod?: RoutingMethod;
	capacity?: { chat: number; email: number };
	signature?: string;
	postSend?: string;
	alias?: string;
	members?: Array< { userId: number; isLead: boolean } >;
}

export type NotifyEvent =
	| 'mention'
	| 'assigned'
	| 'customer_reply'
	| 'sla_warning'
	| 'approval_request'
	| 'team_queue'
	| 'owned_contact';
export type NotifyChannel = 'app' | 'email';

export const NOTIFY_EVENTS: NotifyEvent[] = [
	'mention',
	'assigned',
	'customer_reply',
	'sla_warning',
	'approval_request',
	'team_queue',
	'owned_contact',
];
export const NOTIFY_CHANNELS: NotifyChannel[] = [ 'app', 'email' ];

/** APP-07: all conversations, or only those assigned to the person. */
export type NotifyScope = 'all' | 'mine';

export type Notifications = Record<
	NotifyEvent,
	Record< NotifyChannel, boolean > & { scope: NotifyScope }
>;

export type ThemeChoice = 'system' | 'light' | 'dark';

/** Editable profile fields (API names). */
export type ProfileField =
	| 'displayName'
	| 'jobTitle'
	| 'timezone'
	| 'languages'
	| 'signature'
	| 'notifications'
	| 'theme'
	| 'shortcuts'
	| 'alias'
	| 'aliasAvatarAttachmentId'
	| 'collisionPause'
	| 'notificationDigest';

export interface Profile {
	userId: number;
	displayName: string;
	email: string;
	avatar: string;
	jobTitle: string;
	timezone: string;
	languages: string[];
	signature: string;
	notifications: Notifications;
	theme: ThemeChoice;
	shortcuts: boolean;
	alias: string;
	aliasAvatarAttachmentId: number | null;
	/** Pause my sends when something new arrives while I write (INB-60); null: the workspace default. */
	collisionPause: boolean | null;
	/** Notification emails one by one, or bundled hourly or daily (APP-11). */
	notificationDigest: DigestChoice;
	/** Fields an administrator locked for the user's role. */
	locked: ProfileField[];
	/** APP-07: events an administrator set for everyone. */
	notificationLocks?: NotifyEvent[];
}

export type DigestChoice = 'off' | 'hourly' | 'daily';

export type ProfileInput = Partial<
	Omit<
		Profile,
		'userId' | 'email' | 'avatar' | 'locked' | 'notificationLocks'
	>
>;

export type ProfileLocks = Record< string, ProfileField[] >;

export const teamKeys = {
	all: [ 'team' ] as const,
	capabilities: [ 'team', 'capabilities' ] as const,
	roles: [ 'team', 'roles' ] as const,
	rolePicker: [ 'team', 'roles', 'picker' ] as const,
	agents: ( f: AgentFilters ) => [ 'team', 'agents', f ] as const,
	allAgents: [ 'team', 'agents' ] as const,
	permissions: ( id: number ) => [ 'team', 'permissions', id ] as const,
	userProfile: ( id: number ) => [ 'team', 'profile', id ] as const,
	productScope: ( id: number ) => [ 'team', 'product-scope', id ] as const,
};

/**
 * Where a person's product limit comes from (BRD-14). Free shows it and removes limits; setting them is Pro.
 * `products` null: every product.
 */
export interface ProductScope {
	products: number[] | null;
	own: number[];
	teams: Array< { id: number; name: string; productIds: number[] } >;
	roles: Array< { key: string; productIds: number[] } >;
	defaults: number[];
}

export type LimitSubject = 'user' | 'team' | 'role' | 'default';

export const teamsKeys = {
	all: [ 'teams' ] as const,
	list: ( archived: boolean ) => [ 'teams', 'list', archived ] as const,
	detail: ( id: number ) => [ 'teams', 'detail', id ] as const,
};

export const profileKey = [ 'profile' ] as const;

/**
 * Query arguments of the directory filters (GET /agents and /agents/export). Empty filters are left out.
 *
 * @param f Filters.
 */
export function agentQueryArgs(
	f: AgentFilters
): Record< string, QueryValue > {
	const out: Record< string, QueryValue > = {};
	if ( f.role ) {
		out.role = f.role;
	}
	if ( f.team ) {
		out.team = f.team;
	}
	if ( f.status ) {
		out.status = f.status;
	}
	if ( f.inactive ) {
		out.inactiveDays = INACTIVE_DAYS;
	}
	if ( f.hasOverrides ) {
		out.hasOverrides = true;
	}
	if ( f.search.trim() ) {
		out.search = f.search.trim();
	}
	return out;
}

export const capabilitiesQuery = () =>
	queryOptions( {
		queryKey: teamKeys.capabilities,
		queryFn: async ( { signal } ) =>
			( await api.get< Capability[] >( 'capabilities', { signal } ) )
				.data ?? [],
		staleTime: 5 * 60 * 1000,
	} );

export const rolesQuery = () =>
	queryOptions( {
		queryKey: teamKeys.roles,
		queryFn: async ( { signal } ): Promise< RoleList > => {
			const r = await api.get< Role[] >( 'roles', { signal } );
			return { roles: r.data ?? [] };
		},
	} );

export interface RoleChoice {
	key: string;
	name: string;
}

/** Role keys and names for pickers (GET roles/picker, cliedesk_manage_settings). */
export const rolePickerQuery = () =>
	queryOptions( {
		queryKey: teamKeys.rolePicker,
		queryFn: async ( { signal } ): Promise< RoleChoice[] > => {
			const d = (
				await api.get< { items?: RoleChoice[] } >( 'roles/picker', {
					signal,
				} )
			).data;
			return Array.isArray( d?.items ) ? d.items : [];
		},
		staleTime: 5 * 60 * 1000,
	} );

export const agentsQuery = ( f: AgentFilters ) =>
	queryOptions( {
		queryKey: teamKeys.agents( f ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< Agent[] >( 'agents', {
					query: agentQueryArgs( f ),
					signal,
				} )
			).data ?? [],
	} );

export const permissionsQuery = ( id: number ) =>
	queryOptions( {
		queryKey: teamKeys.permissions( id ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< Permissions >( `users/${ id }/permissions`, {
					signal,
				} )
			).data,
	} );

export const userProfileQuery = ( id: number ) =>
	queryOptions( {
		queryKey: teamKeys.userProfile( id ),
		queryFn: async ( { signal } ) =>
			normaliseProfile(
				(
					await api.get< Profile >( `users/${ id }/profile`, {
						signal,
					} )
				).data
			),
	} );

export const profileQuery = () =>
	queryOptions( {
		queryKey: profileKey,
		queryFn: async ( { signal } ) =>
			normaliseProfile(
				( await api.get< Profile >( 'profile', { signal } ) ).data
			),
	} );

export const productScopeQuery = ( id: number ) =>
	queryOptions( {
		queryKey: teamKeys.productScope( id ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< ProductScope >( `users/${ id }/product-scope`, {
					signal,
				} )
			).data,
	} );

export const teamListQuery = ( archived = false ) =>
	queryOptions( {
		queryKey: teamsKeys.list( archived ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< Team[] >( 'teams', {
					query: { archived },
					signal,
				} )
			).data ?? [],
	} );

export const teamDetailQuery = ( id: number ) =>
	queryOptions( {
		queryKey: teamsKeys.detail( id ),
		queryFn: async ( { signal } ) =>
			normaliseTeam(
				( await api.get< TeamDetail >( `teams/${ id }`, { signal } ) )
					.data
			),
	} );

/**
 * Notification matrix with every event and channel (defaults on, as the server).
 *
 * @param n Stored preferences.
 */
export function normaliseNotifications(
	n: Partial<
		Record< string, Partial< Record< string, boolean | string > > >
	> | null
): Notifications {
	const out = {} as Notifications;
	for ( const e of NOTIFY_EVENTS ) {
		out[ e ] = {
			app: ( n?.[ e ]?.app as boolean | undefined ) ?? true,
			email: ( n?.[ e ]?.email as boolean | undefined ) ?? true,
			scope: n?.[ e ]?.scope === 'mine' ? 'mine' : 'all',
		};
	}
	return out;
}

/**
 * Profile with safe defaults (older servers, partial fixtures).
 *
 * @param p Profile from the API.
 */
export function normaliseProfile( p: Profile ): Profile {
	return {
		...p,
		displayName: p.displayName ?? '',
		jobTitle: p.jobTitle ?? '',
		timezone: p.timezone ?? '',
		languages: p.languages ?? [],
		signature: p.signature ?? '',
		notifications: normaliseNotifications( p.notifications ?? null ),
		theme: p.theme ?? 'system',
		shortcuts: p.shortcuts ?? true,
		alias: p.alias ?? '',
		aliasAvatarAttachmentId: p.aliasAvatarAttachmentId ?? null,
		collisionPause:
			typeof p.collisionPause === 'boolean' ? p.collisionPause : null,
		notificationDigest: p.notificationDigest ?? 'off',
		locked: p.locked ?? [],
	};
}

/**
 * Team detail with safe defaults.
 *
 * @param t Team from the API.
 */
export function normaliseTeam( t: TeamDetail ): TeamDetail {
	const capacity =
		t.capacity && ! Array.isArray( t.capacity ) ? t.capacity : {};
	return {
		...t,
		description: t.description ?? '',
		alias: t.alias ?? '',
		signature: t.signature ?? '',
		postSend: t.postSend ?? 'send',
		shortcutMap:
			t.shortcutMap &&
			typeof t.shortcutMap === 'object' &&
			! Array.isArray( t.shortcutMap )
				? t.shortcutMap
				: {},
		routingMethod: t.routingMethod ?? 'manual',
		capacity,
		productIds: t.productIds ?? [],
		members: t.members ?? [],
	};
}

/**
 * Profile locks from the `team.profile_locks` setting (an empty PHP array arrives as a list).
 *
 * @param value Setting value.
 */
export function normaliseLocks( value: unknown ): ProfileLocks {
	if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) {
		return {};
	}
	const out: ProfileLocks = {};
	for ( const [ role, fields ] of Object.entries(
		value as Record< string, unknown >
	) ) {
		if ( Array.isArray( fields ) ) {
			out[ role ] = fields.filter(
				( f ): f is ProfileField => typeof f === 'string'
			);
		}
	}
	return out;
}

/**
 * Capabilities grouped by area, in catalogue order.
 *
 * @param caps Catalogue.
 */
export function groupByArea(
	caps: Capability[]
): Array< { area: string; caps: Capability[] } > {
	const out: Array< { area: string; caps: Capability[] } > = [];
	for ( const c of caps ) {
		let g = out.find( ( x ) => x.area === c.area );
		if ( ! g ) {
			g = { area: c.area, caps: [] };
			out.push( g );
		}
		g.caps.push( c );
	}
	return out;
}

/**
 * Whether a protected capability may be on a role (§3.5 rule 3): Owner-only capabilities never on an editable
 * role; admin-level ones only on the Cliedesk Admin role.
 *
 * @param cap     Capability.
 * @param roleKey Role.
 */
export function allowedOnRole( cap: Capability, roleKey: string ): boolean {
	if ( roleKey === OWNER_ROLE ) {
		return true;
	}
	if ( cap.protected === 'owner' ) {
		return false;
	}
	return cap.protected !== 'admin' || roleKey === ADMIN_ROLE;
}

/** The signed-in user's id (0 before boot). */
export const currentUserId = (): number => getBoot().user?.id ?? 0;

/**
 * Save a text file in the browser (Blob + temporary link).
 *
 * @param filename File name.
 * @param content  Content.
 * @param type     MIME type.
 */
export function downloadFile(
	filename: string,
	content: string,
	type = 'text/csv;charset=utf-8'
): void {
	const blob = new Blob( [ content ], { type } );
	const url = URL.createObjectURL( blob );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	a.style.display = 'none';
	document.body.appendChild( a );
	a.click();
	a.remove();
	window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
}
