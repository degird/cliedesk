/**
 * Settings → System → Arrival rules (SEC-17), for people with cliedesk_manage_spam.
 *
 * - Rules run in order on every new inbound conversation; each shows its hits and last hit. Move up / Move down
 *   (POST arrival-rules/order {ids}) keep the focus on the moved rule and announce its new place.
 * - The editor holds a name, nested all / any conditions (the shared ConditionGroup) and what the rule does:
 *   block (send to Spam, or drop for listed senders only) or sort (queue, team, priority, product, tags). Sorting
 *   needs cliedesk_manage_sla_routing: without it the option is hidden and sort rules cannot be changed.
 * - Server errors such as `conditions.all.1` or `actions.block` show on the condition or choice they name.
 * - Delete is confirmed.
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	ConfirmDestructive,
	IconButton,
	LoadingRegion,
	Modal,
	RadioGroup,
	Select,
	TextField,
	EmptyState,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
	useEffect,
	useMemo,
	useState,
	type FormEvent,
	type ReactNode,
} from 'react';
import { ConditionGroup } from '../../components/ConditionGroup';
import {
	PRIORITIES,
	queuePickerQuery,
	tagsQuery,
	teamsLookupQuery,
	type Priority,
} from '../../inbox/api';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { channelLabel, fullTime, priorityLabel } from '../../inbox/labels';
import {
	ARRIVAL_MAX_GROUP_DEPTH,
	actionSummary,
	arrivalFieldLabel,
	arrivalFromJson,
	arrivalKeys,
	arrivalOpLabel,
	arrivalQuery,
	arrivalToObject,
	defaultArrivalValue,
	errorPaths,
	isSortRule,
	namesSenders,
	newArrivalGroup,
	newArrivalLeaf,
	sourceLabel,
	validateArrival,
	valueKind,
	weekdayNames,
	type AGroup,
	type ALeaf,
	type ANode,
	type ArrivalFields,
	type ArrivalRule,
	type ArrivalSet,
} from '../../security/arrival';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

const KEEP = '_keep';

const canRoute = () => can( 'cliedesk_manage_sla_routing' );

function Checks( {
	legend,
	choices,
	value,
	error,
	onChange,
}: {
	legend: string;
	choices: Array< { id: string; label: string } >;
	value: string[];
	error: string | null;
	onChange: ( v: string[] ) => void;
} ) {
	return (
		<fieldset className="flex min-w-0 flex-1 flex-col gap-1">
			<legend className="pb-1 text-sm font-medium">{ legend }</legend>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{ choices.map( ( c ) => (
					<Checkbox
						key={ c.id }
						isSelected={ value.includes( c.id ) }
						onChange={ ( on ) =>
							onChange(
								on
									? [ ...value, c.id ]
									: value.filter( ( x ) => x !== c.id )
							)
						}
					>
						{ c.label }
					</Checkbox>
				) ) }
			</div>
			{ error && <p className="text-sm text-danger">{ error }</p> }
		</fieldset>
	);
}

function ValueEditor( {
	leaf,
	error,
	onChange,
}: {
	leaf: ALeaf;
	error: string | null;
	onChange: ( l: ALeaf ) => void;
} ) {
	const kind = valueKind( leaf.field, leaf.op );
	const list = Array.isArray( leaf.value ) ? leaf.value : [];
	const set = ( value: string | string[] ) => onChange( { ...leaf, value } );
	// Channel and source keys come from the server (GET arrival-rules); chosen keys it no longer lists stay visible.
	const keys = useQuery( arrivalQuery() ).data;
	const withChosen = ( known: string[] ) => [
		...known,
		...list.filter( ( k ) => ! known.includes( k ) ),
	];
	switch ( kind ) {
		case 'none':
			return null;
		case 'text':
			return (
				<TextField
					className="min-w-48 flex-1"
					label={ __( 'Value', 'cliedesk' ) }
					description={
						leaf.op === 'wildcard'
							? __(
									'Use * for any text, for example *@example.com.',
									'cliedesk'
								)
							: undefined
					}
					value={ Array.isArray( leaf.value ) ? '' : leaf.value }
					onChange={ set }
					maxLength={ 500 }
					errorMessage={ error }
				/>
			);
		case 'list':
			return (
				<TextField
					className="min-w-48 flex-1"
					label={ __( 'Values', 'cliedesk' ) }
					description={ __(
						'One per line, or separated by commas.',
						'cliedesk'
					) }
					multiline
					rows={ 3 }
					value={
						Array.isArray( leaf.value )
							? leaf.value.join( '\n' )
							: leaf.value
					}
					onChange={ set }
					errorMessage={ error }
				/>
			);
		case 'channels':
			return (
				<Checks
					legend={ __( 'Channels', 'cliedesk' ) }
					value={ list }
					error={ error }
					onChange={ set }
					choices={ withChosen( keys?.channels ?? [] ).map(
						( c ) => ( {
							id: c,
							label: channelLabel( c ),
						} )
					) }
				/>
			);
		case 'sources':
			return (
				<Checks
					legend={ __( 'Sources', 'cliedesk' ) }
					value={ list }
					error={ error }
					onChange={ set }
					choices={ withChosen( keys?.sources ?? [] ).map(
						( s ) => ( {
							id: s,
							label: sourceLabel( s ),
						} )
					) }
				/>
			);
		case 'weekdays': {
			const names = weekdayNames();
			// Monday first; values stay 0 (Sunday) to 6.
			const order = [ 1, 2, 3, 4, 5, 6, 0 ];
			return (
				<Checks
					legend={ __( 'Days', 'cliedesk' ) }
					value={ list }
					error={ error }
					onChange={ set }
					choices={ order.map( ( d ) => ( {
						id: String( d ),
						label: names[ d ] ?? String( d ),
					} ) ) }
				/>
			);
		}
		case 'hours': {
			const hours = Array.from( { length: 24 }, ( _, h ) => ( {
				id: String( h ),
				label: `${ String( h ).padStart( 2, '0' ) }:00`,
			} ) );
			const [ from = '9', to = '17' ] = list;
			return (
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex flex-wrap gap-2">
						<Select
							className="min-w-28"
							label={ __( 'From hour', 'cliedesk' ) }
							value={ from }
							onChange={ ( h ) => set( [ h, to ] ) }
							options={ hours }
						/>
						<Select
							className="min-w-28"
							label={ __( 'To hour (included)', 'cliedesk' ) }
							value={ to }
							onChange={ ( h ) => set( [ from, h ] ) }
							options={ hours }
						/>
					</div>
					<p className="text-sm text-fg-muted">
						{ __(
							'In the site’s time zone. A range such as 22 to 6 runs past midnight.',
							'cliedesk'
						) }
					</p>
					{ error && (
						<p className="text-sm text-danger">{ error }</p>
					) }
				</div>
			);
		}
	}
	return null;
}

function LeafRow( {
	leaf,
	fields,
	error,
	onChange,
	onRemove,
}: {
	leaf: ALeaf;
	fields: ArrivalFields;
	error: string | null;
	onChange: ( l: ALeaf ) => void;
	onRemove: () => void;
} ) {
	const ops = fields[ leaf.field ] ?? [ leaf.op ];
	return (
		<li
			id={ `cd-arrival-cond-${ leaf.id }` }
			className="flex flex-wrap items-start gap-3 rounded-md border border-line bg-surface p-3"
		>
			<Select
				className="min-w-44"
				label={ __( 'Condition', 'cliedesk' ) }
				value={ leaf.field }
				onChange={ ( f ) =>
					onChange( { ...newArrivalLeaf( f, fields ), id: leaf.id } )
				}
				options={ Object.keys( fields ).map( ( f ) => ( {
					id: f,
					label: arrivalFieldLabel( f ),
				} ) ) }
			/>
			{ ops.length > 1 ? (
				<Select
					className="min-w-40"
					label={ __( 'Operator', 'cliedesk' ) }
					value={ leaf.op }
					onChange={ ( op ) => {
						const before = valueKind( leaf.field, leaf.op );
						const after = valueKind( leaf.field, op );
						let value = leaf.value;
						if ( before !== after ) {
							value =
								after === 'list' && before === 'text'
									? [ String( leaf.value ) ].filter( Boolean )
									: defaultArrivalValue( after );
						}
						onChange( { ...leaf, op, value } );
					} }
					options={ ops.map( ( o ) => ( {
						id: o,
						label: arrivalOpLabel( o ),
					} ) ) }
				/>
			) : (
				<p className="self-end pb-2 text-sm text-fg-muted">
					{ arrivalOpLabel( leaf.op ) }
				</p>
			) }
			<ValueEditor leaf={ leaf } error={ error } onChange={ onChange } />
			{ valueKind( leaf.field, leaf.op ) === 'none' && error && (
				<p className="text-sm text-danger">{ error }</p>
			) }
			<IconButton
				className="mt-6"
				label={ sprintf(
					/* translators: %s: condition name. */
					__( 'Remove condition “%s”', 'cliedesk' ),
					arrivalFieldLabel( leaf.field )
				) }
				icon={ <Trash2 size={ 16 } /> }
				onPress={ onRemove }
			/>
		</li>
	);
}

