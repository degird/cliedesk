/**
 * Profile form (TEAM-05, TEAM-06), shared by "My profile" and an administrator editing a person. Fields an
 * administrator locked for the person's role are read-only on their own profile ("Locked by an administrator");
 * the server rejects them with 403 `cliedesk_field_locked`, which locks them here too. Only changed fields are sent.
 */
import {
	api,
	getBoot,
	isApiError,
	useMutation,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	RadioGroup,
	Select,
	Slot,
	Switch,
	TextField,
	setThemePreference,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useMemo, useState, type FormEvent } from 'react';
import { setLocalPrefs } from '../prefs';
import {
	ErrorSummary,
	announceResult,
	apiFieldErrors,
	type SummaryItem,
} from '../workspace/forms';
import { ImagePicker } from '../workspace/ImagePicker';
import {
	NOTIFY_CHANNELS,
	NOTIFY_EVENTS,
	normaliseProfile,
	profileKey,
	teamKeys,
	type Notifications,
	type Profile,
	type ProfileField,
	type ProfileInput,
	type DigestChoice,
	type ThemeChoice,
} from './api';
import { serverMessage } from './components';
import { PushDevice } from './PushDevice';
import {
	notifyChannelLabel,
	notifyEventLabel,
	profileFieldLabel,
	themeLabel,
} from './labels';

export const fieldId = ( f: ProfileField ) => `cd-profile-${ f }`;

const LANG = /^[a-z]{2,3}([_-][A-Za-z]{2,4})?$/;

/** Time zones the browser knows (IANA), or null when it cannot list them. */
export function timeZones(): string[] | null {
	const intl = Intl as unknown as {
		supportedValuesOf?: ( key: string ) => string[];
	};
	try {
		return intl.supportedValuesOf?.( 'timeZone' ) ?? null;
	} catch {
		return null;
	}
}

interface Values {
	displayName: string;
	jobTitle: string;
	timezone: string;
	languages: string;
	signature: string;
	notifications: Notifications;
	theme: ThemeChoice;
	shortcuts: boolean;
	alias: string;
	aliasAvatarAttachmentId: number | null;
	collisionPause: CollisionChoice;
	notificationDigest: DigestChoice;
}

/** Collision pause choice (INB-60): workspace default, on or off. */
export type CollisionChoice = 'default' | 'on' | 'off';

/**
 * Form choice for the stored value.
 *
 * @param v Stored value (null: workspace default).
 */
export function collisionChoice( v: boolean | null ): CollisionChoice {
	if ( v === null ) {
		return 'default';
	}
	return v ? 'on' : 'off';
}

/**
 * Stored value for the form choice.
 *
 * @param c Choice.
 */
export function collisionValue( c: CollisionChoice ): boolean | null {
	return c === 'default' ? null : c === 'on';
}

function initial( p: Profile ): Values {
	return {
		displayName: p.displayName,
		jobTitle: p.jobTitle,
		timezone: p.timezone,
		languages: p.languages.join( ', ' ),
		signature: p.signature,
		notifications: p.notifications,
		theme: p.theme,
		shortcuts: p.shortcuts,
		alias: p.alias,
		aliasAvatarAttachmentId: p.aliasAvatarAttachmentId,
		collisionPause: collisionChoice( p.collisionPause ),
		notificationDigest: p.notificationDigest,
	};
}

/**
 * Language codes from the input ("en, de pt_BR").
 *
 * @param text Input.
 */
export function parseLanguages( text: string ): string[] {
	return [
		...new Set(
			text
				.split( /[\s,;]+/ )
				.map( ( s ) => s.trim() )
				.filter( Boolean )
		),
	];
}

/**
 * Client checks of the profile (the server validates again).
 *
 * @param v Values.
 */
export function validateProfile(
	v: Values
): Partial< Record< ProfileField, string > > {
	const out: Partial< Record< ProfileField, string > > = {};
	if ( ! v.displayName.trim() || v.displayName.length > 191 ) {
		out.displayName = __(
			'Enter a name of up to 191 characters.',
			'cliedesk'
		);
	}
	if ( parseLanguages( v.languages ).some( ( l ) => ! LANG.test( l ) ) ) {
		out.languages = __(
			'Use language codes such as en, de or pt_BR.',
			'cliedesk'
		);
	}
	return out;
}

/**
 * Changed fields, without the locked ones.
 *
 * @param p      Profile as loaded.
 * @param v      Form values.
 * @param locked Locked fields.
 */
