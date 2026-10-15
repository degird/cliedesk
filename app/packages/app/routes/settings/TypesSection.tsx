/**
 * Settings → Workspace → Conversation types (CNV-06, CNV-13, CNV-16, CNV-31 form fields), for
 * cliedesk_manage_settings. Built-in types (Conversation, Request) and up to 50 custom ones: name, emoji icon,
 * visibility (customers or internal only), the ordered status set its picker shows (none chosen: every active
 * status), the form's fields in order, a title template for conversations without a subject, allowed queues and the
 * auto-close days. Archive and restore (types are never deleted).
 * Endpoints: GET types?archived, POST types, PATCH types/{id} (If-Match), POST types/{id}/archive.
 */
import {
	api,
	isApiError,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	EmptyState,
	ErrorState,
	IconButton,
	LoadingRegion,
	Modal,
	RadioGroup,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Plus, Shapes } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { describeError } from '../../components/RouteError';
import {
	fieldsQuery,
	queuePickerQuery,
	statusesQuery,
	type FieldDef,
	type QueueRef,
	type Status,
} from '../../inbox/api';
import { ActionError, Muted, Pill } from '../../inbox/components';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	announceResult,
	apiFieldErrors,
} from '../../workspace/forms';
import { categoryName } from './ConversationsSection';
import { moveIn } from './order';

export interface TypeDetail {
	id: number;
	key: string;
	name: string;
	icon: string | null;
	visibility: 'customer' | 'internal';
	statusIds: number[];
	form: string[];
	titleTemplate: string | null;
	allowedQueueIds: number[];
	autoCloseDays: number;
	system: boolean;
	archived: boolean;
	version: number;
}

const typeKeys = { all: [ 'types' ] as const };

const typeListQuery = ( archived: boolean ) =>
	queryOptions( {
		queryKey: [ 'types', 'settings', archived ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< TypeDetail[] >( 'types', {
					query: archived ? { archived: true } : {},
					signal,
				} )
			).data ?? [],
	} );

export { moveIn };

/** Days check (1–90), or null. */
export function daysError( raw: string ): string | null {
	const n = Number( raw );
	return raw.trim() === '' || ! Number.isInteger( n ) || n < 1 || n > 90
		? __( 'Enter a whole number from 1 to 90.', 'cliedesk' )
		: null;
}

/**
 * An ordered pick list: checkbox to include, arrows to order the included ones.
 *
 * @param props          Props.
 * @param props.legend   Legend.
 * @param props.items    Choices.
 * @param props.value    Chosen ids in order.
 * @param props.onChange Change.
 */
function OrderedPick< K extends string | number >( {
	legend,
	items,
	value,
	onChange,
}: {
	legend: string;
	items: Array< { id: K; label: string } >;
	value: K[];
	onChange: ( v: K[] ) => void;
} ) {
	const chosen = value
		.map( ( id ) => items.find( ( i ) => i.id === id ) )
		.filter( ( i ): i is { id: K; label: string } => !! i );
	const rest = items.filter( ( i ) => ! value.includes( i.id ) );
	return (
		<fieldset className="flex flex-col gap-1">
			<legend className="pb-1 text-sm font-medium">{ legend }</legend>
			<ul className="flex flex-col gap-1">
				{ [ ...chosen, ...rest ].map( ( item ) => {
					const on = value.includes( item.id );
					const at = value.indexOf( item.id );
					return (
						<li
							key={ String( item.id ) }
							className="flex items-center gap-2"
						>
							<Checkbox
								isSelected={ on }
								onChange={ ( v ) =>
									onChange(
										v
											? [ ...value, item.id ]
											: value.filter(
													( x ) => x !== item.id
												)
									)
								}
							>
								{ item.label }
							</Checkbox>
							{ on && (
								<>
									<IconButton
										size="sm"
										label={ sprintf(
											/* translators: %s: item name. */
											__( 'Move %s up', 'cliedesk' ),
											item.label
										) }
										icon={
											<ArrowUp
												aria-hidden="true"
												size={ 14 }
											/>
										}
										isDisabled={ at === 0 }
										onPress={ () =>
											onChange(
												moveIn( value, item.id, -1 )
											)
										}
									/>
									<IconButton
										size="sm"
										label={ sprintf(
											/* translators: %s: item name. */
											__( 'Move %s down', 'cliedesk' ),
											item.label
										) }
										icon={
											<ArrowDown
												aria-hidden="true"
												size={ 14 }
											/>
										}
										isDisabled={ at === value.length - 1 }
										onPress={ () =>
											onChange(
												moveIn( value, item.id, 1 )
											)
										}
									/>
								</>
							) }
						</li>
					);
				} ) }
			</ul>
		</fieldset>
	);
}

