import {
	api,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
	type ApiResult,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	ErrorState,
	LoadingRegion,
	Slot,
	TextField,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { describeError } from '../../components/RouteError';
import { settingsQuery, type SettingValue } from '../../queries';
import { sourceLabel } from '../../workspace/labels';
import { SettingsHistory, WorkspaceDefaults } from './WorkspaceDefaults';
import { WorkspaceDetailsForm } from './WorkspaceDetailsForm';

export { sourceLabel };

export const POLL_FIELD_ID = 'cd-setting-core-poll_interval';

/**
 * Client check (the server validates again).
 *
 * @param raw Input text.
 * @param min Minimum.
 * @param max Maximum.
 */
export function validateSeconds(
	raw: string,
	min: number | null,
	max: number | null
): string | null {
	const lo = min ?? 1;
	const hi = max ?? 3600;
	const range = sprintf(
		/* translators: 1: minimum, 2: maximum. */
		__( 'Enter a whole number of seconds from %1$d to %2$d.', 'cliedesk' ),
		lo,
		hi
	);
	if ( ! /^\d+$/.test( raw.trim() ) ) {
		return range;
	}
	const n = Number( raw );
	return n < lo || n > hi ? range : null;
}

function fieldError(
	fields: Record< string, string >,
	key: string
): string | null {
	return (
		fields[ key ] ??
		fields[ `values.${ key }` ] ??
		fields[ `values[${ key }]` ] ??
		null
	);
}

function PollIntervalForm( {
	setting,
	etag,
}: {
	setting: SettingValue;
	etag: string | null;
} ) {
	const qc = useQueryClient();
	const [ value, setValue ] = useState( String( setting.value ?? '' ) );
	const [ touched, setTouched ] = useState( false );
	const [ serverError, setServerError ] = useState< string | null >( null );
	const [ summary, setSummary ] = useState< string[] >( [] );
	const [ saved, setSaved ] = useState( false );
	const summaryRef = useRef< HTMLDivElement >( null );
	const min = setting.schema?.min ?? null;
	const max = setting.schema?.max ?? null;

	useEffect(
		() => setValue( String( setting.value ?? '' ) ),
		[ setting.value ]
	);

	const save = useMutation( {
		mutationFn: ( next: number | null ) =>
			api.patch< Record< string, SettingValue > >( 'settings/core', {
				body: { values: { poll_interval: next } },
				ifMatch: etag ?? undefined,
			} ),
		onSuccess: ( r: ApiResult< Record< string, SettingValue > > ) => {
			setServerError( null );
			setSummary( [] );
			setSaved( true );
			window.setTimeout( () => setSaved( false ), 2000 );
			if (
				r.data &&
				typeof r.data === 'object' &&
				'poll_interval' in r.data
			) {
				qc.setQueryData(
					settingsQuery( 'core' ).queryKey,
					( old ) => ( {
						values: { ...( old?.values ?? {} ), ...r.data },
						etag: r.etag ?? old?.etag ?? null,
					} )
				);
			}
			void qc.invalidateQueries( { queryKey: [ 'settings', 'core' ] } );
		},
		onError: ( e ) => {
			const msg = isApiError( e )
				? fieldError( e.fields, 'poll_interval' )
				: null;
			setServerError( msg );
			setSummary( msg ? [ msg ] : [] );
		},
	} );

	useEffect( () => {
		if ( summary.length ) {
			summaryRef.current?.focus();
		}
	}, [ summary ] );

	const clientError = touched ? validateSeconds( value, min, max ) : null;
	const error = clientError ?? serverError;

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setTouched( true );
		const err = validateSeconds( value, min, max );
		if ( err ) {
			setSummary( [ err ] );
			return;
		}
		save.mutate( Number( value ) );
	};

	const generalError = save.isError && ! serverError ? save.error : null;

	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-5">
			{ summary.length > 0 && (
				<div
					ref={ summaryRef }
					tabIndex={ -1 }
					role="alert"
					className="rounded-lg border border-danger-line bg-danger-subtle p-4 outline-none"
				>
					<p className="font-semibold">
						{
							/* translators: %d: number of errors. */ sprintf(
								_n(
									'There is %d error to fix:',
									'There are %d errors to fix:',
									summary.length,
									'cliedesk'
								),
								summary.length
							)
						}
					</p>
					<ul className="mt-1 list-disc ps-5">
						{ summary.map( ( m ) => (
							<li key={ m }>
								<a
									href={ `#${ POLL_FIELD_ID }` }
									className="text-danger underline underline-offset-2"
									onClick={ ( ev ) => {
										ev.preventDefault();
										document
											.getElementById( POLL_FIELD_ID )
											?.focus();
									} }
								>
									{ m }
								</a>
							</li>
						) ) }
					</ul>
				</div>
			) }
			{ generalError && (
				<ErrorState
					headingLevel={ 2 }
					title={ __( 'Could not save', 'cliedesk' ) }
					message={ describeError( generalError ) }
					code={
						isApiError( generalError ) ? generalError.code : null
					}
					requestId={
						isApiError( generalError )
							? generalError.requestId
							: null
					}
				/>
			) }
			<fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
				<legend className="px-1 text-lg font-semibold">
					{ __( 'Live updates', 'cliedesk' ) }
				</legend>
				<TextField
					id={ POLL_FIELD_ID }
					label={ __(
						'Update check interval (seconds)',
						'cliedesk'
					) }
					description={ sprintf(
						/* translators: 1: minimum, 2: maximum, 3: default. */
						__(
							'How often open lists check for changes. Allowed: %1$d to %2$d. Default: %3$s.',
							'cliedesk'
						),
						min ?? 1,
						max ?? 3600,
						String( setting.default )
					) }
					inputMode="numeric"
					value={ value }
					onChange={ ( v ) => {
						setValue( v );
						setServerError( null );
					} }
					onBlur={ () => setTouched( true ) }
					errorMessage={ error }
					isRequired
				/>
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: 1: effective value in seconds, 2: where the value comes from. */
						__( 'In effect: %1$s seconds (%2$s).', 'cliedesk' ),
						String( setting.value ),
						sourceLabel( setting.source )
					) }
				</p>
				{ setting.schema?.risk && (
					<p className="text-sm text-warning">
						{ setting.schema.risk }
					</p>
				) }
			</fieldset>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending && save.variables !== null }
				>
					{ saved
						? __( 'Saved', 'cliedesk' )
						: __( 'Save', 'cliedesk' ) }
				</Button>
				<Button
					variant="secondary"
					isDisabled={ setting.source === 'default' }
					isLoading={ save.isPending && save.variables === null }
					onPress={ () => {
						setTouched( false );
						save.mutate( null );
					} }
				>
					{ __( 'Reset to default', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

function WorkspaceDetails() {
	const q = useQuery( settingsQuery( 'workspace' ) );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	if ( q.isError ) {
		return (
			<ErrorState
				headingLevel={ 2 }
				title={ __(
					'Could not load the workspace details',
					'cliedesk'
				) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	return (
		<WorkspaceDetailsForm values={ q.data.values } etag={ q.data.etag } />
	);
}

/**
 * Settings → Workspace → General: workspace details (BRD-01, `settings/workspace`) and live updates
 * (`core.poll_interval`).
 */
export default function WorkspaceSection() {
	const q = useQuery( settingsQuery( 'core' ) );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	if ( q.isError ) {
		return (
			<ErrorState
				title={ __( 'Could not load the settings', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const setting = q.data.values.poll_interval;
	return (
		<div className="flex flex-col gap-6">
			<WorkspaceDetails />
			{ setting ? (
				<PollIntervalForm setting={ setting } etag={ q.data.etag } />
			) : (
				<Banner
					tone="info"
					title={ __(
						'No workspace settings are available yet.',
						'cliedesk'
					) }
				/>
			) }
			<WorkspaceDefaults />
			<SettingsHistory />
			<Slot name="workspace.white_label" className="max-w-md" />
		</div>
	);
}