export function profilePayload(
	p: Profile,
	v: Values,
	locked: Set< ProfileField >
): ProfileInput {
	const out: ProfileInput = {};
	const set = < K extends keyof ProfileInput >(
		k: K & ProfileField,
		value: ProfileInput[ K ],
		before: unknown
	) => {
		if (
			! locked.has( k ) &&
			JSON.stringify( value ) !== JSON.stringify( before )
		) {
			out[ k ] = value;
		}
	};
	set( 'displayName', v.displayName.trim(), p.displayName );
	set( 'jobTitle', v.jobTitle.trim(), p.jobTitle );
	set( 'timezone', v.timezone, p.timezone );
	set( 'languages', parseLanguages( v.languages ), p.languages );
	set( 'signature', v.signature, p.signature );
	set( 'notifications', v.notifications, p.notifications );
	set( 'theme', v.theme, p.theme );
	set( 'notificationDigest', v.notificationDigest, p.notificationDigest );
	set( 'shortcuts', v.shortcuts, p.shortcuts );
	set(
		'collisionPause',
		collisionValue( v.collisionPause ),
		p.collisionPause
	);
	set( 'alias', v.alias.trim(), p.alias );
	set(
		'aliasAvatarAttachmentId',
		v.aliasAvatarAttachmentId,
		p.aliasAvatarAttachmentId
	);
	return out;
}

export interface ProfileFormProps {
	profile: Profile;
	/** `self`: the signed-in user's own profile (locks apply); `admin`: someone else's. */
	mode: 'self' | 'admin';
}

