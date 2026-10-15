/**
 * Shared widget types.
 */
export interface WidgetTexts {
	/** CHN-08: space tabs and help search. */
	spaceHome?: string;
	spaceMessages?: string;
	spaceHelp?: string;
	helpSearch?: string;
	noArticles?: string;
	stillHelp?: string;
	voiceNote?: string;
	openInPortal?: string;
	notifyMe?: string;
	notifyOff?: string;
	popularArticles?: string;
	suggested?: string;
	helped?: string;
	openArticle?: string;
	stopVoice?: string;
	noMicrophone?: string;
	title: string;
	greeting: string;
	open: string;
	close: string;
	/** ADM-25: the opt-in credit line. */
	credit?: string;
	placeholder: string;
	send: string;
	you: string;
	team: string;
	error: string;
	retry: string;
	newChat: string;
	back: string;
	name: string;
	email: string;
	unread: string;
	askEmail: string;
	emailSaved: string;
	save: string;
	emailNeeded: string;
	transcript: string;
	sentCopy: string;
	typing: string;
	/** CHN-24: read marker under the visitor's last message. */
	seen?: string;
	/** CHN-25, CHN-33: email confirmation with a code. */
	verifyLink?: string;
	confirmEmail?: string;
	verifyCode?: string;
	verifySend?: string;
	verified?: string;
	attach: string;
	remove: string;
	tooMany: string;
	away: string;
	awayUntil: string;
	leave: string;
	replyBy: string;
	/** CHN-26: place in line, estimate and the keep-waiting / email choice. */
	queuePosition?: string;
	queueEta?: string;
	queueChoice?: string;
	keepWaiting?: string;
	emailInstead?: string;
	replyMinutes: string;
	replyHours: string;
	replyDay: string;
	replyDays: string;
	csatThanks: string;
	csatWhy: string;
	csatComment: string;
	topic: string;
	details: string;
	yourEmail: string;
	gotIt: string;
	robot: string;
}

export interface WidgetConfig {
	product: string;
	api: string;
	panel: string;
	position: 'right' | 'left';
	/** ADM-25: show "Powered by Cliedesk" (off unless the admin opts in). */
	credit?: boolean;
	/** When to ask for the visitor's email (CHN-18). */
	askEmail: 'off' | 'optional' | 'required' | 'after_wait';
	/** CHN-08: spaces (Home first), the default one and the Home cards. */
	spaces?: Array< 'home' | 'messages' | 'help' >;
	defaultSpace?: 'home' | 'messages' | 'help';
	cards?: WidgetCard[];
	/** CHN-13: widget mode per page (search first or form first) and the form it opens. */
	/** CHN-15: search before the message button; whether this visitor may start a conversation. */
	searchFirst?: boolean;
	/** CHN-21: voice-note limit in seconds (0: off). */
	voiceSeconds?: number;
	/** CHN-32: WooCommerce checkout step of this page. */
	checkout?: '' | 'checkout' | 'thank_you';
	/** APP-16: Web Push for replies (null: off). */
	push?: { key: string; worker: string } | null;
	/** CHN-25: proof of the signed-in user (empty for guests); SEC-07: a token signed by the site's server. */
	identity?: string;
	/** CRM-07: same-site endpoint that gives the signed-in user's proof (also on cached pages). */
	identityUrl?: string;
	/** SEC-10: days the browser keeps the visitor session (0: until it closes). */
	sessionDays?: number;
	canStart?: boolean;
	pageModes?: Array< {
		pattern: string;
		mode: 'search' | 'form';
		type: string;
	} >;
	request?: Parameters< typeof import( './request' ).mount >[ 1 ];
	/** SEC-12: privacy mode and the consent category the widget waits for. */
	privacy?: 'standard' | 'private' | 'consent';
	consent?: string;
	/** AUT-65: the assistant shown on automated messages. */
	assistant?: { avatar: string };
	color: string;
	/** CHN-10: logo in the header, fixed theme, launcher style and distance from the screen edges (px). */
	logo?: string;
	theme?: 'auto' | 'light' | 'dark';
	launcher?: 'icon' | 'label';
	offset?: [ number, number ];
	/** CHN-19: WooCommerce product of the page and the cart, sent with messages. */
	shop?: Record< string, unknown >;
	/** Language of the texts (BCP 47) and writing direction (CHN-11, CHN-17). */
	lang?: string;
	dir?: 'ltr' | 'rtl';
	/** Topics offered while the team is away (CHN-29). */
	topics?: string[];
	/** PRO-12: quick-reply buttons on the widget home. */
	quickReplies?: string[];
	/** CHN-33: the hosted chat page fills the window, without the launcher. */
	fullPage?: boolean;
	/** CHN-33: values from the chat link (the email stays an unverified claim). */
	prefill?: WidgetPrefill;
	texts: WidgetTexts;
}

