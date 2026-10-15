/**
 * Settings → Rules (AUT-04, AUT-08, AUT-09): WHEN something happens, IF the conversation matches, THEN run actions in
 * order. Rules are grouped by trigger in run order (drag, or move up / down), switched on and off, show when they last
 * ran, and can be checked and deleted; search, filters, folders, copy, export / import and the bot behaviours (AUT-67,
 * AUT-77). Rules run as their owner (the person who turned them on) and never do more than that person may.
 * Pro fills the rule slots (FPS-09): `rules.trigger.options` (time, schedule and hook triggers), `rules.editor.draft`
 * (drafts), `rules.toolbar` (trash), `rules.row.tools` (run log, test, apply, history, "Why didn't it run?") and
 * `rules.row.stats`; each gets `automationKit` as `kit`.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	EmptyState,
	IconButton,
	LoadingRegion,
	Modal,
	Select,
	Slot,
	Switch,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Plus, Trash2, Workflow } from 'lucide-react';
import { useState } from 'react';
import {
	RuleConditions,
	conditionsJson,
} from '../../components/RuleConditions';
import {
	queuePickerQuery,
	statusesQuery,
	tagsQuery,
	typesQuery,
} from '../../inbox/api';
import { ActionError, useAgents } from '../../inbox/components';
import { segmentsQuery } from '../../crm/listApi';
import { fromJson, type GroupNode } from '../../inbox/conditions';
import { priorityLabel } from '../../inbox/labels';
import { versionTag } from '../../workspace/api';
import { announceResult } from '../../workspace/forms';
import { PRIORITIES, formatDuration, parseDuration } from './durations';
import { AssistantCard } from './AssistantCard';
import { TriggerOptions, RuleToolsMenu, automationKit } from './RuleTools';
import {
	BotBehaviours,
	ExportImport,
	NO_FILTER,
	RuleFilterBar,
	RuleManageMenu,
	filterRules,
	moveId,
} from './RuleManage';

export interface RuleStep {
	action: string;
	input: Record< string, unknown >;
}

export interface RuleDefinition {
	trigger: {
		event: string;
		targeting?: {
			channels?: string[];
			products?: number[];
			hours?: string;
		};
		rerun?: string;
		options?: {
			duration?: number;
			business?: boolean;
			every?: number;
			per?: string;
			[ key: string ]: unknown;
		};
	};
	conditions: unknown;
	actions: RuleStep[];
	settings?: { stopProcessing?: boolean };
}

export interface Rule {
	id: number;
	name: string;
	status: 'live' | 'paused' | 'archived';
	trigger: string;
	sort: number;
	definition: RuleDefinition;
	lastRunAt: string | null;
	version: number;
}

interface Registry {
	triggers: Array< { name: string; label: string; group: string } >;
	actions: Array< {
		name: string;
		label: string;
		customer: boolean;
		/** AUT-44: inputs of actions from other plugins. */
		fields?: Record< string, { label: string; type: string } >;
	} >;
	/** AUT-19: actions of contact rules. */
	contactActions?: Array< {
		name: string;
		label: string;
		customer: boolean;
	} >;
	paused: boolean;
}

/**
 * A lookup result as a list (empty while loading or on an unexpected answer).
 *
 * @param x Data.
 */
function asList< T >( x: T[] | undefined ): T[] {
	return Array.isArray( x ) ? x : [];
}

/**
 * A list from a stored action input (unknown shape).
 *
 * @param x Input value.
 */
function inputList< T >( x: unknown ): T[] {
	return Array.isArray( x ) ? ( x as T[] ) : [];
}

const RERUN = [
	'once_per_episode',
	'once_per_conversation',
	'every_match',
	'at_most_every',
];

const rerunLabel = ( r: string ): string =>
	( {
		once_per_episode: __(
			'Once per conversation, again after it reopens',
			'cliedesk'
		),
		once_per_conversation: __( 'Once per conversation', 'cliedesk' ),
		every_match: __( 'Every time', 'cliedesk' ),
		at_most_every: __( 'At most once in a set time', 'cliedesk' ),
	} )[ r ] ?? r;

/**
 * Plain text from stored HTML.
 *
 * @param html HTML.
 */
export function htmlText( html: unknown ): string {
	return String( html ?? '' )
		.replace( /<br\s*\/?>/gi, '\n' )
		.replace( /<\/p>\s*<p>/gi, '\n\n' )
		.replace( /<[^>]+>/g, '' )
		.replace( /&lt;/g, '<' )
		.replace( /&gt;/g, '>' )
		.replace( /&quot;/g, '"' )
		.replace( /&amp;/g, '&' );
}

/**
 * HTML paragraphs from plain text (escaped).
 *
 * @param text Text.
 */
