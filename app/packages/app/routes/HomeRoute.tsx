import { can, getBoot, hasModule, useQuery, isApiError } from '@cliedesk/data';
import { ErrorState, Skeleton, Slot, StatusIcon } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { HomeKpis } from '../components/HomeKpis';
import { TodayGroups } from '../components/TodayGroups';
import { describeError } from '../components/RouteError';
import { PageHeader } from '../components/PageHeader';
import { healthQuery, summarise } from '../queries';
import { lazy, Suspense, type ReactNode } from 'react';

const AdminHomeCard = lazy(
	() =>
		import(
			/* webpackChunkName: "admin-home" */ '../components/AdminHomeCard'
		)
);

function Card( { title, children }: { title: string; children: ReactNode } ) {
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 shadow-1">
			<h2 className="text-lg font-semibold">{ title }</h2>
			{ children }
		</section>
	);
}

function HealthSummary() {
	const q = useQuery( healthQuery() );
	if ( q.isPending ) {
		return (
			<div aria-busy="true">
				<span className="sr-only">
					{ __( 'Loading Setup Health…', 'cliedesk' ) }
				</span>
				<Skeleton lines={ 2 } />
			</div>
		);
	}
	if ( q.isError ) {
		return (
			<ErrorState
				headingLevel={ 3 }
				title={ __( 'Could not load Setup Health', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const s = summarise( q.data.checks );
	let tone: 'danger' | 'warning' | 'success' = 'success';
	if ( s.critical ) {
		tone = 'danger';
	} else if ( s.warning ) {
		tone = 'warning';
	}
	let text: string;
	if ( s.critical ) {
		text = sprintf(
			/* translators: %d: number of critical problems. */
			_n(
				'%d critical problem needs attention.',
				'%d critical problems need attention.',
				s.critical,
				'cliedesk'
			),
			s.critical
		);
	} else if ( s.warning ) {
		text = sprintf(
			/* translators: %d: number of warnings. */
			_n(
				'%d warning to review.',
				'%d warnings to review.',
				s.warning,
				'cliedesk'
			),
			s.warning
		);
	} else {
		text = __( 'Everything looks good.', 'cliedesk' );
	}
	return (
		<div className="flex flex-col gap-3">
			<p className="flex items-start gap-2">
				<StatusIcon tone={ tone } />
				<span>{ text }</span>
			</p>
			<dl className="cd-tabular grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
				<div>
					<dt className="text-fg-muted">
						{ __( 'Critical', 'cliedesk' ) }
					</dt>
					<dd className="font-semibold">{ s.critical }</dd>
				</div>
				<div>
					<dt className="text-fg-muted">
						{ __( 'Warnings', 'cliedesk' ) }
					</dt>
					<dd className="font-semibold">{ s.warning }</dd>
				</div>
				<div>
					<dt className="text-fg-muted">
						{ __( 'Info', 'cliedesk' ) }
					</dt>
					<dd className="font-semibold">{ s.info }</dd>
				</div>
				<div>
					<dt className="text-fg-muted">
						{ __( 'OK', 'cliedesk' ) }
					</dt>
					<dd className="font-semibold">{ s.ok }</dd>
				</div>
			</dl>
			<Link
				to="/settings/developer/health"
				className="self-start font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				{ __( 'Open Setup Health', 'cliedesk' ) }
			</Link>
		</div>
	);
}

/**
 * Home (M0): workspace, current user, Setup Health summary; the AI briefing slot follows the Free summary (§11.2).
 */
export default function HomeRoute() {
	const boot = getBoot();
	const user = boot.user;
	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-6">
			<PageHeader
				title={ __( 'Home', 'cliedesk' ) }
				description={
					user
						? /* translators: %s: user display name. */ sprintf(
								__( 'Welcome, %s.', 'cliedesk' ),
								user.name
							)
						: undefined
				}
			/>
			{ can( 'cliedesk_view_reports' ) && hasModule( 'reports' ) && (
				// RPT-08: key numbers linking to Reports.
				<HomeKpis />
			) }
			{ can( 'cliedesk_access' ) && (
				<section className="flex flex-col gap-3">
					<h2 className="text-lg font-semibold">
						{ __( 'My day', 'cliedesk' ) }
					</h2>
					<TodayGroups />
				</section>
			) }
			<div className="grid gap-4 md:grid-cols-2">
				<Card title={ __( 'Workspace', 'cliedesk' ) }>
					<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
						<dt className="text-fg-muted">
							{ __( 'Name', 'cliedesk' ) }
						</dt>
						<dd className="font-medium">
							{ boot.workspace.name ||
								__( '(not set)', 'cliedesk' ) }
						</dd>
						<dt className="text-fg-muted">
							{ __( 'Time zone', 'cliedesk' ) }
						</dt>
						<dd>{ boot.workspace.timezone }</dd>
						<dt className="text-fg-muted">
							{ __( 'Products', 'cliedesk' ) }
						</dt>
						<dd className="cd-tabular">{ boot.products.length }</dd>
					</dl>
				</Card>
				<Card title={ __( 'You', 'cliedesk' ) }>
					{ user ? (
						<div className="flex items-center gap-3">
							{ user.avatar && (
								<img
									src={ user.avatar }
									alt=""
									className="size-10 rounded-full"
								/>
							) }
							<div className="flex flex-col">
								<span className="font-medium">
									{ user.name }
								</span>
								<span className="text-sm text-fg-muted">
									{ user.roleKey }
								</span>
							</div>
						</div>
					) : (
						<p className="text-fg-muted">
							{ __( 'Not signed in.', 'cliedesk' ) }
						</p>
					) }
				</Card>
				<Slot name="home.happiness" />
				{ can( 'cliedesk_manage_settings' ) && (
					<Card title={ __( 'Setup Health', 'cliedesk' ) }>
						<HealthSummary />
					</Card>
				) }
				{ can( 'cliedesk_manage_settings' ) && (
					<Card title={ __( 'Setup', 'cliedesk' ) }>
						<Suspense fallback={ null }>
							<AdminHomeCard />
						</Suspense>
					</Card>
				) }
			</div>
			<Slot name="home.ai_briefing" className="max-w-md" />
		</div>
	);
}
