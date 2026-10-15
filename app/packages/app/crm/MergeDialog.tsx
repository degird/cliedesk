/**
 * Merge two contacts (CRM-13) or two organizations (CRM-15): pick which one is kept (Swap), see what moves
 * (preview counts), choose a value per conflict (attributes and fields) and, for two contacts linked to
 * WordPress users, confirm. The success toast offers Undo; the screen then opens the kept record.
 *
 * Contacts: GET/POST contacts/{id}/merge, POST contacts/merges/{mergeId}/undo.
 * Organizations: GET/POST organizations/{id}/merge, POST organizations/merges/{mergeId}/undo.
 */
import {
	api,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	LoadingRegion,
	Modal,
	RadioGroup,
	toast,
} from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { fieldsQuery, teamsLookupQuery } from '../inbox/api';
import { ActionError, actionMessage, useAgents } from '../inbox/components';
import {
	attributeLabel,
	countOf,
	mergePreviewQuery,
	orgMergePreviewQuery,
	valueText,
	type ContactMergePreview,
	type ContactMergeResult,
	type MergeConflict,
	type OrgMergePreview,
	type OrgMergeResult,
} from './api';
import type { PickedItem } from './components';

export type MergeKind = 'contact' | 'organization';

type Keep = 'target' | 'source';

/**
 * Request body of a merge.
 *
 * @param sourceId       Merged (removed) record.
 * @param attributes     Attribute choices.
 * @param fields         Field choices (field id => keep).
 * @param confirmWpUsers Confirmation for two WordPress users (contacts).
 */
export function mergeBody(
	sourceId: number,
	attributes: Record< string, Keep >,
	fields: Record< string, Keep >,
	confirmWpUsers?: boolean
) {
	return {
		sourceId,
		attributes: Object.entries( attributes ).map( ( [ name, keep ] ) => ( {
			name,
			keep,
		} ) ),
		fields: Object.entries( fields ).map( ( [ fieldId, keep ] ) => ( {
			fieldId: Number( fieldId ),
			keep,
		} ) ),
		...( confirmWpUsers ? { confirmWpUsers: true } : {} ),
	};
}

const base = ( kind: MergeKind ) =>
	kind === 'contact' ? 'contacts' : 'organizations';

/**
 * Refresh everything a merge or its undo touches.
 *
 * @param qc   Query client.
 * @param kind Kind.
 * @param ids  Records.
 */
export function afterMerge( qc: QueryClient, kind: MergeKind, ids: number[] ) {
	void qc.invalidateQueries( {
		queryKey: [ kind === 'contact' ? 'contacts' : 'organizations' ],
	} );
	for ( const id of ids ) {
		void qc.invalidateQueries( { queryKey: [ kind, id ] } );
	}
	if ( kind === 'organization' ) {
		// Memberships shown on contact pages.
		void qc.invalidateQueries( { queryKey: [ 'contact' ] } );
	}
}

/**
 * Undo a merge (from the toast or the merge history).
 *
 * @param qc      Query client.
 * @param kind    Kind.
 * @param mergeId Merge.
 * @param ids     Records to refresh.
 */
export async function undoMerge(
	qc: QueryClient,
	kind: MergeKind,
	mergeId: number,
	ids: number[]
): Promise< void > {
	try {
		await api.post( `${ base( kind ) }/merges/${ mergeId }/undo` );
		afterMerge( qc, kind, ids );
		toast( { tone: 'success', title: __( 'Merge undone.', 'cliedesk' ) } );
	} catch ( e ) {
		toast( {
			tone: 'danger',
			title: __( 'Could not undo the merge', 'cliedesk' ),
			description: actionMessage( e ),
		} );
	}
}

function Counts( { lines }: { lines: string[] } ) {
	return (
		<ul className="list-disc ps-5 text-sm">
			{ lines.map( ( l ) => (
				<li key={ l }>{ l }</li>
			) ) }
		</ul>
	);
}

