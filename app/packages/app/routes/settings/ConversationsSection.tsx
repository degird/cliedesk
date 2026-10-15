/**
 * Settings → Workspace → Conversations (CNV-12, CNV-13, CNV-14, CNV-15, CNV-16), for cliedesk_manage_settings:
 * - Statuses: grouped by category (New, Open, Waiting, Resolved, Closed). Add custom statuses to every category but
 *   Closed (system only), edit label, customer label and description (Pro: "pauses the SLA"), turn a status off, and change
 *   the order inside a category (POST statuses/order with the whole order). System statuses keep their key.
 * - Lifecycle: auto-close days, "new conversation after" days, undo window and merge undo days
 *   (PATCH settings/conversations, If-Match), each with its range.
 */
import {
	api,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	IconButton,
	LoadingRegion,
	Modal,
	Slot,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { describeError } from '../../components/RouteError';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	announceResult,
	apiFieldErrors,
} from '../../workspace/forms';
import { checkRange } from './SecuritySection';

export interface StatusDetail {
	id: number;
	key: string;
	category: string;
	label: string;
	customerLabel: string;
	description: string;
	pausesSla: boolean;
	system: boolean;
	active: boolean;
	sort: number;
	version: number;
}

export const CATEGORIES = [ 'new', 'open', 'waiting', 'resolved', 'closed' ];

const statusKey = [ 'statuses' ] as const;

const statusDetailsQuery = () =>
	queryOptions( {
		queryKey: [ 'statuses', 'settings' ] as const,
		queryFn: async ( { signal } ) =>
			(
				( await api.get< StatusDetail[] >( 'statuses', { signal } ) )
					.data ?? []
			)
				.slice()
				.sort( ( a, b ) => a.sort - b.sort || a.id - b.id ),
	} );

export function categoryName( c: string ): string {
	switch ( c ) {
		case 'new':
			return __( 'New', 'cliedesk' );
		case 'open':
			return __( 'Open', 'cliedesk' );
		case 'waiting':
			return __( 'Waiting', 'cliedesk' );
		case 'resolved':
			return __( 'Resolved', 'cliedesk' );
		default:
			return __( 'Closed', 'cliedesk' );
	}
}

/**
 * The whole order after moving one status up or down inside its category.
 *
 * @param all  Statuses in order.
 * @param id   Status to move.
 * @param step -1 up, +1 down.
 */
export function moveStatus(
	all: StatusDetail[],
	id: number,
	step: -1 | 1
): number[] {
	const ids = all.map( ( s ) => s.id );
	const me = all.find( ( s ) => s.id === id );
	if ( ! me ) {
		return ids;
	}
	const same = all.filter( ( s ) => s.category === me.category );
	const at = same.findIndex( ( s ) => s.id === id );
	const other = same[ at + step ];
	if ( ! other ) {
		return ids;
	}
	const a = ids.indexOf( id );
	const b = ids.indexOf( other.id );
	[ ids[ a ], ids[ b ] ] = [ ids[ b ] as number, ids[ a ] as number ];
	return ids;
}

function StatusDialog( {
	status,
	category,
	onClose,
}: {
	status: StatusDetail | null;
	category: string;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ label, setLabel ] = useState( status?.label ?? '' );
	const [ customer, setCustomer ] = useState( status?.customerLabel ?? '' );
	const [ description, setDescription ] = useState(
		status?.description ?? ''
	);
	// SLA-12 (Pro): whether the status pauses SLA clocks; sent only when Pro's control changed it.
	const [ pauses, setPauses ] = useState< boolean | null >( null );
	const [ error, setError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			status
				? api.patch< StatusDetail >( `statuses/${ status.id }`, {
						body,
						ifMatch: versionTag( status.version ),
					} )
				: api.post< StatusDetail >( 'statuses', {
						body: { ...body, category },
					} ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %s: status name. */
					__( 'Status “%s” saved.', 'cliedesk' ),
					r.data.label
				)
			);
			void qc.invalidateQueries( { queryKey: statusKey } );
			onClose();
		},
	} );
	const fields = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! label.trim() ) {
			setError( __( 'Enter a name.', 'cliedesk' ) );
			return;
		}
		setError( null );
		save.mutate( {
			label: label.trim(),
			customerLabel: customer.trim(),
			description: description.trim(),
			...( pauses === null ? {} : { pausesSla: pauses } ),
		} );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				status
					? sprintf(
							/* translators: %s: status name. */
							__( 'Edit status %s', 'cliedesk' ),
							status.label
						)
					: sprintf(
							/* translators: %s: status category, e.g. "Waiting". */
							__( 'Add a status to %s', 'cliedesk' ),
							categoryName( category )
						)
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-status"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save status', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-status"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ isConflict( save.error ) ? (
					<ConflictBanner
						onReload={ () => {
							void qc.invalidateQueries( {
								queryKey: statusKey,
							} );
							onClose();
						} }
					/>
				) : (
					<ActionError error={ save.error } />
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					value={ label }
					onChange={ setLabel }
					maxLength={ 191 }
					isRequired
					errorMessage={ error ?? fields.label ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<TextField
					label={ __( 'Name customers see', 'cliedesk' ) }
					description={ __(
						'Optional. Customers see this in the portal and the widget instead of the name above.',
						'cliedesk'
					) }
					value={ customer }
					onChange={ setCustomer }
					maxLength={ 191 }
					errorMessage={ fields.customerLabel ?? null }
				/>
				<TextField
					label={ __( 'Description', 'cliedesk' ) }
					value={ description }
					onChange={ setDescription }
					maxLength={ 2000 }
					multiline
					errorMessage={ fields.description ?? null }
				/>
				<Slot
					name="statuses.pauses_sla"
					fillProps={ {
						value:
							pauses ??
							status?.pausesSla ??
							category === 'waiting',
						onChange: setPauses,
					} }
				/>
			</form>
		</Modal>
	);
}

