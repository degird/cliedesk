/**
 * Settings → Email (M2, CHN-39/04): sending connections (WordPress mail by default, SMTP), the sending mode (live,
 * paused, redirect to a test address), the delivery log, reply options, system emails, the deliverability check,
 * blocked addresses and the layout. Free only sends: customers answer in the portal. Incoming mailboxes and their
 * options are Cliedesk Pro: the `email.mailboxes` and `email.reply_options` slots (PRO badges without Pro) get
 * `emailKit` as their `kit` prop. Secrets are write-only: a saved password shows as "set" and is only replaced when
 * a new one is typed.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	Checkbox,
	LoadingRegion,
	Modal,
	Select,
	Slot,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import { settingsQuery } from '../../queries';
import { announceResult, apiFieldErrors } from '../../workspace/forms';
import EmailLayoutEditor from './EmailLayoutEditor';
import Deliverability from './Deliverability';
import { SystemEmails } from './SystemEmails';
import { emailKit } from './emailKit';

interface ProviderField {
	type: string;
	label: string;
	secret?: boolean;
	required?: boolean;
	enum?: string[];
}

interface Provider {
	id: string;
	label: string;
	package: string;
	fields: Record< string, ProviderField >;
}

interface Connection {
	id: number;
	type: string;
	typeLabel: string | null;
	available: boolean;
	name: string;
	isDefault: boolean;
	status: string;
	statusReason: string | null;
	settings: Record< string, unknown >;
	version: number;
}

interface OutboxRow {
	id: number;
	stream: string;
	status: string;
	handedToServer: boolean;
	to: string[];
	subject: string;
	error: string | null;
	createdAt: string;
}

const KEYS = {
	providers: [ 'email', 'providers' ] as const,
	transports: [ 'email', 'transports' ] as const,
	outbox: [ 'email', 'outbox' ] as const,
	blocked: [ 'email', 'suppressions' ] as const,
};

/**
 * Plain label of an outbox status (CHN-04: never "delivered" for server mail).
 *
 * @param row Outbox row.
 */
export function deliveryLabel( row: OutboxRow ): string {
	if ( row.status === 'sent' && row.handedToServer ) {
		return __( 'Handed to server mail', 'cliedesk' );
	}
	return (
		{
			queued: __( 'Queued', 'cliedesk' ),
			sending: __( 'Sending', 'cliedesk' ),
			sent: __( 'Sent', 'cliedesk' ),
			delivered: __( 'Delivered', 'cliedesk' ),
			bounced: __( 'Bounced', 'cliedesk' ),
			complained: __( 'Marked as spam', 'cliedesk' ),
			failed: __( 'Not sent', 'cliedesk' ),
			unknown: __( 'Checking delivery…', 'cliedesk' ),
			held: __( 'Delivery uncertain', 'cliedesk' ),
			cancelled: __( 'Cancelled', 'cliedesk' ),
		}[ row.status ] ?? row.status
	);
}

