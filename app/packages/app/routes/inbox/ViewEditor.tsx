/**
 * View editor (INB-18, INB-20): name, emoji icon, conditions, columns, sort, visibility and sharing, pinned.
 * Creates with POST views, saves with PATCH views/{id} (If-Match: the view's version), duplicates with
 * POST views {duplicateOf} and deletes with DELETE views/{id}. Condition errors come back as `conditions.*`.
 * The conditions follow the server vocabulary (GET views/vocabulary, CNV-11); the editor opens once it has loaded,
 * so stored conditions are read with it (on an error it falls back to the built-in conditions).
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
	Button,
	Checkbox,
	ConfirmDestructive,
	LoadingRegion,
	Modal,
	RadioGroup,
	Select,
	Switch,
	TextField,
	toast,
} from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useMemo, useState, type FormEvent } from 'react';
import {
	SORTS,
	moreSorts,
	fieldsQuery,
	inboxKeys,
	queuePickerQuery,
	statusesQuery,
	tagsQuery,
	teamsLookupQuery,
	typesQuery,
	vocabularyQuery,
	type CustomView,
	type SortKey,
	type ViewInput,
	type Visibility,
} from '../../inbox/api';
import { actionMessage, useAgents } from '../../inbox/components';
import {
	fromJson,
	setVocabulary,
	toJson,
	validateTree,
	type GroupNode,
} from '../../inbox/conditions';
import { sortLabel } from '../../inbox/labels';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	validateText,
	type SummaryItem,
} from '../../workspace/forms';
import { ColumnPicker } from './ColumnPicker';
import { ConditionBuilder } from './ConditionBuilder';

type Field =
	| 'name'
	| 'icon'
	| 'conditions'
	| 'columns'
	| 'sort'
	| 'visibility'
	| 'shareUsers'
	| 'shareTeams';

const fid = ( f: Field ) => `cd-view-${ f }`;
const COLUMN = /^[a-z][a-z0-9_:]{0,70}$/;

export interface ViewValues {
	name: string;
	icon: string;
	root: GroupNode;
	columns: string;
	sort: SortKey;
	visibility: Visibility;
	shareUsers: number[];
	shareTeams: number[];
	pinned: boolean;
}

/**
 * Form values of a view (or defaults for a new one).
 *
 * @param v View.
 */
export function viewValues( v: CustomView | null ): ViewValues {
	return {
		name: v?.name ?? '',
		icon: v?.icon ?? '',
		root: fromJson( v?.conditions ?? {} ),
		columns: ( v?.columns ?? [] ).join( ', ' ),
		sort: v?.sort ?? 'priority',
		visibility: v?.visibility ?? 'private',
		shareUsers: v?.shareUsers ?? [],
		shareTeams: v?.shareTeams ?? [],
		pinned: v?.pinned ?? false,
	};
}

/**
 * Split the columns text.
 *
 * @param text Comma-separated keys.
 */
export function parseColumns( text: string ): string[] {
	return text
		.split( /[\s,]+/ )
		.map( ( c ) => c.trim() )
		.filter( Boolean );
}

/**
 * Client checks.
 *
 * @param v Values.
 */
export function validateView(
	v: ViewValues
): Partial< Record< Field, string > > {
	const out: Partial< Record< Field, string > > = {};
	const name = validateText( v.name, 191, true );
	if ( name ) {
		out.name = name;
	}
	if ( Array.from( v.icon ).length > 16 ) {
		out.icon = __( 'Use up to 16 characters.', 'cliedesk' );
	}
	if ( parseColumns( v.columns ).some( ( c ) => ! COLUMN.test( c ) ) ) {
		out.columns = __(
			'Use lowercase column keys such as subject or field:order_id, separated by commas.',
			'cliedesk'
		);
	}
	if ( Object.keys( validateTree( v.root ) ).length ) {
		out.conditions = __(
			'Complete or remove the highlighted conditions.',
			'cliedesk'
		);
	}
	return out;
}

/**
 * Request body.
 *
 * @param v Values.
 */
export function viewPayload( v: ViewValues ): ViewInput {
	return {
		name: v.name.trim(),
		icon: v.icon.trim(),
		conditions: toJson( v.root ),
		columns: parseColumns( v.columns ),
		sort: v.sort,
		visibility: v.visibility,
		...( v.visibility === 'shared'
			? { shareUsers: v.shareUsers, shareTeams: v.shareTeams }
			: {} ),
		pinned: v.pinned,
	};
}

/**
 * View editor dialog.
 *
 * @param props         Props.
 * @param props.view    View to edit, or null for a new view.
 * @param props.onClose Close.
 */
