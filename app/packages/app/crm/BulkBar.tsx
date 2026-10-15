/**
 * Bulk actions (CRM-40) and export (CRM-41) for selected contacts, or for every contact matching the filter.
 * POST contacts/bulk and POST contacts/export return a job that the jobs panel follows. Block and Move to Trash
 * are confirmed first and sent with confirm:true.
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
	Select,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { fieldsQuery, tagsQuery } from '../inbox/api';
import { ActionError, Muted } from '../inbox/components';
import { announceResult, apiFieldErrors } from '../workspace/forms';
import { conditionLabels } from './contactConditions';
import { OrgPicker, type PickedItem } from './components';
import { trackJob } from './jobs';
import {
	COLUMNS,
	columnLabel,
	opName,
	selectionBody,
	selectionCount,
	type BulkJob,
	type BulkOp,
	type Segment,
	type Selection,
} from './listApi';

/**
 * "N contacts" / "all N matching contacts".
 *
 * @param s Selection.
 */
export function selectionText( s: Selection ): string {
	const n = selectionCount( s );
	if ( s.kind === 'all' ) {
		return n === null
			? __( 'All matching contacts', 'cliedesk' )
			: sprintf(
					/* translators: %d: number of contacts. */
					_n(
						'All %d matching contact',
						'All %d matching contacts',
						n,
						'cliedesk'
					),
					n
				);
	}
	return sprintf(
		/* translators: %d: number of contacts. */
		_n( '%d contact selected', '%d contacts selected', n ?? 0, 'cliedesk' ),
		n ?? 0
	);
}

type Dialog = BulkOp | 'export' | null;

/**
 * Start a bulk job.
 */
function useBulk( selection: Selection, onDone: () => void ) {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			api.post< BulkJob >( 'contacts/bulk', {
				body: { ...selectionBody( selection ), ...body },
			} ),
		onSuccess: ( r, body ) => {
			if ( r.data?.uid ) {
				trackJob(
					qc,
					r.data,
					`${ opName( String( body.op ) ) } · ${ selectionText( selection ) }`
				);
			}
			announceResult( __( 'Bulk action started.', 'cliedesk' ) );
			onDone();
		},
	} );
}