type Kind = 'block' | 'sort';

/**
 * Ids of every condition in a tree, in order.
 *
 * @param g Group.
 */
function leafIdsOf( g: AGroup ): string[] {
	return g.children.flatMap( ( c ) =>
		c.kind === 'group' ? leafIdsOf( c ) : [ c.id ]
	);
}

function initialSet( rule: ArrivalRule | null ): ArrivalSet {
	const a = ( rule?.actions ?? {} ) as { set?: ArrivalSet };
	return a.set && typeof a.set === 'object' ? a.set : {};
}

function SortFields( {
	set,
	errors,
	onChange,
}: {
	set: ArrivalSet;
	errors: Record< string, string >;
	onChange: ( s: ArrivalSet ) => void;
} ) {
	const queues = useQuery( queuePickerQuery() );
	const teams = useQuery( teamsLookupQuery() );
	const tags = useQuery( tagsQuery() );
	const products = getBoot().products ?? [];
	const pick = < K extends 'queueId' | 'teamId' | 'productId' >(
		key: K,
		v: string
	) => {
		const next = { ...set };
		if ( v === KEEP ) {
			delete next[ key ];
		} else {
			next[ key ] = Number( v );
		}
		onChange( next );
	};
	const keep = { id: KEEP, label: __( 'Don’t change', 'cliedesk' ) };
	const queueList = queues.data ?? [];
	const teamList = teams.data ?? [];
	const tagList = Array.isArray( tags.data ) ? tags.data : [];
	return (
		<div className="flex flex-col gap-3">
			<div className="grid gap-3 sm:grid-cols-2">
				<Select
					label={ __( 'Queue', 'cliedesk' ) }
					value={
						set.queueId === undefined ? KEEP : String( set.queueId )
					}
					onChange={ ( v ) => pick( 'queueId', v ) }
					options={ [
						keep,
						...queueList.map( ( q ) => ( {
							id: String( q.id ),
							label: q.name,
						} ) ),
						...( set.queueId !== undefined &&
						! queueList.some( ( q ) => q.id === set.queueId )
							? [
									{
										id: String( set.queueId ),
										label: sprintf(
											/* translators: %d: queue id. */
											__( 'Queue #%d', 'cliedesk' ),
											set.queueId
										),
									},
								]
							: [] ),
					] }
					errorMessage={ errors[ 'actions.set.queueId' ] ?? null }
				/>
				<Select
					label={ __( 'Team', 'cliedesk' ) }
					value={
						set.teamId === undefined ? KEEP : String( set.teamId )
					}
					onChange={ ( v ) => pick( 'teamId', v ) }
					options={ [
						keep,
						...teamList.map( ( t ) => ( {
							id: String( t.id ),
							label: t.name,
						} ) ),
						...( set.teamId !== undefined &&
						! teamList.some( ( t ) => t.id === set.teamId )
							? [
									{
										id: String( set.teamId ),
										label: sprintf(
											/* translators: %d: team id. */
											__( 'Team #%d', 'cliedesk' ),
											set.teamId
										),
									},
								]
							: [] ),
					] }
					errorMessage={ errors[ 'actions.set.teamId' ] ?? null }
				/>
				<Select
					label={ __( 'Priority', 'cliedesk' ) }
					value={ set.priority ?? KEEP }
					onChange={ ( v ) => {
						const next = { ...set };
						if ( v === KEEP ) {
							delete next.priority;
						} else {
							next.priority = v;
						}
						onChange( next );
					} }
					options={ [
						keep,
						...PRIORITIES.map( ( p ) => ( {
							id: p,
							label: priorityLabel( p as Priority ),
						} ) ),
					] }
					errorMessage={ errors[ 'actions.set.priority' ] ?? null }
				/>
				{ products.length > 1 && (
					<Select
						label={ __( 'Product', 'cliedesk' ) }
						value={
							set.productId === undefined
								? KEEP
								: String( set.productId )
						}
						onChange={ ( v ) => pick( 'productId', v ) }
						options={ [
							keep,
							...products.map( ( p ) => ( {
								id: String( p.id ),
								label: p.name,
							} ) ),
						] }
						errorMessage={
							errors[ 'actions.set.productId' ] ?? null
						}
					/>
				) }
			</div>
			<fieldset className="flex flex-col gap-1">
				<legend className="pb-1 text-sm font-medium">
					{ __( 'Add tags', 'cliedesk' ) }
				</legend>
				{ ! tagList.length && (
					<Muted>{ __( 'No tags yet.', 'cliedesk' ) }</Muted>
				) }
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					{ tagList.map( ( t ) => (
						<Checkbox
							key={ t.id }
							isSelected={ ( set.tagIds ?? [] ).includes( t.id ) }
							onChange={ ( on ) => {
								const ids = ( set.tagIds ?? [] ).filter(
									( x ) => x !== t.id
								);
								const next = { ...set };
								if ( on ) {
									ids.push( t.id );
								}
								if ( ids.length ) {
									next.tagIds = ids;
								} else {
									delete next.tagIds;
								}
								onChange( next );
							} }
						>
							{ t.name }
						</Checkbox>
					) ) }
				</div>
				{ errors[ 'actions.set.tagIds' ] && (
					<p className="text-sm text-danger">
						{ errors[ 'actions.set.tagIds' ] }
					</p>
				) }
			</fieldset>
			{ set.fields && Object.keys( set.fields ).length > 0 && (
				<Muted>
					{ __(
						'This rule also sets fields. They are kept as they are.',
						'cliedesk'
					) }
				</Muted>
			) }
		</div>
	);
}

