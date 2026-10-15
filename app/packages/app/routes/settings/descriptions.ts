/**
 * Descriptions of the built-in settings sections (ADM-02), kept out of the start-up bundle: only the settings
 * page header and the command palette (both loaded on demand) show them.
 */
import { __ } from '@wordpress/i18n';

/**
 * The description of a built-in settings section.
 *
 * @param id Section id.
 */
export function sectionDescription( id: string ): string | undefined {
	return (
		{
			general: __( 'Workspace-wide defaults.', 'cliedesk' ),
			languages: __(
				'The languages you support, and which shared content is still missing a translation.',
				'cliedesk'
			),
			'custom-fields': __(
				'Fields of conversations, contacts and organizations: their type, options, rules and what customers see.',
				'cliedesk'
			),
			fields: __(
				'Which custom fields only server code can change, and which stay editable after close.',
				'cliedesk'
			),
			conversations: __(
				'Statuses and their order, when resolved conversations close and when a reply starts a new conversation.',
				'cliedesk'
			),
			widget: __(
				'The chat button on your website: colours, texts and where it may appear.',
				'cliedesk'
			),
			portal: __(
				'The page where customers see their requests, magic links and secure-link emails.',
				'cliedesk'
			),
			forms: __(
				'The request form for your pages, and which forms of other form plugins create conversations.',
				'cliedesk'
			),
			'help-center': __(
				'Web address, author line and archived articles.',
				'cliedesk'
			),
			notices: __(
				'Incident, maintenance and news notices for customers, and the site banner.',
				'cliedesk'
			),
			satisfaction: __(
				'Ask customers to rate resolved conversations.',
				'cliedesk'
			),
			rules: __(
				'When something happens and a conversation matches, run actions for you.',
				'cliedesk'
			),
			sla: __(
				'How fast you reply and resolve: targets per priority, business hours and which conversations they cover.',
				'cliedesk'
			),
			'business-hours': __(
				'When your team is open, in which time zone, and the days you are closed.',
				'cliedesk'
			),
			channels: __(
				'Product, queue, type and survey per channel account.',
				'cliedesk'
			),
			email: __(
				'How email is sent: connections, sender, layouts and the delivery log.',
				'cliedesk'
			),
			'custom-records': __(
				'Record types such as devices, contracts or warranties, and their fields.',
				'cliedesk'
			),
			'panel-layouts': __(
				'Which conversation side panel sections show, in what order and collapsed, per team and type.',
				'cliedesk'
			),
			types: __(
				'Types such as Request: who sees them, their statuses, form fields, title and when they close.',
				'cliedesk'
			),
			tags: __(
				'All tags with how often they are used: add, rename, merge and remove tags.',
				'cliedesk'
			),
			checklists: __(
				'Steps agents tick off for a kind of conversation, attached by type, and whether they must be done before resolving.',
				'cliedesk'
			),
			queues: __(
				'Shared inboxes: their order, who can see their conversations and which teams work them.',
				'cliedesk'
			),
			'customer-cards': __(
				'What the customer and organization cards show next to a conversation, for everyone or per role.',
				'cliedesk'
			),
			products: __(
				'What you support: names, identity, detection rules and lifecycle.',
				'cliedesk'
			),
			brands: __(
				'Your name, logos, colours, favicon, email From name and signature, used everywhere.',
				'cliedesk'
			),
			people: __(
				'Everyone who can open Cliedesk: invite, filter, change roles and deactivate.',
				'cliedesk'
			),
			roles: __(
				'What each role may do, compared side by side, and resetting a default role.',
				'cliedesk'
			),
			teams: __(
				'Groups of people with a supervisor, routing, signature and product scope.',
				'cliedesk'
			),
			statuses: __(
				'Custom statuses like Lunch or Training, Away reasons and automatic Away and Offline.',
				'cliedesk'
			),
			notifications: __(
				'Default notification preferences, events locked for everyone, and when unopened customer messages escalate.',
				'cliedesk'
			),
			profile: __(
				'Your name, signature, notifications and how customers see you.',
				'cliedesk'
			),
			health: __(
				'Checks of this site’s setup, with how to fix each problem.',
				'cliedesk'
			),
			features: __(
				'What Cliedesk Free includes, with no limits, and what Cliedesk Pro adds.',
				'cliedesk'
			),
			addons: __(
				'Settings that add-on plugins added to Cliedesk.',
				'cliedesk'
			),
			labs: __(
				'Experimental features you can switch on for this site.',
				'cliedesk'
			),
			config: __(
				'Copy settings, tags and the triage taxonomy to another site (for example from staging to live).',
				'cliedesk'
			),
			history: __(
				'Every settings change with who made it. Compare an earlier version with now and restore it.',
				'cliedesk'
			),
			audit: __(
				'Who changed what and when: settings, roles, exports, deletions and sign-ins. Filter, export and check it.',
				'cliedesk'
			),
			security: __(
				'Two-factor authentication, sign-in limits and emergency lockdown.',
				'cliedesk'
			),
			integrations: __(
				'Plugins Cliedesk works with on this site, and add-ons.',
				'cliedesk'
			),
			senders: __(
				'Senders whose mail always reaches the inbox, goes to Spam or is refused.',
				'cliedesk'
			),
			arrival: __(
				'Rules that block or sort new conversations before they reach the inbox, in order.',
				'cliedesk'
			),
			blocked: __(
				'Blocked contacts, IP addresses, ranges and countries, with who blocked them, when and why.',
				'cliedesk'
			),
		} as Record< string, string >
	 )[ id ];
}
