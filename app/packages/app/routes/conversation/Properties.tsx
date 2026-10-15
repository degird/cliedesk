/**
 * Properties card at the top of the conversation's side panel: status, priority, assignee, queue, type, product and
 * language (CNV-11…15, CNV-24, TRI-03, BRD-05, INB-14), as compact label · value rows.
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Select, toast } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { whyDisabled } from '../../components/DisabledReason';
import {
	PRIORITIES,
	queuePickerQuery,
	typesQuery,
	type Conversation,
	type Priority,
} from '../../inbox/api';
import { ActionError, PanelSection } from '../../inbox/components';
import { priorityLabel } from '../../inbox/labels';
import { parseUtc, versionTag } from '../../workspace/api';
import { UNASSIGNED, useConversationControls } from './controls';
import { languageName } from './CustomerChips';
import { afterChange, currentVersion, inOrder, mergeDetail } from './shared';

const NO_QUEUE = 'none';
const FIELDS_CAP = 'cliedesk_edit_conversation_fields';

/**
 * Move to another queue (INB-14): POST conversations/{id}/move {queueId}, then an Undo toast until undoUntil
 * (POST …/move/undo). Queues come from GET queues/picker; without cliedesk_assign_others the row is hidden.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function QueueSelect( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const qc = useQueryClient();
	const allowed = can( 'cliedesk_assign_others' );
	const queues = useQuery( { ...queuePickerQuery(), enabled: allowed } );
	const undo = ( name: string ) =>
		void api
			.post< Conversation >( `conversations/${ c.id }/move/undo` )
			.then( ( r ) => {
				if ( r.data && typeof r.data.version === 'number' ) {
					mergeDetail( qc, c.id, r.data );
				}
				afterChange( qc, c.id );
				toast( {
					tone: 'success',
					title: sprintf(
						/* translators: %s: queue name. */
						__( 'Move to %s undone.', 'cliedesk' ),
						name
					),
				} );
			} )
			.catch( ( e: unknown ) =>
				toast( {
					tone: 'danger',
					title: __( 'Could not undo the move', 'cliedesk' ),
					description: e instanceof Error ? e.message : undefined,
				} )
			);
	const move = useMutation( {
		mutationFn: ( queueId: number | null ) =>
			inOrder( c.id, async () => {
				const r = await api.post< {
					undoUntil: string;
					conversation: Conversation;
				} >( `conversations/${ c.id }/move`, {
					body: { queueId },
					ifMatch: versionTag(
						currentVersion( qc, c.id, c.version )
					),
				} );
				if ( r.data?.conversation ) {
					mergeDetail( qc, c.id, r.data.conversation );
				}
				return r;
			} ),
		onSuccess: ( r, queueId ) => {
			if ( r.data?.conversation ) {
				mergeDetail( qc, c.id, r.data.conversation );
			}
			afterChange( qc, c.id );
			const name =
				queueId === null
					? __( 'no queue', 'cliedesk' )
					: ( ( queues.data ?? [] ).find( ( q ) => q.id === queueId )
							?.name ?? `#${ queueId }` );
			const until = parseUtc( r.data?.undoUntil ?? '' )?.getTime() ?? 0;
			const ms = until - Date.now();
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %s: queue name. */
					__( 'Moved to %s.', 'cliedesk' ),
					name
				),
				timeout: ms > 1000 ? ms : undefined,
				action:
					ms > 1000
						? {
								label: __( 'Undo', 'cliedesk' ),
								onAction: () => undo( name ),
							}
						: undefined,
			} );
		},
	} );
	if ( ! allowed || ! queues.isSuccess ) {
		return null;
	}
	const options = [
		{ id: NO_QUEUE, label: __( 'No queue', 'cliedesk' ) },
		...queues.data.map( ( q ) => ( {
			id: String( q.id ),
			label: q.icon ? `${ q.icon } ${ q.name }` : q.name,
		} ) ),
	];
	if (
		c.queueId !== null &&
		! options.some( ( o ) => o.id === String( c.queueId ) )
	) {
		options.push( {
			id: String( c.queueId ),
			label: sprintf(
				/* translators: %d: queue id. */
				__( 'Queue #%d', 'cliedesk' ),
				c.queueId
			),
		} );
	}
	return (
		<>
			<Select
				inline
				label={ __( 'Queue', 'cliedesk' ) }
				value={ c.queueId === null ? NO_QUEUE : String( c.queueId ) }
				isDisabled={ move.isPending }
				options={ options }
				onChange={ ( id ) => {
					const next = id === NO_QUEUE ? null : Number( id );
					if ( next !== c.queueId ) {
						move.mutate( next );
					}
				} }
			/>
			<ActionError
				error={ move.error }
				onDismiss={ () => move.reset() }
			/>
		</>
	);
}

/**
 * The conversation language (TRI-03): the workspace languages plus the current one; an agent overrides it.
 *
 * @param props          Props.
 * @param props.value    Current code.
 * @param props.disabled Read only.
 * @param props.onChange Change (empty clears).
 */