export function ProfileForm( { profile, mode }: ProfileFormProps ) {
	const qc = useQueryClient();
	const [ v, setV ] = useState< Values >( () => initial( profile ) );
	const [ base, setBase ] = useState< Profile >( profile );
	const [ extraLocked, setExtraLocked ] = useState< ProfileField[] >( [] );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ server, setServer ] = useState<
		Partial< Record< ProfileField, string > >
	>( {} );
	const [ saved, setSaved ] = useState( false );
	const zones = useMemo( () => timeZones(), [] );
	const locked = useMemo(
		() =>
			new Set< ProfileField >(
				mode === 'self' ? [ ...base.locked, ...extraLocked ] : []
			),
		[ mode, base.locked, extraLocked ]
	);
	const path =
		mode === 'self' ? 'profile' : `users/${ profile.userId }/profile`;

	const save = useMutation( {
		mutationFn: ( body: ProfileInput ) =>
			api.patch< Profile >( path, { body } ),
		onSuccess: ( r, body ) => {
			const next = normaliseProfile( r.data );
			setBase( next );
			setServer( {} );
			setSummary( [] );
			setSaved( true );
			qc.setQueryData(
				mode === 'self'
					? profileKey
					: teamKeys.userProfile( next.userId ),
				next
			);
			if ( mode === 'self' && body.theme ) {
				setThemePreference( body.theme );
			}
			if ( mode === 'self' ) {
				// Theme and the shortcut switch are also display preferences (prefs store, INB-07, INB-08).
				setLocalPrefs( {
					theme: body.theme,
					shortcuts: body.shortcuts,
				} );
			}
			void qc.invalidateQueries( { queryKey: teamKeys.allAgents } );
			announceResult( __( 'Profile saved.', 'cliedesk' ) );
		},
		onError: ( e ) => {
			const fields = apiFieldErrors( e );
			const next: Partial< Record< ProfileField, string > > = {};
			const items: SummaryItem[] = [];
			const lockedNow: ProfileField[] = [];
			for ( const [ key, message ] of Object.entries( fields ) ) {
				const f = key.split( '.' )[ 0 ] as ProfileField;
				if ( next[ f ] ) {
					continue;
				}
				next[ f ] = message;
				items.push( {
					fieldId: fieldId( f ),
					message: sprintf(
						/* translators: 1: field label, 2: error message. */
						__( '%1$s: %2$s', 'cliedesk' ),
						profileFieldLabel( f ),
						message
					),
				} );
				if ( isApiError( e ) && e.code === 'cliedesk_field_locked' ) {
					lockedNow.push( f );
				}
			}
			if ( lockedNow.length ) {
				setExtraLocked( ( old ) => [
					...new Set( [ ...old, ...lockedNow ] ),
				] );
			}
			setServer( next );
			setSummary( items );
		},
	} );

	const client = validateProfile( v );
	const err = ( f: ProfileField ) =>
		client[ f ] ?? ( locked.has( f ) ? null : server[ f ] ) ?? null;
	const lockNote = __( 'Locked by an administrator.', 'cliedesk' );
	// APP-07: events an administrator set for everyone (they do not bind an administrator editing someone).
	const eventLocks = new Set(
		mode === 'self' ? ( base.notificationLocks ?? [] ) : []
	);
	const desc = ( f: ProfileField, text?: string ) =>
		locked.has( f ) ? lockNote : text;
	const upd = < K extends keyof Values >( k: K, value: Values[ K ] ) => {
		setSaved( false );
		setV( ( o ) => ( { ...o, [ k ]: value } ) );
	};

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSaved( false );
		const errors = validateProfile( v );
		const items = ( Object.keys( errors ) as ProfileField[] ).map(
			( f ) => ( {
				fieldId: fieldId( f ),
				message: errors[ f ] as string,
			} )
		);
		setSummary( items );
		if ( items.length ) {
			return;
		}
		const body = profilePayload( base, v, locked );
		if ( ! Object.keys( body ).length ) {
			setSaved( true );
			return;
		}
		save.mutate( body );
	};

	const workspaceTz = getBoot().workspace.timezone;
	const tzOptions = [
		{
			id: '',
			label: sprintf(
				/* translators: %s: workspace time zone. */
				__( 'Workspace time zone (%s)', 'cliedesk' ),
				workspaceTz || 'UTC'
			),
		},
		...( zones ?? [] ).map( ( z ) => ( { id: z, label: z } ) ),
	];
	if ( v.timezone && zones && ! zones.includes( v.timezone ) ) {
		tzOptions.push( { id: v.timezone, label: v.timezone } );
	}
	const lockedError =
		isApiError( save.error ) && save.error.code === 'cliedesk_field_locked';

	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-6">
			<ErrorSummary items={ summary } />
			{ save.isError && ( lockedError || ! summary.length ) && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( save.error ) }
				/>
			) }
			{ mode === 'self' && locked.size > 0 && (
				<Banner
					tone="info"
					title={ __(
						'Some fields are locked by an administrator.',
						'cliedesk'
					) }
				>
					{ [ ...locked ].map( profileFieldLabel ).join( ', ' ) }
				</Banner>
			) }

			<section
				aria-labelledby="cd-profile-about"
				className="flex flex-col gap-4"
			>
				<h2 id="cd-profile-about" className="text-lg font-semibold">
					{ __( 'About you', 'cliedesk' ) }
				</h2>
				<div className="flex items-center gap-3">
					{ profile.avatar && (
						<img
							src={ profile.avatar }
							alt=""
							className="size-12 rounded-full"
						/>
					) }
					<p className="text-sm text-fg-muted">
						{ __(
							'The picture comes from WordPress (Gravatar).',
							'cliedesk'
						) }
						<br />
						<bdi>{ profile.email }</bdi>
					</p>
				</div>
				<TextField
					id={ fieldId( 'displayName' ) }
					label={ profileFieldLabel( 'displayName' ) }
					value={ v.displayName }
					onChange={ ( x ) => upd( 'displayName', x ) }
					isReadOnly={ locked.has( 'displayName' ) }
					description={ desc( 'displayName' ) }
					errorMessage={ err( 'displayName' ) }
					isRequired
				/>
				<TextField
					id={ fieldId( 'jobTitle' ) }
					label={ profileFieldLabel( 'jobTitle' ) }
					value={ v.jobTitle }
					onChange={ ( x ) => upd( 'jobTitle', x ) }
					isReadOnly={ locked.has( 'jobTitle' ) }
					description={ desc( 'jobTitle' ) }
					errorMessage={ err( 'jobTitle' ) }
				/>
				{ zones ? (
					<Select
						id={ fieldId( 'timezone' ) }
						label={ profileFieldLabel( 'timezone' ) }
						value={ v.timezone }
						onChange={ ( x ) => upd( 'timezone', x ) }
						isDisabled={ locked.has( 'timezone' ) }
						description={ desc( 'timezone' ) }
						errorMessage={ err( 'timezone' ) }
						options={ tzOptions }
					/>
				) : (
					<TextField
						id={ fieldId( 'timezone' ) }
						label={ profileFieldLabel( 'timezone' ) }
						value={ v.timezone }
						onChange={ ( x ) => upd( 'timezone', x ) }
						isReadOnly={ locked.has( 'timezone' ) }
						description={ desc(
							'timezone',
							__(
								'For example Europe/Berlin. Leave empty for the workspace time zone.',
								'cliedesk'
							)
						) }
						errorMessage={ err( 'timezone' ) }
					/>
				) }
				<TextField
					id={ fieldId( 'languages' ) }
					label={ __( 'Languages you understand', 'cliedesk' ) }
					value={ v.languages }
					onChange={ ( x ) => upd( 'languages', x ) }
					isReadOnly={ locked.has( 'languages' ) }
					description={ desc(
						'languages',
						__(
							'Language codes separated by commas, such as en, de, pt_BR. Messages in these languages are not translated for you.',
							'cliedesk'
						)
					) }
					errorMessage={ err( 'languages' ) }
				/>
				<TextField
					id={ fieldId( 'signature' ) }
					label={ profileFieldLabel( 'signature' ) }
					multiline
					rows={ 4 }
					value={ v.signature }
					onChange={ ( x ) => upd( 'signature', x ) }
					isReadOnly={ locked.has( 'signature' ) }
					description={ desc(
						'signature',
						__(
							'Added to your replies. HTML is allowed; unsafe code is removed when you save.',
							'cliedesk'
						)
					) }
					errorMessage={ err( 'signature' ) }
				/>
			</section>

			<section
				aria-labelledby="cd-profile-notify"
				className="flex flex-col gap-2"
			>
				<h2 id="cd-profile-notify" className="text-lg font-semibold">
					{ __( 'Notification preferences', 'cliedesk' ) }
				</h2>
				{ locked.has( 'notifications' ) && (
					<p className="text-sm text-fg-muted">{ lockNote }</p>
				) }
				{ mode === 'self' && <PushDevice /> }
				<div
					id={ fieldId( 'notifications' ) }
					className="overflow-x-auto rounded-lg border border-line bg-surface"
				>
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ __( 'Notify me when', 'cliedesk' ) }
						</caption>
						<thead className="border-b border-line text-fg-muted">
							<tr>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									{ __( 'Notify me when', 'cliedesk' ) }
								</th>
								{ NOTIFY_CHANNELS.map( ( c ) => (
									<th
										key={ c }
										scope="col"
										className="px-3 py-2 text-center font-medium"
									>
										{ notifyChannelLabel( c ) }
									</th>
								) ) }
								<th
									scope="col"
									className="px-3 py-2 text-center font-medium"
								>
									{ __(
										'Only my conversations',
										'cliedesk'
									) }
								</th>
								<th
									scope="col"
									className="px-3 py-2 text-center font-medium"
								>
									{ __( 'Slack or Teams', 'cliedesk' ) }
									<Slot name="notifications.slack_teams" />
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-line">
							{ NOTIFY_EVENTS.map( ( ev ) => (
								<tr key={ ev }>
									<th
										scope="row"
										className="px-3 py-2 text-start font-normal"
									>
										{ notifyEventLabel( ev ) }
									</th>
									{ NOTIFY_CHANNELS.map( ( c ) => (
										<td
											key={ c }
											className="px-3 py-2 text-center"
										>
											<Checkbox
												isSelected={
													v.notifications[ ev ][ c ]
												}
												isReadOnly={
													locked.has(
														'notifications'
													) || eventLocks.has( ev )
												}
												onChange={ ( on ) =>
													upd( 'notifications', {
														...v.notifications,
														[ ev ]: {
															...v.notifications[
																ev
															],
															[ c ]: on,
														},
													} )
												}
											>
												<span className="sr-only">
													{ sprintf(
														/* translators: 1: event, 2: channel. */
														__(
															'%1$s: %2$s',
															'cliedesk'
														),
														notifyEventLabel( ev ),
														notifyChannelLabel( c )
													) }
												</span>
											</Checkbox>
										</td>
									) ) }
									<td className="px-3 py-2 text-center">
										<Checkbox
											isSelected={
												v.notifications[ ev ].scope ===
												'mine'
											}
											isReadOnly={
												locked.has( 'notifications' ) ||
												eventLocks.has( ev )
											}
											onChange={ ( on ) =>
												upd( 'notifications', {
													...v.notifications,
													[ ev ]: {
														...v.notifications[
															ev
														],
														scope: on
															? 'mine'
															: 'all',
													},
												} )
											}
										>
											<span className="sr-only">
												{ sprintf(
													/* translators: %s: event. */
													__(
														'%s: only conversations assigned to me',
														'cliedesk'
													),
													notifyEventLabel( ev )
												) }
											</span>
										</Checkbox>
									</td>
									<td className="px-3 py-2 text-center text-fg-muted">
										<Slot
											name="notifications.slack_teams.event"
											fillProps={ { event: ev } }
										/>
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
				<Select
					id={ fieldId( 'notificationDigest' ) }
					label={ profileFieldLabel( 'notificationDigest' ) }
					value={ v.notificationDigest }
					onChange={ ( x ) =>
						upd( 'notificationDigest', x as DigestChoice )
					}
					isDisabled={ locked.has( 'notificationDigest' ) }
					options={ [
						{
							id: 'off',
							label: __(
								'One email per notification',
								'cliedesk'
							),
						},
						{
							id: 'hourly',
							label: __( 'One summary every hour', 'cliedesk' ),
						},
						{
							id: 'daily',
							label: __( 'One summary a day', 'cliedesk' ),
						},
					] }
				/>
			</section>

			<section
				aria-labelledby="cd-profile-app"
				className="flex flex-col gap-4"
			>
				<h2 id="cd-profile-app" className="text-lg font-semibold">
					{ __( 'App', 'cliedesk' ) }
				</h2>
				<RadioGroup
					id={ fieldId( 'theme' ) }
					label={ profileFieldLabel( 'theme' ) }
					orientation="horizontal"
					value={ v.theme }
					onChange={ ( x ) => upd( 'theme', x as ThemeChoice ) }
					isDisabled={ locked.has( 'theme' ) }
					description={ desc( 'theme' ) }
					errorMessage={ err( 'theme' ) }
					options={ ( [ 'system', 'light', 'dark' ] as const ).map(
						( t ) => ( { id: t, label: themeLabel( t ) } )
					) }
				/>
				<div className="flex flex-col gap-1">
					<Switch
						id={ fieldId( 'shortcuts' ) }
						isSelected={ v.shortcuts }
						isReadOnly={ locked.has( 'shortcuts' ) }
						onChange={ ( x ) => upd( 'shortcuts', x ) }
					>
						{ profileFieldLabel( 'shortcuts' ) }
					</Switch>
					{ locked.has( 'shortcuts' ) && (
						<p className="text-sm text-fg-muted">{ lockNote }</p>
					) }
				</div>
				<Select
					id={ fieldId( 'collisionPause' ) }
					label={ profileFieldLabel( 'collisionPause' ) }
					value={ v.collisionPause }
					onChange={ ( x ) =>
						upd( 'collisionPause', x as CollisionChoice )
					}
					isDisabled={ locked.has( 'collisionPause' ) }
					description={ desc(
						'collisionPause',
						__(
							'When a customer or teammate writes while you are replying, your reply waits so you can read it first.',
							'cliedesk'
						)
					) }
					errorMessage={ err( 'collisionPause' ) }
					options={ [
						{
							id: 'default',
							label: __( 'Workspace default', 'cliedesk' ),
						},
						{ id: 'on', label: __( 'On', 'cliedesk' ) },
						{ id: 'off', label: __( 'Off', 'cliedesk' ) },
					] }
				/>
			</section>

			<section
				aria-labelledby="cd-profile-alias"
				className="flex flex-col gap-4"
			>
				<h2 id="cd-profile-alias" className="text-lg font-semibold">
					{ __( 'How customers see you', 'cliedesk' ) }
				</h2>
				<p className="text-sm text-fg-muted">
					{ __(
						'Customers see this name and picture on replies. The audit log and reports always show your real name.',
						'cliedesk'
					) }
				</p>
				<TextField
					id={ fieldId( 'alias' ) }
					label={ profileFieldLabel( 'alias' ) }
					value={ v.alias }
					onChange={ ( x ) => upd( 'alias', x ) }
					isReadOnly={ locked.has( 'alias' ) }
					description={ desc(
						'alias',
						__( 'Leave empty to use your name.', 'cliedesk' )
					) }
					errorMessage={ err( 'alias' ) }
				/>
				<ImagePicker
					id={ fieldId( 'aliasAvatarAttachmentId' ) }
					label={ profileFieldLabel( 'aliasAvatarAttachmentId' ) }
					value={ v.aliasAvatarAttachmentId }
					onChange={ ( x ) => upd( 'aliasAvatarAttachmentId', x ) }
					isDisabled={ locked.has( 'aliasAvatarAttachmentId' ) }
					description={ desc( 'aliasAvatarAttachmentId' ) }
					errorMessage={ err( 'aliasAvatarAttachmentId' ) }
				/>
				{ /* Names per brand are Pro (TEAM-06 with BRD-04); Free has one brand, so the name above covers it. */ }
				<Slot
					name="team.profile.brand_aliases"
					fillProps={ {
						userId: profile.userId,
						isLocked: locked.has( 'alias' ),
						ImagePicker,
					} }
					className="flex flex-col gap-4"
				/>
			</section>

			<div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-canvas py-3">
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save profile', 'cliedesk' ) }
				</Button>
				<p role="status" className="text-sm text-success">
					{ saved ? __( 'Saved', 'cliedesk' ) : '' }
				</p>
			</div>
		</form>
	);
}
