/**
 * Segments (CRM-38) on the contacts list: the sidebar (click to filter by a segment), "Save as segment" with a live
 * count (POST segments/preview), edit (name, filter, team visibility; PATCH with If-Match), refresh, delete, and
 * "New list" for static lists.
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
	ConfirmDestructive,
	Modal,
	RadioGroup,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { teamsLookupQuery } from '../inbox/api';
import { ActionError, Muted, Pill } from '../inbox/components';
import { fullTime } from '../inbox/labels';
import { isConflict, versionTag } from '../workspace/api';
import {
	ConflictBanner,
	announceResult,
	apiFieldErrors,
	validateText,
} from '../workspace/forms';
import {
	ContactFilterBuilder,
	type FilterLookups,
} from './ContactFilterBuilder';
import {
	conditionLabels,
	fromJson,
	hasConditionErrors,
	toJson,
	validateTree,
	type CGroup,
} from './contactConditions';
import { segmentKeys, type Segment, type SegmentInput } from './listApi';

/**
 * Debounced value.
 *
 * @param value Value.
 * @param ms    Delay.
 */
function useDebounced< T >( value: T, ms: number ): T {
	const [ v, setV ] = useState( value );
	useEffect( () => {
		const t = window.setTimeout( () => setV( value ), ms );
		return () => window.clearTimeout( t );
	}, [ value, ms ] );
	return v;
}

/**
 * Live count of a filter (POST segments/preview).
 *
 * @param props            Props.
 * @param props.conditions Conditions JSON (null: no conditions).
 */
export function PreviewCount( { conditions }: { conditions: string | null } ) {
	const c = useDebounced( conditions, 400 );
	const q = useQuery( {
		queryKey: [ 'segments', 'preview', c ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.post< { count: number } >( 'segments/preview', {
					body: { conditions: c ?? '{}' },
					signal,
				} )
			).data?.count ?? 0,
		retry: false,
	} );
	let text: string = __( 'Counting…', 'cliedesk' );
	if ( q.isError ) {
		text = __( 'Could not count the matching contacts.', 'cliedesk' );
	} else if ( q.isSuccess ) {
		text = sprintf(
			/* translators: %d: number of contacts. */
			_n( '%d contact matches', '%d contacts match', q.data, 'cliedesk' ),
			q.data
		);
	}
	return (
		<p role="status" aria-live="polite" className="text-sm text-fg-muted">
			{ text }
		</p>
	);
}

/**
 * Create or edit a segment.
 *
 * @param props            Props.
 * @param props.segment    Segment to edit (none: create).
 * @param props.kind       Kind of a new segment.
 * @param props.conditions Filter of a new dynamic segment.
 * @param props.lookups    Builder lookups.
 * @param props.onClose    Close.
 * @param props.onSaved    After saving.
 */