function ConnectionDialog( { onClose }: { onClose: () => void } ) {
	const qc = useQueryClient();
	const providers = useQuery( {
		queryKey: KEYS.providers,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Provider[] } >( 'email/providers', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const [ type, setType ] = useState( 'smtp' );
	const [ name, setName ] = useState( '' );
	const [ values, setValues ] = useState< Record< string, string > >( {} );
	const [ isDefault, setIsDefault ] = useState( 'yes' );
	const provider = providers.data?.find( ( p ) => p.id === type );
	const save = useMutation( {
		mutationFn: () => {
			const settings: Record< string, unknown > = {};
			for ( const [ key, field ] of Object.entries(
				provider?.fields ?? {}
			) ) {
				const v = values[ key ] ?? '';
				if ( v !== '' ) {
					settings[ key ] =
						field.type === 'integer' ? Number( v ) : v;
				}
			}
			return api.post( 'email/transports', {
				body: {
					type,
					name: name.trim(),
					settings: JSON.stringify( settings ),
					isDefault: isDefault === 'yes',
				},
			} );
		},
		onSuccess: () => {
			announceResult( __( 'Email connection added.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEYS.transports } );
			onClose();
		},
	} );
	const errors = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Add a sending connection', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-email-connection"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Add connection', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-email-connection"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ ! Object.keys( errors ).length && (
					<ActionError error={ save.error } />
				) }
				<Select
					label={ __( 'Provider', 'cliedesk' ) }
					value={ type }
					onChange={ ( v ) => {
						setType( v );
						setValues( {} );
					} }
					options={ ( providers.data ?? [] )
						.filter( ( p ) => p.id !== 'wp_mail' )
						.map( ( p ) => ( { id: p.id, label: p.label } ) ) }
				/>
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					isRequired
					value={ name }
					onChange={ setName }
					errorMessage={ errors.name ?? null }
				/>
				{ Object.entries( provider?.fields ?? {} ).map(
					( [ key, field ] ) =>
						field.enum ? (
							<Select
								key={ key }
								label={ field.label }
								value={ values[ key ] ?? field.enum[ 0 ] ?? '' }
								onChange={ ( v ) =>
									setValues( ( o ) => ( {
										...o,
										[ key ]: v,
									} ) )
								}
								options={ field.enum.map( ( v ) => ( {
									id: v,
									label: v.toUpperCase(),
								} ) ) }
							/>
						) : (
							<TextField
								key={ key }
								label={ field.label }
								type={ field.secret ? 'password' : 'text' }
								isRequired={ field.required }
								inputMode={
									field.type === 'integer'
										? 'numeric'
										: undefined
								}
								value={ values[ key ] ?? '' }
								onChange={ ( v ) =>
									setValues( ( o ) => ( {
										...o,
										[ key ]: v,
									} ) )
								}
								errorMessage={
									errors[ `settings.${ key }` ] ?? null
								}
							/>
						)
				) }
				<Select
					label={ __( 'Use for all email', 'cliedesk' ) }
					value={ isDefault }
					onChange={ setIsDefault }
					options={ [
						{
							id: 'yes',
							label: __(
								'Yes, send everything through it',
								'cliedesk'
							),
						},
						{
							id: 'no',
							label: __(
								'No, keep the current default',
								'cliedesk'
							),
						},
					] }
				/>
			</form>
		</Modal>
	);
}

interface Suppression {
	id: number;
	email: string | null;
	scope: 'all' | 'notices';
	reason: string;
	detail: string | null;
	createdAt: string;
	expiresAt: string | null;
}

/**
 * Plain label of a suppression reason.
 *
 * @param s Suppression.
 */
export function blockedReason( s: Suppression ): string {
	return (
		{
			hard_bounce: __( 'Bounced', 'cliedesk' ),
			soft_bounce: __( 'Bounced several times', 'cliedesk' ),
			complaint: __( 'Marked as spam', 'cliedesk' ),
			provider: __( 'Blocked by the provider', 'cliedesk' ),
			unsubscribe: __( 'Unsubscribed', 'cliedesk' ),
			manual: __( 'Blocked by hand', 'cliedesk' ),
		}[ s.reason ] ?? s.reason
	);
}

/**
 * Blocked addresses (CHN-04, §10.4). Shown to email managers only (the list answers 403 to others).
 */
function Blocked() {
	const qc = useQueryClient();
	const list = useQuery( {
		queryKey: KEYS.blocked,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Suppression[] } >(
					'email/suppressions',
					{ signal }
				)
			).data?.items ?? [],
		retry: false,
	} );
	const [ email, setEmail ] = useState( '' );
	const [ scope, setScope ] = useState< string >( 'all' );
	const done = ( message: string ) => {
		announceResult( message );
		void qc.invalidateQueries( { queryKey: KEYS.blocked } );
	};
	const add = useMutation( {
		mutationFn: () =>
			api.post( 'email/suppressions', {
				body: { email: email.trim(), scope },
			} ),
		onSuccess: () => {
			setEmail( '' );
			done( __( 'Address blocked.', 'cliedesk' ) );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `email/suppressions/${ id }` ),
		onSuccess: () => done( __( 'Address unblocked.', 'cliedesk' ) ),
	} );
	if ( list.isError ) {
		return null;
	}
	const errors = apiFieldErrors( add.error );
	return (
		<section
			aria-labelledby="cd-email-blocked"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-email-blocked" className="text-lg font-semibold">
				{ __( 'Blocked addresses', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __( 'Email is not sent to these addresses.', 'cliedesk' ) }
			</Muted>
			{ list.isPending && <LoadingRegion /> }
			{ !! list.data?.length && (
				<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
					{ list.data.map( ( s ) => (
						<li
							key={ s.id }
							className="flex flex-wrap items-center gap-3 px-4 py-3"
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="font-medium">
									{ s.email ??
										__( 'Erased address', 'cliedesk' ) }
								</span>
								<span className="text-sm text-fg-muted">
									{ blockedReason( s ) }
									{ s.scope === 'notices' &&
										' · ' +
											__(
												'replies still allowed',
												'cliedesk'
											) }
									{ s.detail && ` · ${ s.detail }` }
								</span>
							</div>
							<Button
								size="sm"
								isLoading={
									remove.isPending &&
									remove.variables === s.id
								}
								onPress={ () => remove.mutate( s.id ) }
							>
								{ sprintf(
									/* translators: %s: email address. */
									__( 'Unblock %s', 'cliedesk' ),
									s.email ?? __( 'address', 'cliedesk' )
								) }
							</Button>
						</li>
					) ) }
				</ul>
			) }
			<form
				noValidate
				className="flex flex-wrap items-end gap-2"
				onSubmit={ ( e ) => {
					e.preventDefault();
					add.mutate();
				} }
			>
				<TextField
					label={ __( 'Block an address', 'cliedesk' ) }
					inputMode="email"
					value={ email }
					onChange={ setEmail }
					errorMessage={ errors.email ?? null }
				/>
				<Select
					label={ __( 'Block', 'cliedesk' ) }
					value={ scope }
					onChange={ setScope }
					options={ [
						{ id: 'all', label: __( 'All email', 'cliedesk' ) },
						{
							id: 'notices',
							label: __( 'Notices only', 'cliedesk' ),
						},
					] }
				/>
				<Button type="submit" isLoading={ add.isPending }>
					{ __( 'Block', 'cliedesk' ) }
				</Button>
			</form>
			{ ! Object.keys( errors ).length && (
				<ActionError error={ add.error ?? remove.error } />
			) }
		</section>
	);
}

