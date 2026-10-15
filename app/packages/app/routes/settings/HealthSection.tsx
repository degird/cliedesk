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
	ErrorState,
	LoadingRegion,
	StatusIcon,
	toast,
	type Tone,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ExternalLink } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { describeError } from '../../components/RouteError';
import {
	healthQuery,
	summarise,
	type HealthCheck,
	type HealthStatus,
} from '../../queries';
import { safeModeStore } from '../../state';
import { HooksList } from './HooksList';
import { UsageCard } from './UsageCard';

const TONE: Record< HealthStatus, Tone > = {
	ok: 'success',
	info: 'info',
	warning: 'warning',
	critical: 'danger',
};

function statusLabel( s: HealthStatus ): string {
	switch ( s ) {
		case 'ok':
			return __( 'OK', 'cliedesk' );
		case 'warning':
			return __( 'Warning', 'cliedesk' );
		case 'critical':
			return __( 'Critical', 'cliedesk' );
		default:
			return __( 'Info', 'cliedesk' );
	}
}

const ORDER: Record< HealthStatus, number > = {
	critical: 0,
	warning: 1,
	info: 2,
	ok: 3,
};

function Fix( { fix }: { fix: HealthCheck[ 'fix' ] } ) {
	if ( ! fix ) {
		return null;
	}
	let url: string | null = null;
	if ( typeof fix === 'string' ) {
		url = /^(https?:\/\/|\/)/.test( fix ) ? fix : null;
	} else {
		url = fix.url ?? null;
	}
	// Action ids such as "safe_mode.confirm" are handled by controls on this screen, not shown as text.
	if (
		! url &&
		typeof fix === 'string' &&
		/^[a-z_]+\.[a-z_.]+$/.test( fix )
	) {
		return null;
	}
	const label =
		typeof fix === 'object' && fix.label
			? fix.label
			: __( 'How to fix', 'cliedesk' );
	if ( ! url ) {
		return (
			<p className="text-sm text-fg">
				{ typeof fix === 'string' ? fix : fix.label }
			</p>
		);
	}
	const external =
		/^https?:\/\//.test( url ) &&
		! url.startsWith( window.location.origin );
	return (
		<a
			href={ url }
			target={ external ? '_blank' : undefined }
			rel={ external ? 'noreferrer noopener' : undefined }
			className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
		>
			{ label }
			{ external && (
				<>
					<ExternalLink aria-hidden="true" size={ 14 } />
					<span className="sr-only">
						{ __( '(opens in a new tab)', 'cliedesk' ) }
					</span>
				</>
			) }
		</a>
	);
}

function ConfirmProduction() {
	const store = safeModeStore();
	const active = useSyncExternalStore(
		store.subscribe,
		store.get,
		store.get
	);
	const qc = useQueryClient();
	const m = useMutation( {
		mutationFn: () =>
			api.post< { active: boolean; reason: string | null } >(
				'safe-mode/confirm',
				{ body: {} }
			),
		onSuccess: ( r ) => {
			store.set( !! r.data?.active );
			void qc.invalidateQueries( { queryKey: [ 'health' ] } );
			toast( {
				tone: r.data?.active ? 'warning' : 'success',
				title: r.data?.active
					? __(
							'Safe mode is still on (forced by the site configuration).',
							'cliedesk'
						)
					: __(
							'Production confirmed. Safe mode is off.',
							'cliedesk'
						),
			} );
		},
	} );
	if ( ! active ) {
		return null;
	}
	return (
		<Banner
			tone="warning"
			title={ __( 'Safe mode is on', 'cliedesk' ) }
			actions={
				<Button
					variant="primary"
					isLoading={ m.isPending }
					onPress={ () => m.mutate() }
				>
					{ __( 'Confirm production', 'cliedesk' ) }
				</Button>
			}
		>
			<p>
				{ __(
					'Confirm only if this is the live site. On a copy or staging site, keep safe mode on so customers get no emails from it.',
					'cliedesk'
				) }
			</p>
			{ m.isError && (
				<p role="alert" className="mt-1 text-danger">
					{ describeError( m.error ) }
				</p>
			) }
		</Banner>
	);
}

/**
 * Settings → System → Setup Health (v1).
 */
export default function HealthSection() {
	const q = useQuery( healthQuery() );
	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Running checks…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<ErrorState
				title={ __( 'Could not run the checks', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else {
		const checks = [ ...q.data.checks ].sort(
			( a, b ) => ( ORDER[ a.status ] ?? 9 ) - ( ORDER[ b.status ] ?? 9 )
		);
		const s = summarise( checks );
		body = (
			<>
				<p className="cd-tabular text-fg-muted" role="status">
					{ sprintf(
						/* translators: 1: critical count, 2: warning count, 3: info count, 4: OK count. */
						__(
							'Critical: %1$d · Warnings: %2$d · Info: %3$d · OK: %4$d',
							'cliedesk'
						),
						s.critical,
						s.warning,
						s.info,
						s.ok
					) }
				</p>
				<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
					{ checks.map( ( c ) => (
						<li key={ c.id } className="flex items-start gap-3 p-4">
							<StatusIcon tone={ TONE[ c.status ] ?? 'info' } />
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="text-base font-semibold">
										{ c.label }
									</h2>
									<span className="rounded-full border border-line px-2 text-xs font-medium text-fg-muted">
										{ statusLabel( c.status ) }
									</span>
								</div>
								{ c.message && (
									<p className="text-fg-muted">
										{ c.message }
									</p>
								) }
								<Fix fix={ c.fix } />
							</div>
						</li>
					) ) }
				</ul>
				<div>
					<Button
						variant="secondary"
						isLoading={ q.isFetching }
						onPress={ () => void q.refetch() }
					>
						{ __( 'Run checks again', 'cliedesk' ) }
					</Button>
				</div>
			</>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<ConfirmProduction />
			{ body }
			<UsageCard />
			<HooksList />
		</div>
	);
}
