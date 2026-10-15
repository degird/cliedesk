/**
 * Macro steps editor (MAC-02): the actions a saved reply runs, in order, when the reply is sent or the note added.
 * One row per step with the inputs of its Action (ConversationActions::macro_steps_schema): status (with snooze
 * hours for Snoozed), priority, type, queue, assignee (me / unassigned / a person, optional team), tags to add and
 * remove, a custom field and its value, follow, CC, link to a conversation, and a linked task.
 */
import { can, useQuery } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	IconButton,
	Menu,
	MenuItem,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import {
	PRIORITIES,
	fieldsQuery,
	queuePickerQuery,
	statusesQuery,
	tagsQuery,
	teamsLookupQuery,
	typesQuery,
	type FieldDef,
	type TagRef,
} from '../inbox/api';
import { Muted, useAgents } from '../inbox/components';
import { linkLabel, priorityLabel } from '../inbox/labels';
import { recordSourcesQuery } from '../crm/records';
import {
	COMMERCE_STEP_ACTIONS,
	LINK_TYPES,
	ORDER_TARGETS,
	STEP_TYPES,
	newStep,
	stepLabel,
	type MacroStep,
	type StepType,
} from './api';
import { extensionStep, extensionStepTypes } from './extensions';

const SKIPPED_FIELD_TYPES = [ 'multi_select', 'money' ];

/**
 * Name of an order target (COM-26).
 *
 * @param t Target.
 */
function orderTargetLabel( t: string ): string {
	switch ( t ) {
		case 'last':
			return __( 'The customer’s last order', 'cliedesk' );
		case 'last_unfulfilled':
			return __( 'The customer’s last unfulfilled order', 'cliedesk' );
		default:
			return __( 'The order linked to the conversation', 'cliedesk' );
	}
}
const ME = 'me';
const NOBODY = 'none';

/**
 * Select value of an assignee: 0 = me, null = unassigned.
 *
 * @param id Assignee id.
 */
export const assigneeKey = ( id: number | null | undefined ): string => {
	if ( id === 0 ) {
		return ME;
	}
	if ( id === null ) {
		return NOBODY;
	}
	return id === undefined ? '' : String( id );
};

const assigneeOf = ( key: string ): number | null => {
	if ( key === ME ) {
		return 0;
	}
	return key === NOBODY ? null : Number( key );
};