export function SegmentDialog( {
	segment,
	kind = 'dynamic',
	conditions,
	lookups,
	onClose,
	onSaved,
}: {
	segment?: Segment;
	kind?: 'dynamic' | 'static';
	conditions?: string | null;
	lookups: FilterLookups;
	onClose: () => void;
	onSaved?: ( s: Segment ) => void;
} ) {
	const qc = useQueryClient();
	const teams = useQuery( teamsLookupQuery() );
	const isStatic = ( segment?.kind ?? kind ) === 'static';
	const [ name, setName ] = useState( segment?.name ?? '' );
	const [ root, setRoot ] = useState< CGroup >( () =>
		fromJson(
			segment ? segment.conditions : ( conditions ?? '' ),
			lookups.fields
		)
	);
	const [ scope, setScope ] = useState< 'all' | 'teams' >(
		segment?.teamIds ? 'teams' : 'all'
	);
	const [ teamIds, setTeamIds ] = useState< number[] >(
		segment?.teamIds ?? []
	);
	const [ submitted, setSubmitted ] = useState( false );
	const json = toJson( root, lookups.fields );
	const save = useMutation( {
		mutationFn: ( body: SegmentInput ) =>
			segment
				? api.patch< Segment >( `segments/${ segment.id }`, {
						body,
						ifMatch: versionTag( segment.version ),
					} )
				: api.post< Segment >( 'segments', { body } ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: segmentKeys.all } );
			announceResult( __( 'Segment saved.', 'cliedesk' ) );
			if ( r.data ) {
				onSaved?.( r.data );
			}
			onClose();
		},
	} );
	const treeErrors =
		submitted && ! isStatic ? validateTree( root, lookups.fields ) : {};
	const nameError =
		( submitted ? validateText( name, 191, true ) : null ) ??
		apiFieldErrors( save.error ).name ??
		null;
	const teamError =
		submitted && scope === 'teams' && ! teamIds.length
			? __( 'Choose at least one team.', 'cliedesk' )
			: null;
	const serverConditions = hasConditionErrors( apiFieldErrors( save.error ) );
	const submit = () => {
		setSubmitted( true );
		if (
			validateText( name, 191, true ) ||
			( scope === 'teams' && ! teamIds.length ) ||
			( ! isStatic &&
				Object.keys( validateTree( root, lookups.fields ) ).length )
		) {
			return;
		}
		save.mutate( {
			name: name.trim(),
			...( segment ? {} : { kind: isStatic ? 'static' : 'dynamic' } ),
			...( isStatic ? {} : { conditions: json ?? '{}' } ),
			teamIds: scope === 'teams' ? teamIds : null,
		} );
	};
	let title: string = __( 'Save as segment', 'cliedesk' );
	if ( segment ) {
		title = isStatic
			? __( 'Edit list', 'cliedesk' )
			: __( 'Edit segment', 'cliedesk' );
	} else if ( isStatic ) {
		title = __( 'New list', 'cliedesk' );
	}
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ title }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ isConflict( save.error ) }
						onPress={ submit }
					>
						{ segment
							? __( 'Save', 'cliedesk' )
							: __( 'Create', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				{ isConflict( save.error ) && (
					<ConflictBanner
						message={ __(
							'Someone else changed this segment. Close and open it again to see their changes.',
							'cliedesk'
						) }
						onReload={ () => {
							void qc.invalidateQueries( {
								queryKey: segmentKeys.all,
							} );
							onClose();
						} }
					/>
				) }
				{ save.error && ! isConflict( save.error ) && ! nameError && (
					<ActionError
						error={ save.error }
						title={
							serverConditions
								? __( 'Check the filter', 'cliedesk' )
								: undefined
						}
						labels={ conditionLabels() }
						onDismiss={ () => save.reset() }
					/>
				) }
				{ segment?.systemKey && (
					<p className="text-sm text-fg-muted">
						{ __(
							'This is a built-in preset. You can change it; your changes are kept.',
							'cliedesk'
						) }
					</p>
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					isRequired
					maxLength={ 191 }
					value={ name }
					onChange={ setName }
					errorMessage={ nameError }
				/>
				{ ! isStatic && (
					<>
						<ContactFilterBuilder
							root={ root }
							lookups={ lookups }
							errors={ treeErrors }
							onChange={ setRoot }
						/>
						<PreviewCount conditions={ json } />
					</>
				) }
				<RadioGroup
					label={ __( 'Who can see it', 'cliedesk' ) }
					value={ scope }
					onChange={ ( v ) => setScope( v as 'all' | 'teams' ) }
					options={ [
						{ id: 'all', label: __( 'Everyone', 'cliedesk' ) },
						{
							id: 'teams',
							label: __( 'Only selected teams', 'cliedesk' ),
						},
					] }
				/>
				{ scope === 'teams' && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Teams', 'cliedesk' ) }
						</legend>
						{ ! teams.data?.length && (
							<Muted>{ __( 'No teams yet.', 'cliedesk' ) }</Muted>
						) }
						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{ ( teams.data ?? [] ).map( ( t ) => (
								<Checkbox
									key={ t.id }
									isSelected={ teamIds.includes( t.id ) }
									onChange={ ( on ) =>
										setTeamIds( ( ids ) =>
											on
												? [ ...ids, t.id ]
												: ids.filter(
														( x ) => x !== t.id
													)
										)
									}
								>
									{ t.name }
								</Checkbox>
							) ) }
						</div>
						{ teamError && (
							<p className="text-sm text-danger">{ teamError }</p>
						) }
					</fieldset>
				) }
			</div>
		</Modal>
	);
}

/**
 * Segments and lists in the contacts sidebar.
 *
 * @param props          Props.
 * @param props.segments Segments.
 * @param props.isError  The list failed to load.
 * @param props.activeId Segment currently filtered by.
 * @param props.lookups  Builder lookups.
 * @param props.onSelect Filter by a segment.
 */
export function SegmentsPanel( {
	segments,
	isError,
	activeId,
	lookups,
	onSelect,
}: {
	segments: Segment[];
	isError: boolean;
	activeId: number | null;
	lookups: FilterLookups;
	onSelect: ( s: Segment ) => void;
} ) {
	const qc = useQueryClient();
	const [ editing, setEditing ] = useState< Segment | null >( null );
	const [ creatingList, setCreatingList ] = useState( false );
	const [ deleting, setDeleting ] = useState< Segment | null >( null );
	const canEdit = can( 'cliedesk_edit_contacts' );
	const refresh = useMutation( {
		mutationFn: ( s: Segment ) =>
			api.post< { entered: number; left: number; count: number } >(
				`segments/${ s.id }/refresh`
			),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: segmentKeys.all } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: 1: contacts now in the segment, 2: contacts that joined, 3: contacts that left. */
					__(
						'Segment refreshed: %1$d contacts (%2$d joined, %3$d left).',
						'cliedesk'
					),
					r.data?.count ?? 0,
					r.data?.entered ?? 0,
					r.data?.left ?? 0
				),
			} );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( s: Segment ) => api.del( `segments/${ s.id }` ),
		onSuccess: () => {
			setDeleting( null );
			void qc.invalidateQueries( { queryKey: segmentKeys.all } );
			announceResult( __( 'Segment deleted.', 'cliedesk' ) );
		},
	} );
	return (
		<nav aria-labelledby="cd-segments-h" className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<h2 id="cd-segments-h" className="text-sm font-semibold">
					{ __( 'Segments and lists', 'cliedesk' ) }
				</h2>
				{ canEdit && (
					<Button
						size="sm"
						variant="ghost"
						onPress={ () => setCreatingList( true ) }
					>
						{ __( 'New list', 'cliedesk' ) }
					</Button>
				) }
			</div>
			<ActionError
				error={ refresh.error }
				onDismiss={ () => refresh.reset() }
			/>
			{ isError && (
				<Muted>
					{ __( 'Could not load the segments.', 'cliedesk' ) }
				</Muted>
			) }
			{ ! isError && ! segments.length && (
				<Muted>
					{ __(
						'No segments yet. Filter the list, then save it as a segment.',
						'cliedesk'
					) }
				</Muted>
			) }
			<ul className="flex flex-col gap-1">
				{ segments.map( ( s ) => (
					<li
						key={ s.id }
						className="flex flex-col gap-1 rounded-md border border-line p-2"
					>
						<Button
							variant="ghost"
							className="h-auto justify-start py-1 text-start whitespace-normal"
							aria-current={
								activeId === s.id ? 'true' : undefined
							}
							onPress={ () => onSelect( s ) }
						>
							<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
								<bdi
									className={
										activeId === s.id ? 'font-semibold' : ''
									}
								>
									{ s.name }
								</bdi>
								<span className="cd-tabular text-sm text-fg-muted">
									{ `(${ s.memberCount })` }
								</span>
							</span>
						</Button>
						<span className="flex flex-wrap items-center gap-1">
							{ s.kind === 'static' && (
								<Pill>{ __( 'List', 'cliedesk' ) }</Pill>
							) }
							{ s.systemKey && (
								<Pill tone="accent">
									{ __( 'Preset', 'cliedesk' ) }
								</Pill>
							) }
							{ s.teamIds && (
								<Pill>{ __( 'Teams only', 'cliedesk' ) }</Pill>
							) }
						</span>
						{ s.refreshedAt && s.kind === 'dynamic' && (
							<span className="text-xs text-fg-muted">
								{ sprintf(
									/* translators: %s: date and time. */
									__( 'Refreshed %s', 'cliedesk' ),
									fullTime( s.refreshedAt )
								) }
							</span>
						) }
						<span className="flex flex-wrap gap-1">
							{ canEdit && (
								<Button
									size="sm"
									variant="ghost"
									onPress={ () => setEditing( s ) }
								>
									{ __( 'Edit', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ s.name }` }</span>
								</Button>
							) }
							{ s.kind === 'dynamic' && (
								<Button
									size="sm"
									variant="ghost"
									isLoading={
										refresh.isPending &&
										refresh.variables?.id === s.id
									}
									onPress={ () => refresh.mutate( s ) }
								>
									{ __( 'Refresh', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ s.name }` }</span>
								</Button>
							) }
							{ canEdit && (
								<Button
									size="sm"
									variant="ghost"
									onPress={ () => setDeleting( s ) }
								>
									{ __( 'Delete', 'cliedesk' ) }
									<span className="sr-only">{ ` ${ s.name }` }</span>
								</Button>
							) }
						</span>
					</li>
				) ) }
			</ul>
			{ editing && (
				<SegmentDialog
					segment={ editing }
					lookups={ lookups }
					onClose={ () => setEditing( null ) }
				/>
			) }
			{ creatingList && (
				<SegmentDialog
					kind="static"
					lookups={ lookups }
					onClose={ () => setCreatingList( false ) }
				/>
			) }
			<ConfirmDestructive
				isOpen={ !! deleting }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setDeleting( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: segment name. */
					__( 'Delete “%s”?', 'cliedesk' ),
					deleting?.name ?? ''
				) }
				description={ __(
					'The segment is removed for everyone. The contacts are not changed.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete segment', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( deleting ) {
						remove.mutate( deleting );
					}
				} }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</nav>
	);
}