type ReplyOptionKey = 'include_history';

/**
 * How replies are sent (CHN-43 Free part): sender name and quoted history. Reply to all, the reply-above line and
 * the archive copy are Pro (`email.reply_options`).
 */
function ReplyOptions() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'email' ) );
	const [ draft, setDraft ] = useState< Record< string, unknown > >( {} );
	const value = ( key: string ): unknown =>
		key in draft ? draft[ key ] : q.data?.values?.[ key ]?.value;
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/email', {
				body: { values: draft },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Reply options saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'email' ] } );
		},
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	const toggles: Array< [ ReplyOptionKey, string ] > = [
		[
			'include_history',
			__( 'Quote the customer’s last message', 'cliedesk' ),
		],
	];
	return (
		<section
			aria-labelledby="cd-email-replies"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-email-replies" className="text-lg font-semibold">
				{ __( 'Replies', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Replies are sent from your sender address and link to the portal, where customers answer.',
					'cliedesk'
				) }
			</Muted>
			<Select
				label={ __( 'Sender name', 'cliedesk' ) }
				value={ String( value( 'from_name_format' ) ?? 'agent_brand' ) }
				onChange={ ( v ) =>
					setDraft( ( d ) => ( { ...d, from_name_format: v } ) )
				}
				options={ [
					{
						id: 'agent_brand',
						label: __(
							'Agent at brand ("Anna at Shop")',
							'cliedesk'
						),
					},
					{ id: 'brand', label: __( 'Brand name', 'cliedesk' ) },
					{ id: 'site', label: __( 'Site sender name', 'cliedesk' ) },
				] }
			/>
			{ toggles.map( ( [ key, label ] ) => (
				<Checkbox
					key={ key }
					isSelected={ Boolean( value( key ) ) }
					onChange={ ( on ) =>
						setDraft( ( d ) => ( { ...d, [ key ]: on } ) )
					}
				>
					{ label }
				</Checkbox>
			) ) }
			<div>
				<Button
					isLoading={ save.isPending }
					isDisabled={ ! Object.keys( draft ).length }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save reply options', 'cliedesk' ) }
				</Button>
			</div>
			<ActionError error={ save.error } />
			<Slot name="email.reply_options" fillProps={ { kit: emailKit } } />
		</section>
	);
}

