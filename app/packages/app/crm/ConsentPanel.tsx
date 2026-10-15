/**
 * Consent on the contact page (SEC-13): per channel, whether proactive updates and marketing may be sent, with where
 * the answer came from and when. Agents who edit contacts can record a change (e.g. a customer asked on the phone).
 * Support replies are always allowed and do not appear here. GET / POST contacts/{id}/consents.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ActionError, Muted, QueryFailed } from '../inbox/components';
import { fullTime } from '../inbox/labels';

interface Consent {
	channel: string;
	purpose: string;
	status: 'granted' | 'withdrawn';
	source: string;
	recordedAt: string;
	recordedBy: number | null;
}

const CHANNELS = [ 'email', 'sms', 'whatsapp', 'push' ] as const;
const PURPOSES = [ 'proactive', 'marketing' ] as const;

const channelName = ( c: string ) =>
	( {
		email: __( 'Email', 'cliedesk' ),
		sms: __( 'SMS', 'cliedesk' ),
		whatsapp: __( 'WhatsApp', 'cliedesk' ),
		push: __( 'Browser push', 'cliedesk' ),
	} )[ c ] ?? c;

const purposeName = ( p: string ) =>
	p === 'marketing'
		? __( 'Marketing', 'cliedesk' )
		: __( 'Updates', 'cliedesk' );

/**
 * Where a consent record came from.
 *
 * @param source Source key.
 */
export function consentSource( source: string ): string {
	return (
		{
			agent: __( 'recorded by an agent', 'cliedesk' ),
			unsubscribe_link: __( 'unsubscribe link', 'cliedesk' ),
			import: __( 'import', 'cliedesk' ),
		}[ source ] ?? source
	);
}

/**
 * Panel.
 *
 * @param props           Props.
 * @param props.contactId Contact.
 * @param props.canEdit   May record changes.
 */
export function ConsentPanel( {
	contactId,
	canEdit,
}: {
	contactId: number;
	canEdit: boolean;
} ) {
	const qc = useQueryClient();
	const key = [ 'contact', contactId, 'consents' ] as const;
	const q = useQuery( {
		queryKey: key,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Consent[] } >(
					`contacts/${ contactId }/consents`,
					{ signal }
				)
			).data?.items ?? [],
	} );
	const set = useMutation( {
		mutationFn: ( body: {
			channel: string;
			purpose: string;
			granted: boolean;
		} ) =>
			api.post< { items: Consent[] } >(
				`contacts/${ contactId }/consents`,
				{ body }
			),
		onSuccess: ( r ) => qc.setQueryData( key, r.data.items ),
	} );
	if ( q.isPending ) {
		return <Muted>{ __( 'Loading…', 'cliedesk' ) }</Muted>;
	}
	if ( q.isError ) {
		return (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the consent', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const entry = ( channel: string, purpose: string ) =>
		q.data.find( ( e ) => e.channel === channel && e.purpose === purpose );
	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-fg-muted">
				{ __(
					'Replies to the customer’s own questions are always allowed. Updates go out unless withdrawn; marketing needs an opt-in.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ set.error } />
			<table className="w-full text-sm">
				<caption className="sr-only">
					{ __( 'Consent per channel', 'cliedesk' ) }
				</caption>
				<thead>
					<tr>
						<th scope="col" className="py-1 text-start font-medium">
							{ __( 'Channel', 'cliedesk' ) }
						</th>
						{ PURPOSES.map( ( p ) => (
							<th
								key={ p }
								scope="col"
								className="py-1 text-start font-medium"
							>
								{ purposeName( p ) }
							</th>
						) ) }
					</tr>
				</thead>
				<tbody>
					{ CHANNELS.map( ( channel ) => (
						<tr key={ channel } className="border-t border-line">
							<th
								scope="row"
								className="py-2 pe-3 text-start font-medium"
							>
								{ channelName( channel ) }
							</th>
							{ PURPOSES.map( ( purpose ) => {
								const e = entry( channel, purpose );
								const allowed = e
									? e.status === 'granted'
									: purpose === 'proactive';
								let status: string = allowed
									? __( 'Allowed', 'cliedesk' )
									: __( 'Withdrawn', 'cliedesk' );
								if ( ! e ) {
									status =
										purpose === 'proactive'
											? __(
													'Allowed (default)',
													'cliedesk'
												)
											: __( 'No opt-in', 'cliedesk' );
								}
								const what = sprintf(
									/* translators: 1: purpose (Updates, Marketing), 2: channel. */
									__( '%1$s by %2$s', 'cliedesk' ),
									purposeName( purpose ),
									channelName( channel )
								);
								return (
									<td
										key={ purpose }
										className="py-2 pe-3 align-top"
									>
										<div className="flex flex-col gap-1">
											<span>{ status }</span>
											{ e && (
												<span className="text-xs text-fg-muted">
													{ sprintf(
														/* translators: 1: source, 2: date and time. */
														__(
															'%1$s, %2$s',
															'cliedesk'
														),
														consentSource(
															e.source
														),
														fullTime( e.recordedAt )
													) }
												</span>
											) }
											{ canEdit && (
												<div>
													<Button
														size="sm"
														isLoading={
															set.isPending &&
															set.variables
																?.channel ===
																channel &&
															set.variables
																?.purpose ===
																purpose
														}
														aria-label={
															allowed
																? sprintf(
																		/* translators: %s: e.g. "Marketing by Email". */
																		__(
																			'Withdraw %s',
																			'cliedesk'
																		),
																		what
																	)
																: sprintf(
																		/* translators: %s: e.g. "Marketing by Email". */
																		__(
																			'Allow %s',
																			'cliedesk'
																		),
																		what
																	)
														}
														onPress={ () =>
															set.mutate( {
																channel,
																purpose,
																granted:
																	! allowed,
															} )
														}
													>
														{ allowed
															? __(
																	'Withdraw',
																	'cliedesk'
																)
															: __(
																	'Allow',
																	'cliedesk'
																) }
													</Button>
												</div>
											) }
										</div>
									</td>
								);
							} ) }
						</tr>
					) ) }
				</tbody>
			</table>
		</div>
	);
}