export function textHtml( text: string ): string {
	const esc = text
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
	return esc
		.split( /\n{2,}/ )
		.map( ( p ) => `<p>${ p.replace( /\n/g, '<br>' ) }</p>` )
		.join( '' );
}

function StepEditor( {
	step,
	index,
	registry,
	onChange,
	onRemove,
}: {
	step: RuleStep;
	index: number;
	registry: Registry;
	onChange: ( s: RuleStep ) => void;
	onRemove: () => void;
} ) {
	const statuses = useQuery( statusesQuery() );
	const types = useQuery( typesQuery() );
	const tags = useQuery( tagsQuery() );
	const queues = useQuery( queuePickerQuery() );
	const replies = useQuery( {
		queryKey: [ 'saved-replies', 'rule-picker' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					items: Array< { id: number; name: string } >;
				} >( 'saved-replies', {
					query: { status: 'active', limit: 200 },
					signal,
				} )
			).data?.items ?? [],
		enabled: step.action === 'saved_reply.apply',
	} );
	// AUT-49: lists for "add the customer to a list".
	const segments = useQuery( {
		...segmentsQuery(),
		enabled: step.action === 'conversation.contact.segment',
	} );
	const { agents } = useAgents();
	const set = ( input: Record< string, unknown > ) =>
		onChange( { ...step, input } );
	const n = index + 1;
	let editor = null;
	switch ( step.action ) {
		case 'conversation.status.set':
			editor = (
				<Select
					label={ __( 'Status', 'cliedesk' ) }
					value={ String( step.input.status ?? '' ) }
					onChange={ ( v ) => set( { status: v } ) }
					options={ asList( statuses.data ).map( ( s ) => ( {
						id: s.key,
						label: s.label,
					} ) ) }
				/>
			);
			break;
		case 'conversation.priority.set':
			editor = (
				<Select
					label={ __( 'Priority', 'cliedesk' ) }
					value={ String( step.input.priority ?? 'normal' ) }
					onChange={ ( v ) => set( { priority: v } ) }
					options={ PRIORITIES.map( ( p ) => ( {
						id: p,
						label: priorityLabel( p ),
					} ) ) }
				/>
			);
			break;
		case 'conversation.type.set':
			editor = (
				<Select
					label={ __( 'Type', 'cliedesk' ) }
					value={ String( step.input.typeId ?? '' ) }
					onChange={ ( v ) => set( { typeId: Number( v ) } ) }
					options={ asList( types.data ).map( ( t ) => ( {
						id: String( t.id ),
						label: t.name,
					} ) ) }
				/>
			);
			break;
		case 'conversation.assign':
			editor = (
				<Select
					label={ __( 'Assignee', 'cliedesk' ) }
					value={ String( step.input.assigneeId ?? 0 ) }
					onChange={ ( v ) =>
						set( { assigneeId: Number( v ) || null } )
					}
					options={ [
						{ id: '0', label: __( 'Unassigned', 'cliedesk' ) },
						...agents.map( ( a ) => ( {
							id: String( a.userId ),
							label: a.name,
						} ) ),
					] }
				/>
			);
			break;
		case 'conversation.move':
			editor = (
				<Select
					label={ __( 'Queue', 'cliedesk' ) }
					value={ String( step.input.queueId ?? '' ) }
					onChange={ ( v ) => set( { queueId: Number( v ) } ) }
					options={ asList( queues.data ).map( ( q ) => ( {
						id: String( q.id ),
						label: q.name,
					} ) ) }
				/>
			);
			break;
		case 'tag.apply': {
			const remove = Array.isArray( step.input.remove );
			const list = ( remove ? step.input.remove : step.input.add ) as
				number[] | undefined;
			editor = (
				<div className="flex flex-wrap gap-2">
					<Select
						label={ __( 'Tags', 'cliedesk' ) }
						value={ remove ? 'remove' : 'add' }
						onChange={ ( v ) =>
							set( { [ v ]: list ?? [] } as Record<
								string,
								unknown
							> )
						}
						options={ [
							{ id: 'add', label: __( 'Add tag', 'cliedesk' ) },
							{
								id: 'remove',
								label: __( 'Remove tag', 'cliedesk' ),
							},
						] }
					/>
					<Select
						label={ __( 'Tag', 'cliedesk' ) }
						value={ String( list?.[ 0 ] ?? '' ) }
						onChange={ ( v ) =>
							set( {
								[ remove ? 'remove' : 'add' ]: [ Number( v ) ],
							} )
						}
						options={ asList( tags.data ).map( ( t ) => ( {
							id: String( t.id ),
							label: t.name,
						} ) ) }
					/>
				</div>
			);
			break;
		}
		case 'order.notice':
			// PRO-22: a service notice about the trigger's order (tokens such as {order.number}).
			editor = (
				<div className="flex flex-col gap-2">
					<TextField
						label={ __( 'Subject', 'cliedesk' ) }
						value={ String( step.input.subject ?? '' ) }
						onChange={ ( v ) =>
							set( { ...step.input, subject: v } )
						}
						maxLength={ 255 }
					/>
					<TextField
						label={ __( 'Notice', 'cliedesk' ) }
						description={ __(
							'Service messages only: promotional text is refused. Tokens like {order.number} and {customer.first_name | "there"} work.',
							'cliedesk'
						) }
						multiline
						value={ String( step.input.text ?? '' ) }
						onChange={ ( v ) => set( { ...step.input, text: v } ) }
					/>
				</div>
			);
			break;
		case 'conversation.forward':
			// AUT-41.
			editor = (
				<TextField
					label={ __(
						'Send to (email addresses, comma separated)',
						'cliedesk'
					) }
					value={ inputList< string >( step.input.to ).join( ', ' ) }
					onChange={ ( v ) =>
						set( {
							to: v
								.split( /[,\s]+/ )
								.map( ( x ) => x.trim() )
								.filter( Boolean ),
						} )
					}
				/>
			);
			break;
		case 'conversation.notify':
			editor = (
				<div className="flex flex-wrap gap-2">
					<Select
						label={ __( 'Who', 'cliedesk' ) }
						value={ String(
							inputList< number >( step.input.userIds )[ 0 ] ?? ''
						) }
						onChange={ ( v ) =>
							set( { ...step.input, userIds: [ Number( v ) ] } )
						}
						options={ agents.map( ( a ) => ( {
							id: String( a.userId ),
							label: a.name,
						} ) ) }
					/>
					<TextField
						label={ __( 'Message', 'cliedesk' ) }
						value={ String( step.input.text ?? '' ) }
						onChange={ ( v ) => set( { ...step.input, text: v } ) }
						maxLength={ 500 }
					/>
				</div>
			);
			break;
		case 'saved_reply.apply':
			// AUT-43.
			editor = (
				<div className="flex flex-wrap gap-2">
					<Select
						label={ __( 'Saved reply', 'cliedesk' ) }
						value={ String( step.input.savedReplyId ?? '' ) }
						onChange={ ( v ) =>
							set( { ...step.input, savedReplyId: Number( v ) } )
						}
						options={ asList< { id: number; name: string } >(
							replies.data
						).map( ( r ) => ( {
							id: String( r.id ),
							label: r.name,
						} ) ) }
					/>
					<Select
						label={ __( 'Its text goes out as', 'cliedesk' ) }
						value={ String( step.input.as ?? 'reply' ) }
						onChange={ ( v ) => set( { ...step.input, as: v } ) }
						options={ [
							{ id: 'reply', label: __( 'A reply', 'cliedesk' ) },
							{
								id: 'note',
								label: __( 'An internal note', 'cliedesk' ),
							},
						] }
					/>
				</div>
			);
			break;
		case 'conversation.contact.segment':
			// AUT-49.
			editor = (
				<div className="flex flex-wrap gap-2">
					<Select
						label={ __( 'Customer', 'cliedesk' ) }
						value={ String( step.input.mode ?? 'add' ) }
						onChange={ ( v ) => set( { ...step.input, mode: v } ) }
						options={ [
							{
								id: 'add',
								label: __( 'Add to list', 'cliedesk' ),
							},
							{
								id: 'remove',
								label: __( 'Remove from list', 'cliedesk' ),
							},
						] }
					/>
					<Select
						label={ __( 'List', 'cliedesk' ) }
						value={ String( step.input.segmentId ?? '' ) }
						onChange={ ( v ) =>
							set( {
								mode: 'add',
								...step.input,
								segmentId: Number( v ),
							} )
						}
						options={ ( segments.data ?? [] )
							.filter( ( x ) => x.kind === 'static' )
							.map( ( x ) => ( {
								id: String( x.id ),
								label: x.name,
							} ) ) }
					/>
				</div>
			);
			break;
		case 'conversation.organization.field':
		case 'conversation.record.field':
			// AUT-49.
			editor = (
				<div className="flex flex-wrap gap-2">
					{ step.action === 'conversation.record.field' && (
						<TextField
							label={ __( 'Record type key', 'cliedesk' ) }
							value={ String( step.input.typeKey ?? '' ) }
							onChange={ ( v ) =>
								set( { ...step.input, typeKey: v.trim() } )
							}
							maxLength={ 64 }
						/>
					) }
					<TextField
						label={ __( 'Field key', 'cliedesk' ) }
						value={ String( step.input.field ?? '' ) }
						onChange={ ( v ) =>
							set( { ...step.input, field: v.trim() } )
						}
						maxLength={ 64 }
					/>
					<TextField
						label={ __( 'Value', 'cliedesk' ) }
						value={ String( step.input.value ?? '' ) }
						onChange={ ( v ) => set( { ...step.input, value: v } ) }
						maxLength={ 2000 }
					/>
				</div>
			);
			break;
		case 'conversation.spinoff':
			// AUT-45.
			editor = (
				<div className="flex flex-wrap gap-2">
					<TextField
						label={ __( 'Task subject', 'cliedesk' ) }
						value={ String( step.input.subject ?? '' ) }
						onChange={ ( v ) =>
							set( { ...step.input, subject: v } )
						}
						maxLength={ 191 }
					/>
					<Select
						label={ __( 'Assignee', 'cliedesk' ) }
						value={ String( step.input.assigneeId ?? 0 ) }
						onChange={ ( v ) =>
							set( {
								...step.input,
								assigneeId: Number( v ) || null,
							} )
						}
						options={ [
							{ id: '0', label: __( 'Unassigned', 'cliedesk' ) },
							...agents.map( ( a ) => ( {
								id: String( a.userId ),
								label: a.name,
							} ) ),
						] }
					/>
				</div>
			);
			break;
		case 'conversation.redact': {
			// AUT-50.
			const classes = inputList< string >( step.input.classes );
			editor = (
				<fieldset className="flex flex-wrap gap-4">
					<legend className="pb-1 text-sm font-medium">
						{ __( 'Redact', 'cliedesk' ) }
					</legend>
					{ (
						[
							[ 'card', __( 'Card numbers', 'cliedesk' ) ],
							[ 'email', __( 'Email addresses', 'cliedesk' ) ],
							[ 'phone', __( 'Phone numbers', 'cliedesk' ) ],
						] as const
					 ).map( ( [ id, label ] ) => (
						<Checkbox
							key={ id }
							isSelected={ classes.includes( id ) }
							onChange={ ( on ) =>
								set( {
									classes: on
										? [ ...classes, id ]
										: classes.filter( ( x ) => x !== id ),
								} )
							}
						>
							{ label }
						</Checkbox>
					) ) }
				</fieldset>
			);
			break;
		}
		case 'conversation.note':
		case 'conversation.reply':
			editor = (
				<TextField
					label={
						step.action === 'conversation.note'
							? __( 'Note', 'cliedesk' )
							: __( 'Reply', 'cliedesk' )
					}
					multiline
					description={ __(
						'Tokens work, like {customer.first_name | "there"}.',
						'cliedesk'
					) }
					value={ htmlText( step.input.html ) }
					onChange={ ( v ) => set( { html: textHtml( v ) } ) }
					maxLength={ 5000 }
				/>
			);
			break;
	}
	// AUT-44: fields of actions registered by other plugins.
	const fields =
		registry.actions.find( ( a ) => a.name === step.action )?.fields ?? {};
	if ( ! editor && Object.keys( fields ).length ) {
		editor = (
			<>
				{ Object.entries( fields ).map( ( [ key, f ] ) =>
					f.type === 'bool' ? (
						<Checkbox
							key={ key }
							isSelected={ !! step.input[ key ] }
							onChange={ ( on ) =>
								set( { ...step.input, [ key ]: on } )
							}
						>
							{ f.label }
						</Checkbox>
					) : (
						<TextField
							key={ key }
							label={ f.label }
							value={ String( step.input[ key ] ?? '' ) }
							onChange={ ( v ) =>
								set( {
									...step.input,
									[ key ]:
										f.type === 'number'
											? Number( v ) || 0
											: v,
								} )
							}
						/>
					)
				) }
			</>
		);
	}
	if ( ! editor ) {
		// Editors of actions a module adds (Pro: Apply an SLA policy, Set business hours).
		editor = (
			<Slot
				name={ `rules.step.${ step.action }` }
				fillProps={ { input: step.input, set } }
			/>
		);
	}
	return (
		<li className="flex flex-col gap-2 rounded-md border border-line p-3">
			<div className="flex flex-wrap items-end gap-2">
				<Select
					label={ sprintf(
						/* translators: %d: action number. */
						__( 'Action %d', 'cliedesk' ),
						n
					) }
					value={ step.action }
					onChange={ ( v ) => onChange( { action: v, input: {} } ) }
					options={ registry.actions.map( ( a ) => ( {
						id: a.name,
						label: a.label,
					} ) ) }
				/>
				<IconButton
					size="sm"
					variant="ghost"
					label={ sprintf(
						/* translators: %d: action number. */
						__( 'Remove action %d', 'cliedesk' ),
						n
					) }
					onPress={ onRemove }
					icon={ <Trash2 aria-hidden="true" size={ 14 } /> }
				/>
			</div>
			{ editor }
		</li>
	);
}

