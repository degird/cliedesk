/**
 * Settings → System → Trusted and blocked senders (SEC-16), for people with cliedesk_manage_spam.
 *
 * - List (GET senders?kind=&q=) with a kind filter and search; each rule shows its hits and last hit.
 * - Add (POST senders {pattern, kind, note}), change kind and note (PATCH senders/{id}; the pattern is fixed) and
 *   delete (DELETE senders/{id}, confirmed). A bad pattern comes back as 400 with fields.pattern, shown on the field.
 * - "Check an address" (GET senders/check?email=): what would happen to mail from it, and which rules match.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	ConfirmDestructive,
	LoadingRegion,
	Modal,
	RadioGroup,
	Select,
	TextField,
	EmptyState,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import {
	SENDER_KINDS,
	checkSender,
	senderCheckText,
	senderKeys,
	senderKindHelp,
	senderKindLabel,
	sendersQuery,
	type SenderCheck,
	type SenderKind,
	type SenderRule,
} from '../../inbox/spam';
import {
	announceResult,
	apiFieldErrors,
	validateEmail,
} from '../../workspace/forms';

type KindFilter = SenderKind | 'all';

function RuleDialog( {
	rule,
	onClose,
}: {
	rule: SenderRule | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ pattern, setPattern ] = useState( rule?.pattern ?? '' );
	const [ kind, setKind ] = useState< SenderKind >(
		rule?.kind ?? 'quarantine'
	);
	const [ note, setNote ] = useState( rule?.note ?? '' );
	const [ error, setError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: () =>
			rule
				? api.patch< SenderRule >( `senders/${ rule.id }`, {
						body: { kind, note: note.trim() },
					} )
				: api.post< SenderRule >( 'senders', {
						body: {
							pattern: pattern.trim().toLowerCase(),
							kind,
							...( note.trim() ? { note: note.trim() } : {} ),
						},
					} ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: senderKeys.all } );
			announceResult(
				rule
					? __( 'Sender rule saved.', 'cliedesk' )
					: __( 'Sender rule added.', 'cliedesk' )
			);
			onClose();
		},
	} );
	const server = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! rule && pattern.trim().length < 3 ) {
			setError(
				__(
					'Enter an email address, a domain such as example.com, or a wildcard such as *.example.com.',
					'cliedesk'
				)
			);
			return;
		}
		setError( null );
		save.mutate();
	};
	const hasFieldErrors = Object.keys( server ).length > 0;
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				rule
					? __( 'Change sender rule', 'cliedesk' )
					: __( 'Add a sender', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-sender-form"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ rule
							? __( 'Save', 'cliedesk' )
							: __( 'Add sender', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-sender-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ save.error && ! hasFieldErrors ? (
					<ActionError
						error={ save.error }
						onDismiss={ () => save.reset() }
					/>
				) : null }
				<TextField
					id="cd-sender-pattern"
					label={ __( 'Email, domain or wildcard', 'cliedesk' ) }
					description={ __(
						'For example ana@example.com, example.com or *.example.com.',
						'cliedesk'
					) }
					value={ pattern }
					onChange={ ( v ) => {
						setPattern( v );
						setError( null );
					} }
					isRequired
					isReadOnly={ !! rule }
					maxLength={ 191 }
					errorMessage={ error ?? server.pattern ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus={ ! rule }
				/>
				<RadioGroup
					id="cd-sender-kind"
					label={ __( 'What happens to their mail', 'cliedesk' ) }
					value={ kind }
					onChange={ ( k ) => setKind( k as SenderKind ) }
					options={ SENDER_KINDS.map( ( k ) => ( {
						id: k,
						label: senderKindLabel( k ),
						description: senderKindHelp( k ),
					} ) ) }
					errorMessage={ server.kind ?? null }
				/>
				<TextField
					id="cd-sender-note"
					label={ __( 'Note', 'cliedesk' ) }
					description={ __(
						'Optional. Why this rule exists.',
						'cliedesk'
					) }
					maxLength={ 255 }
					value={ note }
					onChange={ setNote }
					errorMessage={ server.note ?? null }
				/>
			</form>
		</Modal>
	);
}

function CheckAddress() {
	const [ email, setEmail ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const check = useMutation< SenderCheck, unknown, string >( {
		mutationFn: ( e ) => checkSender( e ),
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const invalid = validateEmail( email.trim() );
		if ( ! email.trim() || invalid ) {
			setError( invalid ?? __( 'Enter an email address.', 'cliedesk' ) );
			return;
		}
		setError( null );
		check.mutate( email.trim() );
	};
	const server = apiFieldErrors( check.error );
	return (
		<section
			aria-labelledby="cd-senders-check"
			className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
		>
			<h2 id="cd-senders-check" className="font-semibold">
				{ __( 'Check an address', 'cliedesk' ) }
			</h2>
			<form
				noValidate
				onSubmit={ submit }
				className="flex flex-wrap items-end gap-2"
			>
				<TextField
					className="min-w-64 flex-1"
					label={ __( 'Email address', 'cliedesk' ) }
					inputMode="email"
					value={ email }
					onChange={ ( v ) => {
						setEmail( v );
						setError( null );
						check.reset();
					} }
					errorMessage={ error ?? server.email ?? null }
				/>
				<Button type="submit" isLoading={ check.isPending }>
					{ __( 'Check', 'cliedesk' ) }
				</Button>
			</form>
			{ check.error && ! server.email ? (
				<ActionError error={ check.error } />
			) : null }
			<div role="status">
				{ check.data && (
					<div className="flex flex-col gap-1 text-sm">
						<p className="font-medium">
							{ senderCheckText( check.data.action ) }
						</p>
						{ check.data.rules.length > 0 && (
							<ul className="list-disc ps-5 text-fg-muted">
								{ check.data.rules.map( ( r ) => (
									<li key={ r.id }>
										{ sprintf(
											/* translators: 1: pattern, 2: what the rule does. */
											__( '%1$s: %2$s', 'cliedesk' ),
											r.pattern,
											senderKindLabel( r.kind )
										) }
									</li>
								) ) }
							</ul>
						) }
					</div>
				) }
			</div>
		</section>
	);
}

