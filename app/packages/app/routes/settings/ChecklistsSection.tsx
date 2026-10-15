/**
 * Settings → Workspace → Checklists (CNV-23), for cliedesk_manage_settings. Checklist templates: name, ordered items
 * (each with an optional automatic check key, e.g. woo_refund_exists), the conversation types they attach to, whether
 * they block Resolve, clone, and deactivate or reactivate (templates are never deleted; attached items stay).
 * Endpoints: GET checklists, POST checklists (cloneFromId), PATCH checklists/{id} (If-Match).
 */
import {
	api,
	isApiError,
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
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { describeError } from '../../components/RouteError';
import {
	checklistTemplatesQuery,
	typesQuery,
	type ChecklistTemplate,
	type ConversationType,
	type TemplateItem,
} from '../../inbox/api';
import { ActionError, Muted, Pill } from '../../inbox/components';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	announceResult,
	apiFieldErrors,
} from '../../workspace/forms';
import { moveIn } from './order';

const KEY = checklistTemplatesQuery().queryKey;

const CHECK_KEY = /^[a-z0-9_]{1,64}$/;

/** Draft row in the editor (`uid` keeps React keys stable while rows move). */
interface DraftItem extends TemplateItem {
	uid: number;
}

/**
 * Client checks of a template draft, keyed like the API's field errors.
 *
 * @param name  Name.
 * @param items Items.
 */
export function validateTemplate(
	name: string,
	items: TemplateItem[]
): Record< string, string > {
	const errors: Record< string, string > = {};
	if ( ! name.trim() ) {
		errors.name = __( 'Enter a name.', 'cliedesk' );
	}
	if ( ! items.length ) {
		errors.items = __( 'Add at least one item.', 'cliedesk' );
	}
	items.forEach( ( item, i ) => {
		if ( ! item.label.trim() ) {
			errors[ `items.${ i }.label` ] = __(
				'Enter the item text.',
				'cliedesk'
			);
		}
		const v = ( item.verify ?? '' ).trim();
		if ( v && ! CHECK_KEY.test( v ) ) {
			errors[ `items.${ i }.verify` ] = __(
				'Use lowercase letters, digits and underscores.',
				'cliedesk'
			);
		}
	} );
	return errors;
}

/**
 * Body sent for the items (keys kept so attached items stay matched).
 *
 * @param items Draft items.
 */
export function itemsBody( items: TemplateItem[] ): TemplateItem[] {
	return items.map( ( i ) => ( {
		...( i.key ? { key: i.key } : {} ),
		label: i.label.trim(),
		...( ( i.verify ?? '' ).trim()
			? { verify: ( i.verify ?? '' ).trim() }
			: {} ),
	} ) );
}

let nextUid = 1;

/**
 * Add / edit dialog.
 *
 * @param props          Props.
 * @param props.template Template (null: new).
 * @param props.types    Conversation types.
 * @param props.onClose  Close.
 */
