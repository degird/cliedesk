/**
 * Settings → Workspace & brands → Plan & features (ADM-21): what Cliedesk Free includes (no seat, ticket or contact
 * limits) and what Cliedesk Pro adds.
 *
 * - GET features → {free: [{label, description}], pro: [{label, description, group, docs}], proActive}.
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Muted } from '../../inbox/components';

interface Feature {
	label: string;
	description: string;
	docs?: string;
}

/** ADM-22 (Free part): licence status as Pro reports it, and where to get or manage Pro. */
interface Licence {
	state: string;
	plan: string | null;
	expiresAt: string | null;
	upgradeUrl: string;
	accountUrl: string | null;
}

/**
 * Plain words for a licence state.
 *
 * @param l Licence.
 */
export function licenceText( l: Licence ): string {
	switch ( l.state ) {
		case 'licensed':
			return l.expiresAt
				? sprintf(
						/* translators: %s: date. */
						__( 'Cliedesk Pro is licensed until %s.', 'cliedesk' ),
						l.expiresAt.slice( 0, 10 )
					)
				: __( 'Cliedesk Pro is licensed.', 'cliedesk' );
		case 'expired':
			return __(
				'Your Cliedesk Pro licence has expired. Pro keeps working; updates and support stop until you renew.',
				'cliedesk'
			);
		case 'expired_blocked':
		case 'revoked':
		case 'unlicensed':
			return __(
				'Cliedesk Pro has no valid licence. Your data and all Free features keep working.',
				'cliedesk'
			);
		case 'incompatible':
			return __(
				'This Cliedesk Pro version does not fit this Cliedesk version. Update both.',
				'cliedesk'
			);
		case 'pro_inactive':
			return __(
				'Cliedesk Pro is installed but not active.',
				'cliedesk'
			);
		default:
			return __(
				'You use Cliedesk Free. No licence is needed.',
				'cliedesk'
			);
	}
}

function LicenceStatus( { licence }: { licence: Licence } ) {
	return (
		<section
			aria-labelledby="cd-licence"
			className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
		>
			<h2 id="cd-licence" className="font-semibold">
				{ __( 'Licence', 'cliedesk' ) }
			</h2>
			<p className="text-sm">{ licenceText( licence ) }</p>
			<div className="flex flex-wrap gap-3 text-sm">
				{ licence.accountUrl ? (
					<a
						className="text-accent-fg underline"
						href={ licence.accountUrl }
					>
						{ __( 'Manage licence and billing', 'cliedesk' ) }
					</a>
				) : (
					[ 'free_only', 'pro_inactive' ].includes(
						licence.state
					) && (
						<a
							className="text-accent-fg underline"
							href={ licence.upgradeUrl }
						>
							{ __( 'Get Cliedesk Pro', 'cliedesk' ) }
						</a>
					)
				) }
			</div>
		</section>
	);
}

export default function FeaturesSection() {
	const q = useQuery( {
		queryKey: [ 'features' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					free: Feature[];
					pro: Feature[];
					proActive: boolean;
					licence?: Licence;
				} >( 'features', { signal } )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const list = ( items: Feature[] ) => (
		<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
			{ items.map( ( f ) => (
				<li key={ f.label } className="flex flex-col gap-0.5 p-3">
					<span className="font-medium">{ f.label }</span>
					<span className="text-sm text-fg-muted">
						{ f.description }
					</span>
				</li>
			) ) }
		</ul>
	);
	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-2">
				<h2 className="font-semibold">
					{ __( 'Included in Cliedesk Free', 'cliedesk' ) }
				</h2>
				<Muted>
					{ __(
						'No limits on agents, conversations or contacts.',
						'cliedesk'
					) }
				</Muted>
				{ list( q.data.free ?? [] ) }
			</section>
			{ q.data.licence && <LicenceStatus licence={ q.data.licence } /> }
			<section className="flex flex-col gap-2">
				<h2 className="font-semibold">
					{ q.data.proActive
						? __( 'Cliedesk Pro (active)', 'cliedesk' )
						: __( 'Added by Cliedesk Pro', 'cliedesk' ) }
				</h2>
				{ list( q.data.pro ?? [] ) }
			</section>
		</div>
	);
}
