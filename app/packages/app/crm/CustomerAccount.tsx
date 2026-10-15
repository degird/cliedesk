/**
 * Customer account (COM-36, COM-37, COM-44 Free) for the conversation side panel and the contact page: claim
 * counters of the last 12 months (refunds, reships, returns, coupons, chargebacks, from the action log) and the
 * account actions, each previewed before it runs: password reset email, resend verification email, change the
 * account email (both addresses confirm) and personal data export or erasure requests (Tools → Privacy). Actions a
 * contact cannot get (no WordPress account, hourly limit reached) show disabled with the reason. Lazy-loaded.
 *
 * - GET contacts/{id}/claims → {counts, total, since} (`cliedesk_view_orders`).
 * - GET contacts/{id}/account → availability; POST contacts/{id}/account/{password-reset|verification|email|privacy}
 *   (`cliedesk_run_commerce_actions`).
 */
import { api, can, useQuery, useQueryClient } from '@cliedesk/data';
import { LoadingRegion, TextField } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { Muted, PanelSection } from '../inbox/components';
import { PreviewAction } from './CommercePreview';

interface Availability {
	available: boolean;
	reason: string;
}

interface AccountOverview {
	userId: number | null;
	email: string;
	pendingEmail: {
		email: string;
		currentConfirmed: boolean;
		newConfirmed: boolean;
	} | null;
	passwordReset: Availability;
	verification: Availability;
	changeEmail: Availability;
	privacyRequest: Availability;
}

interface Claims {
	counts: Record< string, number >;
	total: number;
}

/**
 * Label of a claim counter.
 *
 * @param kind Kind.
 * @param n    Count.
 */
function claimLabel( kind: string, n: number ): string {
	switch ( kind ) {
		case 'refund':
			/* translators: %d: count. */
			return sprintf( _n( '%d refund', '%d refunds', n, 'cliedesk' ), n );
		case 'reship':
			/* translators: %d: count. */
			return sprintf( _n( '%d reship', '%d reships', n, 'cliedesk' ), n );
		case 'return':
			/* translators: %d: count. */
			return sprintf( _n( '%d return', '%d returns', n, 'cliedesk' ), n );
		case 'coupon':
			/* translators: %d: count. */
			return sprintf( _n( '%d coupon', '%d coupons', n, 'cliedesk' ), n );
		default:
			return sprintf(
				/* translators: %d: count. */
				_n( '%d chargeback', '%d chargebacks', n, 'cliedesk' ),
				n
			);
	}
}

/**
 * Claim counters.
 *
 * @param props           Props.
 * @param props.contactId Contact.
 */
export function ClaimCounters( { contactId }: { contactId: number } ) {
	const q = useQuery( {
		queryKey: [ 'contact', contactId, 'claims' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< Claims >( `contacts/${ contactId }/claims`, {
					signal,
				} )
			).data as Claims,
	} );
	if ( ! q.data?.counts ) {
		return null;
	}
	return (
		<p className="text-xs text-fg-muted">
			{ q.data.total === 0
				? __( 'No claims in the last 12 months.', 'cliedesk' )
				: sprintf(
						/* translators: %s: list of counts, e.g. "2 refunds · 1 reship". */
						__( 'Last 12 months: %s', 'cliedesk' ),
						Object.entries( q.data.counts )
							.filter( ( [ , n ] ) => n > 0 )
							.map( ( [ k, n ] ) => claimLabel( k, n ) )
							.join( ' · ' )
					) }
		</p>
	);
}

/**
 * Account card.
 *
 * @param props                Props.
 * @param props.contactId      Contact.
 * @param props.conversationId Conversation the agent works from (events land there).
 */
export default function CustomerAccount( {
	contactId,
	conversationId,
}: {
	contactId: number;
	conversationId?: number;
} ) {
	const qc = useQueryClient();
	const [ email, setEmail ] = useState( '' );
	const view = can( 'cliedesk_view_orders' );
	const q = useQuery( {
		queryKey: [ 'contact', contactId, 'account' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< AccountOverview >(
					`contacts/${ contactId }/account`,
					{ signal }
				)
			).data as AccountOverview,
		enabled: view && contactId > 0,
	} );
	if ( ! view || contactId <= 0 ) {
		return null;
	}
	const d = q.data?.passwordReset ? q.data : undefined;
	const run = can( 'cliedesk_run_commerce_actions' );
	const base = `contacts/${ contactId }/account`;
	const ids = conversationId ? { contactId, conversationId } : { contactId };
	const refresh = () =>
		void qc.invalidateQueries( { queryKey: [ 'contact', contactId ] } );
	const reason = ( a: Availability ) => ( a.available ? '' : a.reason );
	return (
		<PanelSection
			id="cd-side-account"
			title={ __( 'Customer account', 'cliedesk' ) }
		>
			<div className="flex flex-col gap-3 text-sm">
				<ClaimCounters contactId={ contactId } />
				{ ! d && q.isPending && <LoadingRegion /> }
				{ d && ! run && (
					<Muted>
						{ __(
							'You can see the account but not run account actions.',
							'cliedesk'
						) }
					</Muted>
				) }
				{ d && run && (
					<>
						<PreviewAction
							label={ __( 'Send password reset', 'cliedesk' ) }
							path={ `${ base }/password-reset` }
							body={ ids }
							disabledReason={ reason( d.passwordReset ) }
							done={ __(
								'Password reset email sent.',
								'cliedesk'
							) }
							onDone={ refresh }
						/>
						<PreviewAction
							label={ __(
								'Resend verification email',
								'cliedesk'
							) }
							path={ `${ base }/verification` }
							body={ ids }
							disabledReason={ reason( d.verification ) }
							done={ __(
								'Verification email sent.',
								'cliedesk'
							) }
							onDone={ refresh }
						/>
						<div className="flex flex-col gap-1">
							<TextField
								label={ __( 'New account email', 'cliedesk' ) }
								type="email"
								value={ email }
								onChange={ setEmail }
								isDisabled={ ! d.changeEmail.available }
							/>
							{ d.pendingEmail && (
								<Muted>
									{ sprintf(
										/* translators: %s: email address. */
										__(
											'Waiting for both addresses to confirm the change to %s.',
											'cliedesk'
										),
										d.pendingEmail.email
									) }
								</Muted>
							) }
							<PreviewAction
								key={ email }
								label={ __( 'Change email', 'cliedesk' ) }
								path={ `${ base }/email` }
								body={ { ...ids, email } }
								disabledReason={
									reason( d.changeEmail ) ||
									( email.trim() === ''
										? __(
												'Enter the new address first.',
												'cliedesk'
											)
										: '' )
								}
								done={ __(
									'Both addresses were asked to confirm.',
									'cliedesk'
								) }
								onDone={ refresh }
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<PreviewAction
								label={ __(
									'Request data export',
									'cliedesk'
								) }
								path={ `${ base }/privacy` }
								body={ { ...ids, type: 'export' } }
								disabledReason={ reason( d.privacyRequest ) }
								done={ __(
									'Export request created.',
									'cliedesk'
								) }
							/>
							<PreviewAction
								label={ __(
									'Request data erasure',
									'cliedesk'
								) }
								path={ `${ base }/privacy` }
								body={ { ...ids, type: 'erase' } }
								disabledReason={ reason( d.privacyRequest ) }
								done={ __(
									'Erasure request created.',
									'cliedesk'
								) }
							/>
						</div>
					</>
				) }
			</div>
		</PanelSection>
	);
}
