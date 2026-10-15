/**
 * Translated labels for team, role and profile values.
 */
import { __ } from '@wordpress/i18n';
import type {
	AgentStatus,
	ConversationScope,
	InviteStatus,
	NotifyChannel,
	NotifyEvent,
	ProfileField,
	Role,
	RoleType,
	RoutingMethod,
	ThemeChoice,
} from './api';
import { OWNER_ROLE } from './api';

/**
 * Label of a capability area.
 *
 * @param area Area key from the catalogue.
 */
export function areaLabel( area: string ): string {
	switch ( area ) {
		case 'access':
			return __( 'Access', 'cliedesk' );
		case 'conversations':
			return __( 'Conversations', 'cliedesk' );
		case 'customers':
			return __( 'Customers', 'cliedesk' );
		case 'content':
			return __( 'Knowledge & shared content', 'cliedesk' );
		case 'automation':
			return __( 'Automation', 'cliedesk' );
		case 'commerce':
			return __( 'Commerce', 'cliedesk' );
		case 'approvals':
			return __( 'Approvals', 'cliedesk' );
		case 'reports':
			return __( 'Reports', 'cliedesk' );
		case 'workspace':
			return __( 'Settings', 'cliedesk' );
		case 'protected':
			return __( 'Privacy, security & administration', 'cliedesk' );
		case 'ai':
			return __( 'AI', 'cliedesk' );
		default:
			return area;
	}
}

/**
 * Display name of a role ("Owner" for the WordPress administrator).
 *
 * @param key   Role key.
 * @param roles Known roles (names from the server).
 */
export function roleName( key: string, roles?: Role[] ): string {
	if ( key === OWNER_ROLE ) {
		return __( 'Owner', 'cliedesk' );
	}
	const found = roles?.find( ( r ) => r.key === key );
	if ( found ) {
		return found.name;
	}
	switch ( key ) {
		case 'cliedesk_admin':
			return __( 'Cliedesk Admin', 'cliedesk' );
		case 'cliedesk_supervisor':
			return __( 'Supervisor', 'cliedesk' );
		case 'cliedesk_agent':
			return __( 'Agent', 'cliedesk' );
		case 'cliedesk_collaborator':
			return __( 'Collaborator', 'cliedesk' );
		case 'cliedesk_viewer':
			return __( 'Viewer', 'cliedesk' );
		default:
			return key;
	}
}

/** Default Cliedesk roles (keys) when the role list cannot be read (people managers without role rights). */
export const DEFAULT_ROLE_KEYS = [
	'cliedesk_admin',
	'cliedesk_supervisor',
	'cliedesk_agent',
	'cliedesk_collaborator',
	'cliedesk_viewer',
];

/**
 * Label of a role type.
 *
 * @param t Type.
 */
export function roleTypeLabel( t: RoleType ): string {
	switch ( t ) {
		case 'owner':
			return __( 'Owner', 'cliedesk' );
		case 'default':
			return __( 'Default', 'cliedesk' );
		case 'custom':
			return __( 'Custom', 'cliedesk' );
		default:
			return __( 'From another plugin', 'cliedesk' );
	}
}

/**
 * Label of a directory status.
 *
 * @param s Status.
 */
export function statusLabel( s: AgentStatus ): string {
	switch ( s ) {
		case 'invited':
			return __( 'Invited', 'cliedesk' );
		case 'pending':
			return __( 'Pending approval', 'cliedesk' );
		case 'deactivated':
			return __( 'Deactivated', 'cliedesk' );
		default:
			return __( 'Active', 'cliedesk' );
	}
}

/**
 * Label of a conversation scope (TEAM-19).
 *
 * @param s Scope.
 */
export function scopeLabel( s: ConversationScope ): string {
	switch ( s ) {
		case 'teams':
			return __( 'Conversations of their teams', 'cliedesk' );
		case 'mine_unassigned':
			return __( 'Their own and unassigned conversations', 'cliedesk' );
		case 'mine':
			return __( 'Only conversations assigned to them', 'cliedesk' );
		case 'participant':
			return __( 'Only conversations they take part in', 'cliedesk' );
		default:
			return __( 'All conversations', 'cliedesk' );
	}
}

/**
 * Label of a routing method.
 *
 * @param m Method.
 */
export function routingLabel( m: RoutingMethod ): string {
	switch ( m ) {
		case 'round_robin':
			return __( 'Round robin', 'cliedesk' );
		default:
			return __( 'Manual', 'cliedesk' );
	}
}

/**
 * Label of a notification event.
 *
 * @param e Event.
 */
export function notifyEventLabel( e: NotifyEvent ): string {
	switch ( e ) {
		case 'mention':
			return __( 'Someone mentions me', 'cliedesk' );
		case 'assigned':
			return __( 'A conversation is assigned to me', 'cliedesk' );
		case 'customer_reply':
			return __( 'A customer replies to my conversation', 'cliedesk' );
		case 'sla_warning':
			return __( 'An SLA target is about to be missed', 'cliedesk' );
		case 'approval_request':
			return __( 'An approval is waiting for me', 'cliedesk' );
		case 'owned_contact':
			return __( 'A customer I own writes in', 'cliedesk' );
		default:
			return __( 'New conversation in my team’s queue', 'cliedesk' );
	}
}

/**
 * Label of a notification channel.
 *
 * @param c Channel.
 */
export function notifyChannelLabel( c: NotifyChannel ): string {
	return c === 'email'
		? __( 'Email', 'cliedesk' )
		: __( 'In the app', 'cliedesk' );
}

/**
 * Label of a theme choice.
 *
 * @param t Theme.
 */
export function themeLabel( t: ThemeChoice ): string {
	switch ( t ) {
		case 'light':
			return __( 'Light', 'cliedesk' );
		case 'dark':
			return __( 'Dark', 'cliedesk' );
		default:
			return __( 'Same as my device', 'cliedesk' );
	}
}

/**
 * Label of a profile field (locks, errors).
 *
 * @param f Field.
 */
export function profileFieldLabel( f: ProfileField ): string {
	switch ( f ) {
		case 'displayName':
			return __( 'Name', 'cliedesk' );
		case 'jobTitle':
			return __( 'Job title', 'cliedesk' );
		case 'timezone':
			return __( 'Time zone', 'cliedesk' );
		case 'languages':
			return __( 'Languages', 'cliedesk' );
		case 'signature':
			return __( 'Signature', 'cliedesk' );
		case 'notifications':
			return __( 'Notifications', 'cliedesk' );
		case 'theme':
			return __( 'Theme', 'cliedesk' );
		case 'shortcuts':
			return __( 'Keyboard shortcuts', 'cliedesk' );
		case 'alias':
			return __( 'Name shown to customers', 'cliedesk' );
		case 'aliasAvatarAttachmentId':
			return __( 'Picture shown to customers', 'cliedesk' );
		case 'notificationDigest':
			return __( 'Notification emails', 'cliedesk' );
		default:
			return __(
				'Pause my replies when something new arrives',
				'cliedesk'
			);
	}
}

/**
 * Label of an invite result.
 *
 * @param s Status.
 */
export function inviteStatusLabel( s: InviteStatus ): string {
	switch ( s ) {
		case 'created':
			return __( 'Invited', 'cliedesk' );
		case 'upgraded':
			return __( 'Access added to existing user', 'cliedesk' );
		case 'unchanged':
			return __( 'Already had this role', 'cliedesk' );
		default:
			return __( 'Not invited', 'cliedesk' );
	}
}
