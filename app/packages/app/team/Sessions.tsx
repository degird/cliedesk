/**
 * Signed-in devices (SEC-04) on My profile: GET me/sessions, and POST me/sessions/revoke {sessionId} with a
 * session id, `others` or `all` → {ended}. Signing out this device (or all) ends the current session: the app then
 * asks to sign in again on the next request.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, ConfirmDestructive, LoadingRegion, toast } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Pill, QueryFailed } from '../inbox/components';
import { fullTime, relativeTime } from '../inbox/labels';

export interface SessionItem {
	id: string;
	current: boolean;
	ip: string | null;
	userAgent: string | null;
	loginAt: string | null;
	lastSeenAt: string | null;
	expiresAt: string | null;
}

export const sessionsKey = [ 'me', 'sessions' ] as const;

/**
 * Short device description from a user agent ("Firefox on Windows").
 *
 * @param ua User agent.
 */
export function deviceLabel( ua: string | null ): string {
	if ( ! ua ) {
		return __( 'Unknown device', 'cliedesk' );
	}
	const browsers: Array< [ RegExp, string ] > = [
		[ /Edg\//, 'Edge' ],
		[ /OPR\/|Opera/, 'Opera' ],
		[ /Firefox\//, 'Firefox' ],
		[ /Chrome\//, 'Chrome' ],
		[ /Safari\//, 'Safari' ],
	];
	const systems: Array< [ RegExp, string ] > = [
		[ /iPhone|iPad/, 'iOS' ],
		[ /Android/, 'Android' ],
		[ /Windows/, 'Windows' ],
		[ /Mac OS X|Macintosh/, 'macOS' ],
		[ /Linux/, 'Linux' ],
	];
	const b = browsers.find( ( [ re ] ) => re.test( ua ) )?.[ 1 ];
	const s = systems.find( ( [ re ] ) => re.test( ua ) )?.[ 1 ];
	if ( b && s ) {
		/* translators: 1: browser, 2: operating system. */
		return sprintf( __( '%1$s on %2$s', 'cliedesk' ), b, s );
	}
	return b ?? s ?? ua.slice( 0, 60 );
}

type Target = string | 'others' | 'all';

/**
 * Section.
 */
export function SessionsSection() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: sessionsKey,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: SessionItem[] } >( 'me/sessions', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const [ confirming, setConfirming ] = useState< Target | null >( null );
	const revoke = useMutation( {
		mutationFn: ( sessionId: Target ) =>
			api.post< { ended: number } >( 'me/sessions/revoke', {
				body: { sessionId },
			} ),
		onSuccess: ( r ) => {
			setConfirming( null );
			void qc.invalidateQueries( { queryKey: sessionsKey } );
			const n = Number( r.data?.ended ) || 0;
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: number of sessions. */
					_n(
						'%d device signed out.',
						'%d devices signed out.',
						n,
						'cliedesk'
					),
					n
				),
			} );
		},
	} );
	const items = q.data ?? [];
	const others = items.filter( ( s ) => ! s.current ).length;
	return (
		<section
			aria-labelledby="cd-profile-sessions"
			className="mt-10 flex flex-col gap-4"
		>
			<h2 id="cd-profile-sessions" className="text-lg font-semibold">
				{ __( 'Signed-in devices', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Where you are signed in to the helpdesk. Sign out any device you do not recognise.',
					'cliedesk'
				) }
			</p>
			<ActionError
				error={ revoke.error }
				onDismiss={ () => revoke.reset() }
			/>
			{ q.isPending && (
				<LoadingRegion label={ __( 'Loading devices…', 'cliedesk' ) } />
			) }
			{ q.isError && (
				<QueryFailed
					title={ __( 'Could not load your devices', 'cliedesk' ) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			) }
			{ q.data && (
				<ul className="overflow-hidden rounded-lg border border-line bg-surface">
					{ items.map( ( s ) => (
						<li
							key={ s.id }
							className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
						>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="flex flex-wrap items-center gap-2 font-medium">
									{ deviceLabel( s.userAgent ) }
									{ s.current && (
										<Pill tone="accent">
											{ __( 'This device', 'cliedesk' ) }
										</Pill>
									) }
								</span>
								<span className="text-sm text-fg-muted">
									{ [
										s.ip,
										s.lastSeenAt &&
											sprintf(
												/* translators: %s: relative time. */
												__(
													'last active %s',
													'cliedesk'
												),
												relativeTime( s.lastSeenAt )
											),
										s.loginAt &&
											sprintf(
												/* translators: %s: date and time. */
												__(
													'signed in %s',
													'cliedesk'
												),
												fullTime( s.loginAt )
											),
									]
										.filter( Boolean )
										.join( ' · ' ) }
								</span>
							</div>
							{ ! s.current && (
								<Button
									size="sm"
									isLoading={
										revoke.isPending &&
										revoke.variables === s.id
									}
									onPress={ () => revoke.mutate( s.id ) }
								>
									{ sprintf(
										/* translators: %s: device. */
										__( 'Sign out %s', 'cliedesk' ),
										deviceLabel( s.userAgent )
									) }
								</Button>
							) }
						</li>
					) ) }
				</ul>
			) }
			{ q.data && (
				<div className="flex flex-wrap gap-2">
					{ others > 0 && (
						<Button onPress={ () => setConfirming( 'others' ) }>
							{ __( 'Sign out all other devices', 'cliedesk' ) }
						</Button>
					) }
					<Button
						variant="ghost"
						onPress={ () => setConfirming( 'all' ) }
					>
						{ __( 'Sign out everywhere', 'cliedesk' ) }
					</Button>
				</div>
			) }
			<ConfirmDestructive
				isOpen={ confirming === 'others' || confirming === 'all' }
				onOpenChange={ ( o ) => ! o && setConfirming( null ) }
				title={
					confirming === 'all'
						? __( 'Sign out everywhere?', 'cliedesk' )
						: __( 'Sign out all other devices?', 'cliedesk' )
				}
				description={
					confirming === 'all'
						? __(
								'Every device, including this one, is signed out. You need to sign in again.',
								'cliedesk'
							)
						: __(
								'Every device except this one is signed out.',
								'cliedesk'
							)
				}
				confirmLabel={
					confirming === 'all'
						? __( 'Sign out everywhere', 'cliedesk' )
						: __( 'Sign out other devices', 'cliedesk' )
				}
				isLoading={ revoke.isPending }
				onConfirm={ () => {
					if ( confirming ) {
						revoke.mutate( confirming );
					}
				} }
			/>
		</section>
	);
}