/**
 * Section.
 */
export default function SendersSection() {
	const qc = useQueryClient();
	const [ kind, setKind ] = useState< KindFilter >( 'all' );
	const [ input, setInput ] = useState( '' );
	const [ q, setQ ] = useState( '' );
	const [ editing, setEditing ] = useState< SenderRule | 'new' | null >(
		null
	);
	const [ deleting, setDeleting ] = useState< SenderRule | null >( null );
	const list = useQuery( sendersQuery( kind, q ) );
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `senders/${ id }` ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: senderKeys.all } );
			announceResult( __( 'Sender rule deleted.', 'cliedesk' ) );
			setDeleting( null );
		},
	} );
	const rules = list.data ?? [];
	return (
		<div className="flex flex-col gap-6">
			<p className="text-fg-muted">
				{ __(
					'Trusted senders always reach the inbox. Blocked senders go to Spam or are refused. Rules match an email address, a domain, or every subdomain with a wildcard.',
					'cliedesk'
				) }
			</p>
			<CheckAddress />
			<section
				aria-labelledby="cd-senders-rules"
				className="flex flex-col gap-3"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 id="cd-senders-rules" className="font-semibold">
						{ __( 'Sender rules', 'cliedesk' ) }
					</h2>
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 14 } /> }
						onPress={ () => setEditing( 'new' ) }
					>
						{ __( 'Add sender', 'cliedesk' ) }
					</Button>
				</div>
				<form
					role="search"
					noValidate
					onSubmit={ ( e ) => {
						e.preventDefault();
						setQ( input.trim() );
					} }
					className="flex flex-wrap items-end gap-2"
				>
					<Select
						label={ __( 'Show', 'cliedesk' ) }
						value={ kind }
						onChange={ ( k ) => setKind( k as KindFilter ) }
						options={ [
							{ id: 'all', label: __( 'All rules', 'cliedesk' ) },
							...SENDER_KINDS.map( ( k ) => ( {
								id: k,
								label: senderKindLabel( k ),
							} ) ),
						] }
					/>
					<TextField
						className="min-w-48 flex-1"
						label={ __( 'Search senders', 'cliedesk' ) }
						inputMode="search"
						value={ input }
						onChange={ setInput }
					/>
					<Button type="submit">
						{ __( 'Search', 'cliedesk' ) }
					</Button>
				</form>
				{ list.isPending && (
					<LoadingRegion
						label={ __( 'Loading sender rules…', 'cliedesk' ) }
					/>
				) }
				{ list.isError && (
					<QueryFailed
						title={ __(
							'Could not load the sender rules',
							'cliedesk'
						) }
						error={ list.error }
						onRetry={ () => void list.refetch() }
					/>
				) }
				{ list.isSuccess &&
					! rules.length &&
					( q || kind !== 'all' ? (
						<Muted>
							{ __( 'No sender rules match.', 'cliedesk' ) }
						</Muted>
					) : (
						<EmptyState
							headingLevel={ 3 }
							title={ __( 'No sender rules yet.', 'cliedesk' ) }
							description={ __(
								'For example: always accept mail from your shipping partner, or block a domain that only sends spam.',
								'cliedesk'
							) }
							actions={
								// ADM-04: every empty state offers a way to start.
								<Button onPress={ () => setEditing( 'new' ) }>
									{ __(
										'Add your first sender rule',
										'cliedesk'
									) }
								</Button>
							}
						/>
					) ) }
				{ rules.length > 0 && (
					<div className="overflow-x-auto rounded-lg border border-line bg-surface">
						<table className="w-full text-start text-sm">
							<caption className="sr-only">
								{ __( 'Sender rules', 'cliedesk' ) }
							</caption>
							<thead className="border-b border-line text-fg-muted">
								<tr>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Sender', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Rule', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Note', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-end font-medium"
									>
										{ __( 'Hits', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Last hit', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										<span className="sr-only">
											{ __( 'Actions', 'cliedesk' ) }
										</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{ rules.map( ( r ) => (
									<tr
										key={ r.id }
										className="border-b border-line last:border-b-0"
									>
										<td className="px-3 py-2 font-medium">
											<bdi>{ r.pattern }</bdi>
										</td>
										<td className="px-3 py-2">
											<Pill
												tone={
													r.kind === 'trust'
														? 'success'
														: 'warning'
												}
											>
												{ senderKindLabel( r.kind ) }
											</Pill>
										</td>
										<td className="px-3 py-2 text-fg-muted">
											{ r.note || '—' }
										</td>
										<td className="cd-tabular px-3 py-2 text-end">
											{ r.hits }
										</td>
										<td className="px-3 py-2 whitespace-nowrap">
											{ r.lastHitAt ? (
												<time dateTime={ r.lastHitAt }>
													{ fullTime( r.lastHitAt ) }
												</time>
											) : (
												<span className="text-fg-muted">
													{ __(
														'Never',
														'cliedesk'
													) }
												</span>
											) }
										</td>
										<td className="px-3 py-2">
											<div className="flex gap-1">
												<Button
													size="sm"
													variant="ghost"
													aria-label={ sprintf(
														/* translators: %s: sender pattern. */
														__(
															'Change %s',
															'cliedesk'
														),
														r.pattern
													) }
													onPress={ () =>
														setEditing( r )
													}
												>
													{ __(
														'Change',
														'cliedesk'
													) }
												</Button>
												<Button
													size="sm"
													variant="ghost"
													aria-label={ sprintf(
														/* translators: %s: sender pattern. */
														__(
															'Delete %s',
															'cliedesk'
														),
														r.pattern
													) }
													onPress={ () =>
														setDeleting( r )
													}
												>
													{ __(
														'Delete',
														'cliedesk'
													) }
												</Button>
											</div>
										</td>
									</tr>
								) ) }
							</tbody>
						</table>
					</div>
				) }
			</section>
			{ editing && (
				<RuleDialog
					rule={ editing === 'new' ? null : editing }
					onClose={ () => setEditing( null ) }
				/>
			) }
			<ConfirmDestructive
				isOpen={ deleting !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setDeleting( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: sender pattern. */
					__( 'Delete the rule for %s?', 'cliedesk' ),
					deleting?.pattern ?? ''
				) }
				description={ __(
					'Mail from this sender is screened by the spam filter as usual again.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete rule', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( deleting ) {
						remove.mutate( deleting.id );
					}
				} }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</div>
	);
}
