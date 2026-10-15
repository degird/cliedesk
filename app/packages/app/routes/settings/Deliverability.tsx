/**
 * Settings → Email → Deliverability (CHN-40): SPF, DKIM, DMARC and MX for each sending domain, with the record to
 * add when something is missing, a DKIM selector field and Re-check.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, LoadingRegion, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted, Pill } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import { announceResult } from '../../workspace/forms';

type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

interface Check {
	key: 'spf' | 'dkim' | 'dmarc' | 'mx';
	status: CheckStatus;
	detail: string;
	record: string | null;
}

interface DomainState {
	domain: string;
	status: CheckStatus;
	selector: string | null;
	checks: Check[];
	checkedAt: string | null;
}

const KEY = [ 'email', 'deliverability' ] as const;

/**
 * Pill tone and label of a status.
 *
 * @param s Status.
 */
export function statusPill( s: CheckStatus ): {
	tone: 'success' | 'warning' | 'danger' | 'neutral';
	label: string;
} {
	switch ( s ) {
		case 'pass':
			return { tone: 'success', label: __( 'OK', 'cliedesk' ) };
		case 'warn':
			return { tone: 'warning', label: __( 'Check', 'cliedesk' ) };
		case 'fail':
			return { tone: 'danger', label: __( 'Missing', 'cliedesk' ) };
		default:
			return { tone: 'neutral', label: __( 'Not checked', 'cliedesk' ) };
	}
}

const CHECK_LABELS: Record< Check[ 'key' ], string > = {
	spf: 'SPF',
	dkim: 'DKIM',
	dmarc: 'DMARC',
	mx: 'MX',
};

function DomainCard( { item }: { item: DomainState } ) {
	const qc = useQueryClient();
	const [ selector, setSelector ] = useState( item.selector ?? '' );
	const check = useMutation( {
		mutationFn: () =>
			api.post< DomainState >( 'email/deliverability/check', {
				body: { domain: item.domain, selector },
			} ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: 1: domain, 2: status. */
					__( '%1$s checked: %2$s', 'cliedesk' ),
					item.domain,
					statusPill( r.data.status ).label
				)
			);
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const pill = statusPill( item.status );
	return (
		<li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="font-semibold">{ item.domain }</h3>
				<Pill tone={ pill.tone }>{ pill.label }</Pill>
				{ item.checkedAt && (
					<span className="text-sm text-fg-muted">
						{ sprintf(
							/* translators: %s: date and time. */
							__( 'Checked %s', 'cliedesk' ),
							fullTime( item.checkedAt )
						) }
					</span>
				) }
			</div>
			{ item.checks.length > 0 && (
				<ul className="flex flex-col gap-2">
					{ item.checks.map( ( c ) => {
						const p = statusPill( c.status );
						return (
							<li key={ c.key } className="flex flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2">
									<span className="w-14 font-medium">
										{ CHECK_LABELS[ c.key ] }
									</span>
									<Pill tone={ p.tone }>{ p.label }</Pill>
									<span className="text-sm">
										{ c.detail }
									</span>
								</div>
								{ c.record && (
									<code className="block overflow-x-auto rounded-md bg-sunken px-2 py-1 text-xs">
										{ c.record }
									</code>
								) }
							</li>
						);
					} ) }
				</ul>
			) }
			<div className="flex flex-wrap items-end gap-2">
				<TextField
					label={ __( 'DKIM selector (optional)', 'cliedesk' ) }
					value={ selector }
					onChange={ setSelector }
				/>
				<Button
					isLoading={ check.isPending }
					onPress={ () => check.mutate() }
				>
					{ item.checkedAt
						? __( 'Re-check', 'cliedesk' )
						: __( 'Check now', 'cliedesk' ) }
				</Button>
			</div>
			<ActionError error={ check.error } />
		</li>
	);
}

/**
 * Section.
 */
export default function Deliverability() {
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					dnsAvailable: boolean;
					items: DomainState[];
				} >( 'email/deliverability', { signal } )
			).data,
		retry: false,
	} );
	if ( q.isError ) {
		return null;
	}
	return (
		<section
			aria-labelledby="cd-email-deliverability"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-email-deliverability" className="text-lg font-semibold">
				{ __( 'Deliverability', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Mail providers trust email from domains with SPF, DKIM and DMARC records. Add any missing record at your domain’s DNS host, then re-check. Domains are also checked every week.',
					'cliedesk'
				) }
			</Muted>
			{ q.isPending && <LoadingRegion /> }
			{ q.data && ! q.data.dnsAvailable && (
				<p className="text-sm">
					{ __(
						'This server cannot look up DNS records. Check the records at your DNS host by hand.',
						'cliedesk'
					) }
				</p>
			) }
			{ q.data && (
				<ul className="flex flex-col gap-3">
					{ ( Array.isArray( q.data.items ) ? q.data.items : [] ).map(
						( item ) => (
							<DomainCard key={ item.domain } item={ item } />
						)
					) }
				</ul>
			) }
		</section>
	);
}