function Statuses() {
	const qc = useQueryClient();
	const q = useQuery( statusDetailsQuery() );
	const [ editing, setEditing ] = useState< {
		status: StatusDetail | null;
		category: string;
	} | null >( null );
	const reorder = useMutation( {
		mutationFn: ( ids: number[] ) =>
			api.post( 'statuses/order', { body: { ids } } ),
		onSuccess: () => announceResult( __( 'Order saved.', 'cliedesk' ) ),
		onSettled: () => void qc.invalidateQueries( { queryKey: statusKey } ),
	} );
	const toggle = useMutation( {
		mutationFn: ( s: StatusDetail ) =>
			api.patch< StatusDetail >( `statuses/${ s.id }`, {
				body: { active: ! s.active },
				ifMatch: versionTag( s.version ),
			} ),
		onSuccess: ( r ) =>
			announceResult(
				r.data.active
					? sprintf(
							/* translators: %s: status name. */
							__( 'Status “%s” turned on.', 'cliedesk' ),
							r.data.label
						)
					: sprintf(
							/* translators: %s: status name. */
							__( 'Status “%s” turned off.', 'cliedesk' ),
							r.data.label
						)
			),
		onSettled: () => void qc.invalidateQueries( { queryKey: statusKey } ),
	} );
	if ( q.isPending ) {
		return (
			<LoadingRegion label={ __( 'Loading statuses…', 'cliedesk' ) } />
		);
	}
	if ( q.isError ) {
		return (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the statuses', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const all = q.data;
	const failure = reorder.error ?? toggle.error;
	return (
		<section aria-labelledby="cd-statuses" className="flex flex-col gap-4">
			<h2 id="cd-statuses" className="text-lg font-semibold">
				{ __( 'Statuses', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Every status belongs to a category. The category decides the lane and the reports; the status name is what agents pick. Closed is set by the system only.',
					'cliedesk'
				) }
			</p>
			{ failure && (
				<Banner
					tone="danger"
					role="alert"
					title={ describeError( failure ) }
				/>
			) }
			{ CATEGORIES.map( ( c ) => {
				const items = all.filter( ( s ) => s.category === c );
				return (
					<section
						key={ c }
						aria-labelledby={ `cd-status-cat-${ c }` }
						className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h3
								id={ `cd-status-cat-${ c }` }
								className="font-semibold"
							>
								{ categoryName( c ) }
							</h3>
							{ c !== 'closed' && (
								<Button
									size="sm"
									iconStart={
										<Plus aria-hidden="true" size={ 14 } />
									}
									onPress={ () =>
										setEditing( {
											status: null,
											category: c,
										} )
									}
									aria-label={ sprintf(
										/* translators: %s: status category. */
										__( 'Add a status to %s', 'cliedesk' ),
										categoryName( c )
									) }
								>
									{ __( 'Add status', 'cliedesk' ) }
								</Button>
							) }
						</div>
						{ items.length === 0 ? (
							<Muted>{ __( 'No statuses.', 'cliedesk' ) }</Muted>
						) : (
							<ul className="flex flex-col divide-y divide-line">
								{ items.map( ( s, i ) => (
									<li
										key={ s.id }
										className="flex flex-wrap items-center gap-3 py-2"
									>
										<div className="flex min-w-0 flex-1 flex-col">
											<span className="flex flex-wrap items-center gap-2 font-medium">
												<bdi>{ s.label }</bdi>
												{ s.system && (
													<Pill>
														{ __(
															'Built in',
															'cliedesk'
														) }
													</Pill>
												) }
												{ ! s.active && (
													<Pill tone="warning">
														{ __(
															'Off',
															'cliedesk'
														) }
													</Pill>
												) }
												<Slot
													name="statuses.row.sla"
													fillProps={ { status: s } }
												/>
											</span>
											{ s.customerLabel &&
												s.customerLabel !== s.label && (
													<span className="text-sm text-fg-muted">
														{ sprintf(
															/* translators: %s: name customers see. */
															__(
																'Customers see: %s',
																'cliedesk'
															),
															s.customerLabel
														) }
													</span>
												) }
										</div>
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: status name. */
												__( 'Move %s up', 'cliedesk' ),
												s.label
											) }
											icon={
												<ArrowUp
													aria-hidden="true"
													size={ 14 }
												/>
											}
											isDisabled={
												i === 0 || reorder.isPending
											}
											onPress={ () =>
												reorder.mutate(
													moveStatus( all, s.id, -1 )
												)
											}
										/>
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: status name. */
												__(
													'Move %s down',
													'cliedesk'
												),
												s.label
											) }
											icon={
												<ArrowDown
													aria-hidden="true"
													size={ 14 }
												/>
											}
											isDisabled={
												i === items.length - 1 ||
												reorder.isPending
											}
											onPress={ () =>
												reorder.mutate(
													moveStatus( all, s.id, 1 )
												)
											}
										/>
										<Button
											size="sm"
											onPress={ () =>
												setEditing( {
													status: s,
													category: c,
												} )
											}
											aria-label={ sprintf(
												/* translators: %s: status name. */
												__( 'Edit %s', 'cliedesk' ),
												s.label
											) }
										>
											{ __( 'Edit', 'cliedesk' ) }
										</Button>
										{ ! s.system && (
											<Button
												size="sm"
												variant="ghost"
												isLoading={
													toggle.isPending &&
													toggle.variables?.id ===
														s.id
												}
												onPress={ () =>
													toggle.mutate( s )
												}
												aria-label={
													s.active
														? sprintf(
																/* translators: %s: status name. */
																__(
																	'Turn off %s',
																	'cliedesk'
																),
																s.label
															)
														: sprintf(
																/* translators: %s: status name. */
																__(
																	'Turn on %s',
																	'cliedesk'
																),
																s.label
															)
												}
											>
												{ s.active
													? __(
															'Turn off',
															'cliedesk'
														)
													: __(
															'Turn on',
															'cliedesk'
														) }
											</Button>
										) }
									</li>
								) ) }
							</ul>
						) }
					</section>
				);
			} ) }
			{ editing && (
				<StatusDialog
					status={ editing.status }
					category={ editing.category }
					onClose={ () => setEditing( null ) }
				/>
			) }
		</section>
	);
}