function RuleDialog( {
	rule,
	registry,
	onClose,
}: {
	rule: Rule | null;
	registry: Registry;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const def = rule?.definition;
	const [ name, setName ] = useState( rule?.name ?? '' );
	const [ trigger, setTrigger ] = useState(
		def?.trigger.event ?? 'conversation.created'
	);
	const [ rerun, setRerun ] = useState(
		def?.trigger.rerun ?? 'once_per_episode'
	);
	const [ every, setEvery ] = useState(
		formatDuration( def?.trigger.options?.every ?? 86400 )
	);
	const [ per, setPer ] = useState( def?.trigger.options?.per ?? 'contact' );
	const [ hours, setHours ] = useState( def?.trigger.targeting?.hours ?? '' );
	const [ root, setRoot ] = useState< GroupNode >( () =>
		fromJson( def?.conditions ?? {} )
	);
	const [ steps, setSteps ] = useState< RuleStep[] >(
		def?.actions ?? [ { action: 'tag.apply', input: {} } ]
	);
	// AUT-19: contact triggers run on the contact with the contact actions.
	const onContact =
		registry.triggers.find( ( t ) => t.name === trigger )?.group ===
		'contact';
	const stepRegistry = onContact
		? { ...registry, actions: registry.contactActions ?? [] }
		: registry;
	const group =
		registry.triggers.find( ( t ) => t.name === trigger )?.group ?? '';
	// The trigger's own options (customer events, orders; with Pro time, schedule and hook triggers).
	const [ extra, setExtra ] = useState< Record< string, unknown > >( () => ( {
		...( def?.trigger.options ?? {} ),
	} ) );
	const [ stop, setStop ] = useState(
		def?.settings?.stopProcessing ?? false
	);
	const [ enabled, setEnabled ] = useState( true );
	const buildDefinition = () =>
		JSON.stringify( {
			trigger: {
				event: trigger,
				rerun,
				targeting: { ...def?.trigger.targeting, hours },
				options: {
					...extra,
					...( rerun === 'at_most_every'
						? { every: parseDuration( every ) ?? 0, per }
						: {} ),
				},
			},
			conditions: onContact
				? {}
				: JSON.parse( conditionsJson( root ) || '{}' ),
			actions: steps,
			settings: { stopProcessing: stop },
		} );
	const save = useMutation( {
		mutationFn: () => {
			const definition = buildDefinition();
			return rule
				? api.patch< Rule >( `workflows/${ rule.id }`, {
						body: { name: name.trim(), definition },
						ifMatch: versionTag( rule.version ),
					} )
				: api.post< Rule >( 'workflows', {
						body: { name: name.trim(), definition, enabled },
					} );
		},
		onSuccess: () => {
			announceResult( __( 'Rule saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'workflows' ] } );
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				rule
					? sprintf(
							/* translators: %s: rule name. */
							__( 'Edit rule %s', 'cliedesk' ),
							rule.name
						)
					: __( 'Add rule', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ ! name.trim() || steps.length === 0 }
						onPress={ () => save.mutate() }
					>
						{ __( 'Save rule', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<ActionError error={ save.error } />
				{ rule && (
					<Slot
						name="rules.editor.draft"
						fillProps={ {
							rule,
							definition: buildDefinition,
							onClose,
							kit: automationKit,
						} }
					/>
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					value={ name }
					onChange={ setName }
					maxLength={ 191 }
					isRequired
				/>
				<section className="flex flex-col gap-2">
					<h3 className="font-semibold">
						{ __( 'When', 'cliedesk' ) }
					</h3>
					<Select
						label={ __( 'Trigger', 'cliedesk' ) }
						value={ trigger }
						onChange={ setTrigger }
						options={ registry.triggers.map( ( t ) => ( {
							id: t.name,
							label: t.label,
						} ) ) }
					/>
					<TriggerOptions
						trigger={ trigger }
						value={ extra }
						onChange={ setExtra }
					/>
					<Slot
						name="rules.trigger.options"
						fillProps={ {
							trigger,
							group,
							ruleId: rule?.id ?? null,
							value: extra,
							onChange: setExtra,
							kit: automationKit,
						} }
					/>
					<Select
						label={ __( 'How often', 'cliedesk' ) }
						value={ rerun }
						onChange={ setRerun }
						options={ RERUN.map( ( r ) => ( {
							id: r,
							label: rerunLabel( r ),
						} ) ) }
					/>
					{ rerun === 'at_most_every' && (
						<div className="flex flex-wrap gap-3">
							<TextField
								label={ __( 'Once in', 'cliedesk' ) }
								description={ __(
									'Like 24h or 7d.',
									'cliedesk'
								) }
								value={ every }
								onChange={ setEvery }
							/>
							<Select
								label={ __( 'Counted per', 'cliedesk' ) }
								value={ per }
								onChange={ setPer }
								options={ [
									{
										id: 'contact',
										label: __( 'Customer', 'cliedesk' ),
									},
									{
										id: 'conversation',
										label: __( 'Conversation', 'cliedesk' ),
									},
								] }
							/>
						</div>
					) }
					<Select
						label={ __( 'Business hours', 'cliedesk' ) }
						value={ hours || 'any' }
						onChange={ ( v ) => setHours( v === 'any' ? '' : v ) }
						options={ [
							{ id: 'any', label: __( 'Any time', 'cliedesk' ) },
							{
								id: 'in',
								label: __(
									'Only during business hours',
									'cliedesk'
								),
							},
							{
								id: 'out',
								label: __(
									'Only outside business hours',
									'cliedesk'
								),
							},
						] }
					/>
				</section>
				<section className="flex flex-col gap-2">
					<h3 className="font-semibold">
						{ __( 'If', 'cliedesk' ) }
					</h3>
					<p className="text-sm text-fg-muted">
						{ __(
							'Checked on the conversation when the trigger happens. Without conditions the rule runs for every conversation.',
							'cliedesk'
						) }
					</p>
					{ onContact ? (
						<p className="text-sm text-fg-muted">
							{ __(
								'Contact rules run on the contact and have no conversation conditions.',
								'cliedesk'
							) }
						</p>
					) : (
						<RuleConditions
							root={ root }
							onChange={ setRoot }
							channels={ def?.trigger.targeting?.channels ?? [] }
						/>
					) }
				</section>
				<section className="flex flex-col gap-2">
					<h3 className="font-semibold">
						{ __( 'Then', 'cliedesk' ) }
					</h3>
					<ol className="flex flex-col gap-2">
						{ steps.map( ( s, i ) => (
							<StepEditor
								key={ i }
								step={ s }
								index={ i }
								registry={ stepRegistry }
								onChange={ ( x ) =>
									setSteps( ( all ) =>
										all.map( ( y, j ) =>
											j === i ? x : y
										)
									)
								}
								onRemove={ () =>
									setSteps( ( all ) =>
										all.filter( ( _, j ) => j !== i )
									)
								}
							/>
						) ) }
					</ol>
					<div>
						<Button
							size="sm"
							iconStart={
								<Plus aria-hidden="true" size={ 14 } />
							}
							isDisabled={ steps.length >= 20 }
							onPress={ () =>
								setSteps( ( all ) => [
									...all,
									{ action: 'conversation.note', input: {} },
								] )
							}
						>
							{ __( 'Add action', 'cliedesk' ) }
						</Button>
					</div>
				</section>
				<Checkbox isSelected={ stop } onChange={ setStop }>
					{ __(
						'Stop processing: when this rule runs, later rules for the same trigger do not',
						'cliedesk'
					) }
				</Checkbox>
				{ ! rule && (
					<Checkbox isSelected={ enabled } onChange={ setEnabled }>
						{ __( 'Turn the rule on now', 'cliedesk' ) }
					</Checkbox>
				) }
			</div>
		</Modal>
	);
}

interface Recipe {
	key: string;
	name: string;
	description: string;
	rules: number;
}

function RecipesDialog( { onClose }: { onClose: () => void } ) {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'workflows', 'recipes' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Recipe[] >( 'automation/recipes', { signal } ) )
				.data ?? [],
	} );
	const add = useMutation( {
		mutationFn: ( r: Recipe ) =>
			api.post( `automation/recipes/${ r.key }`, { body: {} } ),
		onSuccess: ( _, r ) => {
			announceResult(
				sprintf(
					/* translators: %s: recipe name. */
					__( '“%s” added. Check it, then turn it on.', 'cliedesk' ),
					r.name
				)
			);
			void qc.invalidateQueries( { queryKey: [ 'workflows' ] } );
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Add rules from a recipe', 'cliedesk' ) }
		>
			<ActionError error={ add.error } />
			{ q.isPending && <LoadingRegion /> }
			<ul className="flex flex-col divide-y divide-line">
				{ asList( q.data ).map( ( r ) => (
					<li
						key={ r.key }
						className="flex flex-wrap items-start gap-3 py-3"
					>
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="font-medium">{ r.name }</span>
							<span className="text-sm text-fg-muted">
								{ r.description }
							</span>
						</div>
						<Button
							size="sm"
							isLoading={
								add.isPending && add.variables?.key === r.key
							}
							onPress={ () => add.mutate( r ) }
							aria-label={ sprintf(
								/* translators: %s: recipe name. */
								__( 'Add %s', 'cliedesk' ),
								r.name
							) }
						>
							{ __( 'Add', 'cliedesk' ) }
						</Button>
					</li>
				) ) }
			</ul>
		</Modal>
	);
}

/**
 * Rules section.
 */
export default function RulesSection() {
	const qc = useQueryClient();
	const [ editing, setEditing ] = useState< Rule | 'new' | null >( null );
	const [ recipes, setRecipes ] = useState( false );
	// AUT-04, AUT-77: filters and drag and drop.
	const [ filter, setFilter ] = useState( NO_FILTER );
	const [ dragging, setDragging ] = useState< number | null >( null );
	const registry = useQuery( {
		queryKey: [ 'workflows', 'registry' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Registry >( 'automation/registry', { signal } ) )
				.data,
	} );
	const q = useQuery( {
		queryKey: [ 'workflows', 'list' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Rule[] >( 'workflows', { signal } ) ).data ?? [],
	} );
	const refresh = () =>
		void qc.invalidateQueries( { queryKey: [ 'workflows' ] } );
	const status = useMutation( {
		mutationFn: ( { r, to }: { r: Rule; to: string } ) =>
			api.post( `workflows/${ r.id }/status`, { body: { status: to } } ),
		onSuccess: refresh,
	} );
	const order = useMutation( {
		mutationFn: ( { trigger, ids }: { trigger: string; ids: number[] } ) =>
			api.post( 'workflows/order', { body: { trigger, ids } } ),
		onSuccess: refresh,
	} );
	const pause = useMutation( {
		mutationFn: ( paused: boolean ) =>
			api.post( 'automation/pause', { body: { paused } } ),
		onSuccess: refresh,
	} );
	if ( q.isPending || registry.isPending || ! registry.data ) {
		return <LoadingRegion />;
	}
	const reg = registry.data;
	const label = ( t: string ) =>
		reg.triggers.find( ( x ) => x.name === t )?.label ?? t;
	const groups = new Map< string, Rule[] >();
	const folders = [
		...new Set(
			( q.data ?? [] )
				.map(
					( r ) => ( r as Rule & { folder?: string } ).folder ?? ''
				)
				.filter( Boolean )
		),
	];
	const shown = filterRules(
		( q.data ?? [] ) as Array< Rule & { folder?: string } >,
		filter,
		( a ) => reg.actions.find( ( x ) => x.name === a )?.label ?? a
	);
	for ( const r of shown ) {
		groups.set( r.trigger, [ ...( groups.get( r.trigger ) ?? [] ), r ] );
	}
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-fg-muted">
				{ __(
					'Rules do work for you: when something happens and the conversation matches, they run actions in order. Rules for the same trigger run top to bottom.',
					'cliedesk'
				) }
			</p>
			{ reg.paused && (
				<Banner
					tone="warning"
					title={ __( 'All rules are paused.', 'cliedesk' ) }
				>
					<Button size="sm" onPress={ () => pause.mutate( false ) }>
						{ __( 'Resume rules', 'cliedesk' ) }
					</Button>
				</Banner>
			) }
			<div className="flex flex-wrap items-center justify-between gap-3">
				{ ! reg.paused && (
					<Button
						variant="ghost"
						onPress={ () => pause.mutate( true ) }
					>
						{ __( 'Pause all rules', 'cliedesk' ) }
					</Button>
				) }
				<div className="flex flex-wrap gap-2">
					<ExportImport onChanged={ refresh } />
					<Slot
						name="rules.toolbar"
						fillProps={ { onChanged: refresh, kit: automationKit } }
					/>
					<Button onPress={ () => setRecipes( true ) }>
						{ __( 'Recipes', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
						onPress={ () => setEditing( 'new' ) }
					>
						{ __( 'Add rule', 'cliedesk' ) }
					</Button>
				</div>
			</div>
			<ActionError error={ status.error ?? order.error ?? pause.error } />
			<AssistantCard />
			<BotBehaviours />
			<RuleFilterBar
				value={ filter }
				onChange={ setFilter }
				folders={ folders }
			/>
			{ groups.size === 0 && (
				<EmptyState
					icon={ <Workflow size={ 32 } strokeWidth={ 1.75 } /> }
					title={ __( 'No rules yet', 'cliedesk' ) }
					description={ __(
						'Start from a ready recipe, for example an automatic reply to “Where is my order?” questions.',
						'cliedesk'
					) }
					actions={
						// ADM-04: every empty state offers a recipe.
						<Button
							variant="primary"
							onPress={ () => setRecipes( true ) }
						>
							{ __( 'Start from a recipe', 'cliedesk' ) }
						</Button>
					}
				/>
			) }
			{ [ ...groups.entries() ].map( ( [ trigger, list ] ) => (
				<section key={ trigger } className="flex flex-col gap-2">
					<h2 className="text-base font-semibold">
						{ label( trigger ) }
					</h2>
					<ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
						{ list.map( ( r, i ) => (
							<li
								key={ r.id }
								className="flex flex-wrap items-center gap-3 p-3"
								// AUT-04: drag a rule onto another to put it there (Move up / down do the same by keyboard).
								draggable
								onDragStart={ () => setDragging( r.id ) }
								onDragOver={ ( e ) => e.preventDefault() }
								onDrop={ ( e ) => {
									e.preventDefault();
									if (
										dragging !== null &&
										dragging !== r.id
									) {
										order.mutate( {
											trigger,
											ids: moveId(
												list.map( ( x ) => x.id ),
												dragging,
												r.id
											),
										} );
									}
									setDragging( null );
								} }
							>
								<Switch
									isSelected={ r.status === 'live' }
									onChange={ ( on ) =>
										status.mutate( {
											r,
											to: on ? 'live' : 'paused',
										} )
									}
								>
									<span className="sr-only">
										{ sprintf(
											/* translators: %s: rule name. */
											__( '%s is on', 'cliedesk' ),
											r.name
										) }
									</span>
								</Switch>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="font-medium">
										{ r.name }
									</span>
									<span className="text-sm text-fg-muted">
										{ r.definition.actions
											.map(
												( a ) =>
													reg.actions.find(
														( x ) =>
															x.name === a.action
													)?.label ?? a.action
											)
											.join( ' → ' ) }
										{ r.lastRunAt
											? ` · ${ sprintf(
													/* translators: %s: date and time. */
													__(
														'last run %s',
														'cliedesk'
													),
													new Date(
														r.lastRunAt
													).toLocaleString()
												) }`
											: '' }
									</span>
									<Slot
										name="rules.row.stats"
										fillProps={ { rule: r } }
										className="text-sm text-fg-muted"
									/>
								</div>
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: rule name. */
										__( 'Move %s up', 'cliedesk' ),
										r.name
									) }
									isDisabled={ i === 0 }
									onPress={ () => {
										const ids = list.map( ( x ) => x.id );
										[ ids[ i - 1 ], ids[ i ] ] = [
											ids[ i ] as number,
											ids[ i - 1 ] as number,
										];
										order.mutate( { trigger, ids } );
									} }
									icon={
										<ArrowUp
											aria-hidden="true"
											size={ 14 }
										/>
									}
								/>
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: rule name. */
										__( 'Move %s down', 'cliedesk' ),
										r.name
									) }
									isDisabled={ i === list.length - 1 }
									onPress={ () => {
										const ids = list.map( ( x ) => x.id );
										[ ids[ i + 1 ], ids[ i ] ] = [
											ids[ i ] as number,
											ids[ i + 1 ] as number,
										];
										order.mutate( { trigger, ids } );
									} }
									icon={
										<ArrowDown
											aria-hidden="true"
											size={ 14 }
										/>
									}
								/>
								<RuleToolsMenu
									rule={ r }
									onChanged={ refresh }
								/>
								<RuleManageMenu
									rule={ r }
									onChanged={ refresh }
								/>
								<Slot
									name="rules.row.tools"
									fillProps={ {
										rule: r,
										onChanged: refresh,
										kit: automationKit,
									} }
								/>
								<Button
									size="sm"
									onPress={ () => setEditing( r ) }
									aria-label={ sprintf(
										/* translators: %s: rule name. */
										__( 'Edit %s', 'cliedesk' ),
										r.name
									) }
								>
									{ __( 'Edit', 'cliedesk' ) }
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onPress={ () =>
										status.mutate( { r, to: 'archived' } )
									}
									aria-label={ sprintf(
										/* translators: %s: rule name. */
										__( 'Archive %s', 'cliedesk' ),
										r.name
									) }
								>
									{ __( 'Archive', 'cliedesk' ) }
								</Button>
							</li>
						) ) }
					</ol>
				</section>
			) ) }
			{ editing && (
				<RuleDialog
					rule={ editing === 'new' ? null : editing }
					registry={ reg }
					onClose={ () => setEditing( null ) }
				/>
			) }
			{ recipes && (
				<RecipesDialog onClose={ () => setRecipes( false ) } />
			) }
		</div>
	);
}