function Mode() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'email' ) );
	const [ mode, setMode ] = useState< string | null >( null );
	const [ redirect, setRedirect ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/email', {
				body: {
					values: {
						mode: mode ?? q.data?.values?.mode?.value,
						redirect_to:
							redirect ??
							q.data?.values?.redirect_to?.value ??
							'',
					},
				},
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			announceResult( __( 'Sending mode saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'email' ] } );
		},
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	const current = mode ?? String( q.data?.values?.mode?.value ?? 'live' );
	return (
		<div className="flex flex-wrap items-end gap-3">
			<Select
				label={ __( 'Sending', 'cliedesk' ) }
				value={ current }
				onChange={ setMode }
				options={ [
					{ id: 'live', label: __( 'On', 'cliedesk' ) },
					{
						id: 'paused',
						label: __( 'Paused (email waits)', 'cliedesk' ),
					},
					{
						id: 'redirect',
						label: __(
							'Test: send everything to one address',
							'cliedesk'
						),
					},
				] }
			/>
			{ current === 'redirect' && (
				<TextField
					label={ __( 'Test address', 'cliedesk' ) }
					inputMode="email"
					value={
						redirect ??
						String( q.data?.values?.redirect_to?.value ?? '' )
					}
					onChange={ setRedirect }
				/>
			) }
			<Button
				isLoading={ save.isPending }
				onPress={ () => save.mutate() }
			>
				{ __( 'Save', 'cliedesk' ) }
			</Button>
			<ActionError error={ save.error } />
		</div>
	);
}

/**
 * Section.
 */
export default function EmailSection() {
	const qc = useQueryClient();
	const transports = useQuery( {
		queryKey: KEYS.transports,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Connection[] } >( 'email/transports', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const outbox = useQuery( {
		queryKey: KEYS.outbox,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: OutboxRow[] } >( 'email/outbox', {
					query: { limit: 25 },
					signal,
				} )
			).data?.items ?? [],
	} );
	const [ adding, setAdding ] = useState( false );
	const [ testTo, setTestTo ] = useState( '' );
	const test = useMutation( {
		mutationFn: () =>
			api.post< OutboxRow >( 'email/test', {
				body: { to: testTo.trim() },
			} ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %s: delivery status. */
					__( 'Test email: %s', 'cliedesk' ),
					deliveryLabel( r.data )
				)
			);
			void qc.invalidateQueries( { queryKey: KEYS.outbox } );
		},
	} );
	if ( transports.isError ) {
		return (
			<QueryFailed
				title={ __( 'Could not load the email settings', 'cliedesk' ) }
				error={ transports.error }
				onRetry={ () => void transports.refetch() }
			/>
		);
	}
	return (
		<div className="flex flex-col gap-8">
			<section
				aria-labelledby="cd-email-sending"
				className="flex flex-col gap-3"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 id="cd-email-sending" className="text-lg font-semibold">
						{ __( 'Sending', 'cliedesk' ) }
					</h2>
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
						onPress={ () => setAdding( true ) }
					>
						{ __( 'Add connection', 'cliedesk' ) }
					</Button>
				</div>
				<Mode />
				{ transports.isPending ? (
					<LoadingRegion />
				) : (
					<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
						{ ! transports.data.some( ( t ) => t.isDefault ) && (
							<li className="px-4 py-3 text-sm">
								{ __(
									'WordPress mail sends your email (the default). Add an SMTP connection for better delivery.',
									'cliedesk'
								) }
							</li>
						) }
						{ transports.data.map( ( t ) => (
							<li
								key={ t.id }
								className="flex flex-wrap items-center gap-2 px-4 py-3"
							>
								<span className="font-medium">{ t.name }</span>
								<span className="text-sm text-fg-muted">
									{ t.typeLabel ?? t.type }
								</span>
								{ t.isDefault && (
									<Pill tone="success">
										{ __( 'Default', 'cliedesk' ) }
									</Pill>
								) }
								{ t.status !== 'active' && (
									<Pill tone="danger">
										{ t.statusReason ??
											__( 'Not working', 'cliedesk' ) }
									</Pill>
								) }
							</li>
						) ) }
					</ul>
				) }
				<form
					noValidate
					className="flex flex-wrap items-end gap-2"
					onSubmit={ ( e ) => {
						e.preventDefault();
						test.mutate();
					} }
				>
					<TextField
						label={ __( 'Send a test email to', 'cliedesk' ) }
						inputMode="email"
						value={ testTo }
						onChange={ setTestTo }
					/>
					<Button type="submit" isLoading={ test.isPending }>
						{ __( 'Send test', 'cliedesk' ) }
					</Button>
				</form>
				<ActionError error={ test.error } />
			</section>

			{ /* CHN-35/37 (Pro): incoming mailboxes, support addresses and incoming email options. */ }
			<Slot
				name="email.mailboxes"
				fillProps={ {
					connections: transports.data ?? [],
					kit: emailKit,
				} }
			/>

			<section
				aria-labelledby="cd-email-log"
				className="flex flex-col gap-3"
			>
				<h2 id="cd-email-log" className="text-lg font-semibold">
					{ __( 'Delivery log', 'cliedesk' ) }
				</h2>
				{ outbox.isPending && <LoadingRegion /> }
				{ ! outbox.isPending && ! outbox.data?.length && (
					<Muted>{ __( 'No email sent yet.', 'cliedesk' ) }</Muted>
				) }
				{ !! outbox.data?.length && (
					<table className="w-full text-sm">
						<caption className="sr-only">
							{ __( 'Latest emails', 'cliedesk' ) }
						</caption>
						<thead>
							<tr className="text-fg-muted">
								<th
									scope="col"
									className="py-1 text-start font-medium"
								>
									{ __( 'To', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="py-1 text-start font-medium"
								>
									{ __( 'Subject', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="py-1 text-start font-medium"
								>
									{ __( 'Status', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="py-1 text-start font-medium"
								>
									{ __( 'Queued', 'cliedesk' ) }
								</th>
							</tr>
						</thead>
						<tbody>
							{ outbox.data.map( ( r ) => (
								<tr
									key={ r.id }
									className="border-t border-line"
								>
									<td className="py-2 pe-3">
										{ r.to.join( ', ' ) }
									</td>
									<td className="py-2 pe-3">{ r.subject }</td>
									<td className="py-2 pe-3">
										{ deliveryLabel( r ) }
										{ r.error && (
											<span className="block text-xs text-fg-muted">
												{ r.error }
											</span>
										) }
									</td>
									<td className="py-2 text-fg-muted">
										{ fullTime( r.createdAt ) }
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				) }
			</section>
			{ can( 'cliedesk_manage_email' ) && <ReplyOptions /> }
			{ can( 'cliedesk_manage_email' ) && <SystemEmails /> }
			{ can( 'cliedesk_manage_email' ) && <Deliverability /> }
			<Blocked />
			{ can( 'cliedesk_manage_email' ) && <EmailLayoutEditor /> }
			{ adding && (
				<ConnectionDialog onClose={ () => setAdding( false ) } />
			) }
		</div>
	);
}