export default function ViewEditor( {
	view,
	onClose,
}: {
	view: CustomView | null;
	onClose: () => void;
} ) {
	const vocabulary = useQuery( vocabularyQuery() );
	if ( vocabulary.isPending ) {
		return (
			<Modal
				isOpen
				onOpenChange={ ( open ) => ! open && onClose() }
				title={
					view
						? sprintf(
								/* translators: %s: view name. */
								__( 'Edit view “%s”', 'cliedesk' ),
								view.name
							)
						: __( 'New view', 'cliedesk' )
				}
			>
				<LoadingRegion
					label={ __( 'Loading the conditions…', 'cliedesk' ) }
				/>
			</Modal>
		);
	}
	setVocabulary(
		vocabulary.data?.conditions.filter( ( c ) => ! c.rulesOnly ) ?? null
	);
	return <ViewEditorForm view={ view } onClose={ onClose } />;
}

function ViewEditorForm( {
	view,
	onClose,
}: {
	view: CustomView | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const me = getBoot().user?.id ?? null;
	const [ v, setV ] = useState< ViewValues >( () => viewValues( view ) );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ server, setServer ] = useState<
		Partial< Record< Field, string > >
	>( {} );
	const [ submitted, setSubmitted ] = useState( false );
	const [ confirmDelete, setConfirmDelete ] = useState( false );
	const vocabulary = useQuery( vocabularyQuery() );
	const statuses = useQuery( statusesQuery() );
	const tags = useQuery( tagsQuery() );
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const teams = useQuery( teamsLookupQuery() );
	const types = useQuery( typesQuery() );
	const queues = useQuery( queuePickerQuery() );
	const { agents } = useAgents();
	const canShare = can( 'cliedesk_manage_shared_views' );
	const canEdit = ! view || view.ownerId === me || canShare;

	const done = ( id: number | null, message: string ) => {
		void qc.invalidateQueries( { queryKey: inboxKeys.all } );
		toast( { tone: 'success', title: message } );
		announceResult( message );
		onClose();
		if ( id ) {
			void navigate( {
				to: '/inbox/$view',
				params: { view: String( id ) },
			} );
		}
	};

	const save = useMutation( {
		mutationFn: ( body: ViewInput ) =>
			view
				? api.patch< CustomView >( `views/${ view.id }`, {
						body,
						ifMatch: versionTag( view.version ),
					} )
				: api.post< CustomView >( 'views', { body } ),
		onSuccess: ( r ) =>
			done(
				view ? null : r.data.id,
				sprintf(
					/* translators: %s: view name. */
					__( 'View “%s” saved.', 'cliedesk' ),
					r.data.name
				)
			),
		onError: ( e ) => {
			const f = apiFieldErrors( e );
			const next: Partial< Record< Field, string > > = {};
			const items: SummaryItem[] = [];
			for ( const [ k, msg ] of Object.entries( f ) ) {
				const key = (
					k.startsWith( 'conditions' )
						? 'conditions'
						: k.split( '.' )[ 0 ]
				) as Field;
				if ( ! next[ key ] ) {
					next[ key ] = msg;
					items.push( {
						fieldId: fid( key in FIELD_SET ? key : 'name' ),
						message: msg,
					} );
				}
			}
			setServer( next );
			setSummary( items );
		},
	} );
	const duplicate = useMutation( {
		mutationFn: () =>
			api.post< CustomView >( 'views', {
				body: {
					name: sprintf(
						/* translators: %s: view name. */
						__( '%s (copy)', 'cliedesk' ),
						view?.name ?? ''
					).slice( 0, 191 ),
					duplicateOf: view?.id,
				},
			} ),
		onSuccess: ( r ) =>
			done(
				r.data.id,
				sprintf(
					/* translators: %s: view name. */
					__( 'View “%s” created.', 'cliedesk' ),
					r.data.name
				)
			),
	} );
	const remove = useMutation( {
		mutationFn: () => api.del( `views/${ view?.id }` ),
		onSuccess: () => {
			setConfirmDelete( false );
			done( null, __( 'View deleted.', 'cliedesk' ) );
			void navigate( { to: '/inbox' } );
		},
	} );

	const leafErrors = useMemo(
		() => ( submitted ? validateTree( v.root ) : {} ),
		[ submitted, v.root ]
	);
	const client = submitted ? validateView( v ) : {};
	const err = ( f: Field ) => client[ f ] ?? server[ f ] ?? null;
	const upd = < K extends keyof ViewValues >(
		k: K,
		value: ViewValues[ K ]
	) => {
		setV( ( o ) => ( { ...o, [ k ]: value } ) );
		setServer( {} );
	};
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSubmitted( true );
		const errors = validateView( v );
		const items = ( Object.keys( errors ) as Field[] ).map( ( f ) => ( {
			fieldId: fid( f ),
			message: errors[ f ] as string,
		} ) );
		setSummary( items );
		if ( ! items.length ) {
			save.mutate( viewPayload( v ) );
		}
	};
	const visibilityOptions = [
		{
			id: 'private',
			label: __( 'Private', 'cliedesk' ),
			description: __( 'Only you see this view.', 'cliedesk' ),
		},
		...( canShare || v.visibility !== 'private'
			? [
					{
						id: 'shared',
						label: __( 'Shared', 'cliedesk' ),
						description: __(
							'The people and teams you choose see it.',
							'cliedesk'
						),
						isDisabled: ! canShare,
					},
					{
						id: 'public',
						label: __( 'Everyone', 'cliedesk' ),
						description: __(
							'Everyone who can see conversations sees it.',
							'cliedesk'
						),
						isDisabled: ! canShare,
					},
				]
			: [] ),
	];
	const title = view
		? sprintf(
				/* translators: %s: view name. */
				__( 'Edit view “%s”', 'cliedesk' ),
				view.name
			)
		: __( 'New view', 'cliedesk' );

	return (
		<>
			<Modal
				isOpen
				onOpenChange={ ( open ) => ! open && onClose() }
				title={ title }
				size="lg"
				footer={
					<>
						{ view && canEdit && (
							<Button
								variant="danger"
								className="me-auto"
								onPress={ () => setConfirmDelete( true ) }
							>
								{ __( 'Delete view', 'cliedesk' ) }
							</Button>
						) }
						{ view && (
							<Button
								isLoading={ duplicate.isPending }
								onPress={ () => duplicate.mutate() }
							>
								{ __( 'Duplicate', 'cliedesk' ) }
							</Button>
						) }
						<Button onPress={ onClose }>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
						{ canEdit && (
							<Button
								type="submit"
								form="cd-view-form"
								variant="primary"
								isLoading={ save.isPending }
								isDisabled={ isConflict( save.error ) }
							>
								{ view
									? __( 'Save view', 'cliedesk' )
									: __( 'Create view', 'cliedesk' ) }
							</Button>
						) }
					</>
				}
			>
				<form
					id="cd-view-form"
					noValidate
					onSubmit={ onSubmit }
					className="flex flex-col gap-4"
				>
					<ErrorSummary items={ summary } />
					{ ! canEdit && (
						// ADM-04: the read-only form says why.
						<p className="text-sm text-fg-muted">
							{ __(
								'This shared view belongs to someone else. Changing it needs the “Manage shared views” permission; you can still duplicate it.',
								'cliedesk'
							) }
						</p>
					) }
					{ isConflict( save.error ) && (
						<ConflictBanner
							message={ __(
								'Someone else changed this view. Close this dialog and open it again to see their changes.',
								'cliedesk'
							) }
							onReload={ () => {
								void qc.invalidateQueries( {
									queryKey: inboxKeys.views,
								} );
								onClose();
							} }
						/>
					) }
					<SaveError error={ save.error } />
					{ ( duplicate.error || remove.error ) && (
						<p role="alert" className="text-danger">
							{ actionMessage( duplicate.error ?? remove.error ) }
						</p>
					) }
					<div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
						<TextField
							id={ fid( 'name' ) }
							label={ __( 'Name', 'cliedesk' ) }
							value={ v.name }
							onChange={ ( x ) => upd( 'name', x ) }
							isRequired
							isReadOnly={ ! canEdit }
							errorMessage={ err( 'name' ) }
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
						/>
						<TextField
							id={ fid( 'icon' ) }
							label={ __( 'Icon (emoji)', 'cliedesk' ) }
							value={ v.icon }
							maxLength={ 16 }
							onChange={ ( x ) => upd( 'icon', x ) }
							isReadOnly={ ! canEdit }
							errorMessage={ err( 'icon' ) }
						/>
					</div>
					<div
						id={ fid( 'conditions' ) }
						className="flex flex-col gap-1"
					>
						<ConditionBuilder
							root={ v.root }
							lookups={ {
								statuses: statuses.data ?? [],
								tags: tags.data ?? [],
								agents,
								fields: fields.data ?? [],
								meId: me,
								types: types.data ?? [],
								queues: queues.data ?? [],
								teams: teams.data ?? [],
								products: getBoot().products,
							} }
							errors={ leafErrors }
							onChange={ ( root ) => upd( 'root', root ) }
						/>
						{ err( 'conditions' ) && (
							<p className="text-sm text-danger">
								{ err( 'conditions' ) }
							</p>
						) }
					</div>
					<ColumnPicker
						id={ fid( 'columns' ) }
						available={ vocabulary.data?.columns ?? [] }
						value={ parseColumns( v.columns ) }
						onChange={ ( keys ) =>
							upd( 'columns', keys.join( ', ' ) )
						}
						isDisabled={ ! canEdit }
						error={ err( 'columns' ) ?? undefined }
					/>
					<div className="grid gap-4 sm:grid-cols-2">
						<Select
							id={ fid( 'sort' ) }
							label={ __( 'Sort by', 'cliedesk' ) }
							value={ v.sort }
							onChange={ ( x ) => upd( 'sort', x as SortKey ) }
							isDisabled={ ! canEdit }
							errorMessage={ err( 'sort' ) }
							options={ [
								...SORTS.map( ( s ) => ( {
									id: s as string,
									label: sortLabel( s ),
								} ) ),
								...moreSorts( vocabulary.data ).map(
									( s ) => ( {
										id: s.key,
										label: s.label,
									} )
								),
							] }
						/>
					</div>
					<RadioGroup
						id={ fid( 'visibility' ) }
						label={ __( 'Who sees this view', 'cliedesk' ) }
						value={ v.visibility }
						onChange={ ( x ) =>
							upd( 'visibility', x as Visibility )
						}
						isDisabled={ ! canEdit }
						errorMessage={ err( 'visibility' ) }
						options={ visibilityOptions }
					/>
					{ v.visibility === 'shared' && (
						<div className="grid gap-4 sm:grid-cols-2">
							<fieldset
								id={ fid( 'shareUsers' ) }
								className="flex flex-col gap-1"
							>
								<legend className="pb-1 text-sm font-medium">
									{ __( 'Share with people', 'cliedesk' ) }
								</legend>
								{ agents.length === 0 && (
									<p className="text-sm text-fg-muted">
										{ __(
											'The people list needs the “Manage team” permission.',
											'cliedesk'
										) }
									</p>
								) }
								{ agents
									.filter( ( a ) => a.userId !== me )
									.map( ( a ) => (
										<Checkbox
											key={ a.userId }
											isReadOnly={ ! canShare }
											isSelected={ v.shareUsers.includes(
												a.userId
											) }
											onChange={ ( on ) =>
												upd(
													'shareUsers',
													on
														? [
																...v.shareUsers,
																a.userId,
															]
														: v.shareUsers.filter(
																( x ) =>
																	x !==
																	a.userId
															)
												)
											}
										>
											<bdi>{ a.name }</bdi>
										</Checkbox>
									) ) }
								{ err( 'shareUsers' ) && (
									<p className="text-sm text-danger">
										{ err( 'shareUsers' ) }
									</p>
								) }
							</fieldset>
							<fieldset
								id={ fid( 'shareTeams' ) }
								className="flex flex-col gap-1"
							>
								<legend className="pb-1 text-sm font-medium">
									{ __( 'Share with teams', 'cliedesk' ) }
								</legend>
								{ ( teams.data ?? [] ).length === 0 && (
									<p className="text-sm text-fg-muted">
										{ __( 'No teams yet.', 'cliedesk' ) }
									</p>
								) }
								{ ( teams.data ?? [] ).map( ( t ) => (
									<Checkbox
										key={ t.id }
										isReadOnly={ ! canShare }
										isSelected={ v.shareTeams.includes(
											t.id
										) }
										onChange={ ( on ) =>
											upd(
												'shareTeams',
												on
													? [ ...v.shareTeams, t.id ]
													: v.shareTeams.filter(
															( x ) => x !== t.id
														)
											)
										}
									>
										<bdi>{ t.name }</bdi>
									</Checkbox>
								) ) }
							</fieldset>
						</div>
					) }
					<Switch
						isSelected={ v.pinned }
						isReadOnly={ ! canEdit }
						onChange={ ( x ) => upd( 'pinned', x ) }
					>
						{ __( 'Pin to the top of my views', 'cliedesk' ) }
					</Switch>
				</form>
			</Modal>
			{ view && (
				<ConfirmDestructive
					isOpen={ confirmDelete }
					onOpenChange={ setConfirmDelete }
					title={ sprintf(
						/* translators: %s: view name. */
						__( 'Delete view “%s”?', 'cliedesk' ),
						view.name
					) }
					description={ __(
						'The view disappears for everyone it is shared with. Conversations are not changed.',
						'cliedesk'
					) }
					confirmLabel={ __( 'Delete view', 'cliedesk' ) }
					isLoading={ remove.isPending }
					onConfirm={ () => remove.mutate() }
				/>
			) }
		</>
	);
}

const FIELD_SET: Record< Field, true > = {
	name: true,
	icon: true,
	conditions: true,
	columns: true,
	sort: true,
	visibility: true,
	shareUsers: true,
	shareTeams: true,
};