function TagList( {
	label,
	value,
	tags,
	onChange,
	isDisabled,
}: {
	label: string;
	value: number[];
	tags: TagRef[];
	onChange: ( ids: number[] ) => void;
	isDisabled?: boolean;
} ) {
	const name = ( id: number ) =>
		tags.find( ( t ) => t.id === id )?.name ??
		sprintf(
			/* translators: %d: tag id. */
			__( 'Tag %d', 'cliedesk' ),
			id
		);
	const rest = tags.filter( ( t ) => ! value.includes( t.id ) );
	return (
		<div className="flex flex-col gap-1">
			<Select
				label={ label }
				value={ null }
				isDisabled={ isDisabled || ! rest.length }
				options={ rest.map( ( t ) => ( {
					id: String( t.id ),
					label: t.name,
				} ) ) }
				onChange={ ( v ) => onChange( [ ...value, Number( v ) ] ) }
			/>
			{ value.length > 0 && (
				<ul className="flex flex-wrap gap-1">
					{ value.map( ( id ) => (
						<li
							key={ id }
							className="inline-flex items-center gap-1 rounded-full border border-line px-2 text-sm"
						>
							<bdi>{ name( id ) }</bdi>
							<IconButton
								size="sm"
								variant="ghost"
								isDisabled={ isDisabled }
								label={ sprintf(
									/* translators: 1: tag name, 2: "Add tags" or "Remove tags". */
									__( 'Remove %1$s from %2$s', 'cliedesk' ),
									name( id ),
									label
								) }
								icon={ <X aria-hidden="true" size={ 12 } /> }
								onPress={ () =>
									onChange(
										value.filter( ( x ) => x !== id )
									)
								}
							/>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}

/**
 * Value input of a custom field step: options and yes/no as a select, numbers parsed, text otherwise.
 *
 * @param props            Props.
 * @param props.field      Field definition.
 * @param props.value      Value.
 * @param props.onChange   Change.
 * @param props.isDisabled Read only.
 */
function FieldValue( {
	field,
	value,
	onChange,
	isDisabled,
}: {
	field: FieldDef | undefined;
	value: MacroStep[ 'value' ];
	onChange: ( v: MacroStep[ 'value' ] ) => void;
	isDisabled?: boolean;
} ) {
	const label = __( 'Value', 'cliedesk' );
	if ( field?.options?.length ) {
		return (
			<Select
				label={ label }
				value={
					value === null || value === undefined
						? null
						: String( value )
				}
				isDisabled={ isDisabled }
				options={ field.options
					.filter( ( o ) => ! o.archived )
					.map( ( o ) => ( { id: o.key, label: o.label } ) ) }
				onChange={ onChange }
			/>
		);
	}
	if ( field?.type === 'boolean' ) {
		let selected: string | null = null;
		if ( typeof value === 'boolean' ) {
			selected = value ? 'yes' : 'no';
		}
		return (
			<Select
				label={ label }
				value={ selected }
				isDisabled={ isDisabled }
				options={ [
					{ id: 'yes', label: __( 'Yes', 'cliedesk' ) },
					{ id: 'no', label: __( 'No', 'cliedesk' ) },
				] }
				onChange={ ( v ) => onChange( v === 'yes' ) }
			/>
		);
	}
	const numeric = field?.type === 'number' || field?.type === 'decimal';
	return (
		<TextField
			label={ label }
			value={
				value === null || value === undefined ? '' : String( value )
			}
			isDisabled={ isDisabled }
			inputMode={ numeric ? 'decimal' : undefined }
			maxLength={ 10000 }
			description={ __( 'Leave empty to clear the field.', 'cliedesk' ) }
			onChange={ ( v ) => {
				if ( v === '' ) {
					onChange( null );
				} else if ( numeric && ! Number.isNaN( Number( v ) ) ) {
					onChange( Number( v ) );
				} else {
					onChange( v );
				}
			} }
		/>
	);
}

function StepInputs( {
	step,
	set,
	isDisabled,
}: {
	step: MacroStep;
	set: ( patch: Partial< MacroStep > ) => void;
	isDisabled?: boolean;
} ) {
	const statuses = useQuery( {
		...statusesQuery(),
		enabled: step.type === 'status',
	} );
	const types = useQuery( {
		...typesQuery(),
		enabled: step.type === 'type',
	} );
	const queues = useQuery( {
		...queuePickerQuery(),
		enabled: step.type === 'queue',
	} );
	const teams = useQuery( {
		...teamsLookupQuery(),
		enabled: step.type === 'assign',
	} );
	const tags = useQuery( { ...tagsQuery(), enabled: step.type === 'tags' } );
	const fields = useQuery( {
		...fieldsQuery( 'conversation' ),
		enabled: step.type === 'field',
	} );
	const { agents } = useAgents();
	const people = [
		{ id: ME, label: __( 'Me (the person applying it)', 'cliedesk' ) },
		{ id: NOBODY, label: __( 'Unassigned', 'cliedesk' ) },
		...agents.map( ( a ) => ( { id: String( a.userId ), label: a.name } ) ),
	];
	switch ( step.type ) {
		case 'status':
			return (
				<>
					<Select
						label={ __( 'Status', 'cliedesk' ) }
						value={ step.status ?? null }
						isDisabled={ isDisabled }
						options={ ( statuses.data ?? [] )
							.filter( ( s ) => s.active && s.key !== 'new' )
							.map( ( s ) => ( { id: s.key, label: s.label } ) ) }
						onChange={ ( v ) =>
							set( {
								status: v,
								snoozeHours:
									v === 'snoozed'
										? ( step.snoozeHours ?? 24 )
										: undefined,
							} )
						}
					/>
					{ step.status === 'snoozed' && (
						<TextField
							label={ __( 'Snooze for (hours)', 'cliedesk' ) }
							inputMode="numeric"
							isDisabled={ isDisabled }
							value={ String( step.snoozeHours ?? '' ) }
							onChange={ ( v ) => {
								const n = parseInt( v, 10 );
								set( {
									snoozeHours:
										n > 0 ? Math.min( n, 8760 ) : undefined,
								} );
							} }
						/>
					) }
				</>
			);
		case 'priority':
			return (
				<Select
					label={ __( 'Priority', 'cliedesk' ) }
					value={ step.priority ?? null }
					isDisabled={ isDisabled }
					options={ PRIORITIES.map( ( p ) => ( {
						id: p,
						label: priorityLabel( p ),
					} ) ) }
					onChange={ ( v ) => set( { priority: v } ) }
				/>
			);
		case 'type':
			return (
				<Select
					label={ __( 'Type', 'cliedesk' ) }
					value={ step.typeId ? String( step.typeId ) : null }
					isDisabled={ isDisabled }
					options={ ( types.data ?? [] ).map( ( t ) => ( {
						id: String( t.id ),
						label: t.name,
					} ) ) }
					onChange={ ( v ) => set( { typeId: Number( v ) } ) }
				/>
			);
		case 'queue':
			return (
				<Select
					label={ __( 'Queue', 'cliedesk' ) }
					value={ step.queueId ? String( step.queueId ) : NOBODY }
					isDisabled={ isDisabled }
					options={ [
						{ id: NOBODY, label: __( 'No queue', 'cliedesk' ) },
						...( queues.data ?? [] ).map( ( q ) => ( {
							id: String( q.id ),
							label: q.name,
						} ) ),
					] }
					onChange={ ( v ) =>
						set( { queueId: v === NOBODY ? null : Number( v ) } )
					}
				/>
			);
		case 'assign':
			return (
				<>
					<Select
						label={ __( 'Assignee', 'cliedesk' ) }
						value={ assigneeKey( step.assigneeId ) || null }
						isDisabled={ isDisabled }
						options={ people }
						onChange={ ( v ) =>
							set( { assigneeId: assigneeOf( v ) } )
						}
					/>
					<Select
						label={ __( 'Team', 'cliedesk' ) }
						value={ step.teamId ? String( step.teamId ) : NOBODY }
						isDisabled={ isDisabled }
						options={ [
							{
								id: NOBODY,
								label: __( 'Keep the team', 'cliedesk' ),
							},
							...( teams.data ?? [] ).map( ( t ) => ( {
								id: String( t.id ),
								label: t.name,
							} ) ),
						] }
						onChange={ ( v ) =>
							set( {
								teamId: v === NOBODY ? undefined : Number( v ),
							} )
						}
					/>
				</>
			);
		case 'tags':
			return (
				<>
					<TagList
						label={ __( 'Add tags', 'cliedesk' ) }
						value={ step.add ?? [] }
						tags={ tags.data ?? [] }
						isDisabled={ isDisabled }
						onChange={ ( add ) => set( { add } ) }
					/>
					<TagList
						label={ __( 'Remove tags', 'cliedesk' ) }
						value={ step.remove ?? [] }
						tags={ tags.data ?? [] }
						isDisabled={ isDisabled }
						onChange={ ( remove ) => set( { remove } ) }
					/>
				</>
			);
		case 'field': {
			const defs = fields.data ?? [];
			const known = defs.some( ( f ) => f.key === step.key );
			return (
				<>
					<Select
						label={ __( 'Field', 'cliedesk' ) }
						value={ step.key ?? null }
						isDisabled={ isDisabled }
						options={ [
							...defs
								// One plain value per step: lists and amounts with a currency are set elsewhere.
								.filter(
									( f ) =>
										! f.readonly &&
										! SKIPPED_FIELD_TYPES.includes( f.type )
								)
								.map( ( f ) => ( {
									id: f.key,
									label: f.label,
								} ) ),
							...( step.key && ! known
								? [ { id: step.key, label: step.key } ]
								: [] ),
						] }
						onChange={ ( v ) => set( { key: v, value: null } ) }
					/>
					{ step.key && (
						<FieldValue
							field={ defs.find( ( f ) => f.key === step.key ) }
							value={ step.value }
							isDisabled={ isDisabled }
							onChange={ ( value ) => set( { value } ) }
						/>
					) }
				</>
			);
		}
		case 'follow':
			return (
				<Muted>
					{ __(
						'The person applying it follows the conversation.',
						'cliedesk'
					) }
				</Muted>
			);
		case 'cc':
			return (
				<TextField
					label={ __( 'Email address', 'cliedesk' ) }
					inputMode="email"
					maxLength={ 191 }
					isDisabled={ isDisabled }
					value={ step.email ?? '' }
					onChange={ ( email ) => set( { email } ) }
				/>
			);
		case 'link':
			return (
				<>
					<TextField
						label={ __( 'Conversation ID', 'cliedesk' ) }
						inputMode="numeric"
						isDisabled={ isDisabled }
						value={ step.targetId ? String( step.targetId ) : '' }
						onChange={ ( v ) => {
							const n = parseInt( v, 10 );
							set( { targetId: n > 0 ? n : undefined } );
						} }
					/>
					<Select
						label={ __( 'Link type', 'cliedesk' ) }
						value={ step.linkType ?? 'related' }
						isDisabled={ isDisabled }
						options={ LINK_TYPES.map( ( t ) => ( {
							id: t,
							label: linkLabel( t ),
						} ) ) }
						onChange={ ( linkType ) => set( { linkType } ) }
					/>
				</>
			);
		case 'task':
			return (
				<>
					<TextField
						label={ __( 'Task subject', 'cliedesk' ) }
						maxLength={ 255 }
						isDisabled={ isDisabled }
						value={ step.subject ?? '' }
						onChange={ ( subject ) => set( { subject } ) }
					/>
					<Select
						label={ __( 'Task assignee', 'cliedesk' ) }
						value={ assigneeKey( step.assigneeId ) || ME }
						isDisabled={ isDisabled }
						options={ people }
						onChange={ ( v ) =>
							set( { assigneeId: assigneeOf( v ) } )
						}
					/>
				</>
			);
		case 'commerce':
			// MAC-03: a commerce action on an order target (COM-26).
			return (
				<>
					<Select
						label={ __( 'Order action', 'cliedesk' ) }
						value={ step.action ?? 'order.resend_email' }
						isDisabled={ isDisabled }
						options={ COMMERCE_STEP_ACTIONS.map( ( a ) => ( {
							id: a,
							label:
								a === 'order.add_note'
									? __( 'Add an order note', 'cliedesk' )
									: __( 'Resend an order email', 'cliedesk' ),
						} ) ) }
						onChange={ ( action ) => set( { action } ) }
					/>
					<Select
						label={ __( 'Which order', 'cliedesk' ) }
						value={ step.target ?? 'linked' }
						isDisabled={ isDisabled }
						options={ ORDER_TARGETS.map( ( t ) => ( {
							id: t,
							label: orderTargetLabel( t ),
						} ) ) }
						onChange={ ( target ) => set( { target } ) }
					/>
					{ step.action === 'order.add_note' ? (
						<>
							<TextField
								label={ __( 'Order note', 'cliedesk' ) }
								maxLength={ 2000 }
								isDisabled={ isDisabled }
								value={ step.text ?? '' }
								onChange={ ( text ) => set( { text } ) }
							/>
							<Checkbox
								isSelected={ !! step.customer }
								isDisabled={ isDisabled }
								onChange={ ( customer ) => set( { customer } ) }
							>
								{ __(
									'Note to the customer (WooCommerce emails it)',
									'cliedesk'
								) }
							</Checkbox>
						</>
					) : (
						<Select
							label={ __( 'Email to resend', 'cliedesk' ) }
							value={ step.email ?? 'confirmation' }
							isDisabled={ isDisabled }
							options={ [
								{
									id: 'confirmation',
									label: __(
										'Order confirmation',
										'cliedesk'
									),
								},
								{
									id: 'invoice',
									label: __( 'Invoice', 'cliedesk' ),
								},
								{
									id: 'shipped',
									label: __(
										'Shipped (order complete)',
										'cliedesk'
									),
								},
								{
									id: 'download',
									label: __( 'Download links', 'cliedesk' ),
								},
							] }
							onChange={ ( email ) => set( { email } ) }
						/>
					) }
				</>
			);
	}
	const extension = extensionStep( step.type );
	return extension?.description ? (
		<Muted>{ extension.description }</Muted>
	) : null;
}

/**
 * Steps editor.
 *
 * @param props            Props.
 * @param props.steps      Steps in order.
 * @param props.onChange   Change.
 * @param props.errors     Errors by `steps.N`.
 * @param props.isDisabled Read only.
 */
export function StepsEditor( {
	steps,
	onChange,
	errors,
	isDisabled,
}: {
	steps: MacroStep[];
	onChange: ( steps: MacroStep[] ) => void;
	errors: Record< string, string >;
	isDisabled?: boolean;
} ) {
	// MAC-03: order actions only with WooCommerce connected and the right to run them.
	const sources = useQuery( {
		...recordSourcesQuery(),
		enabled: can( 'cliedesk_run_commerce_actions' ),
	} );
	const woo = !! sources.data?.some( ( s ) => s.key === 'woo_order' );
	const update = ( i: number, patch: Partial< MacroStep > ) =>
		onChange(
			steps.map( ( s, j ) => ( j === i ? { ...s, ...patch } : s ) )
		);
	const move = ( i: number, to: number ) => {
		const next = [ ...steps ];
		const [ s ] = next.splice( i, 1 );
		next.splice( to, 0, s as MacroStep );
		onChange( next );
	};
	return (
		<div className="flex flex-col gap-3">
			{ steps.length ? (
				<ol className="flex flex-col gap-3">
					{ steps.map( ( s, i ) => {
						const error = errors[ `steps.${ i }` ];
						const title = sprintf(
							/* translators: 1: action number, 2: action name. */
							__( 'Action %1$d: %2$s', 'cliedesk' ),
							i + 1,
							stepLabel( s.type )
						);
						return (
							<li
								key={ i }
								id={ `cd-reply-steps-${ i }` }
								tabIndex={ -1 }
								className="flex flex-col gap-3 rounded-lg border border-line p-3 outline-none"
							>
								<fieldset className="flex flex-col gap-3">
									<legend className="pb-1 text-sm font-semibold">
										{ title }
									</legend>
									{ ! isDisabled && (
										<div className="flex gap-1">
											<IconButton
												size="sm"
												label={ sprintf(
													/* translators: %s: action name with its number. */
													__(
														'Move %s up',
														'cliedesk'
													),
													title
												) }
												isDisabled={ i === 0 }
												icon={
													<ArrowUp
														aria-hidden="true"
														size={ 14 }
													/>
												}
												onPress={ () =>
													move( i, i - 1 )
												}
											/>
											<IconButton
												size="sm"
												label={ sprintf(
													/* translators: %s: action name with its number. */
													__(
														'Move %s down',
														'cliedesk'
													),
													title
												) }
												isDisabled={
													i === steps.length - 1
												}
												icon={
													<ArrowDown
														aria-hidden="true"
														size={ 14 }
													/>
												}
												onPress={ () =>
													move( i, i + 1 )
												}
											/>
											<IconButton
												size="sm"
												label={ sprintf(
													/* translators: %s: action name with its number. */
													__(
														'Remove %s',
														'cliedesk'
													),
													title
												) }
												icon={
													<Trash2
														aria-hidden="true"
														size={ 14 }
													/>
												}
												onPress={ () =>
													onChange(
														steps.filter(
															( _x, j ) => j !== i
														)
													)
												}
											/>
										</div>
									) }
									<div className="grid gap-3 sm:grid-cols-2">
										<StepInputs
											step={ s }
											isDisabled={ isDisabled }
											set={ ( patch ) =>
												update( i, patch )
											}
										/>
									</div>
									{ error && (
										<p
											role="alert"
											className="text-sm text-danger"
										>
											{ error }
										</p>
									) }
								</fieldset>
							</li>
						);
					} ) }
				</ol>
			) : (
				<Muted>
					{ __(
						'No actions. Add actions to change the conversation when this reply is sent.',
						'cliedesk'
					) }
				</Muted>
			) }
			{ ! isDisabled && steps.length < 50 && (
				<Menu
					aria-label={ __( 'Action to add', 'cliedesk' ) }
					placement="bottom start"
					onAction={ ( k ) =>
						onChange( [
							...steps,
							newStep( String( k ) as StepType ),
						] )
					}
					trigger={
						<Button
							className="self-start"
							iconStart={
								<Plus aria-hidden="true" size={ 16 } />
							}
						>
							{ __( 'Add action', 'cliedesk' ) }
						</Button>
					}
				>
					{ [
						...STEP_TYPES.filter(
							( t ) => t !== 'commerce' || woo
						),
						...extensionStepTypes().map( ( d ) => d.type ),
					].map( ( t ) => (
						<MenuItem key={ t } id={ t }>
							{ stepLabel( t ) }
						</MenuItem>
					) ) }
				</Menu>
			) }
		</div>
	);
}
