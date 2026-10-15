/**
 * Settings → System → Blocked (SEC-18), for people with cliedesk_manage_spam.
 *
 * - Blocked contacts with their channels (or all), mode, reason, who blocked them (`blockedByName`) and when, and how
 *   often the block was hit. Unblock sends POST contacts/{id}/block {blocked: false} with the row's `version`.
 * - Blocked IP addresses, ranges (CIDR) and countries: add (POST blocks {type, value, reason}; a bad value comes back
 *   as 400 with fields.value, shown on the field) and remove (DELETE blocks/{id}, confirmed).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	ConfirmDestructive,
	LoadingRegion,
	Select,
	TextField,
	toast,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ActionError, Muted, QueryFailed } from '../../inbox/components';
import { channelLabel, fullTime } from '../../inbox/labels';
import {
	blockKeys,
	blockModeLabel,
	blocksQuery,
	setContactBlocked,
	type BlockedContact,
	type NetworkBlock,
} from '../../security/blocks';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

type NetworkType = 'ip' | 'country';

function Th( {
	children,
	end = false,
}: {
	children: ReactNode;
	end?: boolean;
} ) {
	return (
		<th
			scope="col"
			className={ `px-3 py-2 font-medium ${
				end ? 'text-end' : 'text-start'
			}` }
		>
			{ children }
		</th>
	);
}

function When( { at }: { at: string } ) {
	return at ? (
		<time dateTime={ at }>{ fullTime( at ) }</time>
	) : (
		<span className="text-fg-muted">—</span>
	);
}

function AddNetworkBlock() {
	const qc = useQueryClient();
	const [ type, setType ] = useState< NetworkType >( 'ip' );
	const [ value, setValue ] = useState( '' );
	const [ reason, setReason ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const add = useMutation( {
		mutationFn: () =>
			api.post< NetworkBlock >( 'blocks', {
				body: {
					type,
					value:
						type === 'country'
							? value.trim().toUpperCase()
							: value.trim(),
					...( reason.trim() ? { reason: reason.trim() } : {} ),
				},
			} ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: blockKeys.all } );
			announceResult( __( 'Block added.', 'cliedesk' ) );
			setValue( '' );
			setReason( '' );
		},
	} );
	const server = apiFieldErrors( add.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const v = value.trim();
		if ( type === 'country' && ! /^[A-Za-z]{2}$/.test( v ) ) {
			setError(
				__( 'Enter a two-letter country code, such as DE.', 'cliedesk' )
			);
			return;
		}
		if ( type === 'ip' && v.length < 2 ) {
			setError(
				__(
					'Enter an IP address or a range such as 203.0.113.0/24.',
					'cliedesk'
				)
			);
			return;
		}
		setError( null );
		add.mutate();
	};
	return (
		<form
			noValidate
			onSubmit={ submit }
			aria-labelledby="cd-blocks-add"
			className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
		>
			<h3 id="cd-blocks-add" className="font-semibold">
				{ __( 'Block an address or a country', 'cliedesk' ) }
			</h3>
			{ add.error && ! server.value && ! server.reason ? (
				<ActionError
					error={ add.error }
					onDismiss={ () => add.reset() }
				/>
			) : null }
			<div className="flex flex-wrap items-start gap-2">
				<Select
					className="min-w-44"
					label={ __( 'Block', 'cliedesk' ) }
					value={ type }
					onChange={ ( t ) => {
						setType( t as NetworkType );
						setError( null );
						add.reset();
					} }
					options={ [
						{
							id: 'ip',
							label: __( 'IP address or range', 'cliedesk' ),
						},
						{ id: 'country', label: __( 'Country', 'cliedesk' ) },
					] }
				/>
				<TextField
					className="min-w-48 flex-1"
					label={
						type === 'ip'
							? __( 'IP address or range', 'cliedesk' )
							: __( 'Country code', 'cliedesk' )
					}
					description={
						type === 'ip'
							? __(
									'For example 203.0.113.7 or 203.0.113.0/24.',
									'cliedesk'
								)
							: __( 'Two letters, for example DE.', 'cliedesk' )
					}
					value={ value }
					onChange={ ( v ) => {
						setValue( v );
						setError( null );
					} }
					isRequired
					maxLength={ 64 }
					errorMessage={ error ?? server.value ?? null }
				/>
				<TextField
					className="min-w-48 flex-1"
					label={ __( 'Reason', 'cliedesk' ) }
					description={ __( 'Optional.', 'cliedesk' ) }
					value={ reason }
					onChange={ setReason }
					maxLength={ 255 }
					errorMessage={ server.reason ?? null }
				/>
			</div>
			<Button
				type="submit"
				className="self-start"
				isLoading={ add.isPending }
			>
				{ __( 'Add block', 'cliedesk' ) }
			</Button>
			<p className="text-sm text-fg-muted">
				{ __(
					'Visitors from a blocked address or country cannot open the chat widget, and their new conversations are dropped.',
					'cliedesk'
				) }
			</p>
		</form>
	);
}

/**
 * Section.
 */
