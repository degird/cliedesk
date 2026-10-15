/**
 * Settings → System → Security (SEC-01, SEC-04, SEC-06), for people with cliedesk_manage_security.
 *
 * - Emergency lockdown: POST security/lockdown {on, reason}; a reason is required to turn it on. It is a
 *   sensitive Action, so the API client asks for the password first when the last confirmation is too old.
 * - Settings of module `security` (GET / PATCH settings/security with If-Match): require_2fa, twofa_grace_days,
 *   max_session_hours, idle_minutes, sudo_minutes. A 422 `cliedesk_lockout_risk` (turning on 2FA would lock the
 *   saver out) shows the server's message; while strict mode is on, a loosening change fails with 409
 *   `cliedesk_strict_mode` and the per-field messages show on the fields.
 * - Strict mode and the compliance pack (SecurityCards.tsx).
 */
import {
	api,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	LoadingRegion,
	Select,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { ActionError, QueryFailed } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';
import { AbuseProtectionCard } from './AbuseProtectionCard';
import { LinkSafetyCard } from './LinkSafetyCard';
import { PiiRulesCard } from './PiiRulesCard';
import { CredentialsCard } from './CredentialsCard';
import { IdentityKeysCard } from './IdentityKeysCard';
import { DataRemovalCard } from './DataRemovalCard';
import { ComplianceCard, StrictModeCard } from './SecurityCards';

export interface SecurityStatus {
	twoFactor: {
		required: boolean;
		configured: boolean | null;
		graceUntil: string | null;
		blocked: boolean;
		adapter: string | null;
	};
	sudo: boolean;
	lockdown: { reason: string; by: number | null; at: string } | null;
	coverage?: unknown;
	mode?: string;
}

export const securityStatusQuery = () => ( {
	queryKey: [ 'security', 'status' ] as const,
	queryFn: async ( { signal }: { signal?: AbortSignal } ) =>
		( await api.get< SecurityStatus >( 'security/status', { signal } ) )
			.data,
	staleTime: 5 * 60 * 1000,
	retry: false,
} );

export const NUMBER_SETTINGS = [
	{
		key: 'twofa_grace_days',
		min: 0,
		max: 30,
		label: () => __( 'Days to set up 2FA', 'cliedesk' ),
		help: () =>
			__(
				'How long people have to set up two-factor authentication before access is blocked (0–30).',
				'cliedesk'
			),
	},
	{
		key: 'max_session_hours',
		min: 1,
		max: 336,
		label: () => __( 'Longest sign-in (hours)', 'cliedesk' ),
		help: () =>
			__( 'After this, people sign in again (1–336).', 'cliedesk' ),
	},
	{
		key: 'idle_minutes',
		min: 0,
		max: 1440,
		label: () => __( 'Sign out after idle minutes', 'cliedesk' ),
		help: () => __( '0 means never (0–1440).', 'cliedesk' ),
	},
	{
		key: 'sudo_minutes',
		min: 5,
		max: 60,
		label: () => __( 'Password confirmation lasts (minutes)', 'cliedesk' ),
		help: () =>
			__(
				'How long a password confirmation covers sensitive changes (5–60).',
				'cliedesk'
			),
	},
	{
		key: 'credential_rotation_days',
		min: 0,
		max: 3650,
		label: () => __( 'Replace credentials after (days)', 'cliedesk' ),
		help: () =>
			__(
				'Health reminds you to replace stored passwords and keys older than this. 0 means never.',
				'cliedesk'
			),
	},
] as const;

export const REQUIRE_2FA = [ 'off', 'cliedesk_roles', 'admins' ] as const;

/**
 * Label of a require_2fa choice.
 *
 * @param v Value.
 */
export function require2faLabel( v: string ): string {
	switch ( v ) {
		case 'cliedesk_roles':
			return __( 'Everyone with helpdesk access', 'cliedesk' );
		case 'admins':
			return __( 'Administrators only', 'cliedesk' );
		default:
			return __( 'Nobody (off)', 'cliedesk' );
	}
}

/**
 * Check a number setting.
 *
 * @param raw Input.
 * @param min Minimum.
 * @param max Maximum.
 */
export function checkRange(
	raw: string,
	min: number,
	max: number
): string | null {
	const n = Number( raw );
	if ( raw.trim() === '' || ! Number.isInteger( n ) || n < min || n > max ) {
		return sprintf(
			/* translators: 1: minimum, 2: maximum. */
			__( 'Enter a whole number from %1$d to %2$d.', 'cliedesk' ),
			min,
			max
		);
	}
	return null;
}

function Lockdown() {
	const qc = useQueryClient();
	const status = useQuery( securityStatusQuery() );
	const [ reason, setReason ] = useState( '' );
	const [ reasonError, setReasonError ] = useState< string | null >( null );
	const toggle = useMutation( {
		mutationFn: ( body: { on: boolean; reason?: string } ) =>
			api.post< {
				lockdown: unknown;
				sessionsEnded: number;
			} >( 'security/lockdown', { body } ),
		onSuccess: ( r, body ) => {
			void qc.invalidateQueries( { queryKey: [ 'security' ] } );
			setReason( '' );
			const msg = body.on
				? sprintf(
						/* translators: %d: number of sessions ended. */
						__(
							'Lockdown is on. %d sessions were ended.',
							'cliedesk'
						),
						Number( r.data?.sessionsEnded ) || 0
					)
				: __( 'Lockdown is off.', 'cliedesk' );
			toast( { tone: body.on ? 'warning' : 'success', title: msg } );
			announceResult( msg );
		},
	} );
	if ( status.isPending ) {
		return (
			<LoadingRegion label={ __( 'Loading lockdown…', 'cliedesk' ) } />
		);
	}
	if ( status.isError ) {
		return (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the security status', 'cliedesk' ) }
				error={ status.error }
				onRetry={ () => void status.refetch() }
			/>
		);
	}
	const on = !! status.data?.lockdown;
	const turnOn = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! reason.trim() ) {
			setReasonError( __( 'Say why you are locking down.', 'cliedesk' ) );
			return;
		}
		toggle.mutate( { on: true, reason: reason.trim() } );
	};
	const serverReason = isApiError( toggle.error )
		? ( toggle.error.fields?.reason ?? null )
		: null;
	return (
		<div className="flex flex-col gap-3">
			{ toggle.error && ! serverReason ? (
				<ActionError
					error={ toggle.error }
					onDismiss={ () => toggle.reset() }
				/>
			) : null }
			{ on ? (
				<>
					<Banner
						tone="danger"
						title={ __( 'Lockdown is on', 'cliedesk' ) }
					>
						{ status.data?.lockdown?.reason }
					</Banner>
					<Button
						className="self-start"
						isLoading={ toggle.isPending }
						onPress={ () => toggle.mutate( { on: false } ) }
					>
						{ __( 'Turn lockdown off', 'cliedesk' ) }
					</Button>
				</>
			) : (
				<form
					noValidate
					onSubmit={ turnOn }
					className="flex flex-col gap-3"
				>
					<TextField
						label={ __( 'Reason', 'cliedesk' ) }
						description={ __(
							'Required. Saved in the audit log.',
							'cliedesk'
						) }
						isRequired
						maxLength={ 500 }
						value={ reason }
						onChange={ ( x ) => {
							setReason( x );
							setReasonError( null );
						} }
						errorMessage={ reasonError ?? serverReason }
					/>
					<Button
						type="submit"
						variant="danger"
						className="self-start"
						isLoading={ toggle.isPending }
					>
						{ __( 'Turn lockdown on', 'cliedesk' ) }
					</Button>
				</form>
			) }
		</div>
	);
}