function LanguageSelect( {
	value,
	disabled,
	onChange,
}: {
	value: string | null;
	disabled: boolean;
	onChange: ( code: string ) => void;
} ) {
	const q = useQuery( {
		queryKey: [ 'languages', 'picker' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items?: { code: string; name: string }[] } >(
					'languages',
					{ signal }
				)
			).data?.items ?? [],
		staleTime: 300000,
		retry: false,
	} );
	const items = q.data ?? [];
	const options = [
		{ id: '', label: __( 'Not set', 'cliedesk' ) },
		...items.map( ( l ) => ( { id: l.code, label: l.name } ) ),
	];
	if ( value && ! items.some( ( l ) => l.code === value ) ) {
		options.push( { id: value, label: languageName( value ) } );
	}
	return (
		<Select
			inline
			label={ __( 'Language', 'cliedesk' ) }
			value={ value ?? '' }
			isDisabled={ disabled }
			description={
				disabled ? whyDisabled( { cap: FIELDS_CAP } ) : undefined
			}
			options={ options }
			onChange={ ( l ) => l !== ( value ?? '' ) && onChange( l ) }
		/>
	);
}

/**
 * Properties card.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function Properties( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const ctl = useConversationControls( c );
	const types = useQuery( typesQuery() );
	const canFields = can( FIELDS_CAP );
	const products = getBoot().products ?? [];
	const typeOptions = ( types.data ?? [] ).map( ( t ) => ( {
		id: String( t.id ),
		label: t.name,
	} ) );
	if ( ! typeOptions.some( ( o ) => o.id === String( c.typeId ) ) ) {
		typeOptions.unshift( {
			id: String( c.typeId ),
			label: __( 'Conversation', 'cliedesk' ),
		} );
	}
	const fieldsWhy = whyDisabled( { cap: FIELDS_CAP } );
	return (
		<PanelSection
			id="cd-side-properties"
			title={ __( 'Properties', 'cliedesk' ) }
		>
			{ ctl.feedback }
			<div className="flex flex-col gap-1">
				<Select
					inline
					label={ __( 'Status', 'cliedesk' ) }
					value={ c.status ? String( c.status.id ) : null }
					isDisabled={ ! ctl.canStatus || ! ctl.statusOptions.length }
					description={ whyDisabled( {
						cap: 'cliedesk_change_status',
					} ) }
					options={ ctl.statusOptions }
					onChange={ ctl.setStatus }
				/>
				<Select
					inline
					label={ __( 'Priority', 'cliedesk' ) }
					value={ c.priority }
					isDisabled={ ! canFields }
					description={ fieldsWhy }
					options={ PRIORITIES.map( ( p ) => ( {
						id: p,
						label: priorityLabel( p ),
					} ) ) }
					onChange={ ( p ) =>
						p !== c.priority &&
						ctl.run(
							'priority',
							{ priority: p as Priority },
							sprintf(
								/* translators: %s: priority. */
								__( 'Priority changed to %s.', 'cliedesk' ),
								priorityLabel( p )
							)
						)
					}
				/>
				<Select
					inline
					label={ __( 'Assignee', 'cliedesk' ) }
					value={
						c.assigneeId === null
							? UNASSIGNED
							: String( c.assigneeId )
					}
					isDisabled={ ! ctl.canAssign }
					description={ whyDisabled( {
						cap: [
							'cliedesk_assign_self',
							'cliedesk_assign_others',
						],
					} ) }
					options={ ctl.assigneeOptions }
					onChange={ ctl.assign }
				/>
				<QueueSelect conversation={ c } />
				<Select
					inline
					label={ __( 'Type', 'cliedesk' ) }
					value={ String( c.typeId ) }
					isDisabled={ ! canFields || typeOptions.length < 2 }
					description={ fieldsWhy }
					options={ typeOptions }
					onChange={ ( id ) =>
						Number( id ) !== c.typeId &&
						ctl.run(
							'type',
							{ typeId: Number( id ) },
							__( 'Type changed.', 'cliedesk' )
						)
					}
				/>
				{ products.length > 1 && (
					// BRD-05: move the conversation to another product (logged; routing and SLA run again).
					<Select
						inline
						label={ __( 'Product', 'cliedesk' ) }
						value={ String( c.productId ) }
						isDisabled={ ! canFields }
						description={ fieldsWhy }
						options={ products.map( ( p ) => ( {
							id: String( p.id ),
							label: p.name,
						} ) ) }
						onChange={ ( id ) =>
							Number( id ) !== c.productId &&
							ctl.run(
								'product',
								{ productId: Number( id ) },
								__( 'Product changed.', 'cliedesk' )
							)
						}
					/>
				) }
				<LanguageSelect
					value={ c.language ?? null }
					disabled={ ! canFields }
					onChange={ ( l ) =>
						ctl.run(
							'language',
							{ language: l },
							__( 'Language changed.', 'cliedesk' )
						)
					}
				/>
			</div>
			{ ctl.dialogs }
		</PanelSection>
	);
}
