/**
 * Settings → Chat widget (CHN-10, CHN-09, CHN-30): on/off, colour (with a contrast check), position, title and
 * greeting, trusted websites and the embed code — with a live preview that renders the real widget panel inside a
 * Shadow DOM, exactly as visitors see it. The preview switches between desktop and mobile and between a guest
 * visitor and a signed-in customer; logo, theme, launcher style and offsets show in it as you type.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	LoadingRegion,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChatPanel } from '../../../widget/ChatPanel';
import type { WidgetClient } from '../../../widget/client';
import { STYLES } from '../../../widget/styles';
import type { WidgetConfig } from '../../../widget/types';
import { ActionError, Muted } from '../../inbox/components';
import { WidgetTexts, type TextOverrides } from './WidgetTexts';
import { settingsQuery } from '../../queries';
import { announceResult, apiFieldErrors } from '../../workspace/forms';
import { VolumeControls } from './VolumeControls';
import { WidgetSpaces } from './WidgetSpaces';

type Values = {
	enabled: boolean;
	color: string;
	position: 'right' | 'left';
	title: string;
	greeting: string;
	reply_promise: string;
	texts: TextOverrides;
	origins: string;
	/** SEC-12: privacy mode and the consent category. */
	privacy: 'standard' | 'private' | 'consent';
	consent_category: 'functional' | 'preferences' | 'statistics' | 'marketing';
	ask_email: 'off' | 'optional' | 'required' | 'after_wait';
	unseen_email_minutes: number;
	/** CHN-26: place in line and the email offer threshold. */
	queue_info: boolean;
	eta_offer_minutes: number;
	email_handover_minutes: number;
	availability: 'always' | 'agents' | 'hours' | 'offline';
	offline_topics: string;
	quick_replies: string;
	pages: 'all' | 'only' | 'except' | 'woo';
	page_patterns: string;
	post_types: string;
	audience: 'all' | 'guests' | 'users';
	devices: 'all' | 'desktop' | 'mobile';
	/** CHN-33: address of the hosted chat page. */
	chat_page: string;
	/** ADM-25: "Powered by Cliedesk" (off unless chosen). */
	show_credit: boolean;
	/** CHN-10: logo, theme, launcher style and offsets. */
	logo: string;
	theme: 'auto' | 'light' | 'dark';
	launcher: 'icon' | 'label';
	offset_x: number;
	offset_y: number;
	/** CHN-24: visitors see "Seen". */
	read_receipts: boolean;
	/** CHN-14: roles and segments. */
	roles: string;
	segments: string;
};

const DEFAULTS: Values = {
	enabled: true,
	color: '#2563eb',
	position: 'right',
	title: '',
	greeting: '',
	reply_promise: '',
	texts: {},
	origins: '',
	privacy: 'standard',
	consent_category: 'functional',
	ask_email: 'after_wait',
	unseen_email_minutes: 3,
	queue_info: true,
	eta_offer_minutes: 15,
	email_handover_minutes: 10,
	availability: 'always',
	offline_topics: '',
	quick_replies: '',
	pages: 'all',
	page_patterns: '',
	post_types: '',
	audience: 'all',
	devices: 'all',
	chat_page: 'support/chat',
	show_credit: false,
	logo: '',
	theme: 'auto',
	launcher: 'icon',
	offset_x: 20,
	offset_y: 20,
	read_receipts: true,
	roles: '',
	segments: '',
};

/**
 * WCAG contrast ratio of white text on a colour (the launcher, header and send button).
 *
 * @param hex #rgb or #rrggbb.
 */
export function contrastOnWhiteText( hex: string ): number | null {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec( hex.trim() );
	if ( ! m?.[ 1 ] ) {
		return null;
	}
	const full =
		m[ 1 ].length === 3
			? m[ 1 ]
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: m[ 1 ];
	const lum = [ 0, 2, 4 ]
		.map( ( i ) => parseInt( full.slice( i, i + 2 ), 16 ) / 255 )
		.map( ( c ) =>
			c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 )
		);
	const l =
		0.2126 * ( lum[ 0 ] ?? 0 ) +
		0.7152 * ( lum[ 1 ] ?? 0 ) +
		0.0722 * ( lum[ 2 ] ?? 0 );
	return Math.round( ( 1.05 / ( l + 0.05 ) ) * 100 ) / 100;
}

