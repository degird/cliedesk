/**
 * Settings → System → Integrations (DEV-35): built-in integrations, supported plugins found on this site and
 * Cliedesk add-ons, each with its status and an on/off switch. Newly found plugins are proposed at the top.
 *
 * - GET integrations → {items: [{key, name, category, tier, detected, status, settings}], addons, found}.
 * - PUT integrations/{key} {on}; POST integrations/seen {keys}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Banner, Button, LoadingRegion, Switch } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { ActionError, Muted, QueryFailed } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';
import { lazy, Suspense } from 'react';

// COM-04, COM-06, COM-08, PRO-22: WooCommerce settings, loaded when WooCommerce is on.
const WooSettingsCard = lazy(
	() => import( /* webpackChunkName: "settings-woo" */ './WooSettingsCard' )
);

type Status = 'on' | 'off' | 'not_installed' | 'needs_pro' | 'coming';

interface Integration {
	key: string;
	name: string;
	category: string;
	tier: 'free' | 'pro';
	detected: boolean;
	status: Status;
	settings: string;
}

interface Page {
	items: Integration[];
	addons: Array< { key: string; name: string; status: 'on' | 'off' } >;
	found: string[];
}

const KEY = [ 'integrations' ];

function categoryLabel( c: string ): string {
	return (
		{
			wordpress: __( 'WordPress', 'cliedesk' ),
			forms: __( 'Forms', 'cliedesk' ),
			commerce: __( 'Commerce', 'cliedesk' ),
			membership: __( 'Memberships', 'cliedesk' ),
			learning: __( 'Courses', 'cliedesk' ),
		}[ c ] ?? c
	);
}

function statusLabel( s: Status ): string {
	return {
		on: __( 'On', 'cliedesk' ),
		off: __( 'Off', 'cliedesk' ),
		not_installed: __( 'Plugin not active', 'cliedesk' ),
		needs_pro: __( 'Needs Cliedesk Pro', 'cliedesk' ),
		coming: __( 'Found; support is being built', 'cliedesk' ),
	}[ s ];
}

export default function IntegrationsSection() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< Page >( 'integrations', { signal } ) )
				.data as Page,
	} );
	const done = () => void qc.invalidateQueries( { queryKey: KEY } );
	const toggle = useMutation( {
		mutationFn: ( v: { key: string; on: boolean } ) =>
			api.put( `integrations/${ v.key }`, { body: { on: v.on } } ),
		onSuccess: () => {
			done();
			announceResult( __( 'Integration saved.', 'cliedesk' ) );
		},
	} );
	const seen = useMutation( {
		mutationFn: ( keys: string[] ) =>
			api.post( 'integrations/seen', { body: { keys } } ),
		onSuccess: done,
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	if ( q.isError ) {
		return (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the integrations', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const { items, addons, found } = q.data;
	const names = items
		.filter( ( i ) => found.includes( i.key ) )
		.map( ( i ) => i.name );
	const groups = [ ...new Set( items.map( ( i ) => i.category ) ) ];
	const row = (
		key: string,
		name: string,
		status: Status,
		extra?: { tier?: string; settings?: string }
	) => (
		<li
			key={ key }
			className="flex flex-wrap items-center justify-between gap-2 py-3"
		>
			<span className="flex flex-col">
				<span className="font-medium">
					{ name }
					{ extra?.tier === 'pro' && (
						<span className="ms-2 rounded-full border border-line px-2 text-xs text-fg-muted">
							{ __( 'Pro', 'cliedesk' ) }
						</span>
					) }
				</span>
				<span className="text-sm text-fg-muted">
					{ statusLabel( status ) }
				</span>
			</span>
			<span className="flex items-center gap-3">
				{ extra?.settings && status === 'on' && (
					<Link
						to={ extra.settings as never }
						className="text-sm underline"
					>
						{ __( 'Set up', 'cliedesk' ) }
					</Link>
				) }
				{ ( status === 'on' || status === 'off' ) && (
					<Switch
						isSelected={ status === 'on' }
						isDisabled={ toggle.isPending }
						onChange={ ( on ) => toggle.mutate( { key, on } ) }
					>
						<span className="sr-only">
							{ sprintf(
								/* translators: %s: integration name. */
								__( 'Use %s', 'cliedesk' ),
								name
							) }
						</span>
					</Switch>
				) }
			</span>
		</li>
	);
	return (
		<div className="flex flex-col gap-4">
			<Muted>
				{ __(
					'Integrations are normal WordPress plugins. Cliedesk finds the supported ones on this site; each starts on and you can turn it off.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ toggle.error } />
			{ found.length > 0 && (
				<Banner
					tone="info"
					title={ __( 'New plugins found', 'cliedesk' ) }
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span>
							{ sprintf(
								/* translators: %s: plugin names. */
								__(
									'New on this site: %s. Cliedesk works with it and it is on.',
									'cliedesk'
								),
								names.join( ', ' )
							) }
						</span>
						<Button
							size="sm"
							isLoading={ seen.isPending }
							onPress={ () => seen.mutate( found ) }
						>
							{ __( 'Got it', 'cliedesk' ) }
						</Button>
					</div>
				</Banner>
			) }
			{ groups.map( ( g ) => (
				<section
					key={ g }
					aria-labelledby={ `cd-int-${ g }` }
					className="rounded-lg border border-line bg-surface px-4"
				>
					<h2 id={ `cd-int-${ g }` } className="pt-3 font-semibold">
						{ categoryLabel( g ) }
					</h2>
					<ul className="divide-y divide-line">
						{ items
							.filter( ( i ) => i.category === g )
							.map( ( i ) =>
								row( i.key, i.name, i.status, {
									tier: i.tier,
									settings: i.settings,
								} )
							) }
					</ul>
				</section>
			) ) }
			{ items.some(
				( i ) => i.key === 'woocommerce' && i.status === 'on'
			) && (
				<Suspense fallback={ <LoadingRegion /> }>
					<WooSettingsCard />
				</Suspense>
			) }
			<section
				aria-labelledby="cd-int-addons"
				className="rounded-lg border border-line bg-surface px-4"
			>
				<h2 id="cd-int-addons" className="pt-3 font-semibold">
					{ __( 'Add-ons', 'cliedesk' ) }
				</h2>
				{ addons.length ? (
					<ul className="divide-y divide-line">
						{ addons.map( ( a ) =>
							row( a.key, a.name, a.status )
						) }
					</ul>
				) : (
					<p className="py-3 text-sm text-fg-muted">
						{ __(
							'No add-ons yet. Plugins that add records with cliedesk_register_record_source() show here.',
							'cliedesk'
						) }
					</p>
				) }
			</section>
		</div>
	);
}