type Values = Record< string, string >;

function SettingsForm() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'security' ) );
	const [ values, setValues ] = useState< Values | null >( null );
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const [ saved, setSaved ] = useState( false );
	useEffect( () => {
		if ( q.data?.values ) {
			const v: Values = {
				require_2fa: String(
					q.data.values.require_2fa?.value ?? 'off'
				),
			};
			for ( const s of NUMBER_SETTINGS ) {
				v[ s.key ] = String( q.data.values[ s.key ]?.value ?? '' );
			}
			setValues( v );
		}
	}, [ q.data ] );
	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			api.patch( 'settings/security', {
				body: { values: body },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setSaved( true );
			window.setTimeout( () => setSaved( false ), 2000 );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'security' ],
			} );
			void qc.invalidateQueries( { queryKey: [ 'security' ] } );
		},
	} );
	if ( q.isPending || ( q.data && ! values ) ) {
		return (
			<LoadingRegion
				label={ __( 'Loading security settings…', 'cliedesk' ) }
			/>
		);
	}
	if ( q.isError || ! values ) {
		return (
			<QueryFailed
				headingLevel={ 3 }
				title={ __(
					'Could not load the security settings',
					'cliedesk'
				) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next: Record< string, string > = {};
		for ( const s of NUMBER_SETTINGS ) {
			const err = checkRange( values[ s.key ] ?? '', s.min, s.max );
			if ( err ) {
				next[ s.key ] = err;
			}
		}
		setErrors( next );
		if ( Object.keys( next ).length ) {
			document
				.getElementById( `cd-security-${ Object.keys( next )[ 0 ] }` )
				?.querySelector( 'input' )
				?.focus();
			return;
		}
		const body: Record< string, unknown > = {};
		const before = q.data?.values ?? {};
		if ( values.require_2fa !== String( before.require_2fa?.value ) ) {
			body.require_2fa = values.require_2fa;
		}
		for ( const s of NUMBER_SETTINGS ) {
			const n = Number( values[ s.key ] );
			if ( n !== Number( before[ s.key ]?.value ) ) {
				body[ s.key ] = n;
			}
		}
		if ( ! Object.keys( body ).length ) {
			announceResult( __( 'Nothing changed.', 'cliedesk' ) );
			return;
		}
		save.mutate( body );
	};
	const fieldErrors = isApiError( save.error ) ? save.error.fields : {};
	const fieldError = ( k: string ) =>
		errors[ k ] ??
		fieldErrors[ k ] ??
		fieldErrors[ `values.${ k }` ] ??
		null;
	return (
		<form noValidate onSubmit={ submit } className="flex flex-col gap-4">
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
			<Select
				id="cd-security-require_2fa"
				label={ __( 'Require two-factor authentication', 'cliedesk' ) }
				description={ __(
					'People set it up with the site’s two-factor plugin on their WordPress profile.',
					'cliedesk'
				) }
				value={ values.require_2fa ?? 'off' }
				options={ REQUIRE_2FA.map( ( v ) => ( {
					id: v,
					label: require2faLabel( v ),
				} ) ) }
				onChange={ ( x ) => setValues( { ...values, require_2fa: x } ) }
				errorMessage={ fieldError( 'require_2fa' ) }
			/>
			{ NUMBER_SETTINGS.map( ( s ) => (
				<TextField
					key={ s.key }
					id={ `cd-security-${ s.key }` }
					label={ s.label() }
					description={ s.help() }
					inputMode="numeric"
					value={ values[ s.key ] ?? '' }
					onChange={ ( x ) => {
						setValues( { ...values, [ s.key ]: x } );
						setErrors( ( old ) => {
							const n = { ...old };
							delete n[ s.key ];
							return n;
						} );
					} }
					errorMessage={ fieldError( s.key ) }
				/>
			) ) }
			<div className="flex items-center gap-3">
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save security settings', 'cliedesk' ) }
				</Button>
				<p role="status" className="text-sm text-success">
					{ saved ? __( 'Saved', 'cliedesk' ) : '' }
				</p>
			</div>
		</form>
	);
}

/**
 * Security section.
 */
export default function SecuritySection() {
	return (
		<div className="flex flex-col gap-10">
			<section
				aria-labelledby="cd-security-lockdown"
				className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
			>
				<h2 id="cd-security-lockdown" className="text-lg font-semibold">
					{ __( 'Emergency lockdown', 'cliedesk' ) }
				</h2>
				<p className="text-sm text-fg-muted">
					{ __(
						'Ends every session except Owners’ and Admins’ and keeps everyone else out until you turn it off.',
						'cliedesk'
					) }
				</p>
				<Lockdown />
			</section>
			<StrictModeCard />
			<section
				aria-labelledby="cd-security-settings"
				className="flex flex-col gap-3"
			>
				<h2 id="cd-security-settings" className="text-lg font-semibold">
					{ __( 'Sign-in rules', 'cliedesk' ) }
				</h2>
				<SettingsForm />
			</section>
			<LinkSafetyCard />
			<PiiRulesCard />
			<AbuseProtectionCard />
			<CredentialsCard />
			<IdentityKeysCard />
			<DataRemovalCard />
			<ComplianceCard />
		</div>
	);
}
