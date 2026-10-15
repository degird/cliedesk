/**
 * Settings → Workspace → General: workspace identity and defaults (BRD-01) through `settings/workspace`.
 * Empty text means "use the WordPress site value"; only changed fields are sent.
 */
import {
	api,
	can,
	getBoot,
	isApiError,
	useMutation,
	useQueryClient,
} from '@cliedesk/data';
import { Button, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SettingsModule } from '../../queries';
import {
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	pickError,
	validateEmail,
	validateText,
	type SummaryItem,
} from '../../workspace/forms';

export type WorkspaceKey =
	| 'name'
	| 'legal_name'
	| 'address'
	| 'website'
	| 'support_email'
	| 'default_language'
	| 'timezone'
	| 'merge_undo_days';

export const WORKSPACE_KEYS: WorkspaceKey[] = [
	'name',
	'legal_name',
	'address',
	'website',
	'support_email',
	'default_language',
	'timezone',
	'merge_undo_days',
];

export const workspaceFieldId = ( key: WorkspaceKey ) =>
	`cd-setting-workspace-${ key }`;

const LANGUAGE = /^([a-z]{2,3}(_[A-Z]{2})?(_[a-z0-9]+)?)?$/;
const TIMEZONE =
	/^([A-Za-z]+(\/[A-Za-z0-9_+\-]+){1,2}|UTC([+-]\d{1,2}(:[0-5]\d)?)?)?$/;
const WEBSITE = /^(https?:\/\/\S+)?$/i;

/**
 * Client checks mirroring the server schema (the server validates again).
 *
 * @param key   Setting key.
 * @param value Input text.
 * @param min   Minimum (merge_undo_days).
 * @param max   Maximum (merge_undo_days).
 */
export function validateWorkspaceField(
	key: WorkspaceKey,
	value: string,
	min: number | null = 7,
	max: number | null = 90
): string | null {
	if ( key === 'name' || key === 'legal_name' ) {
		return validateText( value, 191 );
	}
	if ( key === 'address' ) {
		return validateText( value, 500 );
	}
	const v = value.trim();
	switch ( key ) {
		case 'website':
			return WEBSITE.test( v ) && v.length <= 255
				? null
				: __(
						'Enter a full address such as https://example.com.',
						'cliedesk'
					);
		case 'support_email':
			return validateEmail( v );
		case 'default_language':
			return LANGUAGE.test( v )
				? null
				: __( 'Enter a language code such as en_US.', 'cliedesk' );
		case 'timezone':
			return TIMEZONE.test( v )
				? null
				: __(
						'Enter a time zone such as Europe/Berlin or UTC+2.',
						'cliedesk'
					);
		case 'merge_undo_days': {
			const lo = min ?? 7;
			const hi = max ?? 90;
			const msg = sprintf(
				/* translators: 1: minimum days, 2: maximum days. */
				__(
					'Enter a whole number of days from %1$d to %2$d.',
					'cliedesk'
				),
				lo,
				hi
			);
			if ( ! /^\d+$/.test( v ) ) {
				return msg;
			}
			const n = Number( v );
			return n < lo || n > hi ? msg : null;
		}
	}
	return null;
}

function toText( v: unknown ): string {
	return v === null || v === undefined ? '' : String( v );
}

/**
 * Workspace details form.
 *
 * @param props        Props.
 * @param props.values Settings of the `workspace` module.
 * @param props.etag   ETag of the settings read.
 */