function BulkDialog( {
	op,
	selection,
	segments,
	onClose,
}: {
	op: Exclude< BulkOp, 'block' | 'trash' >;
	selection: Selection;
	segments: Segment[];
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const tags = useQuery( {
		...tagsQuery(),
		enabled: op === 'tag_add' || op === 'tag_remove',
	} );
	const fields = useQuery( {
		...fieldsQuery( 'contact' ),
		enabled: op === 'field_set',
	} );
	const [ tagIds, setTagIds ] = useState< number[] >( [] );
	const [ fieldKey, setFieldKey ] = useState< string | null >( null );
	const [ value, setValue ] = useState( '' );
	const [ org, setOrg ] = useState< PickedItem | null >( null );
	const [ segmentId, setSegmentId ] = useState< string | null >( null );
	const [ error, setError ] = useState< string | null >( null );
	const bulk = useBulk( selection, onClose );
	const lists = segments.filter( ( s ) => s.kind === 'static' );
	// A few ids go straight to a static list; "all matching" goes through the bulk job.
	const addMembers = useMutation( {
		mutationFn: ( id: number ) =>
			api.post< { added: number } >( `segments/${ id }/members`, {
				body: {
					contactIds: selection.kind === 'ids' ? selection.ids : [],
				},
			} ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: [ 'segments' ] } );
			void qc.invalidateQueries( { queryKey: [ 'contacts', 'query' ] } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: number of contacts. */
					_n(
						'%d contact added to the list.',
						'%d contacts added to the list.',
						r.data?.added ?? 0,
						'cliedesk'
					),
					r.data?.added ?? 0
				),
			} );
			onClose();
		},
	} );
	const editable = ( fields.data ?? [] ).filter( ( f ) => ! f.archived );
	const def = editable.find( ( f ) => f.key === fieldKey );
	const submit = () => {
		setError( null );
		switch ( op ) {
			case 'tag_add':
			case 'tag_remove':
				if ( ! tagIds.length ) {
					setError( __( 'Choose at least one tag.', 'cliedesk' ) );
					return;
				}
				bulk.mutate( { op, tagIds } );
				return;
			case 'field_set': {
				if ( ! def ) {
					setError( __( 'Choose a field.', 'cliedesk' ) );
					return;
				}
				let v: unknown = value.trim() === '' ? null : value;
				if (
					v !== null &&
					[ 'number', 'decimal', 'money' ].includes( def.type )
				) {
					v = Number( value );
					if ( ! Number.isFinite( v ) ) {
						setError( __( 'Enter a number.', 'cliedesk' ) );
						return;
					}
				}
				if ( def.type === 'boolean' ) {
					v = value === 'yes';
				}
				bulk.mutate( { op, fieldKey: def.key, value: v } );
				return;
			}
			case 'org_add':
				if ( ! org ) {
					setError( __( 'Choose an organization.', 'cliedesk' ) );
					return;
				}
				bulk.mutate( { op, orgId: org.id } );
				return;
			case 'segment_add':
				if ( ! segmentId ) {
					setError( __( 'Choose a list.', 'cliedesk' ) );
					return;
				}
				if ( selection.kind === 'ids' ) {
					addMembers.mutate( Number( segmentId ) );
				} else {
					bulk.mutate( { op, segmentId: Number( segmentId ) } );
				}
		}
	};
	const server = apiFieldErrors( bulk.error );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ opName( op ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ bulk.isPending || addMembers.isPending }
						onPress={ submit }
					>
						{ __( 'Apply', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<p>{ selectionText( selection ) }</p>
				<ActionError
					error={ bulk.error ?? addMembers.error }
					labels={ conditionLabels() }
					onDismiss={ () => {
						bulk.reset();
						addMembers.reset();
					} }
				/>
				{ ( op === 'tag_add' || op === 'tag_remove' ) && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Tags', 'cliedesk' ) }
						</legend>
						{ ! tags.data?.length && (
							<Muted>{ __( 'No tags yet.', 'cliedesk' ) }</Muted>
						) }
						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{ ( tags.data ?? [] ).map( ( t ) => (
								<Checkbox
									key={ t.id }
									isSelected={ tagIds.includes( t.id ) }
									onChange={ ( on ) =>
										setTagIds( ( ids ) =>
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
					</fieldset>
				) }
				{ op === 'field_set' && (
					<>
						<Select
							label={ __( 'Field', 'cliedesk' ) }
							value={ fieldKey }
							onChange={ ( k ) => {
								setFieldKey( k );
								setValue( '' );
							} }
							options={ editable.map( ( f ) => ( {
								id: f.key,
								label: f.label,
							} ) ) }
							errorMessage={ server.fieldKey ?? null }
						/>
						{ def && def.type === 'boolean' && (
							<Select
								label={ __( 'Value', 'cliedesk' ) }
								value={ value || 'yes' }
								onChange={ setValue }
								options={ [
									{
										id: 'yes',
										label: __( 'Yes', 'cliedesk' ),
									},
									{ id: 'no', label: __( 'No', 'cliedesk' ) },
								] }
							/>
						) }
						{ def &&
							( def.type === 'select' ||
								def.type === 'nested_select' ) && (
								<Select
									label={ __( 'Value', 'cliedesk' ) }
									value={ value || null }
									onChange={ setValue }
									options={ ( def.options ?? [] )
										.filter( ( o ) => ! o.archived )
										.map( ( o ) => ( {
											id: o.key,
											label: o.label,
										} ) ) }
									errorMessage={ server.value ?? null }
								/>
							) }
						{ def &&
							! [ 'boolean', 'select', 'nested_select' ].includes(
								def.type
							) && (
								<TextField
									label={ __( 'Value', 'cliedesk' ) }
									description={ __(
										'Leave empty to clear the field.',
										'cliedesk'
									) }
									value={ value }
									onChange={ setValue }
									errorMessage={ server.value ?? null }
								/>
							) }
					</>
				) }
				{ op === 'org_add' && (
					<OrgPicker value={ org } onChange={ setOrg } />
				) }
				{ op === 'segment_add' &&
					( lists.length ? (
						<Select
							label={ __( 'List', 'cliedesk' ) }
							value={ segmentId }
							onChange={ setSegmentId }
							options={ lists.map( ( s ) => ( {
								id: String( s.id ),
								label: s.name,
							} ) ) }
						/>
					) : (
						<Muted>
							{ __(
								'No lists yet. Create one with “New list”.',
								'cliedesk'
							) }
						</Muted>
					) ) }
				{ error && (
					<p role="alert" className="text-sm text-danger">
						{ error }
					</p>
				) }
			</div>
		</Modal>
	);
}

/**
 * Export dialog: choose the columns, then POST contacts/export.
 *
 * @param props           Props.
 * @param props.selection Contacts to export.
 * @param props.onClose   Close.
 */
export function ExportDialog( {
	selection,
	onClose,
}: {
	selection: Selection;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const fields = useQuery( fieldsQuery( 'contact' ) );
	const [ cols, setCols ] = useState< string[] >( [
		'id',
		'name',
		'emails',
		'phones',
		'country',
		'organization',
		'tags',
		'created',
	] );
	const [ error, setError ] = useState< string | null >( null );
	const run = useMutation( {
		mutationFn: () =>
			api.post< BulkJob >( 'contacts/export', {
				body: { ...selectionBody( selection ), columns: cols },
			} ),
		onSuccess: ( r ) => {
			if ( r.data?.uid ) {
				trackJob(
					qc,
					r.data,
					`${ __( 'Export', 'cliedesk' ) } · ${ selectionText( selection ) }`,
					{
						download: true,
					}
				);
			}
			announceResult( __( 'Export started.', 'cliedesk' ) );
			onClose();
		},
	} );
	const builtIn = [ 'id', ...COLUMNS ];
	const custom = ( fields.data ?? [] ).filter( ( f ) => ! f.archived );
	const toggle = ( c: string, on: boolean ) =>
		setCols( ( l ) => ( on ? [ ...l, c ] : l.filter( ( x ) => x !== c ) ) );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Export contacts', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ run.isPending }
						onPress={ () => {
							if ( ! cols.length ) {
								setError(
									__(
										'Choose at least one column.',
										'cliedesk'
									)
								);
								return;
							}
							run.mutate();
						} }
					>
						{ __( 'Export CSV', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<p>{ selectionText( selection ) }</p>
				<ActionError
					error={ run.error }
					labels={ conditionLabels() }
					onDismiss={ () => run.reset() }
				/>
				<fieldset className="flex flex-col gap-1">
					<legend className="pb-1 text-sm font-medium">
						{ __( 'Columns', 'cliedesk' ) }
					</legend>
					<div className="grid gap-1 sm:grid-cols-2">
						{ builtIn.map( ( c ) => (
							<Checkbox
								key={ c }
								isSelected={ cols.includes( c ) }
								onChange={ ( on ) => toggle( c, on ) }
							>
								{ columnLabel( c ) }
							</Checkbox>
						) ) }
					</div>
				</fieldset>
				{ custom.length > 0 && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Contact fields', 'cliedesk' ) }
						</legend>
						<div className="grid gap-1 sm:grid-cols-2">
							{ custom.map( ( f ) => (
								<Checkbox
									key={ f.key }
									isSelected={ cols.includes(
										`field:${ f.key }`
									) }
									onChange={ ( on ) =>
										toggle( `field:${ f.key }`, on )
									}
								>
									{ f.label }
								</Checkbox>
							) ) }
						</div>
					</fieldset>
				) }
				<p className="text-sm text-fg-muted">
					{ __(
						'Large exports run in the background; we email you a link when the file is ready.',
						'cliedesk'
					) }
				</p>
				{ error && (
					<p role="alert" className="text-sm text-danger">
						{ error }
					</p>
				) }
			</div>
		</Modal>
	);
}

/**
 * Bar with the bulk actions for the current selection.
 *
 * @param props              Props.
 * @param props.selection    Selection.
 * @param props.segments     Segments (lists for "Add to list").
 * @param props.activeListId Static list currently shown (offers "Remove from list").
 * @param props.onClear      Clear the selection.
 */
export function BulkBar( {
	selection,
	segments,
	activeListId,
	onClear,
}: {
	selection: Selection;
	segments: Segment[];
	activeListId: number | null;
	onClear: () => void;
} ) {
	const qc = useQueryClient();
	const [ dialog, setDialog ] = useState< Dialog >( null );
	const bulkOk = can( 'cliedesk_bulk_actions' );
	const edit = bulkOk && can( 'cliedesk_edit_contacts' );
	const del = bulkOk && can( 'cliedesk_delete_contacts' );
	const exportOk = can( 'cliedesk_export_contacts' );
	const confirmed = useBulk( selection, () => {
		setDialog( null );
		onClear();
	} );
	const removeFromList = useMutation( {
		mutationFn: () =>
			api.post( `segments/${ activeListId }/members/remove`, {
				body: {
					contactIds: selection.kind === 'ids' ? selection.ids : [],
				},
			} ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: [ 'segments' ] } );
			void qc.invalidateQueries( { queryKey: [ 'contacts', 'query' ] } );
			announceResult( __( 'Removed from the list.', 'cliedesk' ) );
			onClear();
		},
	} );
	const canAddToList =
		can( 'cliedesk_edit_contacts' ) &&
		( selection.kind === 'ids' || bulkOk );
	if ( ! edit && ! del && ! exportOk && ! canAddToList ) {
		return null;
	}
	const close = () => {
		setDialog( null );
		confirmed.reset();
	};
	return (
		<div
			role="region"
			aria-label={ __( 'Bulk actions', 'cliedesk' ) }
			className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-subtle px-3 py-2"
		>
			<p className="me-2 font-medium">{ selectionText( selection ) }</p>
			{ edit && (
				<>
					<Button size="sm" onPress={ () => setDialog( 'tag_add' ) }>
						{ opName( 'tag_add' ) }
					</Button>
					<Button
						size="sm"
						onPress={ () => setDialog( 'tag_remove' ) }
					>
						{ opName( 'tag_remove' ) }
					</Button>
					<Button
						size="sm"
						onPress={ () => setDialog( 'field_set' ) }
					>
						{ opName( 'field_set' ) }
					</Button>
					<Button size="sm" onPress={ () => setDialog( 'org_add' ) }>
						{ opName( 'org_add' ) }
					</Button>
				</>
			) }
			{ canAddToList && (
				<Button size="sm" onPress={ () => setDialog( 'segment_add' ) }>
					{ opName( 'segment_add' ) }
				</Button>
			) }
			{ activeListId !== null &&
				selection.kind === 'ids' &&
				can( 'cliedesk_edit_contacts' ) && (
					<Button
						size="sm"
						isLoading={ removeFromList.isPending }
						onPress={ () => removeFromList.mutate() }
					>
						{ __( 'Remove from list', 'cliedesk' ) }
					</Button>
				) }
			{ edit && (
				<Button size="sm" onPress={ () => setDialog( 'block' ) }>
					{ opName( 'block' ) }
				</Button>
			) }
			{ del && (
				<Button
					size="sm"
					variant="danger"
					onPress={ () => setDialog( 'trash' ) }
				>
					{ opName( 'trash' ) }
				</Button>
			) }
			{ exportOk && (
				<Button size="sm" onPress={ () => setDialog( 'export' ) }>
					{ __( 'Export…', 'cliedesk' ) }
				</Button>
			) }
			<Button size="sm" variant="ghost" onPress={ onClear }>
				{ __( 'Clear selection', 'cliedesk' ) }
			</Button>
			<ActionError
				error={ removeFromList.error }
				onDismiss={ () => removeFromList.reset() }
			/>
			{ dialog &&
				dialog !== 'export' &&
				dialog !== 'block' &&
				dialog !== 'trash' && (
					<BulkDialog
						op={ dialog }
						selection={ selection }
						segments={ segments }
						onClose={ () => {
							setDialog( null );
						} }
					/>
				) }
			{ dialog === 'export' && (
				<ExportDialog
					selection={ selection }
					onClose={ () => setDialog( null ) }
				/>
			) }
			<ConfirmDestructive
				isOpen={ dialog === 'block' || dialog === 'trash' }
				onOpenChange={ ( o ) => ! o && close() }
				title={
					dialog === 'trash'
						? sprintf(
								/* translators: %s: "12 contacts selected" or "All 40 matching contacts". */
								__( 'Move to Trash: %s?', 'cliedesk' ),
								selectionText( selection )
							)
						: sprintf(
								/* translators: %s: "12 contacts selected" or "All 40 matching contacts". */
								__( 'Block: %s?', 'cliedesk' ),
								selectionText( selection )
							)
				}
				description={
					dialog === 'trash'
						? __(
								'The contacts are hidden from lists and search. You can restore them from Trash.',
								'cliedesk'
							)
						: __(
								'New messages from these contacts do not start conversations. Their data is kept.',
								'cliedesk'
							)
				}
				confirmLabel={
					dialog === 'trash' ? opName( 'trash' ) : opName( 'block' )
				}
				isLoading={ confirmed.isPending }
				onConfirm={ () =>
					confirmed.mutate( { op: dialog, confirm: true } )
				}
			>
				<ActionError error={ confirmed.error } />
			</ConfirmDestructive>
		</div>
	);
}