export default function BlockedSection() {
	const qc = useQueryClient();
	const list = useQuery( blocksQuery() );
	const [ removing, setRemoving ] = useState< NetworkBlock | null >( null );
	const unblock = useMutation( {
		mutationFn: ( c: BlockedContact ) =>
			setContactBlocked(
				c.contactId,
				false,
				typeof c.version === 'number' ? c.version : null
			),
		onSuccess: ( _r, c ) => {
			void qc.invalidateQueries( { queryKey: blockKeys.all } );
			void qc.invalidateQueries( {
				queryKey: [ 'contact', c.contactId ],
			} );
			void qc.invalidateQueries( { queryKey: [ 'contacts' ] } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %s: contact name. */
					__( '%s unblocked.', 'cliedesk' ),
					c.name || __( 'Contact', 'cliedesk' )
				),
			} );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `blocks/${ id }` ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: blockKeys.all } );
			announceResult( __( 'Block removed.', 'cliedesk' ) );
			setRemoving( null );
		},
	} );
	const who = ( row: {
		blockedBy: number | null;
		blockedByName?: string | null;
	} ) => {
		if ( row.blockedByName ) {
			return row.blockedByName;
		}
		return row.blockedBy === null
			? __( 'Automation', 'cliedesk' )
			: sprintf(
					/* translators: %d: user id. */
					__( 'Former agent #%d', 'cliedesk' ),
					row.blockedBy
				);
	};
	const contacts = list.data?.contacts ?? [];
	const networks = list.data?.networks ?? [];
	return (
		<div className="flex flex-col gap-6">
			<p className="text-fg-muted">
				{ __(
					'Everyone and everything that is blocked: contacts, IP addresses, ranges and countries, with who blocked them, when and why.',
					'cliedesk'
				) }
			</p>
			{ list.isPending && (
				<LoadingRegion
					label={ __( 'Loading the blocked list…', 'cliedesk' ) }
				/>
			) }
			{ list.isError && (
				<QueryFailed
					title={ __(
						'Could not load the blocked list',
						'cliedesk'
					) }
					error={ list.error }
					onRetry={ () => void list.refetch() }
				/>
			) }
			{ list.isSuccess && (
				<>
					<section
						aria-labelledby="cd-blocks-contacts"
						className="flex flex-col gap-3"
					>
						<h2 id="cd-blocks-contacts" className="font-semibold">
							{ __( 'Blocked contacts', 'cliedesk' ) }
						</h2>
						<ActionError
							error={ unblock.error }
							onDismiss={ () => unblock.reset() }
						/>
						{ ! contacts.length ? (
							<Muted>
								{ __(
									'No contacts are blocked. Block one from their contact page.',
									'cliedesk'
								) }
							</Muted>
						) : (
							<div className="overflow-x-auto rounded-lg border border-line bg-surface">
								<table className="w-full text-start text-sm">
									<caption className="sr-only">
										{ __( 'Blocked contacts', 'cliedesk' ) }
									</caption>
									<thead className="border-b border-line text-fg-muted">
										<tr>
											<Th>
												{ __( 'Contact', 'cliedesk' ) }
											</Th>
											<Th>
												{ __( 'Channels', 'cliedesk' ) }
											</Th>
											<Th>
												{ __( 'Mode', 'cliedesk' ) }
											</Th>
											<Th>
												{ __( 'Reason', 'cliedesk' ) }
											</Th>
											<Th>
												{ __(
													'Blocked by',
													'cliedesk'
												) }
											</Th>
											<Th end>
												{ __( 'Hits', 'cliedesk' ) }
											</Th>
											<Th>
												<span className="sr-only">
													{ __(
														'Actions',
														'cliedesk'
													) }
												</span>
											</Th>
										</tr>
									</thead>
									<tbody>
										{ contacts.map( ( c ) => {
											const name =
												c.name ||
												__(
													'Unnamed contact',
													'cliedesk'
												);
											return (
												<tr
													key={ c.contactId }
													className="border-b border-line last:border-b-0"
												>
													<td className="px-3 py-2 font-medium">
														<Link
															to="/contacts/$contactId"
															params={ {
																contactId:
																	String(
																		c.contactId
																	),
															} }
															className="text-accent-fg underline-offset-2 hover:underline"
														>
															<bdi>{ name }</bdi>
														</Link>
													</td>
													<td className="px-3 py-2">
														{ c.channels.length
															? c.channels
																	.map(
																		channelLabel
																	)
																	.join(
																		', '
																	)
															: __(
																	'All channels',
																	'cliedesk'
																) }
													</td>
													<td className="px-3 py-2">
														{ blockModeLabel(
															c.mode
														) }
													</td>
													<td className="px-3 py-2 text-fg-muted">
														{ c.reason || '—' }
													</td>
													<td className="px-3 py-2">
														<span className="flex flex-col">
															<span>
																{ who( c ) }
															</span>
															<span className="text-fg-muted">
																<When
																	at={
																		c.blockedAt
																	}
																/>
															</span>
														</span>
													</td>
													<td className="cd-tabular px-3 py-2 text-end">
														{ c.hits }
													</td>
													<td className="px-3 py-2">
														<Button
															size="sm"
															variant="ghost"
															aria-label={ sprintf(
																/* translators: %s: contact name. */
																__(
																	'Unblock %s',
																	'cliedesk'
																),
																name
															) }
															isLoading={
																unblock.isPending &&
																unblock
																	.variables
																	?.contactId ===
																	c.contactId
															}
															onPress={ () =>
																unblock.mutate(
																	c
																)
															}
														>
															{ __(
																'Unblock',
																'cliedesk'
															) }
														</Button>
													</td>
												</tr>
											);
										} ) }
									</tbody>
								</table>
							</div>
						) }
					</section>
					<section
						aria-labelledby="cd-blocks-networks"
						className="flex flex-col gap-3"
					>
						<h2 id="cd-blocks-networks" className="font-semibold">
							{ __(
								'Blocked addresses and countries',
								'cliedesk'
							) }
						</h2>
						<AddNetworkBlock />
						{ ! networks.length ? (
							<Muted>
								{ __(
									'No addresses or countries are blocked.',
									'cliedesk'
								) }
							</Muted>
						) : (
							<div className="overflow-x-auto rounded-lg border border-line bg-surface">
								<table className="w-full text-start text-sm">
									<caption className="sr-only">
										{ __(
											'Blocked addresses and countries',
											'cliedesk'
										) }
									</caption>
									<thead className="border-b border-line text-fg-muted">
										<tr>
											<Th>
												{ __( 'Blocked', 'cliedesk' ) }
											</Th>
											<Th>
												{ __( 'Type', 'cliedesk' ) }
											</Th>
											<Th>
												{ __( 'Reason', 'cliedesk' ) }
											</Th>
											<Th>
												{ __(
													'Blocked by',
													'cliedesk'
												) }
											</Th>
											<Th end>
												{ __( 'Hits', 'cliedesk' ) }
											</Th>
											<Th>
												<span className="sr-only">
													{ __(
														'Actions',
														'cliedesk'
													) }
												</span>
											</Th>
										</tr>
									</thead>
									<tbody>
										{ networks.map( ( n ) => (
											<tr
												key={ n.id }
												className="border-b border-line last:border-b-0"
											>
												<td className="px-3 py-2 font-medium">
													<bdi>{ n.value }</bdi>
												</td>
												<td className="px-3 py-2">
													{ n.type === 'country'
														? __(
																'Country',
																'cliedesk'
															)
														: __(
																'IP address or range',
																'cliedesk'
															) }
												</td>
												<td className="px-3 py-2 text-fg-muted">
													{ n.reason || '—' }
												</td>
												<td className="px-3 py-2">
													<span className="flex flex-col">
														<span>
															{ who( n ) }
														</span>
														<span className="text-fg-muted">
															<When
																at={
																	n.blockedAt
																}
															/>
														</span>
													</span>
												</td>
												<td className="cd-tabular px-3 py-2 text-end">
													{ n.hits }
												</td>
												<td className="px-3 py-2">
													<Button
														size="sm"
														variant="ghost"
														aria-label={ sprintf(
															/* translators: %s: blocked address or country. */
															__(
																'Remove the block on %s',
																'cliedesk'
															),
															n.value
														) }
														onPress={ () =>
															setRemoving( n )
														}
													>
														{ __(
															'Remove',
															'cliedesk'
														) }
													</Button>
												</td>
											</tr>
										) ) }
									</tbody>
								</table>
							</div>
						) }
					</section>
				</>
			) }
			<ConfirmDestructive
				isOpen={ removing !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setRemoving( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: blocked address or country. */
					__( 'Remove the block on %s?', 'cliedesk' ),
					removing?.value ?? ''
				) }
				description={ __(
					'Visitors from here can open the chat widget and start conversations again.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Remove block', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( removing ) {
						remove.mutate( removing.id );
					}
				} }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</div>
	);
}