function contactLines( p: ContactMergePreview ): string[] {
	return [
		sprintf(
			/* translators: %d: number of items. */
			_n(
				'%d conversation as the customer',
				'%d conversations as the customer',
				p.conversations,
				'cliedesk'
			),
			p.conversations
		),
		sprintf(
			/* translators: %d: number of items. */
			_n(
				'%d conversation as a CC or follower',
				'%d conversations as a CC or follower',
				p.participations,
				'cliedesk'
			),
			p.participations
		),
		sprintf(
			/* translators: %d: number of items. */
			_n(
				'%d email, phone or channel',
				'%d emails, phones or channels',
				p.identities.length,
				'cliedesk'
			),
			p.identities.length
		),
		sprintf(
			/* translators: %d: number of items. */
			_n( '%d note', '%d notes', p.notes, 'cliedesk' ),
			p.notes
		),
		sprintf(
			/* translators: %d: number of items. */
			_n( '%d tag', '%d tags', p.tags, 'cliedesk' ),
			p.tags
		),
		sprintf(
			/* translators: %d: number of items. */
			_n(
				'%d organization',
				'%d organizations',
				p.organizations.length,
				'cliedesk'
			),
			p.organizations.length
		),
		sprintf(
			/* translators: %d: number of items. */
			_n(
				'%d activity event',
				'%d activity events',
				p.events,
				'cliedesk'
			),
			p.events
		),
	];
}

function orgLines( p: OrgMergePreview ): string[] {
	return [
		sprintf(
			/* translators: %d: number of items. */
			_n( '%d member', '%d members', countOf( p.members ), 'cliedesk' ),
			countOf( p.members )
		),
		sprintf(
			/* translators: %d: number of items. */
			_n( '%d domain', '%d domains', p.domains.length, 'cliedesk' ),
			p.domains.length
		),
		sprintf(
			/* translators: %d: number of items. */
			_n(
				'%d child organization',
				'%d child organizations',
				countOf( p.children ),
				'cliedesk'
			),
			countOf( p.children )
		),
		sprintf(
			/* translators: %d: number of items. */
			_n(
				'%d conversation',
				'%d conversations',
				p.conversations,
				'cliedesk'
			),
			p.conversations
		),
		sprintf(
			/* translators: %d: number of items. */
			_n( '%d note', '%d notes', p.notes, 'cliedesk' ),
			p.notes
		),
	];
}

/**
 * Merge dialog.
 *
 * @param props          Props.
 * @param props.kind     contact | organization.
 * @param props.first    Kept by default (the primary).
 * @param props.second   Merged into the primary by default.
 * @param props.onClose  Close.
 * @param props.onMerged After a merge (before navigation).
 */