/** CHN-26: a waiting chat's place in line. */
export interface WidgetQueue {
	position: number;
	etaMinutes: number | null;
	offerEmail: boolean;
}

export interface WidgetPrefill {
	name?: string;
	email?: string;
	subject?: string;
	order?: string;
	fields?: Record< string, string >;
}

/** DEV-10: the view a JS call opens the panel on (prefill, showArticle, search). */
export type PanelStart =
	| { name: 'new'; text?: string }
	| { name: 'help'; article?: number; q?: string };

export interface PanelApi {
	/** Render the panel into the shadow-root mount; onClose is called by Esc and the close button. */
	open: (
		mount: HTMLElement,
		config: WidgetConfig,
		onClose: () => void,
		start?: PanelStart
	) => void;
	close: ( mount: HTMLElement ) => void;
	/** SEC-07: forget the session token so the next call starts a session with the new identity. */
	forget?: () => void;
}

export interface WidgetFile {
	name: string;
	size: number;
	/** INB-45: audio (voice notes) plays inline. */
	mime?: string;
	url: string;
}

export interface WidgetMessage {
	id: number;
	from: 'visitor' | 'team';
	name: string;
	/** AUT-65: written by a rule or the AI agent (shown with the assistant avatar). */
	bot?: boolean;
	text: string;
	files?: WidgetFile[];
	at: string;
	/** TEAM-06: the agent's customer-facing alias picture. */
	avatar?: string;
	/** INB-46: the message this one answers, quoted. */
	replyTo?: { id: number; excerpt: string };
	/** CHN-22: quick-reply buttons and link cards. */
	rich?: {
		options?: string[];
		/** COM-25: `product` makes it a live product card (price, stock, Add to cart). */
		cards?: {
			title: string;
			url: string;
			text?: string;
			product?: number;
			/** An order of the customer (title, text and url filled by the shop). */
			order?: number;
		}[];
		/** DEV-20: an extension card (the sidebar card schema). */
		card?: import( './card' ).ReplyCard;
		/** CHN-22: a short inline form. */
		form?: {
			title: string;
			submit: string;
			fields: Array< {
				key: string;
				label: string;
				type: 'text' | 'email' | 'number';
			} >;
		};
	} | null;
}

export interface WidgetConversation {
	uid: string;
	number?: number;
	subject: string;
	/** PRT-09: the status label the portal shows, and the conversation in the portal (signed-in customers). */
	status?: string;
	open: boolean;
	lastAt: string | null;
	portalUrl?: string;
}

/** While the team is away (CHN-29): when it is back, if known. */
/** Incident, maintenance or announcement notice (PRO-18). */
export interface WidgetNotice {
	uid: string;
	kind: string;
	title: string;
	body: string;
}

/** CSAT survey card (CSX-02). */
export interface WidgetSurvey {
	question: string;
	choices: Array< {
		value: number;
		symbol: string;
		label: string;
		positive: boolean;
	} >;
	reasons: Array< { key: string; label: string } >;
	rating: number | null;
	chosen: string[];
	comment: string;
	open: boolean;
}

/** Reply promise label (SLA-20). */
export type WidgetWithin = 'minutes' | 'hours' | 'day' | 'days' | null;

/** SLA-26: during a closure, its message; `hide` allows no new messages. */
export type WidgetOffline = {
	opensAt: string | null;
	closure?: string;
	hide?: boolean;
} | null;

/** Bot check a guest must pass before starting (SEC-19). */
export type WidgetChallenge = { provider: string; siteKey: string } | null;

/** CHN-08: a Home card. */
export interface WidgetCard {
	type: 'start' | 'search' | 'link' | 'text';
	title: string;
	text: string;
	url: string;
}