function TypeDialog( {
	type,
	statuses,
	fields,
	queues,
	onClose,
}: {
	type: TypeDetail | null;
	statuses: Status[];
	fields: FieldDef[];
	queues: QueueRef[];
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ name, setName ] = useState( type?.name ?? '' );
	const [ icon, setIcon ] = useState( type?.icon ?? '' );
	const [ visibility, setVisibility ] = useState< 'customer' | 'internal' >(
		type?.visibility ?? 'customer'
	);
	const [ statusIds, setStatusIds ] = useState< number[] >(
		type?.statusIds ?? []
	);
	const [ form, setForm ] = useState< string[] >( type?.form ?? [] );
	const [ title, setTitle ] = useState( type?.titleTemplate ?? '' );
	const [ queueIds, setQueueIds ] = useState< number[] >(
		type?.allowedQueueIds ?? []
	);
	const [ days, setDays ] = useState( String( type?.autoCloseDays ?? 4 ) );
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			type
				? api.patch< TypeDetail >( `types/${ type.id }`, {
						body,
						ifMatch: versionTag( type.version ),
					} )
				: api.post< TypeDetail >( 'types', { body } ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %s: type name. */
					__( 'Type “%s” saved.', 'cliedesk' ),
					r.data.name
				)
			);
			void qc.invalidateQueries( { queryKey: typeKeys.all } );
			onClose();
		},
	} );
	const server = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next: Record< string, string > = {};
		if ( ! type?.system && ! name.trim() ) {
			next.name = __( 'Enter a name.', 'cliedesk' );
		}
		const d = daysError( days );
		if ( d ) {
			next.autoCloseDays = d;
		}
		setErrors( next );
		if ( Object.keys( next ).length ) {
			return;
		}
		save.mutate( {
			...( type?.system ? {} : { name: name.trim() } ),
			icon: icon.trim(),
			visibility,
			statusIds,
			form,
			titleTemplate: title.trim(),
			allowedQueueIds: queueIds,
			autoCloseDays: Number( days ),
		} );
	};
	const active = statuses.filter(
		( s ) => s.active && s.category !== 'new' && s.category !== 'closed'
	);
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				type
					? sprintf(
							/* translators: %s: type name. */
							__( 'Edit type %s', 'cliedesk' ),
							type.name
						)
					: __( 'Add type', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-type"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save type', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-type"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-5"
			>
				{ isConflict( save.error ) ? (
					<ConflictBanner
						onReload={ () => {
							void qc.invalidateQueries( {
								queryKey: typeKeys.all,
							} );
							onClose();
						} }
					/>
				) : (
					<ActionError error={ save.error } />
				) }
				<div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
					<TextField
						label={ __( 'Name', 'cliedesk' ) }
						value={ name }
						onChange={ setName }
						maxLength={ 191 }
						isRequired
						isDisabled={ !! type?.system }
						description={
							type?.system
								? __(
										'Built-in types keep their name.',
										'cliedesk'
									)
								: undefined
						}
						errorMessage={ errors.name ?? server.name ?? null }
					/>
					<TextField
						label={ __( 'Icon (emoji)', 'cliedesk' ) }
						value={ icon }
						onChange={ setIcon }
						maxLength={ 64 }
						errorMessage={ server.icon ?? null }
					/>
				</div>
				<RadioGroup
					label={ __( 'Who sees this type', 'cliedesk' ) }
					value={ visibility }
					onChange={ ( v ) =>
						setVisibility( v as 'customer' | 'internal' )
					}
					options={ [
						{
							id: 'customer',
							label: __( 'Customers and agents', 'cliedesk' ),
						},
						{
							id: 'internal',
							label: __( 'Agents only (internal)', 'cliedesk' ),
						},
					] }
				/>
				<OrderedPick
					legend={ __( 'Statuses agents can pick', 'cliedesk' ) }
					items={ active.map( ( s ) => ( {
						id: s.id,
						label: `${ s.label } (${ categoryName( s.category ) })`,
					} ) ) }
					value={ statusIds }
					onChange={ setStatusIds }
				/>
				{ ! statusIds.length && (
					<Muted>
						{ __(
							'None chosen: agents can pick every active status.',
							'cliedesk'
						) }
					</Muted>
				) }
				<OrderedPick
					legend={ __( 'Form fields', 'cliedesk' ) }
					items={ fields
						.filter( ( f ) => ! f.archived )
						.map( ( f ) => ( { id: f.key, label: f.label } ) ) }
					value={ form }
					onChange={ setForm }
				/>
				<TextField
					label={ __(
						'Title for conversations without a subject',
						'cliedesk'
					) }
					description={ __(
						'Optional. You can use {type}, {contact}, {email}, {number} and {date}.',
						'cliedesk'
					) }
					value={ title }
					onChange={ setTitle }
					maxLength={ 255 }
					errorMessage={ server.titleTemplate ?? null }
				/>
				{ queues.length > 0 && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Allowed queues', 'cliedesk' ) }
						</legend>
						<p className="text-sm text-fg-muted">
							{ __( 'None chosen: every queue.', 'cliedesk' ) }
						</p>
						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{ queues.map( ( q ) => (
								<Checkbox
									key={ q.id }
									isSelected={ queueIds.includes( q.id ) }
									onChange={ ( v ) =>
										setQueueIds( ( l ) =>
											v
												? [ ...l, q.id ]
												: l.filter(
														( x ) => x !== q.id
													)
										)
									}
								>
									{ q.name }
								</Checkbox>
							) ) }
						</div>
					</fieldset>
				) }
				<TextField
					label={ __(
						'Close resolved conversations after (days)',
						'cliedesk'
					) }
					inputMode="numeric"
					value={ days }
					onChange={ setDays }
					errorMessage={
						errors.autoCloseDays ?? server.autoCloseDays ?? null
					}
				/>
			</form>
		</Modal>
	);
}