export default function MergeDialog( {
	kind,
	first,
	second,
	onClose,
	onMerged,
}: {
	kind: MergeKind;
	first: PickedItem;
	second: PickedItem;
	onClose: () => void;
	onMerged?: ( targetId: number ) => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ swapped, setSwapped ] = useState( false );
	const target = swapped ? second : first;
	const source = swapped ? first : second;
	const [ attributes, setAttributes ] = useState< Record< string, Keep > >(
		{}
	);
	const [ fields, setFields ] = useState< Record< string, Keep > >( {} );
	const [ confirmWp, setConfirmWp ] = useState( false );
	const [ needWp, setNeedWp ] = useState( false );
	const contactPreview = useQuery( {
		...mergePreviewQuery( target.id, source.id ),
		enabled: kind === 'contact',
	} );
	const orgPreview = useQuery( {
		...orgMergePreviewQuery( target.id, source.id ),
		enabled: kind === 'organization',
	} );
	const preview = kind === 'contact' ? contactPreview : orgPreview;
	const defs = useQuery( fieldsQuery( kind ) );
	const teams = useQuery( {
		...teamsLookupQuery(),
		enabled: kind === 'organization',
	} );
	const { nameFor } = useAgents();
	const cp = kind === 'contact' ? contactPreview.data : undefined;
	const op = kind === 'organization' ? orgPreview.data : undefined;
	const wp = needWp || !! cp?.bothWpUsers;
	const nameOf = ( which: Keep ) => {
		const rec = which === 'target' ? target : source;
		if ( cp ) {
			return cp[ which ]?.displayName || rec.label;
		}
		return op?.[ which ]?.name || rec.label;
	};

	const merge = useMutation( {
		mutationFn: () =>
			api.post< ContactMergeResult | OrgMergeResult >(
				`${ base( kind ) }/${ target.id }/merge`,
				{
					body: mergeBody(
						source.id,
						attributes,
						fields,
						kind === 'contact' && wp ? confirmWp : undefined
					),
				}
			),
		onSuccess: ( r ) => {
			const mergeId = r.data?.mergeId;
			const kept = r.data?.target ?? target.id;
			const ids = [ kept, r.data?.source ?? source.id ];
			afterMerge( qc, kind, ids );
			onMerged?.( kept );
			onClose();
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: 1: merged record name, 2: kept record name. */
					__( '“%1$s” was merged into “%2$s”.', 'cliedesk' ),
					nameOf( 'source' ),
					nameOf( 'target' )
				),
				timeout: 15000,
				action: mergeId
					? {
							label: __( 'Undo', 'cliedesk' ),
							onAction: () =>
								void undoMerge( qc, kind, mergeId, ids ),
						}
					: undefined,
			} );
			if ( kind === 'contact' ) {
				void navigate( {
					to: '/contacts/$contactId',
					params: { contactId: String( kept ) },
				} );
			} else {
				void navigate( {
					to: '/organizations/$orgId',
					params: { orgId: String( kept ) },
				} );
			}
		},
		onError: ( e ) => {
			if ( isApiError( e ) && e.code === 'cliedesk_merge_wp_users' ) {
				setNeedWp( true );
			}
		},
	} );

	const swap = () => {
		setSwapped( ( s ) => ! s );
		// Choices refer to "target" and "source", which have just changed places.
		setAttributes( {} );
		setFields( {} );
		merge.reset();
	};

	const showValue = ( c: MergeConflict, which: Keep ): string => {
		const v = c[ which ];
		if ( v === null || v === undefined || v === '' ) {
			return valueText( v );
		}
		if ( c.name === 'ownerId' ) {
			return nameFor( Number( v ) ) ?? `#${ v }`;
		}
		if ( c.name === 'defaultTeamId' ) {
			return (
				teams.data?.find( ( t ) => t.id === Number( v ) )?.name ??
				`#${ v }`
			);
		}
		if ( c.name === 'parentId' ) {
			return op?.[ which ]?.parentName ?? `#${ v }`;
		}
		return valueText( v );
	};
	const optionLabel = ( which: Keep, value: string ) =>
		which === 'target'
			? sprintf(
					/* translators: 1: value, 2: name of the kept record. */
					__( '%1$s (from “%2$s”, kept)', 'cliedesk' ),
					value,
					nameOf( 'target' )
				)
			: sprintf(
					/* translators: 1: value, 2: name of the merged record. */
					__( '%1$s (from “%2$s”)', 'cliedesk' ),
					value,
					nameOf( 'source' )
				);

	const conflicts = cp?.conflicts ?? op?.conflicts ?? [];
	const fieldConflicts = cp?.fieldConflicts ?? op?.fieldConflicts ?? [];
	const fieldLabel = ( id: number ) =>
		defs.data?.find( ( d ) => d.id === id )?.label ??
		sprintf(
			/* translators: %d: field id. */
			__( 'Field #%d', 'cliedesk' ),
			id
		);
	const blocked =
		! preview.isSuccess || ( kind === 'contact' && wp && ! confirmWp );

	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				kind === 'contact'
					? __( 'Merge contacts', 'cliedesk' )
					: __( 'Merge organizations', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isDisabled={ blocked }
						isLoading={ merge.isPending }
						onPress={ () => merge.mutate() }
					>
						{ __( 'Merge', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
					<p className="min-w-0 flex-1">
						{ sprintf(
							/* translators: 1: record that is kept, 2: record merged into it. */
							__(
								'Keep “%1$s” and merge “%2$s” into it. “%2$s” is removed.',
								'cliedesk'
							),
							nameOf( 'target' ),
							nameOf( 'source' )
						) }
					</p>
					<Button
						size="sm"
						iconStart={
							<ArrowLeftRight aria-hidden="true" size={ 14 } />
						}
						onPress={ swap }
					>
						{ sprintf(
							/* translators: %s: name of the record to keep instead. */
							__( 'Swap: keep “%s”', 'cliedesk' ),
							nameOf( 'source' )
						) }
					</Button>
				</div>
				{ preview.isPending && (
					<LoadingRegion
						label={ __( 'Loading the preview…', 'cliedesk' ) }
					/>
				) }
				{ preview.isError && (
					<ActionError
						title={ __( 'Could not load the preview', 'cliedesk' ) }
						error={ preview.error }
					/>
				) }
				{ preview.isSuccess && (
					<section
						aria-labelledby="cd-merge-moves"
						className="flex flex-col gap-1"
					>
						<h3 id="cd-merge-moves" className="font-semibold">
							{ sprintf(
								/* translators: %s: name of the kept record. */
								__( 'Moves to “%s”', 'cliedesk' ),
								nameOf( 'target' )
							) }
						</h3>
						<Counts
							lines={ cp ? contactLines( cp ) : orgLines( op! ) }
						/>
					</section>
				) }
				{ conflicts.length + fieldConflicts.length > 0 && (
					<section
						aria-labelledby="cd-merge-conflicts"
						className="flex flex-col gap-3"
					>
						<h3 id="cd-merge-conflicts" className="font-semibold">
							{ __( 'Values that differ', 'cliedesk' ) }
						</h3>
						{ conflicts.map( ( c ) => (
							<RadioGroup
								key={ c.name }
								label={ attributeLabel( c.name ) }
								value={ attributes[ c.name ] ?? 'target' }
								onChange={ ( v ) =>
									setAttributes( ( a ) => ( {
										...a,
										[ c.name ]: v as Keep,
									} ) )
								}
								options={ (
									[ 'target', 'source' ] as Keep[]
								 ).map( ( w ) => ( {
									id: w,
									label: optionLabel( w, showValue( c, w ) ),
								} ) ) }
							/>
						) ) }
						{ fieldConflicts.map( ( f ) => (
							<RadioGroup
								key={ f.fieldId }
								label={ fieldLabel( f.fieldId ) }
								value={
									fields[ String( f.fieldId ) ] ?? 'target'
								}
								onChange={ ( v ) =>
									setFields( ( a ) => ( {
										...a,
										[ String( f.fieldId ) ]: v as Keep,
									} ) )
								}
								options={ (
									[ 'target', 'source' ] as Keep[]
								 ).map( ( w ) => ( {
									id: w,
									label: optionLabel(
										w,
										valueText( f[ w ] )
									),
								} ) ) }
							/>
						) ) }
					</section>
				) }
				{ kind === 'contact' && wp && (
					<Banner
						tone="warning"
						title={ __(
							'Both contacts are linked to WordPress users',
							'cliedesk'
						) }
					>
						<p>
							{ __(
								'The kept contact stays linked to its WordPress user. The other WordPress user account is not deleted, but it is no longer linked to a contact.',
								'cliedesk'
							) }
						</p>
						<Checkbox
							className="mt-2"
							isSelected={ confirmWp }
							onChange={ setConfirmWp }
						>
							{ __(
								'I understand, merge these WordPress users’ contacts',
								'cliedesk'
							) }
						</Checkbox>
					</Banner>
				) }
				{ merge.error &&
					! (
						isApiError( merge.error ) &&
						merge.error.code === 'cliedesk_merge_wp_users' &&
						! confirmWp
					) && (
						<ActionError
							error={ merge.error }
							onDismiss={ () => merge.reset() }
						/>
					) }
			</div>
		</Modal>
	);
}