/** A client for the preview: sample conversation, nothing sent. */
const PREVIEW_CLIENT = {
	conversations: () =>
		Promise.resolve( {
			items: [ { uid: 'P1', subject: '', open: true, lastAt: null } ],
		} ),
	messages: () =>
		Promise.resolve( {
			open: true,
			items: [
				{
					id: 1,
					from: 'visitor' as const,
					name: '',
					text: __( 'Hi, where is my order?', 'cliedesk' ),
					at: '',
				},
				{
					id: 2,
					from: 'team' as const,
					name: __( 'Anna', 'cliedesk' ),
					text: __(
						'It ships today. You will get the tracking link by email.',
						'cliedesk'
					),
					at: '',
				},
			],
		} ),
	send: () => Promise.resolve( { id: 3 } ),
	start: () => Promise.resolve( { uid: 'P1' } ),
} as unknown as WidgetClient;

/**
 * The widget panel inside its own Shadow DOM, as on the website.
 *
 * @param props        Props.
 * @param props.config Config to preview.
 */
function Preview( {
	config,
	mobile = false,
}: {
	config: WidgetConfig;
	mobile?: boolean;
} ) {
	const host = useRef< HTMLDivElement >( null );
	const [ root, setRoot ] = useState< ShadowRoot | null >( null );
	useEffect( () => {
		if ( host.current && ! host.current.shadowRoot ) {
			const shadow = host.current.attachShadow( { mode: 'open' } );
			const style = document.createElement( 'style' );
			// Inside the preview the panel sits in the box, not fixed to the screen.
			style.textContent =
				STYLES +
				'.cdw-panel{position:absolute;inset:0 0 76px;width:auto;height:auto;max-width:none;animation:none}.cdw-launcher{position:absolute;bottom:8px}.cdw-right{right:8px}.cdw-left{left:8px}';
			shadow.appendChild( style );
			setRoot( shadow );
		}
	}, [] );
	return (
		<div
			ref={ host }
			role="group"
			aria-label={ __( 'Preview of the chat widget', 'cliedesk' ) }
			className={ `relative w-full overflow-hidden rounded-xl ${
				mobile ? 'h-[560px] max-w-[320px]' : 'h-[500px] max-w-[380px]'
			} cdw-theme-${ config.theme ?? 'auto' }` }
			style={ { [ '--cdw-accent' as string ]: config.color } }
		>
			{ root &&
				createPortal(
					<ChatPanel
						key={ config.texts.title + config.texts.greeting }
						config={ config }
						client={ PREVIEW_CLIENT }
						onClose={ () => undefined }
						preview
					/>,
					root as unknown as Element
				) }
			{ root &&
				createPortal(
					<span
						aria-hidden="true"
						className={ `cdw-launcher cdw-${ config.position }${
							config.launcher === 'label' ? ' cdw-label' : ''
						}` }
					>
						{ config.launcher === 'label'
							? config.texts.title
							: '' }
					</span>,
					root as unknown as Element
				) }
		</div>
	);
}

/**
 * Section.
 */