export const LIFECYCLE: NumberSetting[] = [
	{
		key: 'auto_close_days',
		min: 1,
		max: 90,
		label: () =>
			__( 'Close resolved conversations after (days)', 'cliedesk' ),
		help: () =>
			__(
				'A resolved conversation closes after this many days without a customer reply (1–90). Types can set their own.',
				'cliedesk'
			),
	},
	{
		key: 'new_after_days',
		min: 1,
		max: 365,
		label: () => __( 'Start a new conversation after (days)', 'cliedesk' ),
		help: () =>
			__(
				'A customer reply to a conversation resolved longer ago than this starts a new conversation (1–365).',
				'cliedesk'
			),
	},
	{
		key: 'undo_seconds',
		min: 0,
		max: 30,
		label: () => __( 'Undo window for replies (seconds)', 'cliedesk' ),
		help: () =>
			__(
				'Replies wait this long with an Undo button before they are sent (0–30; 0 sends at once).',
				'cliedesk'
			),
	},
	{
		key: 'merge_undo_days',
		min: 1,
		max: 365,
		label: () => __( 'Merges can be undone for (days)', 'cliedesk' ),
		help: () => __( 'From 1 to 365 days.', 'cliedesk' ),
	},
];

export interface NumberSetting {
	key: string;
	min: number;
	max: number;
	label: () => string;
	help: () => string;
}

export const INBOX_SETTINGS: NumberSetting[] = [
	{
		key: 'slow_view_ms',
		min: 0,
		max: 30000,
		label: () => __( 'Warn about slow views after (ms)', 'cliedesk' ),
		help: () =>
			__(
				'A view that takes longer than this shows a warning with a hint about indexes (0–30000; default 1000).',
				'cliedesk'
			),
	},
];

/**
 * Form of whole-number settings of one module.
 *
 * @param props        Props.
 * @param props.module Settings module.
 * @param props.items  Settings.
 * @param props.title  Heading.
 * @param props.saved  Message after saving.
 * @param props.failed Title when loading fails.
 */