function TemplateDialog( {
	template,
	types,
	onClose,
}: {
	template: ChecklistTemplate | null;
	types: ConversationType[];
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ name, setName ] = useState( template?.name ?? '' );
	const [ items, setItems ] = useState< DraftItem[] >( () =>
		( template?.items.length ? template.items : [ { label: '' } ] ).map(
			( i ) => ( { ...i, uid: nextUid++ } )
		)
	);
	const [ typeIds, setTypeIds ] = useState< number[] >(
		template?.typeIds ?? []
	);
	const [ blocks, setBlocks ] = useState( template?.blocksResolve ?? false );
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			template
				? api.patch< ChecklistTemplate >(
						`checklists/${ template.id }`,
						{
							body,
							ifMatch: versionTag( template.version ),
						}
					)
				: api.post< ChecklistTemplate >( 'checklists', { body } ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %s: checklist name. */
					__( 'Checklist “%s” saved.', 'cliedesk' ),
					r.data.name
				)
			);
			void qc.invalidateQueries( { queryKey: KEY } );
			onClose();
		},
	} );
	const server = apiFieldErrors( save.error );
	const err = ( k: string ) => errors[ k ] ?? server[ k ];
	const setItem = ( uid: number, patch: Partial< TemplateItem > ) =>
		setItems( ( list ) =>
			list.map( ( i ) => ( i.uid === uid ? { ...i, ...patch } : i ) )
		);
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next = validateTemplate( name, items );
		setErrors( next );
		if ( Object.keys( next ).length ) {
			return;
		}
		save.mutate( {
			name: name.trim(),
			items: itemsBody( items ),
			typeIds,
			blocksResolve: blocks,
		} );
	};
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				template
					? sprintf(
							/* translators: %s: checklist name. */
							__( 'Edit checklist %s', 'cliedesk' ),
							template.name
						)
					: __( 'Add checklist', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-checklist"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save checklist', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-checklist"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-5"
			>
				{ isConflict( save.error ) ? (
					<ConflictBanner
						onReload={ () => {
							void qc.invalidateQueries( { queryKey: KEY } );
							onClose();
						} }
					/>
				) : (
					<ActionError
						error={
							Object.keys( server ).length ? null : save.error
						}
						onDismiss={ () => save.reset() }
					/>
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					value={ name }
					onChange={ setName }
					isRequired
					errorMessage={ err( 'name' ) }
				/>
				<fieldset className="flex flex-col gap-3">
					<legend className="mb-1 text-sm font-medium">
						{ __( 'Items', 'cliedesk' ) }
					</legend>
					{ err( 'items' ) && (
						<p className="text-sm text-danger" role="alert">
							{ err( 'items' ) }
						</p>
					) }
					<ol className="flex flex-col gap-3">
						{ items.map( ( item, i ) => (
							<li
								key={ item.uid }
								className="flex flex-wrap items-end gap-2"
							>
								<TextField
									className="min-w-48 flex-1"
									label={ sprintf(
										/* translators: %d: item position. */
										__( 'Item %d', 'cliedesk' ),
										i + 1
									) }
									value={ item.label }
									onChange={ ( v ) =>
										setItem( item.uid, { label: v } )
									}
									errorMessage={ err( `items.${ i }.label` ) }
								/>
								<TextField
									className="w-48"
									label={ sprintf(
										/* translators: %d: item position. */
										__( 'Automatic check %d', 'cliedesk' ),
										i + 1
									) }
									description={
										0 === i
											? __(
													'Optional, e.g. woo_refund_exists: ticks itself when true.',
													'cliedesk'
												)
											: undefined
									}
									value={ item.verify ?? '' }
									onChange={ ( v ) =>
										setItem( item.uid, { verify: v } )
									}
									errorMessage={ err(
										`items.${ i }.verify`
									) }
								/>
								<div className="flex gap-1">
									<IconButton
										label={ sprintf(
											/* translators: %d: item position. */
											__( 'Move item %d up', 'cliedesk' ),
											i + 1
										) }
										icon={ <ArrowUp size={ 16 } /> }
										isDisabled={ 0 === i }
										onPress={ () =>
											setItems( ( l ) =>
												moveIn( l, item, -1 )
											)
										}
									/>
									<IconButton
										label={ sprintf(
											/* translators: %d: item position. */
											__(
												'Move item %d down',
												'cliedesk'
											),
											i + 1
										) }
										icon={ <ArrowDown size={ 16 } /> }
										isDisabled={ i === items.length - 1 }
										onPress={ () =>
											setItems( ( l ) =>
												moveIn( l, item, 1 )
											)
										}
									/>
									<IconButton
										label={ sprintf(
											/* translators: %d: item position. */
											__( 'Remove item %d', 'cliedesk' ),
											i + 1
										) }
										icon={ <Trash2 size={ 16 } /> }
										isDisabled={ items.length < 2 }
										onPress={ () =>
											setItems( ( l ) =>
												l.filter(
													( x ) => x.uid !== item.uid
												)
											)
										}
									/>
								</div>
							</li>
						) ) }
					</ol>
					<div>
						<Button
							size="sm"
							iconStart={
								<Plus aria-hidden="true" size={ 14 } />
							}
							isDisabled={ items.length >= 200 }
							onPress={ () =>
								setItems( ( l ) => [
									...l,
									{ label: '', uid: nextUid++ },
								] )
							}
						>
							{ __( 'Add item', 'cliedesk' ) }
						</Button>
					</div>
				</fieldset>
				<fieldset className="flex flex-col gap-2">
					<legend className="mb-1 text-sm font-medium">
						{ __( 'Attach to conversations of type', 'cliedesk' ) }
					</legend>
					{ types.length ? (
						types.map( ( t ) => (
							<Checkbox
								key={ t.id }
								isSelected={ typeIds.includes( t.id ) }
								onChange={ ( on ) =>
									setTypeIds( ( ids ) =>
										on
											? [ ...ids, t.id ]
											: ids.filter( ( x ) => x !== t.id )
									)
								}
							>
								{ t.name }
							</Checkbox>
						) )
					) : (
						<Muted>{ __( 'No types.', 'cliedesk' ) }</Muted>
					) }
					<Muted>
						{ __(
							'None chosen: agents and workflows attach it by hand.',
							'cliedesk'
						) }
					</Muted>
				</fieldset>
				<Checkbox isSelected={ blocks } onChange={ setBlocks }>
					{ __(
						'Conversations cannot be resolved until every item is ticked',
						'cliedesk'
					) }
				</Checkbox>
			</form>
		</Modal>
	);
}

/**
 * Section.
 */
export default function ChecklistsSection() {
	const qc = useQueryClient();
	const [ editing, setEditing ] = useState<
		ChecklistTemplate | 'new' | null
	>( null );
	const q = useQuery( checklistTemplatesQuery() );
	const types = useQuery( typesQuery() );
	const done = ( message: string ) => {
		announceResult( message );
		void qc.invalidateQueries( { queryKey: KEY } );
	};
	const toggle = useMutation( {
		mutationFn: ( t: ChecklistTemplate ) =>
			api.patch< ChecklistTemplate >( `checklists/${ t.id }`, {
				body: { active: ! t.active },
				ifMatch: versionTag( t.version ),
			} ),
		onSuccess: ( r ) =>
			done(
				r.data.active
					? sprintf(
							/* translators: %s: checklist name. */
							__( 'Checklist “%s” turned on.', 'cliedesk' ),
							r.data.name
						)
					: sprintf(
							/* translators: %s: checklist name. */
							__( 'Checklist “%s” turned off.', 'cliedesk' ),
							r.data.name
						)
			),
	} );
	const clone = useMutation( {
		mutationFn: ( t: ChecklistTemplate ) =>
			api.post< ChecklistTemplate >( 'checklists', {
				body: {
					cloneFromId: t.id,
					name: sprintf(
						/* translators: %s: checklist name. */
						__( '%s (copy)', 'cliedesk' ),
						t.name
					).slice( 0, 191 ),
				},
			} ),
		onSuccess: ( r ) =>
			done(
				sprintf(
					/* translators: %s: checklist name. */
					__( 'Checklist “%s” added.', 'cliedesk' ),
					r.data.name
				)
			),
	} );
	const typeName = ( id: number ) =>
		types.data?.find( ( t ) => t.id === id )?.name ?? `#${ id }`;
	const failed = toggle.error ?? clone.error;
	let body;
	if ( q.isPending ) {
		body = (
			<LoadingRegion label={ __( 'Loading checklists…', 'cliedesk' ) } />
		);
	} else if ( q.isError ) {
		body = (
			<ErrorState
				title={ __( 'Could not load the checklists', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.length ) {
		body = (
			<EmptyState
				icon={ <ListChecks size={ 32 } strokeWidth={ 1.75 } /> }
				title={ __( 'No checklists yet', 'cliedesk' ) }
				description={ __(
					'A checklist lists the steps for a kind of conversation, such as “Damaged item”: photo received, order checked, refund issued.',
					'cliedesk'
				) }
				actions={
					// ADM-04: every empty state offers a way to start.
					<Button
						variant="primary"
						onPress={ () => setEditing( 'new' ) }
					>
						{ __( 'Add your first checklist', 'cliedesk' ) }
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
								<bdi>{ t.name }</bdi>
								{ t.blocksResolve && (
									<Pill>
										{ __(
											'Needed to resolve',
											'cliedesk'
										) }
									</Pill>
								) }
								{ ! t.active && (
									<Pill tone="warning">
										{ __( 'Off', 'cliedesk' ) }
									</Pill>
								) }
							</h2>
							<p className="text-sm text-fg-muted">
								{ sprintf(
									/* translators: %d: number of items. */
									__( '%d items', 'cliedesk' ),
									t.items.length
								) }
								{ ' · ' }
								{ t.typeIds.length
									? sprintf(
											/* translators: %s: comma-separated type names. */
											__( 'Attaches to: %s', 'cliedesk' ),
											t.typeIds
												.map( typeName )
												.join( ', ' )
										)
									: __( 'Attached by hand', 'cliedesk' ) }
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								onPress={ () => setEditing( t ) }
								aria-label={ sprintf(
									/* translators: %s: checklist name. */
									__( 'Edit %s', 'cliedesk' ),
									t.name
								) }
							>
								{ __( 'Edit', 'cliedesk' ) }
							</Button>
							<Button
								size="sm"
								variant="ghost"
								isLoading={
									clone.isPending &&
									clone.variables?.id === t.id
								}
								onPress={ () => clone.mutate( t ) }
								aria-label={ sprintf(
									/* translators: %s: checklist name. */
									__( 'Copy %s', 'cliedesk' ),
									t.name
								) }
							>
								{ __( 'Copy', 'cliedesk' ) }
							</Button>
							<Button
								size="sm"
								variant="ghost"
								isLoading={
									toggle.isPending &&
									toggle.variables?.id === t.id
								}
								onPress={ () => toggle.mutate( t ) }
								aria-label={
									t.active
										? sprintf(
												/* translators: %s: checklist name. */
												__( 'Turn off %s', 'cliedesk' ),
												t.name
											)
										: sprintf(
												/* translators: %s: checklist name. */
												__( 'Turn on %s', 'cliedesk' ),
												t.name
											)
								}
							>
								{ t.active
									? __( 'Turn off', 'cliedesk' )
									: __( 'Turn on', 'cliedesk' ) }
							</Button>
						</div>
					</li>
				) ) }
			</ul>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-end gap-3">
				<Button
					variant="primary"
					iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add checklist', 'cliedesk' ) }
				</Button>
			</div>
			{ failed && (
				<Banner
					tone="danger"
					role="alert"
					title={ describeError( failed ) }
				/>
			) }
			{ body }
			{ editing && (
				<TemplateDialog
					template={ editing === 'new' ? null : editing }
					types={ types.data ?? [] }
					onClose={ () => setEditing( null ) }
				/>
			) }
		</div>
	);
}