/**
 * Section.
 */
export default function TypesSection() {
	const qc = useQueryClient();
	const [ showArchived, setShowArchived ] = useState( false );
	const [ editing, setEditing ] = useState< TypeDetail | 'new' | null >(
		null
	);
	const q = useQuery( typeListQuery( showArchived ) );
	const statuses = useQuery( statusesQuery() );
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const queues = useQuery( queuePickerQuery() );
	const archive = useMutation( {
		mutationFn: ( t: TypeDetail ) =>
			api.post< TypeDetail >( `types/${ t.id }/archive`, {
				body: t.archived ? { restore: true } : {},
			} ),
		onSuccess: ( r ) => {
			announceResult(
				r.data.archived
					? sprintf(
							/* translators: %s: type name. */
							__( 'Type “%s” archived.', 'cliedesk' ),
							r.data.name
						)
					: sprintf(
							/* translators: %s: type name. */
							__( 'Type “%s” restored.', 'cliedesk' ),
							r.data.name
						)
			);
			void qc.invalidateQueries( { queryKey: typeKeys.all } );
		},
	} );
	const statusName = ( id: number ) =>
		statuses.data?.find( ( s ) => s.id === id )?.label ?? `#${ id }`;
	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Loading types…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<ErrorState
				title={ __( 'Could not load the types', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.length ) {
		body = (
			<EmptyState
				icon={ <Shapes size={ 32 } strokeWidth={ 1.75 } /> }
				title={ __( 'No types', 'cliedesk' ) }
				description={ __(
					'For example “Return request” with the fields and checklist a return needs.',
					'cliedesk'
				) }
				actions={
					<Button onPress={ () => setEditing( 'new' ) }>
						{ __( 'Add a type', 'cliedesk' ) }
					</Button>
				}
			/>
		);
	} else {
		body = (
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ q.data.map( ( t ) => (
					<li
						key={ t.id }
						className="flex flex-wrap items-center gap-4 p-4"
					>
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
								{ t.icon && (
									<span aria-hidden="true">{ t.icon }</span>
								) }
								<bdi>{ t.name }</bdi>
								{ t.system && (
									<Pill>
										{ __( 'Built in', 'cliedesk' ) }
									</Pill>
								) }
								{ t.visibility === 'internal' && (
									<Pill>
										{ __( 'Internal', 'cliedesk' ) }
									</Pill>
								) }
								{ t.archived && (
									<Pill tone="warning">
										{ __( 'Archived', 'cliedesk' ) }
									</Pill>
								) }
							</h2>
							<p className="text-sm text-fg-muted">
								{ t.statusIds.length
									? sprintf(
											/* translators: %s: comma-separated status names. */
											__( 'Statuses: %s', 'cliedesk' ),
											t.statusIds
												.map( statusName )
												.join( ', ' )
										)
									: __( 'Statuses: all active', 'cliedesk' ) }
								{ ' · ' }
								{ sprintf(
									/* translators: %d: days. */
									__(
										'closes %d days after resolved',
										'cliedesk'
									),
									t.autoCloseDays
								) }
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								onPress={ () => setEditing( t ) }
								aria-label={ sprintf(
									/* translators: %s: type name. */
									__( 'Edit %s', 'cliedesk' ),
									t.name
								) }
							>
								{ __( 'Edit', 'cliedesk' ) }
							</Button>
							{ ! t.system && (
								<Button
									size="sm"
									variant="ghost"
									isLoading={
										archive.isPending &&
										archive.variables?.id === t.id
									}
									onPress={ () => archive.mutate( t ) }
									aria-label={
										t.archived
											? sprintf(
													/* translators: %s: type name. */
													__(
														'Restore %s',
														'cliedesk'
													),
													t.name
												)
											: sprintf(
													/* translators: %s: type name. */
													__(
														'Archive %s',
														'cliedesk'
													),
													t.name
												)
									}
								>
									{ t.archived
										? __( 'Restore', 'cliedesk' )
										: __( 'Archive', 'cliedesk' ) }
								</Button>
							) }
						</div>
					</li>
				) ) }
			</ul>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Checkbox
					isSelected={ showArchived }
					onChange={ setShowArchived }
				>
					{ __( 'Show archived types', 'cliedesk' ) }
				</Checkbox>
				<Button
					variant="primary"
					iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add type', 'cliedesk' ) }
				</Button>
			</div>
			{ archive.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ describeError( archive.error ) }
				/>
			) }
			{ body }
			{ editing && (
				<TypeDialog
					type={ editing === 'new' ? null : editing }
					statuses={ statuses.data ?? [] }
					fields={ fields.data ?? [] }
					queues={ queues.data ?? [] }
					onClose={ () => setEditing( null ) }
				/>
			) }
		</div>
	);
}