function NumberSettings( {
	module,
	items,
	title,
	saved,
	failed,
}: {
	module: string;
	items: NumberSetting[];
	title: string;
	saved: string;
	failed: string;
} ) {
	const headingId = `cd-settings-${ module }`;
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( module ) );
	const [ values, setValues ] = useState< Record< string, string > | null >(
		null
	);
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	useEffect( () => {
		if ( q.data?.values ) {
			setValues(
				Object.fromEntries(
					items.map( ( s ) => [
						s.key,
						String( q.data.values[ s.key ]?.value ?? '' ),
					] )
				)
			);
		}
	}, [ q.data, items ] );
	const save = useMutation( {
		mutationFn: ( body: Record< string, number > ) =>
			api.patch( `settings/${ module }`, {
				body: { values: body },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			announceResult( saved );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', module ],
			} );
		},
	} );
	if ( q.isPending || ( q.data && ! values ) ) {
		return <LoadingRegion />;
	}
	if ( q.isError || ! values ) {
		return (
			<QueryFailed
				headingLevel={ 3 }
				title={ failed }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const server = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next: Record< string, string > = {};
		for ( const s of items ) {
			const err = checkRange( values[ s.key ] ?? '', s.min, s.max );
			if ( err ) {
				next[ s.key ] = err;
			}
		}
		setErrors( next );
		if ( Object.keys( next ).length ) {
			return;
		}
		const body: Record< string, number > = {};
		for ( const s of items ) {
			const n = Number( values[ s.key ] );
			if ( n !== Number( q.data?.values?.[ s.key ]?.value ) ) {
				body[ s.key ] = n;
			}
		}
		if ( Object.keys( body ).length ) {
			save.mutate( body );
		}
	};
	return (
		<section aria-labelledby={ headingId } className="flex flex-col gap-4">
			<h2 id={ headingId } className="text-lg font-semibold">
				{ title }
			</h2>
			<form
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
			>
				{ isConflict( save.error ) ? (
					<ConflictBanner onReload={ () => void q.refetch() } />
				) : (
					<ActionError error={ save.error } />
				) }
				<div className="grid gap-4 sm:grid-cols-2">
					{ items.map( ( s ) => (
						<TextField
							key={ s.key }
							label={ s.label() }
							description={ s.help() }
							inputMode="numeric"
							value={ values[ s.key ] ?? '' }
							onChange={ ( v ) =>
								setValues( ( cur ) => ( {
									...cur,
									[ s.key ]: v,
								} ) )
							}
							errorMessage={
								errors[ s.key ] ?? server[ s.key ] ?? null
							}
						/>
					) ) }
				</div>
				<div>
					<Button
						type="submit"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save settings', 'cliedesk' ) }
					</Button>
				</div>
			</form>
		</section>
	);
}

/**
 * CNV-25: the optional computed priority (a person's or a rule's choice always wins).
 */
function ComputedPriority() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'conversations' ) );
	const on = Boolean( q.data?.values?.computed_priority?.value );
	const save = useMutation( {
		mutationFn: ( value: boolean ) =>
			api.patch( 'settings/conversations', {
				body: { values: { computed_priority: value } },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			announceResult( __( 'Conversation settings saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'conversations' ],
			} );
		},
	} );
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
			<ActionError error={ save.error } />
			<Checkbox
				isSelected={ on }
				isDisabled={ ! q.data || save.isPending }
				onChange={ ( v ) => save.mutate( v ) }
			>
				{ __( 'Compute the priority', 'cliedesk' ) }
			</Checkbox>
			<Muted>
				{ __(
					'From urgency, sentiment, customer value and SLA. The history shows why. A priority set by a person or a rule is kept.',
					'cliedesk'
				) }
			</Muted>
		</div>
	);
}

/**
 * Section.
 */
export default function ConversationsSection() {
	return (
		<div className="flex flex-col gap-8">
			<Statuses />
			<NumberSettings
				module="conversations"
				items={ LIFECYCLE }
				title={ __( 'Lifecycle', 'cliedesk' ) }
				saved={ __( 'Conversation settings saved.', 'cliedesk' ) }
				failed={ __(
					'Could not load the conversation settings',
					'cliedesk'
				) }
			/>
			<ComputedPriority />
			<NumberSettings
				module="inbox"
				items={ INBOX_SETTINGS }
				title={ __( 'Inbox', 'cliedesk' ) }
				saved={ __( 'Inbox settings saved.', 'cliedesk' ) }
				failed={ __( 'Could not load the inbox settings', 'cliedesk' ) }
			/>
		</div>
	);
}