export default function WidgetSection() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'widget' ) );
	const embed = useQuery( {
		queryKey: [ 'widget', 'embed' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { snippet: string; siteHost: string } >(
					'widget-embed',
					{ signal }
				)
			).data,
	} );
	const [ draft, setDraft ] = useState< Partial< Values > >( {} );
	const stored = ( key: keyof Values ) =>
		q.data?.values?.[ key ]?.value as Values[ typeof key ] | undefined;
	const v: Values = {
		enabled:
			draft.enabled ?? Boolean( stored( 'enabled' ) ?? DEFAULTS.enabled ),
		color: draft.color ?? String( stored( 'color' ) ?? DEFAULTS.color ),
		position: ( draft.position ??
			stored( 'position' ) ??
			DEFAULTS.position ) as Values[ 'position' ],
		title: draft.title ?? String( stored( 'title' ) ?? '' ),
		greeting: draft.greeting ?? String( stored( 'greeting' ) ?? '' ),
		texts:
			draft.texts ??
			( ( stored( 'texts' ) as TextOverrides | undefined ) &&
			Array.isArray( stored( 'texts' ) )
				? {}
				: ( ( stored( 'texts' ) as TextOverrides | undefined ) ??
					{} ) ),
		reply_promise:
			draft.reply_promise ?? String( stored( 'reply_promise' ) ?? '' ),
		origins: draft.origins ?? String( stored( 'origins' ) ?? '' ),
		privacy: ( draft.privacy ??
			stored( 'privacy' ) ??
			DEFAULTS.privacy ) as Values[ 'privacy' ],
		consent_category: ( draft.consent_category ??
			stored( 'consent_category' ) ??
			DEFAULTS.consent_category ) as Values[ 'consent_category' ],
		ask_email: ( draft.ask_email ??
			stored( 'ask_email' ) ??
			DEFAULTS.ask_email ) as Values[ 'ask_email' ],
		queue_info:
			draft.queue_info ??
			Boolean( stored( 'queue_info' ) ?? DEFAULTS.queue_info ),
		eta_offer_minutes:
			draft.eta_offer_minutes ??
			Number(
				stored( 'eta_offer_minutes' ) ?? DEFAULTS.eta_offer_minutes
			),
		unseen_email_minutes:
			draft.unseen_email_minutes ??
			Number(
				stored( 'unseen_email_minutes' ) ??
					DEFAULTS.unseen_email_minutes
			),
		email_handover_minutes:
			draft.email_handover_minutes ??
			Number(
				stored( 'email_handover_minutes' ) ??
					DEFAULTS.email_handover_minutes
			),
		availability: ( draft.availability ??
			stored( 'availability' ) ??
			DEFAULTS.availability ) as Values[ 'availability' ],
		offline_topics:
			draft.offline_topics ?? String( stored( 'offline_topics' ) ?? '' ),
		quick_replies:
			draft.quick_replies ?? String( stored( 'quick_replies' ) ?? '' ),
		pages: ( draft.pages ??
			stored( 'pages' ) ??
			DEFAULTS.pages ) as Values[ 'pages' ],
		page_patterns:
			draft.page_patterns ?? String( stored( 'page_patterns' ) ?? '' ),
		post_types: draft.post_types ?? String( stored( 'post_types' ) ?? '' ),
		audience: ( draft.audience ??
			stored( 'audience' ) ??
			DEFAULTS.audience ) as Values[ 'audience' ],
		devices: ( draft.devices ??
			stored( 'devices' ) ??
			DEFAULTS.devices ) as Values[ 'devices' ],
		chat_page:
			draft.chat_page ??
			String( stored( 'chat_page' ) ?? DEFAULTS.chat_page ),
		show_credit:
			draft.show_credit ??
			Boolean( stored( 'show_credit' ) ?? DEFAULTS.show_credit ),
		logo: draft.logo ?? String( stored( 'logo' ) ?? '' ),
		theme: ( draft.theme ??
			stored( 'theme' ) ??
			DEFAULTS.theme ) as Values[ 'theme' ],
		launcher: ( draft.launcher ??
			stored( 'launcher' ) ??
			DEFAULTS.launcher ) as Values[ 'launcher' ],
		offset_x:
			draft.offset_x ??
			Number( stored( 'offset_x' ) ?? DEFAULTS.offset_x ),
		offset_y:
			draft.offset_y ??
			Number( stored( 'offset_y' ) ?? DEFAULTS.offset_y ),
		read_receipts:
			draft.read_receipts ??
			Boolean( stored( 'read_receipts' ) ?? DEFAULTS.read_receipts ),
		roles: draft.roles ?? String( stored( 'roles' ) ?? '' ),
		segments: draft.segments ?? String( stored( 'segments' ) ?? '' ),
	};
	// CHN-10: what the preview shows.
	const [ device, setDevice ] = useState< 'desktop' | 'mobile' >( 'desktop' );
	const [ who, setWho ] = useState< 'visitor' | 'customer' >( 'visitor' );
	const set = < K extends keyof Values >( k: K, value: Values[ K ] ) =>
		setDraft( ( d ) => ( { ...d, [ k ]: value } ) );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/widget', {
				body: { values: draft },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Chat widget saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'widget' ] } );
		},
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	const errors = apiFieldErrors( save.error );
	const ratio = contrastOnWhiteText( v.color );
	const config: WidgetConfig = {
		product: 'preview',
		api: '',
		panel: '',
		position: v.position,
		// A signed-in customer is never asked for an email; a guest as set.
		askEmail: who === 'customer' ? 'off' : v.ask_email,
		color: ratio === null ? DEFAULTS.color : v.color,
		logo: /^https?:\/\//.test( v.logo ) ? v.logo : '',
		theme: v.theme,
		launcher: v.launcher,
		texts: {
			title: v.title || __( 'Chat with us', 'cliedesk' ),
			greeting: v.greeting || __( 'Hi! How can we help?', 'cliedesk' ),
			open: __( 'Open chat', 'cliedesk' ),
			close: __( 'Close chat', 'cliedesk' ),
			placeholder: __( 'Write a message…', 'cliedesk' ),
			send: __( 'Send', 'cliedesk' ),
			you: __( 'You', 'cliedesk' ),
			team: __( 'Support', 'cliedesk' ),
			error: __(
				'We can’t connect right now. Please try again.',
				'cliedesk'
			),
			retry: __( 'Retry', 'cliedesk' ),
			newChat: __( 'New conversation', 'cliedesk' ),
			back: __( 'Back', 'cliedesk' ),
			name: __( 'Your name (optional)', 'cliedesk' ),
			email: __( 'Your email (optional, for replies)', 'cliedesk' ),
			unread: '%d',
			askEmail: __(
				'Leave your email and we will send the answer there too.',
				'cliedesk'
			),
			emailSaved: __(
				'Thanks! We will email you when we reply.',
				'cliedesk'
			),
			save: __( 'Save', 'cliedesk' ),
			emailNeeded: __( 'Enter your email address.', 'cliedesk' ),
			transcript: __( 'Email me this chat', 'cliedesk' ),
			sentCopy: __( 'A copy is on its way to your email.', 'cliedesk' ),
			/* translators: %s: name of the person typing. */
			typing: __( '%s is typing…', 'cliedesk' ),
			attach: __( 'Attach a file', 'cliedesk' ),
			/* translators: %s: file name. */
			remove: __( 'Remove %s', 'cliedesk' ),
			tooMany: __( 'Send at most 5 files at a time.', 'cliedesk' ),
			away: __( 'We’re away right now.', 'cliedesk' ),
			/* translators: %s: day and time the team is back, e.g. "Monday 09:00". */
			awayUntil: __( 'We’re away right now. We’re back %s.', 'cliedesk' ),
			leave: __(
				'Leave a message and we’ll reply by email.',
				'cliedesk'
			),
			/* translators: %s: day and time, like Tuesday 10:00. */
			replyBy: __( 'We’ll reply by %s.', 'cliedesk' ),
			replyMinutes: __( 'We usually reply within minutes.', 'cliedesk' ),
			replyHours: __(
				'We usually reply within a few hours.',
				'cliedesk'
			),
			replyDay: __( 'We usually reply within a day.', 'cliedesk' ),
			replyDays: __( 'We usually reply within a few days.', 'cliedesk' ),
			csatThanks: __( 'Thank you for your rating!', 'cliedesk' ),
			csatWhy: __( 'What went wrong?', 'cliedesk' ),
			csatComment: __( 'Anything else? (optional)', 'cliedesk' ),
			topic: __( 'What is it about?', 'cliedesk' ),
			details: __( 'Your message', 'cliedesk' ),
			yourEmail: __( 'Your email (we reply there)', 'cliedesk' ),
			gotIt: __(
				'Thanks! We got your message and will reply by email.',
				'cliedesk'
			),
			robot: __( 'Please confirm you are not a robot.', 'cliedesk' ),
		},
	};
	return (
		<div className="grid gap-8 lg:grid-cols-[1fr_380px]">
			<form
				noValidate
				className="flex flex-col gap-4"
				onSubmit={ ( e ) => {
					e.preventDefault();
					save.mutate();
				} }
			>
				<Checkbox
					isSelected={ v.enabled }
					onChange={ ( on ) => set( 'enabled', on ) }
				>
					{ __( 'Show the chat widget on this website', 'cliedesk' ) }
				</Checkbox>
				<Checkbox
					isSelected={ v.show_credit }
					onChange={ ( on ) => set( 'show_credit', on ) }
				>
					{ __(
						'Show “Powered by Cliedesk” in the widget',
						'cliedesk'
					) }
				</Checkbox>
				<Checkbox
					isSelected={ v.read_receipts }
					onChange={ ( on ) => set( 'read_receipts', on ) }
				>
					{ __(
						'Show visitors “Seen” when the team has read their message',
						'cliedesk'
					) }
				</Checkbox>
				<TextField
					label={ __( 'Colour', 'cliedesk' ) }
					description={ __(
						'A hex colour such as #2563eb.',
						'cliedesk'
					) }
					value={ v.color }
					onChange={ ( x ) => set( 'color', x ) }
					errorMessage={
						errors.color ??
						( ratio === null
							? __(
									'Enter a colour such as #2563eb.',
									'cliedesk'
								)
							: null )
					}
				/>
				{ ratio !== null && ratio < 4.5 && (
					<p role="status" className="text-sm text-warning-fg">
						{ sprintf(
							/* translators: %s: contrast ratio, e.g. 3.2. */
							__(
								'White text on this colour has a contrast of %s:1, below the 4.5:1 that many visitors need. Choose a darker colour.',
								'cliedesk'
							),
							String( ratio )
						) }
					</p>
				) }
				<TextField
					label={ __( 'Logo address', 'cliedesk' ) }
					description={ __(
						'An image URL shown in the widget header (https://…). Empty: no logo.',
						'cliedesk'
					) }
					value={ v.logo }
					onChange={ ( x ) => set( 'logo', x ) }
					errorMessage={ errors.logo ?? null }
				/>
				<Select
					label={ __( 'Theme', 'cliedesk' ) }
					value={ v.theme }
					onChange={ ( x ) => set( 'theme', x as Values[ 'theme' ] ) }
					options={ [
						{
							id: 'auto',
							label: __(
								'Follow the visitor’s device',
								'cliedesk'
							),
						},
						{ id: 'light', label: __( 'Light', 'cliedesk' ) },
						{ id: 'dark', label: __( 'Dark', 'cliedesk' ) },
					] }
				/>
				<Select
					label={ __( 'Launcher', 'cliedesk' ) }
					value={ v.launcher }
					onChange={ ( x ) =>
						set( 'launcher', x as Values[ 'launcher' ] )
					}
					options={ [
						{ id: 'icon', label: __( 'Round icon', 'cliedesk' ) },
						{
							id: 'label',
							label: __( 'Icon with the title', 'cliedesk' ),
						},
					] }
				/>
				<div className="flex gap-4">
					<TextField
						type="number"
						label={ __(
							'Distance from the side (px)',
							'cliedesk'
						) }
						value={ String( v.offset_x ) }
						onChange={ ( x ) => set( 'offset_x', Number( x ) ) }
						errorMessage={ errors.offset_x ?? null }
					/>
					<TextField
						type="number"
						label={ __(
							'Distance from the bottom (px)',
							'cliedesk'
						) }
						value={ String( v.offset_y ) }
						onChange={ ( x ) => set( 'offset_y', Number( x ) ) }
						errorMessage={ errors.offset_y ?? null }
					/>
				</div>
				<Select
					label={ __( 'Position', 'cliedesk' ) }
					value={ v.position }
					onChange={ ( x ) =>
						set( 'position', x as Values[ 'position' ] )
					}
					options={ [
						{
							id: 'right',
							label: __( 'Bottom right', 'cliedesk' ),
						},
						{ id: 'left', label: __( 'Bottom left', 'cliedesk' ) },
					] }
				/>
				<TextField
					label={ __( 'Title', 'cliedesk' ) }
					value={ v.title }
					placeholder={ __( 'Chat with us', 'cliedesk' ) }
					onChange={ ( x ) => set( 'title', x ) }
					errorMessage={ errors.title ?? null }
				/>
				<TextField
					label={ __( 'Greeting', 'cliedesk' ) }
					multiline
					rows={ 2 }
					value={ v.greeting }
					onChange={ ( x ) => set( 'greeting', x ) }
					errorMessage={ errors.greeting ?? null }
				/>
				<TextField
					label={ __( 'Reply promise', 'cliedesk' ) }
					description={ __(
						'Shown during business hours while someone on the team is online. Empty: “We usually reply within a few hours.”',
						'cliedesk'
					) }
					value={ v.reply_promise }
					onChange={ ( x ) => set( 'reply_promise', x ) }
					errorMessage={ errors.reply_promise ?? null }
				/>
				<TextField
					label={ __(
						'Other websites that may show the widget',
						'cliedesk'
					) }
					description={ __(
						'Comma-separated, for example shop.example.com, *.example.com. This website is always allowed.',
						'cliedesk'
					) }
					value={ v.origins }
					onChange={ ( x ) => set( 'origins', x ) }
					errorMessage={ errors.origins ?? null }
				/>
				<Select
					label={ __( 'Privacy', 'cliedesk' ) }
					description={ __(
						'Visitors who send Do Not Track or Global Privacy Control are never tracked.',
						'cliedesk'
					) }
					value={ v.privacy }
					onChange={ ( x ) =>
						set( 'privacy', x as Values[ 'privacy' ] )
					}
					options={ [
						{ id: 'standard', label: __( 'Standard', 'cliedesk' ) },
						{
							id: 'private',
							label: __(
								'Private: store nothing until the visitor opens the chat',
								'cliedesk'
							),
						},
						{
							id: 'consent',
							label: __(
								'Wait for consent (WP Consent API)',
								'cliedesk'
							),
						},
					] }
				/>
				{ v.privacy === 'consent' && (
					<Select
						label={ __( 'Consent category', 'cliedesk' ) }
						value={ v.consent_category }
						onChange={ ( x ) =>
							set(
								'consent_category',
								x as Values[ 'consent_category' ]
							)
						}
						options={ [
							{
								id: 'functional',
								label: __( 'Functional', 'cliedesk' ),
							},
							{
								id: 'preferences',
								label: __( 'Preferences', 'cliedesk' ),
							},
							{
								id: 'statistics',
								label: __( 'Statistics', 'cliedesk' ),
							},
							{
								id: 'marketing',
								label: __( 'Marketing', 'cliedesk' ),
							},
						] }
					/>
				) }
				<Select
					label={ __( 'Ask for the visitor’s email', 'cliedesk' ) }
					value={ v.ask_email }
					onChange={ ( x ) =>
						set( 'ask_email', x as Values[ 'ask_email' ] )
					}
					options={ [
						{
							id: 'after_wait',
							label: __(
								'Only when no one answered for 2 minutes',
								'cliedesk'
							),
						},
						{
							id: 'optional',
							label: __(
								'Before the chat, optional',
								'cliedesk'
							),
						},
						{
							id: 'required',
							label: __(
								'Before the chat, required',
								'cliedesk'
							),
						},
						{ id: 'off', label: __( 'Never', 'cliedesk' ) },
					] }
				/>
				<Checkbox
					isSelected={ v.queue_info }
					onChange={ ( on ) => set( 'queue_info', on ) }
				>
					{ __(
						'Show waiting visitors their place in line and how long it may take',
						'cliedesk'
					) }
				</Checkbox>
				{ v.queue_info && (
					<TextField
						label={ __(
							'Offer an email answer when the wait is longer than (minutes)',
							'cliedesk'
						) }
						inputMode="numeric"
						value={ String( v.eta_offer_minutes ) }
						onChange={ ( x ) =>
							set(
								'eta_offer_minutes',
								Number( x.replace( /\D/g, '' ) || 0 )
							)
						}
						errorMessage={ errors.eta_offer_minutes ?? null }
					/>
				) }
				<TextField
					label={ __(
						'Email replies the visitor has not seen after (minutes)',
						'cliedesk'
					) }
					description={ __( '0 turns this off.', 'cliedesk' ) }
					inputMode="numeric"
					value={ String( v.unseen_email_minutes ) }
					onChange={ ( x ) =>
						set(
							'unseen_email_minutes',
							Number( x.replace( /\D/g, '' ) || 0 )
						)
					}
					errorMessage={ errors.unseen_email_minutes ?? null }
				/>
				<TextField
					label={ __(
						'Continue unanswered chats by email after (minutes)',
						'cliedesk'
					) }
					description={ __(
						'When no agent has replied, the chat moves to email if the visitor gave one, and is routed again. 0 turns this off.',
						'cliedesk'
					) }
					inputMode="numeric"
					value={ String( v.email_handover_minutes ) }
					onChange={ ( x ) =>
						set(
							'email_handover_minutes',
							Number( x.replace( /\D/g, '' ) || 0 )
						)
					}
					errorMessage={ errors.email_handover_minutes ?? null }
				/>
				<Select
					label={ __( 'Live chat', 'cliedesk' ) }
					value={ v.availability }
					onChange={ ( x ) =>
						set( 'availability', x as Values[ 'availability' ] )
					}
					options={ [
						{ id: 'always', label: __( 'Always on', 'cliedesk' ) },
						{
							id: 'agents',
							label: __(
								'While an agent is online; otherwise visitors leave a message',
								'cliedesk'
							),
						},
						{
							id: 'hours',
							label: __(
								'During business hours; outside them visitors leave a message',
								'cliedesk'
							),
						},
						{
							id: 'offline',
							label: __(
								'Off; visitors leave a message and get the answer by email',
								'cliedesk'
							),
						},
					] }
				/>
				{ v.availability !== 'always' && (
					<TextField
						label={ __(
							'Topics for messages left while away',
							'cliedesk'
						) }
						description={ __(
							'One per line, up to 8. Empty: Track an order, Return or exchange, Product question, Something else. Business hours are set under Business hours.',
							'cliedesk'
						) }
						multiline
						rows={ 4 }
						value={ v.offline_topics }
						onChange={ ( x ) => set( 'offline_topics', x ) }
						errorMessage={ errors.offline_topics ?? null }
					/>
				) }
				<TextField
					label={ __( 'Quick-reply buttons', 'cliedesk' ) }
					description={ __(
						'Shown when the widget opens, one per line, up to 6 (like “Where is my order?”). A tap starts a chat with that text. Per language: the “quickReplies” text, separated by |.',
						'cliedesk'
					) }
					multiline
					rows={ 3 }
					value={ v.quick_replies }
					onChange={ ( x ) => set( 'quick_replies', x ) }
					errorMessage={ errors.quick_replies ?? null }
				/>
				<WidgetTexts
					value={ v.texts }
					onChange={ ( x ) => set( 'texts', x ) }
				/>
				<fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
					<legend className="px-1 text-sm font-medium">
						{ __( 'Where the widget shows', 'cliedesk' ) }
					</legend>
					<Select
						label={ __( 'Pages', 'cliedesk' ) }
						value={ v.pages }
						onChange={ ( x ) =>
							set( 'pages', x as Values[ 'pages' ] )
						}
						options={ [
							{ id: 'all', label: __( 'All pages', 'cliedesk' ) },
							{
								id: 'only',
								label: __( 'Only these pages', 'cliedesk' ),
							},
							{
								id: 'except',
								label: __(
									'All pages except these',
									'cliedesk'
								),
							},
							{
								id: 'woo',
								label: __(
									'Shop pages only (WooCommerce)',
									'cliedesk'
								),
							},
						] }
					/>
					{ ( v.pages === 'only' || v.pages === 'except' ) && (
						<TextField
							label={ __( 'Page addresses', 'cliedesk' ) }
							description={ __(
								'One per line, for example /contact or /shop/* (the star matches anything).',
								'cliedesk'
							) }
							multiline
							rows={ 3 }
							value={ v.page_patterns }
							onChange={ ( x ) => set( 'page_patterns', x ) }
						/>
					) }
					<TextField
						label={ __( 'Chat page address', 'cliedesk' ) }
						description={ __(
							'A page with only the chat, for links in emails and on social media, e.g. support/chat. Add ?subject=…&order=…&email=… to fill them in. Empty: no chat page.',
							'cliedesk'
						) }
						value={ v.chat_page }
						onChange={ ( x ) => set( 'chat_page', x.trim() ) }
						errorMessage={ errors.chat_page ?? null }
						maxLength={ 60 }
					/>
					<TextField
						label={ __( 'Only on these post types', 'cliedesk' ) }
						description={ __(
							'Comma-separated, for example product, page. Empty: any.',
							'cliedesk'
						) }
						value={ v.post_types }
						onChange={ ( x ) => set( 'post_types', x ) }
					/>
					<Select
						label={ __( 'Visitors', 'cliedesk' ) }
						value={ v.audience }
						onChange={ ( x ) =>
							set( 'audience', x as Values[ 'audience' ] )
						}
						options={ [
							{ id: 'all', label: __( 'Everyone', 'cliedesk' ) },
							{
								id: 'guests',
								label: __( 'Guests only', 'cliedesk' ),
							},
							{
								id: 'users',
								label: __( 'Logged-in users only', 'cliedesk' ),
							},
						] }
					/>
					<Select
						label={ __( 'Devices', 'cliedesk' ) }
						value={ v.devices }
						onChange={ ( x ) =>
							set( 'devices', x as Values[ 'devices' ] )
						}
						options={ [
							{
								id: 'all',
								label: __( 'Desktop and mobile', 'cliedesk' ),
							},
							{
								id: 'desktop',
								label: __( 'Desktop only', 'cliedesk' ),
							},
							{
								id: 'mobile',
								label: __( 'Mobile only', 'cliedesk' ),
							},
						] }
					/>
					<TextField
						label={ __(
							'Roles of signed-in visitors',
							'cliedesk'
						) }
						description={ __(
							'Comma-separated, for example customer, subscriber. Empty: every role.',
							'cliedesk'
						) }
						value={ v.roles }
						onChange={ ( x ) => set( 'roles', x ) }
						errorMessage={ errors.roles ?? null }
					/>
					<TextField
						label={ __( 'Customer segments', 'cliedesk' ) }
						description={ __(
							'Segment numbers, comma-separated: only signed-in customers in one of them see the widget. Empty: everyone.',
							'cliedesk'
						) }
						value={ v.segments }
						onChange={ ( x ) => set( 'segments', x ) }
						errorMessage={ errors.segments ?? null }
					/>
				</fieldset>
				{ embed.data && (
					<div className="flex flex-col gap-1">
						<p className="text-sm font-medium">
							{ __(
								'Embed code for other websites',
								'cliedesk'
							) }
						</p>
						<code className="block overflow-x-auto rounded-md bg-sunken p-2 text-xs">
							{ embed.data.snippet }
						</code>
						<Muted>
							{ sprintf(
								/* translators: %s: this website's host name. */
								__(
									'On %s the widget appears by itself; no code is needed.',
									'cliedesk'
								),
								embed.data.siteHost
							) }
						</Muted>
					</div>
				) }
				<div>
					<Button
						type="submit"
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={
							! Object.keys( draft ).length || ratio === null
						}
					>
						{ __( 'Save chat widget', 'cliedesk' ) }
					</Button>
				</div>
				{ ! Object.keys( errors ).length && (
					<ActionError error={ save.error } />
				) }
			</form>
			<WidgetSpaces />
			<VolumeControls />
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium">
					{ __( 'Preview', 'cliedesk' ) }
				</p>
				<div className="flex flex-wrap gap-2">
					<Select
						label={ __( 'Device', 'cliedesk' ) }
						value={ device }
						onChange={ ( x ) =>
							setDevice( x as 'desktop' | 'mobile' )
						}
						options={ [
							{
								id: 'desktop',
								label: __( 'Desktop', 'cliedesk' ),
							},
							{ id: 'mobile', label: __( 'Mobile', 'cliedesk' ) },
						] }
					/>
					<Select
						label={ __( 'Seen by', 'cliedesk' ) }
						value={ who }
						onChange={ ( x ) =>
							setWho( x as 'visitor' | 'customer' )
						}
						options={ [
							{
								id: 'visitor',
								label: __( 'A guest visitor', 'cliedesk' ),
							},
							{
								id: 'customer',
								label: __( 'A signed-in customer', 'cliedesk' ),
							},
						] }
					/>
				</div>
				<Preview
					key={ `${ device }-${ who }` }
					config={ config }
					mobile={ device === 'mobile' }
				/>
			</div>
		</div>
	);
}
