/**
 * Free core module (M0): routes, navigation, settings sections and change-feed invalidations.
 * Navigation only lists routes that exist (no dead links for later modules).
 */
import { can, hasModule, registerEntityInvalidation } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';
import {
	BarChart3,
	BookOpen,
	Building2,
	House,
	Inbox,
	MessageSquareText,
	Settings,
	Users,
} from 'lucide-react';
import { organizationsEnabled } from './crm/settings';
import {
	getSettingsSections,
	registerNavItem,
	registerRoute,
	registerSettingsSection,
} from './registry';

export function registerCore(): void {
	registerRoute( {
		id: 'home',
		path: '/',
		title: __( 'Home', 'cliedesk' ),
		component: () =>
			import( /* webpackChunkName: "home" */ './routes/HomeRoute' ),
	} );
	registerRoute( {
		id: 'inbox',
		path: '/inbox',
		title: __( 'Inbox', 'cliedesk' ),
		capability: 'cliedesk_view_conversations',
		module: 'inbox',
		component: () =>
			import(
				/* webpackChunkName: "inbox" */ './routes/inbox/InboxRoute'
			),
	} );
	registerRoute( {
		id: 'inbox.view',
		path: '/inbox/$view',
		title: __( 'Inbox', 'cliedesk' ),
		capability: 'cliedesk_view_conversations',
		module: 'inbox',
		component: () =>
			import(
				/* webpackChunkName: "inbox" */ './routes/inbox/InboxRoute'
			),
	} );
	// INB-55: pre-filled new conversation (/new?email=&name=&subject=&type=&queue=&body=).
	registerRoute( {
		id: 'inbox.new',
		path: '/new',
		title: __( 'New conversation', 'cliedesk' ),
		capability: 'cliedesk_view_conversations',
		module: 'inbox',
		component: () =>
			import(
				/* webpackChunkName: "inbox" */ './routes/inbox/InboxRoute'
			),
	} );
	registerRoute( {
		id: 'conversation',
		path: '/c/$number',
		title: __( 'Conversation', 'cliedesk' ),
		capability: 'cliedesk_view_conversations',
		module: 'conversations',
		component: () =>
			import(
				/* webpackChunkName: "conversation" */ './routes/conversation/ConversationRoute'
			),
	} );
	registerRoute( {
		id: 'conversation.message',
		path: '/c/$number/m/$messageId',
		title: __( 'Conversation', 'cliedesk' ),
		capability: 'cliedesk_view_conversations',
		module: 'conversations',
		component: () =>
			import(
				/* webpackChunkName: "conversation" */ './routes/conversation/ConversationRoute'
			),
	} );
	// KB-33: the knowledge library.
	registerRoute( {
		id: 'knowledge',
		path: '/knowledge',
		title: __( 'Knowledge', 'cliedesk' ),
		capability: 'edit_cliedesk_articles',
		module: 'knowledge',
		component: () =>
			import(
				/* webpackChunkName: "knowledge" */ './routes/knowledge/KnowledgeRoute'
			),
	} );
	registerRoute( {
		id: 'drafts',
		path: '/drafts',
		title: __( 'My drafts', 'cliedesk' ),
		capability: 'cliedesk_view_conversations',
		module: 'inbox',
		component: () =>
			import(
				/* webpackChunkName: "drafts" */ './routes/drafts/DraftsRoute'
			),
	} );
	registerRoute( {
		id: 'saved-replies',
		path: '/automation/replies',
		title: __( 'Saved replies', 'cliedesk' ),
		capability: 'cliedesk_use_saved_replies',
		module: 'macros',
		enabled: () => can( 'cliedesk_view_conversations' ),
		component: () =>
			import(
				/* webpackChunkName: "saved-replies" */ './routes/automation/SavedRepliesRoute'
			),
	} );
	registerRoute( {
		id: 'saved-reply',
		path: '/automation/replies/$replyId',
		title: __( 'Saved reply', 'cliedesk' ),
		capability: 'cliedesk_use_saved_replies',
		module: 'macros',
		enabled: () => can( 'cliedesk_view_conversations' ),
		component: () =>
			import(
				/* webpackChunkName: "saved-reply" */ './routes/automation/SavedReplyRoute'
			),
	} );
	// RPT-01: reports.
	registerRoute( {
		id: 'reports',
		path: '/reports',
		title: __( 'Reports', 'cliedesk' ),
		capability: 'cliedesk_view_reports',
		module: 'reports',
		component: () =>
			import(
				/* webpackChunkName: "reports" */ './routes/reports/ReportsRoute'
			),
	} );
	registerRoute( {
		id: 'contacts',
		path: '/contacts',
		title: __( 'Contacts', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "contacts" */ './routes/contacts/ContactsRoute'
			),
	} );
	// CRM-46: custom records.
	registerRoute( {
		id: 'records',
		path: '/records',
		title: __( 'Records', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "records" */ './routes/records/RecordsRoute'
			),
	} );
	registerRoute( {
		id: 'records.type',
		path: '/records/$typeKey',
		title: __( 'Records', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "records" */ './routes/records/RecordsRoute'
			),
	} );
	registerRoute( {
		id: 'records.record',
		path: '/records/$typeKey/$recordId',
		title: __( 'Records', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "records" */ './routes/records/RecordsRoute'
			),
	} );
	registerRoute( {
		id: 'contacts.duplicates',
		path: '/contacts/duplicates',
		title: __( 'Possible duplicates', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "contacts-duplicates" */ './routes/contacts/DuplicatesRoute'
			),
	} );
	registerRoute( {
		id: 'export',
		path: '/exports/$uid',
		title: __( 'Contact export', 'cliedesk' ),
		capability: 'cliedesk_export_contacts',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "export" */ './routes/exports/ExportRoute'
			),
	} );
	registerRoute( {
		id: 'organizations',
		path: '/organizations',
		title: __( 'Organizations', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		enabled: organizationsEnabled,
		component: () =>
			import(
				/* webpackChunkName: "organizations" */ './routes/organizations/OrganizationsRoute'
			),
	} );
	registerRoute( {
		id: 'organization',
		path: '/organizations/$orgId',
		title: __( 'Organization', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		enabled: organizationsEnabled,
		component: () =>
			import(
				/* webpackChunkName: "organization" */ './routes/organizations/OrganizationRoute'
			),
	} );
	registerRoute( {
		id: 'contact',
		path: '/contacts/$contactId',
		title: __( 'Contact', 'cliedesk' ),
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "contact" */ './routes/contacts/ContactRoute'
			),
	} );
	registerRoute( {
		id: 'setup',
		path: '/setup',
		title: __( 'Set up Cliedesk', 'cliedesk' ),
		capability: 'cliedesk_manage_settings',
		component: () =>
			import( /* webpackChunkName: "setup" */ './routes/SetupRoute' ),
	} );
	registerRoute( {
		id: 'settings.index',
		path: '/settings',
		title: __( 'Settings', 'cliedesk' ),
		component: () =>
			import(
				/* webpackChunkName: "settings" */ './routes/settings/SettingsIndexRoute'
			),
	} );
	registerRoute( {
		id: 'settings.area',
		path: '/settings/$area',
		title: __( 'Settings', 'cliedesk' ),
		component: () =>
			import(
				/* webpackChunkName: "settings" */ './routes/settings/SettingsRoute'
			),
	} );
	registerRoute( {
		id: 'settings.section',
		path: '/settings/$area/$section',
		title: __( 'Settings', 'cliedesk' ),
		component: () =>
			import(
				/* webpackChunkName: "settings" */ './routes/settings/SettingsRoute'
			),
	} );
	registerRoute( {
		id: 'settings.workspace.product',
		path: '/settings/workspace/products/$productId',
		title: __( 'Product', 'cliedesk' ),
		capability: 'cliedesk_manage_products',
		component: () =>
			import(
				/* webpackChunkName: "settings-products" */ './routes/settings/ProductDetailRoute'
			),
	} );
	registerRoute( {
		id: 'settings.team.person',
		path: '/settings/team/people/$userId',
		title: __( 'Person', 'cliedesk' ),
		capability: 'cliedesk_manage_team',
		component: () =>
			import(
				/* webpackChunkName: "settings-team-person" */ './routes/settings/PersonRoute'
			),
	} );
	registerRoute( {
		id: 'settings.team.role',
		path: '/settings/team/roles/$roleKey',
		title: __( 'Role', 'cliedesk' ),
		capability: 'cliedesk_manage_roles',
		component: () =>
			import(
				/* webpackChunkName: "settings-team-role" */ './routes/settings/RoleRoute'
			),
	} );
	registerRoute( {
		id: 'settings.team.team',
		path: '/settings/team/teams/$teamId',
		title: __( 'Team', 'cliedesk' ),
		capability: 'cliedesk_manage_team',
		component: () =>
			import(
				/* webpackChunkName: "settings-team-teams" */ './routes/settings/TeamRoute'
			),
	} );
	registerRoute( {
		id: 'reauth',
		path: '/_reauth',
		layout: 'bare',
		title: __( 'Signed in', 'cliedesk' ),
		component: () =>
			import( /* webpackChunkName: "reauth" */ './routes/ReauthRoute' ),
	} );

	registerNavItem( {
		id: 'inbox',
		label: __( 'Inbox', 'cliedesk' ),
		to: '/inbox',
		icon: Inbox,
		order: 5,
		capability: 'cliedesk_view_conversations',
		module: 'inbox',
	} );
	registerNavItem( {
		id: 'contacts',
		label: __( 'Contacts', 'cliedesk' ),
		to: '/contacts',
		icon: Users,
		order: 30,
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
	} );
	registerNavItem( {
		id: 'organizations',
		label: __( 'Organizations', 'cliedesk' ),
		/* translators: Short rail label for Organizations (about 9 characters). */
		shortLabel: __( 'Orgs', 'cliedesk' ),
		to: '/organizations',
		icon: Building2,
		order: 31,
		capability: 'cliedesk_view_contacts',
		module: 'contacts',
		enabled: organizationsEnabled,
	} );
	registerNavItem( {
		id: 'saved-replies',
		label: __( 'Saved replies', 'cliedesk' ),
		/* translators: Short rail label for Saved replies (about 9 characters). */
		shortLabel: __( 'Replies', 'cliedesk' ),
		to: '/automation/replies',
		icon: MessageSquareText,
		order: 35,
		capability: 'cliedesk_use_saved_replies',
		module: 'macros',
		enabled: () => can( 'cliedesk_view_conversations' ),
	} );
	registerNavItem( {
		id: 'knowledge',
		label: __( 'Knowledge', 'cliedesk' ),
		to: '/knowledge',
		icon: BookOpen,
		order: 36,
		capability: 'edit_cliedesk_articles',
		module: 'knowledge',
	} );
	registerNavItem( {
		id: 'reports',
		label: __( 'Reports', 'cliedesk' ),
		to: '/reports',
		icon: BarChart3,
		order: 38,
		capability: 'cliedesk_view_reports',
		module: 'reports',
	} );
	registerNavItem( {
		id: 'home',
		label: __( 'Home', 'cliedesk' ),
		to: '/',
		icon: House,
		order: 10,
	} );
	registerNavItem( {
		id: 'settings',
		label: __( 'Settings', 'cliedesk' ),
		to: '/settings',
		icon: Settings,
		area: 'footer',
		order: 100,
		// Shown when any settings section that needs a permission is open to me (Tags, People, sender rules… need
		// other capabilities than manage_settings). My profile alone stays in the account menu.
		enabled: () =>
			getSettingsSections().some(
				( s ) =>
					!! s.capability &&
					'cliedesk_access' !== s.capability &&
					can( s.capability ) &&
					hasModule( s.module )
			),
	} );

	registerSettingsSection( {
		area: 'workspace',
		id: 'general',
		label: __( 'General', 'cliedesk' ),
		order: 10,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-workspace" */ './routes/settings/WorkspaceSection'
			),
	} );
	registerSettingsSection( {
		area: 'workspace',
		id: 'languages',
		label: __( 'Languages', 'cliedesk' ),
		order: 20,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-languages" */ './routes/settings/LanguagesSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'custom-fields',
		label: __( 'Custom fields', 'cliedesk' ),
		order: 29,
		capability: 'cliedesk_manage_settings',
		module: 'fields',
		component: () =>
			import(
				/* webpackChunkName: "settings-custom-fields" */ './routes/settings/CustomFieldsSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'fields',
		label: __( 'Field access', 'cliedesk' ),
		order: 30,
		capability: 'cliedesk_manage_fields',
		module: 'fields',
		component: () =>
			import(
				/* webpackChunkName: "settings-fields" */ './routes/settings/FieldAccessSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'conversations',
		label: __( 'Conversations', 'cliedesk' ),
		order: 32,
		capability: 'cliedesk_manage_settings',
		module: 'conversations',
		component: () =>
			import(
				/* webpackChunkName: "settings-conversations" */ './routes/settings/ConversationsSection'
			),
	} );
	registerSettingsSection( {
		area: 'channels',
		id: 'widget',
		label: __( 'Chat widget', 'cliedesk' ),
		order: 32,
		capability: 'cliedesk_manage_settings',
		module: 'widget',
		component: () =>
			import(
				/* webpackChunkName: "settings-widget" */ './routes/settings/WidgetSection'
			),
	} );
	registerSettingsSection( {
		area: 'channels',
		id: 'portal',
		label: __( 'Portal', 'cliedesk' ),
		order: 33,
		capability: 'cliedesk_manage_portal',
		module: 'portal',
		component: () =>
			import(
				/* webpackChunkName: "settings-portal" */ './routes/settings/PortalSection'
			),
	} );
	registerSettingsSection( {
		area: 'channels',
		id: 'forms',
		label: __( 'Forms', 'cliedesk' ),
		order: 33,
		capability: 'cliedesk_manage_settings',
		module: 'requests',
		component: () =>
			import(
				/* webpackChunkName: "settings-forms" */ './routes/settings/FormsSection'
			),
	} );
	registerSettingsSection( {
		area: 'channels',
		id: 'help-center',
		label: __( 'Help center', 'cliedesk' ),
		order: 34,
		capability: 'cliedesk_manage_knowledge',
		module: 'knowledge',
		component: () =>
			import(
				/* webpackChunkName: "settings-help-center" */ './routes/settings/HelpCenterSection'
			),
	} );
	registerSettingsSection( {
		area: 'channels',
		id: 'notices',
		label: __( 'Notices', 'cliedesk' ),
		order: 35,
		capability: 'cliedesk_manage_knowledge',
		module: 'notices',
		component: () =>
			import(
				/* webpackChunkName: "settings-notices" */ './routes/settings/NoticesSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'satisfaction',
		label: __( 'Satisfaction (CSAT)', 'cliedesk' ),
		order: 34,
		capability: 'cliedesk_manage_settings',
		module: 'csat',
		component: () =>
			import(
				/* webpackChunkName: "settings-csat" */ './routes/settings/CsatSection'
			),
	} );
	registerSettingsSection( {
		area: 'automation',
		id: 'rules',
		label: __( 'Rules', 'cliedesk' ),
		order: 32,
		capability: 'cliedesk_manage_automation',
		module: 'automation',
		component: () =>
			import(
				/* webpackChunkName: "settings-rules" */ './routes/settings/RulesSection'
			),
	} );
	// SLA policies are Pro (FPS-06): the section hosts the fill of settings.sla and is listed only with one.
	registerSettingsSection( {
		area: 'automation',
		id: 'sla',
		label: __( 'SLA policies', 'cliedesk' ),
		order: 33,
		capability: 'cliedesk_manage_settings',
		module: 'sla',
		slot: 'settings.sla',
		component: () =>
			import(
				/* webpackChunkName: "settings-sla" */ './routes/settings/SlaPoliciesHost'
			),
	} );
	registerSettingsSection( {
		area: 'automation',
		id: 'business-hours',
		label: __( 'Business hours', 'cliedesk' ),
		order: 33,
		capability: 'cliedesk_manage_settings',
		module: 'sla',
		component: () =>
			import(
				/* webpackChunkName: "settings-business-hours" */ './routes/settings/BusinessHoursSection'
			),
	} );
	registerSettingsSection( {
		area: 'channels',
		id: 'channels',
		label: __( 'Channels', 'cliedesk' ),
		order: 30,
		capability: 'cliedesk_manage_channels',
		module: 'email',
		component: () =>
			import(
				/* webpackChunkName: "settings-channels" */ './routes/settings/ChannelsSection'
			),
	} );
	registerSettingsSection( {
		area: 'channels',
		id: 'email',
		label: __( 'Email', 'cliedesk' ),
		order: 31,
		capability: 'cliedesk_manage_email',
		module: 'email',
		component: () =>
			import(
				/* webpackChunkName: "settings-email" */ './routes/settings/EmailSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'custom-records',
		label: __( 'Custom records', 'cliedesk' ),
		order: 38,
		capability: 'cliedesk_manage_settings',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "settings-custom-records" */ './routes/settings/CustomRecordsSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'panel-layouts',
		label: __( 'Side panel layouts', 'cliedesk' ),
		order: 32,
		capability: 'cliedesk_manage_settings',
		module: 'inbox',
		component: () =>
			import(
				/* webpackChunkName: "settings-panel-layouts" */ './routes/settings/PanelLayoutsSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'types',
		label: __( 'Conversation types', 'cliedesk' ),
		order: 34,
		capability: 'cliedesk_manage_settings',
		module: 'conversations',
		component: () =>
			import(
				/* webpackChunkName: "settings-types" */ './routes/settings/TypesSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'tags',
		label: __( 'Tags', 'cliedesk' ),
		order: 36,
		capability: 'cliedesk_manage_tags',
		module: 'conversations',
		component: () =>
			import(
				/* webpackChunkName: "settings-tags" */ './routes/settings/TagsSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'checklists',
		label: __( 'Checklists', 'cliedesk' ),
		order: 37,
		capability: 'cliedesk_manage_settings',
		module: 'conversations',
		component: () =>
			import(
				/* webpackChunkName: "settings-checklists" */ './routes/settings/ChecklistsSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'queues',
		label: __( 'Queues', 'cliedesk' ),
		order: 33,
		capability: 'cliedesk_manage_settings',
		module: 'inbox',
		component: () =>
			import(
				/* webpackChunkName: "settings-queues" */ './routes/settings/QueuesSection'
			),
	} );
	registerSettingsSection( {
		area: 'conversations',
		id: 'customer-cards',
		label: __( 'Customer cards', 'cliedesk' ),
		order: 35,
		capability: 'cliedesk_manage_settings',
		module: 'contacts',
		component: () =>
			import(
				/* webpackChunkName: "settings-customer-cards" */ './routes/settings/CustomerCardsSection'
			),
	} );
	registerSettingsSection( {
		area: 'workspace',
		id: 'products',
		label: __( 'Products', 'cliedesk' ),
		order: 40,
		capability: 'cliedesk_manage_products',
		component: () =>
			import(
				/* webpackChunkName: "settings-products" */ './routes/settings/ProductsSection'
			),
	} );
	registerSettingsSection( {
		area: 'workspace',
		id: 'brands',
		label: __( 'Brand', 'cliedesk' ),
		order: 50,
		capability: 'cliedesk_manage_products',
		component: () =>
			import(
				/* webpackChunkName: "settings-brands" */ './routes/settings/BrandsSection'
			),
	} );

	registerSettingsSection( {
		area: 'workspace',
		id: 'features',
		label: __( 'Plan & features', 'cliedesk' ),
		order: 90,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-features" */ './routes/settings/FeaturesSection'
			),
	} );
	registerSettingsSection( {
		area: 'team',
		id: 'people',
		label: __( 'People', 'cliedesk' ),
		order: 10,
		capability: 'cliedesk_manage_team',
		wide: true,
		component: () =>
			import(
				/* webpackChunkName: "settings-team-people" */ './routes/settings/PeopleSection'
			),
	} );
	registerSettingsSection( {
		area: 'team',
		id: 'roles',
		label: __( 'Roles', 'cliedesk' ),
		order: 20,
		capability: 'cliedesk_manage_roles',
		wide: true,
		component: () =>
			import(
				/* webpackChunkName: "settings-team-roles" */ './routes/settings/RolesSection'
			),
	} );
	registerSettingsSection( {
		area: 'team',
		id: 'teams',
		label: __( 'Teams', 'cliedesk' ),
		order: 30,
		capability: 'cliedesk_manage_team',
		component: () =>
			import(
				/* webpackChunkName: "settings-team-teams" */ './routes/settings/TeamsSection'
			),
	} );
	// Custom statuses and automatic presence are Pro (FPS-07): the section hosts the fill of settings.statuses.
	registerSettingsSection( {
		area: 'team',
		id: 'statuses',
		label: __( 'Statuses', 'cliedesk' ),
		order: 35,
		capability: 'cliedesk_manage_team',
		slot: 'settings.statuses',
		component: () =>
			import(
				/* webpackChunkName: "settings-team-statuses" */ './routes/settings/StatusesHost'
			),
	} );
	// APP-07, APP-13: notification defaults, locks and escalation.
	registerSettingsSection( {
		area: 'team',
		id: 'notifications',
		label: __( 'Notifications', 'cliedesk' ),
		order: 37,
		capability: 'cliedesk_manage_settings',
		wide: true,
		component: () =>
			import(
				/* webpackChunkName: "settings-team-notifications" */ './routes/settings/NotificationsSection'
			),
	} );
	registerSettingsSection( {
		area: 'team',
		id: 'profile',
		label: __( 'My profile', 'cliedesk' ),
		order: 90,
		capability: 'cliedesk_access',
		component: () =>
			import(
				/* webpackChunkName: "settings-team-profile" */ './routes/settings/ProfileSection'
			),
	} );
	registerSettingsSection( {
		area: 'developer',
		id: 'health',
		label: __( 'Setup Health', 'cliedesk' ),
		order: 10,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-system" */ './routes/settings/HealthSection'
			),
	} );

	registerSettingsSection( {
		area: 'security',
		id: 'audit',
		label: __( 'Audit log', 'cliedesk' ),
		order: 25,
		capability: 'cliedesk_view_audit_log',
		component: () =>
			import(
				/* webpackChunkName: "settings-audit" */ './routes/settings/AuditSection'
			),
	} );

	registerSettingsSection( {
		area: 'security',
		id: 'history',
		label: __( 'Change history', 'cliedesk' ),
		order: 30,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-history" */ './routes/settings/SettingsHistorySection'
			),
	} );

	registerSettingsSection( {
		area: 'security',
		id: 'security',
		label: __( 'Security', 'cliedesk' ),
		order: 20,
		capability: 'cliedesk_manage_security',
		component: () =>
			import(
				/* webpackChunkName: "settings-security" */ './routes/settings/SecuritySection'
			),
	} );

	registerSettingsSection( {
		area: 'developer',
		id: 'config',
		label: __( 'Move configuration', 'cliedesk' ),
		order: 30,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-config" */ './routes/settings/ConfigTransferSection'
			),
	} );

	registerSettingsSection( {
		area: 'developer',
		id: 'addons',
		label: __( 'Add-on settings', 'cliedesk' ),
		order: 35,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-addons" */ './routes/settings/AddonSettingsSection'
			),
	} );

	registerSettingsSection( {
		area: 'developer',
		id: 'labs',
		label: __( 'Labs', 'cliedesk' ),
		order: 40,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-labs" */ './routes/settings/LabsSection'
			),
	} );

	registerSettingsSection( {
		area: 'developer',
		id: 'integrations',
		label: __( 'Integrations', 'cliedesk' ),
		order: 15,
		capability: 'cliedesk_manage_settings',
		component: () =>
			import(
				/* webpackChunkName: "settings-integrations" */ './routes/settings/IntegrationsSection'
			),
	} );

	registerSettingsSection( {
		area: 'channels',
		id: 'senders',
		label: __( 'Trusted and blocked senders', 'cliedesk' ),
		order: 30,
		capability: 'cliedesk_manage_spam',
		component: () =>
			import(
				/* webpackChunkName: "settings-senders" */ './routes/settings/SendersSection'
			),
	} );

	registerSettingsSection( {
		area: 'channels',
		id: 'arrival',
		label: __( 'Arrival rules', 'cliedesk' ),
		order: 40,
		capability: 'cliedesk_manage_spam',
		wide: true,
		component: () =>
			import(
				/* webpackChunkName: "settings-arrival" */ './routes/settings/ArrivalRulesSection'
			),
	} );

	registerSettingsSection( {
		area: 'security',
		id: 'blocked',
		label: __( 'Blocked', 'cliedesk' ),
		order: 50,
		capability: 'cliedesk_manage_spam',
		wide: true,
		component: () =>
			import(
				/* webpackChunkName: "settings-blocked" */ './routes/settings/BlockedSection'
			),
	} );

	registerEntityInvalidation( 'settings', ( c ) => [
		[ 'settings', String( c.entity_id ?? '' ) ].filter( Boolean ),
		[ 'health' ],
	] );
	// Notifications (entity type 13, private to their user): the bell refreshes live (APP-10).
	for ( const type of [ '13', 'notification' ] ) {
		registerEntityInvalidation( type, () => [ [ 'notifications' ] ] );
	}
	// Products (entity type 8) and brands (20): lists and details (Pro: the inheritance view) refresh live.
	for ( const type of [ '8', 'product' ] ) {
		registerEntityInvalidation( type, () => [ [ 'products' ] ] );
	}
	for ( const type of [ '20', 'brand' ] ) {
		registerEntityInvalidation( type, () => [
			[ 'brands' ],
			[ 'products' ],
		] );
	}
	// Conversations (entity type 1): inbox lists, counts and the open conversation refresh live.
	for ( const type of [ '1', 'conversation' ] ) {
		registerEntityInvalidation( type, ( c ) => {
			const id = Number( c.conversation_id ?? c.entity_id );
			return id
				? [ [ 'inbox' ], [ 'conversation', id ] ]
				: [ [ 'inbox' ] ];
		} );
	}
	// Contacts (2), views (15), tags (17) and field definitions (18).
	for ( const type of [ '2', 'contact' ] ) {
		registerEntityInvalidation( type, ( c ) => {
			const id = Number( c.entity_id );
			return id
				? [ [ 'contacts' ], [ 'contact', id ] ]
				: [ [ 'contacts' ] ];
		} );
	}
	// Organizations (3): lists, the organization page and its notes.
	for ( const type of [ '3', 'organization' ] ) {
		registerEntityInvalidation( type, ( c ) => {
			const id = Number( c.entity_id );
			return id
				? [ [ 'organizations' ], [ 'organization', id ] ]
				: [ [ 'organizations' ] ];
		} );
	}
	for ( const type of [ '15', 'view' ] ) {
		registerEntityInvalidation( type, () => [ [ 'inbox', 'views' ] ] );
	}
	// Saved replies (16): the library and the pickers (an open editor keeps its edits; a stale save gets 412).
	for ( const type of [ '16', 'saved_reply' ] ) {
		registerEntityInvalidation( type, () => [
			[ 'saved-replies', 'manage' ],
			[ 'saved-replies', 'categories' ],
			[ 'saved-replies', 'picker' ],
		] );
	}
	for ( const type of [ '17', 'tag' ] ) {
		registerEntityInvalidation( type, () => [ [ 'tags' ] ] );
	}
	for ( const type of [ '18', 'field' ] ) {
		registerEntityInvalidation( type, () => [ [ 'fields' ] ] );
	}
	registerEntityInvalidation( 'setting', () => [
		[ 'settings' ],
		[ 'health' ],
	] );
}