export function WorkspaceDetailsForm( {
	values,
	etag,
}: {
	values: SettingsModule;
	etag: string | null;
} ) {
	const qc = useQueryClient();
	const keys = useMemo(
		() =>
			WORKSPACE_KEYS.filter(
				( k ) =>
					k in values &&
					( k !== 'merge_undo_days' ||
						can( 'cliedesk_manage_products' ) )
			),
		[ values ]
	);
	const initial = useMemo( () => {
		const out: Partial< Record< WorkspaceKey, string > > = {};
		for ( const k of keys ) {
			out[ k ] = toText( values[ k ]?.value );
		}
		return out;
	}, [ keys, values ] );
	const [ form, setForm ] = useState( initial );
	const [ touched, setTouched ] = useState< Set< WorkspaceKey > >(
		() => new Set()
	);
	const [ server, setServer ] = useState< Record< string, string > >( {} );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ saved, setSaved ] = useState( false );

	useEffect( () => setForm( initial ), [ initial ] );

	const days = values.merge_undo_days?.schema;
	const check = ( k: WorkspaceKey, v: string ) =>
		validateWorkspaceField( k, v, days?.min ?? 7, days?.max ?? 90 );

	const save = useMutation( {
		mutationFn: ( changed: Record< string, string | number > ) =>
			api.patch( 'settings/workspace', {
				body: { values: changed },
				ifMatch: etag ?? undefined,
			} ),
		onSuccess: () => {
			setServer( {} );
			setSummary( [] );
			setSaved( true );
			window.setTimeout( () => setSaved( false ), 2000 );
			announceResult( __( 'Workspace details saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'workspace' ],
			} );
		},
		onError: ( e ) => {
			const fields = apiFieldErrors( e );
			const next: Record< string, string > = {};
			const items: SummaryItem[] = [];
			for ( const k of keys ) {
				const msg = pickError( fields, k, `workspace.${ k }` );
				if ( msg ) {
					next[ k ] = msg;
					items.push( {
						fieldId: workspaceFieldId( k ),
						message: msg,
					} );
				}
			}
			setServer( next );
			setSummary( items );
		},
	} );

	if ( ! keys.length ) {
		return null;
	}

	const set = ( k: WorkspaceKey, v: string ) => {
		setForm( ( f ) => ( { ...f, [ k ]: v } ) );
		setServer( ( s ) => {
			if ( ! ( k in s ) ) {
				return s;
			}
			const n = { ...s };
			delete n[ k ];
			return n;
		} );
	};

	const errorFor = ( k: WorkspaceKey ) =>
		( touched.has( k ) ? check( k, form[ k ] ?? '' ) : null ) ??
		server[ k ] ??
		null;

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setTouched( new Set( keys ) );
		const items: SummaryItem[] = [];
		for ( const k of keys ) {
			const msg = check( k, form[ k ] ?? '' );
			if ( msg ) {
				items.push( { fieldId: workspaceFieldId( k ), message: msg } );
			}
		}
		if ( items.length ) {
			setSummary( items );
			return;
		}
		const changed: Record< string, string | number > = {};
		for ( const k of keys ) {
			const v = ( form[ k ] ?? '' ).trim();
			if ( v !== ( initial[ k ] ?? '' ).trim() ) {
				changed[ k ] = k === 'merge_undo_days' ? Number( v ) : v;
			}
		}
		if ( ! Object.keys( changed ).length ) {
			setSummary( [] );
			setSaved( true );
			window.setTimeout( () => setSaved( false ), 2000 );
			return;
		}
		save.mutate( changed );
	};

	const blur = ( k: WorkspaceKey ) => () =>
		setTouched( ( t ) => new Set( t ).add( k ) );

	const siteValue = ( k: WorkspaceKey ): string | undefined => {
		const boot = getBoot();
		switch ( k ) {
			case 'name':
				return boot.workspace.name || undefined;
			case 'timezone':
				return boot.workspace.timezone || undefined;
			case 'default_language':
				return boot.workspace.locale || undefined;
			case 'address':
				return boot.workspace.address || undefined;
			default:
				return undefined;
		}
	};

	const field = (
		k: WorkspaceKey,
		label: string,
		description?: string,
		extra: {
			multiline?: boolean;
			inputMode?: 'text' | 'numeric' | 'email' | 'url';
			type?: string;
			autoComplete?: string;
		} = {}
	) =>
		keys.includes( k ) ? (
			<TextField
				key={ k }
				id={ workspaceFieldId( k ) }
				label={ label }
				description={ description }
				value={ form[ k ] ?? '' }
				placeholder={ siteValue( k ) }
				onChange={ ( v ) => set( k, v ) }
				onBlur={ blur( k ) }
				errorMessage={ errorFor( k ) }
				multiline={ extra.multiline }
				inputMode={ extra.inputMode }
				type={ extra.type }
				autoComplete={ extra.autoComplete }
				isRequired={ k === 'merge_undo_days' }
			/>
		) : null;

	const siteHint = __(
		'Leave empty to use the WordPress site value.',
		'cliedesk'
	);

	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-5">
			<ErrorSummary items={ summary } />
			<SaveError error={ save.error } />
			<fieldset className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
				<legend className="px-1 text-lg font-semibold">
					{ __( 'Workspace details', 'cliedesk' ) }
				</legend>
				{ field( 'name', __( 'Workspace name', 'cliedesk' ), siteHint, {
					autoComplete: 'organization',
				} ) }
				{ field(
					'legal_name',
					__( 'Legal company name', 'cliedesk' ),
					__( 'Used in email footers and invoices.', 'cliedesk' )
				) }
				{ field(
					'address',
					__( 'Company address', 'cliedesk' ),
					undefined,
					{ multiline: true, autoComplete: 'street-address' }
				) }
				{ field( 'website', __( 'Website', 'cliedesk' ), undefined, {
					inputMode: 'url',
					type: 'url',
					autoComplete: 'url',
				} ) }
				{ field(
					'support_email',
					__( 'Support email address', 'cliedesk' ),
					undefined,
					{ inputMode: 'email', type: 'email', autoComplete: 'email' }
				) }
				{ field(
					'default_language',
					__( 'Default language', 'cliedesk' ),
					sprintf(
						/* translators: %s: hint about the WordPress site value. */
						__(
							'A language code such as en_US or de_DE. %s',
							'cliedesk'
						),
						siteHint
					)
				) }
				{ field(
					'timezone',
					__( 'Time zone', 'cliedesk' ),
					sprintf(
						/* translators: %s: hint about the WordPress site value. */
						__( 'Such as Europe/Berlin or UTC+2. %s', 'cliedesk' ),
						siteHint
					)
				) }
				{ field(
					'merge_undo_days',
					__( 'Product merge undo period (days)', 'cliedesk' ),
					sprintf(
						/* translators: 1: minimum days, 2: maximum days, 3: default days. */
						__(
							'How long a product merge can be undone. Allowed: %1$d to %2$d. Default: %3$s.',
							'cliedesk'
						),
						days?.min ?? 7,
						days?.max ?? 90,
						toText( values.merge_undo_days?.default ?? 30 )
					),
					{ inputMode: 'numeric' }
				) }
				{ values.merge_undo_days?.schema?.risk &&
					keys.includes( 'merge_undo_days' ) && (
						<p className="text-sm text-warning">
							{ values.merge_undo_days.schema.risk }
						</p>
					) }
			</fieldset>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ saved
						? __( 'Saved', 'cliedesk' )
						: __( 'Save workspace details', 'cliedesk' ) }
				</Button>
				{ isApiError( save.error ) && save.error.status === 409 && (
					<Button
						onPress={ () =>
							void qc.invalidateQueries( {
								queryKey: [ 'settings', 'workspace' ],
							} )
						}
					>
						{ __( 'Reload', 'cliedesk' ) }
					</Button>
				) }
			</div>
		</form>
	);
}