function RuleDialog( {
	rule,
	fields,
	onClose,
}: {
	rule: ArrivalRule | null;
	fields: ArrivalFields;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const routing = canRoute();
	const [ name, setName ] = useState( rule?.name ?? '' );
	const [ root, setRoot ] = useState< AGroup >( () =>
		rule
			? arrivalFromJson( rule.conditions, fields )
			: newArrivalGroup( 'all', [ newArrivalLeaf( 'sender', fields ) ] )
	);
	const initialKind: Kind =
		rule && isSortRule( rule.actions ) ? 'sort' : 'block';
	const [ kind, setKind ] = useState< Kind >( initialKind );
	const [ block, setBlock ] = useState< 'quarantine' | 'drop' >(
		( rule?.actions as { block?: string } | undefined )?.block === 'drop'
			? 'drop'
			: 'quarantine'
	);
	const [ set, setSet ] = useState< ArrivalSet >( () => initialSet( rule ) );
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const save = useMutation( {
		mutationFn: () => {
			const body = {
				name: name.trim(),
				conditions: JSON.stringify( arrivalToObject( root ) ),
				actions: JSON.stringify(
					kind === 'block' ? { block } : { set }
				),
			};
			return rule
				? api.patch< ArrivalRule >( `arrival-rules/${ rule.id }`, {
						body,
					} )
				: api.post< ArrivalRule >( 'arrival-rules', { body } );
		},
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: arrivalKeys.all } );
			announceResult(
				rule
					? __( 'Arrival rule saved.', 'cliedesk' )
					: __( 'Arrival rule added.', 'cliedesk' )
			);
			onClose();
		},
	} );
	// Server errors by path → the condition they name; anything else is shown above the conditions.
	const server = apiFieldErrors( save.error );
	const paths = errorPaths( root );
	const leafIds = new Set( leafIdsOf( root ) );
	const nodeErrors: Record< string, string > = { ...errors };
	const treeErrors: string[] = errors[ '' ] ? [ errors[ '' ] ] : [];
	for ( const [ path, msg ] of Object.entries( server ) ) {
		if ( ! path.startsWith( 'conditions' ) ) {
			continue;
		}
		const id = paths[ path ];
		if ( id && leafIds.has( id ) ) {
			nodeErrors[ id ] = msg;
		} else {
			treeErrors.push( msg );
		}
	}
	const dropAllowed = namesSenders( root );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next = validateArrival( root );
		if ( ! name.trim() ) {
			next.name = __( 'Enter a name.', 'cliedesk' );
		}
		if ( kind === 'block' && block === 'drop' && ! dropAllowed ) {
			next.block = __(
				'Drop works only for listed senders: add a condition “Sender email is” or “Sender domain is”. Use Spam for anything else.',
				'cliedesk'
			);
		}
		if ( kind === 'sort' && ! Object.keys( set ).length ) {
			next.set = __( 'Choose what the rule sets.', 'cliedesk' );
		}
		setErrors( next );
		if ( Object.keys( next ).length ) {
			// Focus the first problem: the name, or the first condition with an error.
			if ( next.name ) {
				document.getElementById( 'cd-arrival-name' )?.focus();
				return;
			}
			const leaf = leafIdsOf( root ).find( ( id ) => next[ id ] );
			if ( leaf ) {
				document
					.getElementById( `cd-arrival-cond-${ leaf }` )
					?.querySelector< HTMLElement >( 'input, textarea, button' )
					?.focus();
			}
			return;
		}
		save.mutate();
	};
	const hasKnownErrors = Object.keys( server ).some(
		( k ) =>
			k === 'name' ||
			k.startsWith( 'conditions' ) ||
			k.startsWith( 'actions' )
	);
	const kindOptions = [
		{
			id: 'block',
			label: __( 'Block', 'cliedesk' ),
			description: __(
				'Keep the conversation out of the inbox.',
				'cliedesk'
			),
		},
		...( routing || initialKind === 'sort'
			? [
					{
						id: 'sort',
						label: __( 'Sort', 'cliedesk' ),
						description: __(
							'Set the queue, team, priority, product or tags before routing.',
							'cliedesk'
						),
						isDisabled: ! routing,
					},
				]
			: [] ),
	];
	const readOnly = initialKind === 'sort' && ! routing;
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				rule
					? __( 'Change arrival rule', 'cliedesk' )
					: __( 'Add an arrival rule', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-arrival-form"
						variant="primary"
						isDisabled={ readOnly }
						isLoading={ save.isPending }
					>
						{ rule
							? __( 'Save rule', 'cliedesk' )
							: __( 'Add rule', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-arrival-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ readOnly && (
					<Banner
						tone="info"
						title={ __(
							'You can’t change rules that sort',
							'cliedesk'
						) }
					>
						{ __(
							'Sorting conversations needs the permission to manage SLA and routing.',
							'cliedesk'
						) }
					</Banner>
				) }
				{ save.error && ! hasKnownErrors ? (
					<ActionError
						error={ save.error }
						onDismiss={ () => save.reset() }
					/>
				) : null }
				<TextField
					id="cd-arrival-name"
					label={ __( 'Name', 'cliedesk' ) }
					description={ __(
						'For example “Newsletters to Spam”.',
						'cliedesk'
					) }
					value={ name }
					onChange={ ( v ) => {
						setName( v );
						setErrors( ( x ) => {
							const { name: _drop, ...rest } = x;
							return rest;
						} );
					} }
					isRequired
					maxLength={ 255 }
					errorMessage={ errors.name ?? server.name ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<section
					aria-labelledby="cd-arrival-when"
					className="flex flex-col gap-2"
				>
					<h3 id="cd-arrival-when" className="font-semibold">
						{ __( 'When a new conversation arrives', 'cliedesk' ) }
					</h3>
					{ treeErrors.length > 0 && (
						<div role="alert" className="text-sm text-danger">
							{ treeErrors.map( ( m, i ) => (
								<p key={ i }>{ m }</p>
							) ) }
						</div>
					) }
					<ConditionGroup< ANode >
						group={ root }
						depth={ 0 }
						maxDepth={ ARRIVAL_MAX_GROUP_DEPTH }
						text={ {
							rootLegend: __( 'Conditions', 'cliedesk' ),
							rootEmpty: __(
								'Add at least one condition.',
								'cliedesk'
							),
						} }
						newLeaf={ () => newArrivalLeaf( 'sender', fields ) }
						newGroup={ ( mode, children ) =>
							newArrivalGroup( mode, children )
						}
						onChange={ setRoot }
						renderNode={ ( n, setNode ) =>
							n.kind === 'raw' ? (
								<li className="flex items-center gap-2 rounded-md border border-line bg-sunken p-3 text-sm">
									<span className="min-w-0 flex-1 font-mono break-all">
										{ JSON.stringify( n.json ) }
									</span>
									<IconButton
										label={ __(
											'Remove this condition',
											'cliedesk'
										) }
										icon={ <Trash2 size={ 16 } /> }
										onPress={ () => setNode( null ) }
									/>
								</li>
							) : (
								<LeafRow
									leaf={ n }
									fields={ fields }
									error={ nodeErrors[ n.id ] ?? null }
									onChange={ ( l ) => setNode( l ) }
									onRemove={ () => setNode( null ) }
								/>
							)
						}
					/>
				</section>
				<section
					aria-labelledby="cd-arrival-then"
					className="flex flex-col gap-3"
				>
					<h3 id="cd-arrival-then" className="font-semibold">
						{ __( 'Then', 'cliedesk' ) }
					</h3>
					{ kindOptions.length > 1 && (
						<RadioGroup
							label={ __( 'What the rule does', 'cliedesk' ) }
							orientation="horizontal"
							value={ kind }
							onChange={ ( k ) => {
								setKind( k as Kind );
								setErrors( {} );
							} }
							options={ kindOptions }
							errorMessage={ server.actions ?? null }
						/>
					) }
					{ kind === 'block' && (
						<RadioGroup
							id="cd-arrival-block"
							label={ __( 'Block how', 'cliedesk' ) }
							value={ block }
							onChange={ ( b ) =>
								setBlock( b as 'quarantine' | 'drop' )
							}
							options={ [
								{
									id: 'quarantine',
									label: __( 'Send to Spam', 'cliedesk' ),
									description: __(
										'The conversation waits in Spam, where you can restore it.',
										'cliedesk'
									),
								},
								{
									id: 'drop',
									label: __(
										'Drop without a trace',
										'cliedesk'
									),
									description: dropAllowed
										? __(
												'Nothing is kept. Only for listed senders.',
												'cliedesk'
											)
										: __(
												'Only for listed senders: needs a condition “Sender email is” or “Sender domain is”.',
												'cliedesk'
											),
								},
							] }
							errorMessage={
								errors.block ??
								server[ 'actions.block' ] ??
								( kindOptions.length > 1
									? null
									: ( server.actions ?? null ) )
							}
						/>
					) }
					{ kind === 'sort' && (
						<>
							<SortFields
								set={ set }
								errors={ server }
								onChange={ ( s ) => {
									setSet( s );
									setErrors( ( x ) => {
										const { set: _drop, ...rest } = x;
										return rest;
									} );
								} }
							/>
							{ ( errors.set ?? server[ 'actions.set' ] ) && (
								<p role="alert" className="text-sm text-danger">
									{ errors.set ?? server[ 'actions.set' ] }
								</p>
							) }
						</>
					) }
				</section>
			</form>
		</Modal>
	);
}

function MoveButton( {
	id,
	label,
	icon,
	isDisabled,
	onPress,
}: {
	id: string;
	label: string;
	icon: ReactNode;
	isDisabled: boolean;
	onPress: () => void;
} ) {
	return (
		<IconButton
			id={ id }
			size="sm"
			label={ label }
			icon={ icon }
			isDisabled={ isDisabled }
			onPress={ onPress }
		/>
	);
}

/**
 * Section.
 */
export default function ArrivalRulesSection() {
	const qc = useQueryClient();
	const list = useQuery( arrivalQuery() );
	const routing = canRoute();
	const [ editing, setEditing ] = useState< ArrivalRule | 'new' | null >(
		null
	);
	const [ deleting, setDeleting ] = useState< ArrivalRule | null >( null );
	const [ focusAfter, setFocusAfter ] = useState< string | null >( null );
	const rules = useMemo( () => list.data?.items ?? [], [ list.data ] );
	const fields = list.data?.fields;
	const reorder = useMutation( {
		mutationFn: ( ids: number[] ) =>
			api.post< { items: ArrivalRule[] } >( 'arrival-rules/order', {
				body: { ids },
			} ),
		onMutate: ( ids ) => {
			// Show the new order at once; the server's order replaces it.
			qc.setQueryData( arrivalKeys.all, ( d: typeof list.data ) =>
				d
					? {
							...d,
							items: ids
								.map( ( id ) =>
									d.items.find( ( r ) => r.id === id )
								)
								.filter( ( r ): r is ArrivalRule => !! r ),
						}
					: d
			);
		},
		onSuccess: ( r ) => {
			if ( Array.isArray( r.data?.items ) ) {
				qc.setQueryData( arrivalKeys.all, ( d: typeof list.data ) =>
					d ? { ...d, items: r.data.items } : d
				);
			}
		},
		onError: () => {
			void qc.invalidateQueries( { queryKey: arrivalKeys.all } );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `arrival-rules/${ id }` ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: arrivalKeys.all } );
			announceResult( __( 'Arrival rule deleted.', 'cliedesk' ) );
			setDeleting( null );
		},
	} );
	// After a move, focus follows the rule (its other button when it reached the top or bottom).
	useEffect( () => {
		if ( ! focusAfter ) {
			return;
		}
		const el = document.getElementById( focusAfter );
		const alt = document.getElementById(
			focusAfter.endsWith( '-up' )
				? focusAfter.replace( /-up$/, '-down' )
				: focusAfter.replace( /-down$/, '-up' )
		);
		const target =
			el && ! el.hasAttribute( 'disabled' ) ? el : ( alt ?? el );
		target?.focus();
		setFocusAfter( null );
	}, [ focusAfter, rules ] );
	const move = ( index: number, delta: -1 | 1 ) => {
		const ids = rules.map( ( r ) => r.id );
		const to = index + delta;
		if ( reorder.isPending || to < 0 || to >= ids.length ) {
			return;
		}
		const [ id ] = ids.splice( index, 1 );
		ids.splice( to, 0, id! );
		const rule = rules[ index ]!;
		reorder.mutate( ids );
		setFocusAfter(
			`cd-arrival-${ rule.id }-${ delta < 0 ? 'up' : 'down' }`
		);
		announceResult(
			sprintf(
				/* translators: 1: rule name, 2: new position, 3: number of rules. */
				__( '“%1$s” moved to position %2$d of %3$d.', 'cliedesk' ),
				rule.name,
				to + 1,
				ids.length
			)
		);
	};
	return (
		<div className="flex flex-col gap-6">
			<p className="text-fg-muted">
				{ __(
					'Arrival rules check every new conversation, in order, before it reaches the inbox. A rule can block the conversation or sort it. Trusted senders skip block rules.',
					'cliedesk'
				) }
			</p>
			<section
				aria-labelledby="cd-arrival-rules"
				className="flex flex-col gap-3"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 id="cd-arrival-rules" className="font-semibold">
						{ __( 'Rules, in order', 'cliedesk' ) }
					</h2>
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 14 } /> }
						isDisabled={ ! list.isSuccess }
						onPress={ () => setEditing( 'new' ) }
					>
						{ __( 'Add rule', 'cliedesk' ) }
					</Button>
				</div>
				{ list.isPending && (
					<LoadingRegion
						label={ __( 'Loading arrival rules…', 'cliedesk' ) }
					/>
				) }
				{ list.isError && (
					<QueryFailed
						title={ __(
							'Could not load the arrival rules',
							'cliedesk'
						) }
						error={ list.error }
						onRetry={ () => void list.refetch() }
					/>
				) }
				<ActionError
					error={ reorder.error }
					onDismiss={ () => reorder.reset() }
				/>
				{ list.isSuccess && ! rules.length && (
					<EmptyState
						headingLevel={ 3 }
						title={ __( 'No arrival rules yet.', 'cliedesk' ) }
						description={ __(
							'For example: emails whose subject contains “invoice” go to the Billing queue with the tag billing.',
							'cliedesk'
						) }
						actions={
							// ADM-04: every empty state offers a way to start.
							<Button onPress={ () => setEditing( 'new' ) }>
								{ __(
									'Add your first arrival rule',
									'cliedesk'
								) }
							</Button>
						}
					/>
				) }
				{ rules.length > 0 && (
					<div className="overflow-x-auto rounded-lg border border-line bg-surface">
						<table className="w-full text-start text-sm">
							<caption className="sr-only">
								{ __( 'Arrival rules, in order', 'cliedesk' ) }
							</caption>
							<thead className="border-b border-line text-fg-muted">
								<tr>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Order', 'cliedesk' ) }
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
										{ __( 'Does', 'cliedesk' ) }
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
								{ rules.map( ( r, i ) => {
									const sorts = isSortRule( r.actions );
									const editable = ! sorts || routing;
									return (
										<tr
											key={ r.id }
											className="border-b border-line last:border-b-0"
										>
											<td className="px-3 py-2">
												<div className="flex items-center gap-1">
													<span className="cd-tabular w-6 text-end">
														{ i + 1 }
													</span>
													<MoveButton
														id={ `cd-arrival-${ r.id }-up` }
														label={ sprintf(
															/* translators: %s: rule name. */
															__(
																'Move “%s” up',
																'cliedesk'
															),
															r.name
														) }
														icon={
															<ArrowUp
																size={ 14 }
															/>
														}
														isDisabled={ i === 0 }
														onPress={ () =>
															move( i, -1 )
														}
													/>
													<MoveButton
														id={ `cd-arrival-${ r.id }-down` }
														label={ sprintf(
															/* translators: %s: rule name. */
															__(
																'Move “%s” down',
																'cliedesk'
															),
															r.name
														) }
														icon={
															<ArrowDown
																size={ 14 }
															/>
														}
														isDisabled={
															i ===
															rules.length - 1
														}
														onPress={ () =>
															move( i, 1 )
														}
													/>
												</div>
											</td>
											<td className="px-3 py-2 font-medium">
												<bdi>{ r.name }</bdi>
											</td>
											<td className="px-3 py-2">
												<Pill
													tone={
														sorts
															? 'accent'
															: 'warning'
													}
												>
													{ actionSummary(
														r.actions
													) }
												</Pill>
											</td>
											<td className="cd-tabular px-3 py-2 text-end">
												{ r.hits }
											</td>
											<td className="px-3 py-2 whitespace-nowrap">
												{ r.lastHitAt ? (
													<time
														dateTime={ r.lastHitAt }
													>
														{ fullTime(
															r.lastHitAt
														) }
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
														aria-label={
															editable
																? sprintf(
																		/* translators: %s: rule name. */
																		__(
																			'Change %s',
																			'cliedesk'
																		),
																		r.name
																	)
																: sprintf(
																		/* translators: %s: rule name. */
																		__(
																			'View %s',
																			'cliedesk'
																		),
																		r.name
																	)
														}
														onPress={ () =>
															setEditing( r )
														}
													>
														{ editable
															? __(
																	'Change',
																	'cliedesk'
																)
															: __(
																	'View',
																	'cliedesk'
																) }
													</Button>
													<Button
														size="sm"
														variant="ghost"
														aria-label={ sprintf(
															/* translators: %s: rule name. */
															__(
																'Delete %s',
																'cliedesk'
															),
															r.name
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
									);
								} ) }
							</tbody>
						</table>
					</div>
				) }
			</section>
			{ editing && fields && (
				<RuleDialog
					rule={ editing === 'new' ? null : editing }
					fields={ fields }
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
					/* translators: %s: rule name. */
					__( 'Delete the arrival rule “%s”?', 'cliedesk' ),
					deleting?.name ?? ''
				) }
				description={ __(
					'New conversations are no longer checked against this rule. Its hit count is lost.',
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
