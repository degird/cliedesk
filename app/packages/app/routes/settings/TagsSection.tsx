/**
 * Settings → Workspace → Tags (CNV-36, CNV-38, CNV-41). List by usage (default) or name with search, the usage count,
 * last use and an "Unused" badge (no use for conversations.tag_unused_days). Add (cliedesk_create_tags); edit name,
 * colour and description, merge several tags into one with Undo, and delete (cliedesk_manage_tags). A tag in use
 * answers 409 with where it is used; the delete then needs a confirmation.
 * Endpoints: GET tags?sort&q, POST tags, PATCH tags/{id} (If-Match), POST tags/{id}/merge {sourceIds},
 * POST tags/merges/{mergeId}/undo, DELETE tags/{id} {confirm}.
 */
import {
	api,
	can,
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
	ConfirmDestructive,
	ErrorState,
	LoadingRegion,
	Modal,
	Select,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { TagInheritance } from './TagInheritance';
import { describeError } from '../../components/RouteError';
import { ActionError, Muted, Pill } from '../../inbox/components';
import { relativeTime } from '../../inbox/labels';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	announceResult,
	apiFieldErrors,
} from '../../workspace/forms';

export interface TagDetail {
	id: number;
	name: string;
	slug: string;
	color: string | null;
	description: string;
	usageCount: number;
	lastUsedAt: string | null;
	unused: boolean;
	version: number;
}

interface References {
	taggings: Record< string, number >;
	references: Array< { type: string; id: number; name: string } >;
}

const tagListQuery = ( sort: string, q: string ) =>
	queryOptions( {
		queryKey: [ 'tags', 'settings', sort, q ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< TagDetail[] >( 'tags', {
					query: { sort, ...( q ? { q } : {} ) },
					signal,
				} )
			).data ?? [],
	} );

/** #rrggbb or empty, else an error. */
export function colorError( v: string ): string | null {
	return v === '' || /^#[0-9a-fA-F]{6}$/.test( v )
		? null
		: __( 'Use a colour such as #2861E6.', 'cliedesk' );
}

/**
 * Where a tag is used, in words.
 *
 * @param refs References from the API.
 */
export function usageText( refs: References ): string[] {
	const out: string[] = Object.entries( refs.taggings ?? {} ).map(
		( [ kind, n ] ) =>
			sprintf(
				/* translators: 1: number, 2: kind of record, e.g. "conversation". */
				__( '%1$d × %2$s', 'cliedesk' ),
				n,
				kind
			)
	);
	for ( const r of refs.references ?? [] ) {
		out.push( `${ r.type }: ${ r.name }` );
	}
	return out;
}

function TagDialog( {
	tag,
	onClose,
}: {
	tag: TagDetail | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ name, setName ] = useState( tag?.name ?? '' );
	const [ color, setColor ] = useState( tag?.color ?? '' );
	const [ description, setDescription ] = useState( tag?.description ?? '' );
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			tag
				? api.patch< TagDetail >( `tags/${ tag.id }`, {
						body,
						ifMatch: versionTag( tag.version ),
					} )
				: api.post< TagDetail >( 'tags', { body } ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %s: tag name. */
					__( 'Tag “%s” saved.', 'cliedesk' ),
					r.data.name
				)
			);
			void qc.invalidateQueries( { queryKey: [ 'tags' ] } );
			onClose();
		},
	} );
	const server = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next: Record< string, string > = {};
		if ( ! name.trim() ) {
			next.name = __( 'Enter a name.', 'cliedesk' );
		}
		const c = colorError( color.trim() );
		if ( c ) {
			next.color = c;
		}
		setErrors( next );
		if ( Object.keys( next ).length ) {
			return;
		}
		save.mutate( {
			name: name.trim(),
			color: color.trim() || null,
			description: description.trim(),
		} );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				tag
					? sprintf(
							/* translators: %s: tag name. */
							__( 'Edit tag %s', 'cliedesk' ),
							tag.name
						)
					: __( 'Add tag', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-tag"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save tag', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-tag"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ isConflict( save.error ) ? (
					<ConflictBanner
						onReload={ () => {
							void qc.invalidateQueries( {
								queryKey: [ 'tags' ],
							} );
							onClose();
						} }
					/>
				) : (
					<ActionError error={ save.error } />
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					value={ name }
					onChange={ setName }
					maxLength={ 191 }
					isRequired
					errorMessage={ errors.name ?? server.name ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<TextField
					label={ __( 'Colour', 'cliedesk' ) }
					description={ __(
						'Optional, for example #2861E6.',
						'cliedesk'
					) }
					value={ color }
					onChange={ setColor }
					maxLength={ 7 }
					errorMessage={ errors.color ?? server.color ?? null }
				/>
				<TextField
					label={ __( 'Description', 'cliedesk' ) }
					value={ description }
					onChange={ setDescription }
					maxLength={ 1000 }
					multiline
					errorMessage={ server.description ?? null }
				/>
			</form>
		</Modal>
	);
}

function MergeDialog( {
	tags,
	onClose,
}: {
	tags: TagDetail[];
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ target, setTarget ] = useState( String( tags[ 0 ]?.id ?? '' ) );
	const merge = useMutation( {
		mutationFn: () =>
			api.post< { mergeId: number; tag: TagDetail } >(
				`tags/${ target }/merge`,
				{
					body: {
						sourceIds: tags
							.map( ( t ) => t.id )
							.filter( ( id ) => String( id ) !== target ),
					},
				}
			),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: [ 'tags' ] } );
			const id = r.data.mergeId;
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %s: tag name. */
					__( 'Tags merged into “%s”.', 'cliedesk' ),
					r.data.tag.name
				),
				action: {
					label: __( 'Undo', 'cliedesk' ),
					onAction: () =>
						void api
							.post( `tags/merges/${ id }/undo`, { body: {} } )
							.then( () =>
								qc.invalidateQueries( { queryKey: [ 'tags' ] } )
							),
				},
			} );
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %d: number of tags. */
				_n( 'Merge %d tag', 'Merge %d tags', tags.length, 'cliedesk' ),
				tags.length
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ merge.isPending }
						onPress={ () => merge.mutate() }
					>
						{ __( 'Merge', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<p className="text-sm text-fg-muted">
					{ __(
						'Everything tagged with the other tags gets the kept tag, and the other tags are removed. You can undo this for a while.',
						'cliedesk'
					) }
				</p>
				<ActionError error={ merge.error } />
				<Select
					label={ __( 'Keep', 'cliedesk' ) }
					value={ target }
					onChange={ setTarget }
					options={ tags.map( ( t ) => ( {
						id: String( t.id ),
						label: t.name,
					} ) ) }
				/>
			</div>
		</Modal>
	);
}

/**
 * Section.
 */
export default function TagsSection() {
	const qc = useQueryClient();
	const [ sort, setSort ] = useState( 'usage' );
	const [ search, setSearch ] = useState( '' );
	const [ editing, setEditing ] = useState< TagDetail | 'new' | null >(
		null
	);
	const [ selected, setSelected ] = useState< number[] >( [] );
	const [ merging, setMerging ] = useState( false );
	const [ deleting, setDeleting ] = useState< TagDetail | null >( null );
	const [ refs, setRefs ] = useState< References | null >( null );
	const manage = can( 'cliedesk_manage_tags' );
	const create = can( 'cliedesk_create_tags' ) || manage;
	const q = useQuery( tagListQuery( sort, search.trim() ) );
	const remove = useMutation( {
		mutationFn: ( {
			tag,
			confirm,
		}: {
			tag: TagDetail;
			confirm: boolean;
		} ) =>
			api.del( `tags/${ tag.id }`, {
				body: confirm ? { confirm: true } : {},
			} ),
		onSuccess: ( _r, { tag } ) => {
			announceResult(
				sprintf(
					/* translators: %s: tag name. */
					__( 'Tag “%s” deleted.', 'cliedesk' ),
					tag.name
				)
			);
			setDeleting( null );
			setRefs( null );
			setSelected( ( l ) => l.filter( ( x ) => x !== tag.id ) );
			void qc.invalidateQueries( { queryKey: [ 'tags' ] } );
		},
		onError: ( e ) => {
			if ( isApiError( e ) && e.code === 'cliedesk_tag_in_use' ) {
				setRefs(
					( e.details as References ) ?? {
						taggings: {},
						references: [],
					}
				);
			}
		},
	} );
	const tags = q.data ?? [];
	const chosen = tags.filter( ( t ) => selected.includes( t.id ) );
	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Loading tags…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<ErrorState
				title={ __( 'Could not load the tags', 'cliedesk' ) }
				message={ describeError( q.error ) }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! tags.length ) {
		body = <Muted>{ __( 'No tags found.', 'cliedesk' ) }</Muted>;
	} else {
		body = (
			<div className="overflow-x-auto rounded-lg border border-line bg-surface">
				<table className="w-full text-sm">
					<caption className="sr-only">
						{ __( 'Tags', 'cliedesk' ) }
					</caption>
					<thead className="border-b border-line text-start text-fg-muted">
						<tr>
							{ manage && (
								<th scope="col" className="w-8 px-3 py-2">
									<span className="sr-only">
										{ __( 'Select', 'cliedesk' ) }
									</span>
								</th>
							) }
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Tag', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-3 py-2 text-end font-medium"
							>
								{ __( 'Uses', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Last used', 'cliedesk' ) }
							</th>
							{ manage && (
								<th scope="col" className="px-3 py-2">
									<span className="sr-only">
										{ __( 'Actions', 'cliedesk' ) }
									</span>
								</th>
							) }
						</tr>
					</thead>
					<tbody>
						{ tags.map( ( t ) => (
							<tr
								key={ t.id }
								className="border-b border-line last:border-b-0"
							>
								{ manage && (
									<td className="px-3 py-2">
										<Checkbox
											isSelected={ selected.includes(
												t.id
											) }
											onChange={ ( v ) =>
												setSelected( ( l ) =>
													v
														? [ ...l, t.id ]
														: l.filter(
																( x ) =>
																	x !== t.id
															)
												)
											}
										>
											<span className="sr-only">
												{ sprintf(
													/* translators: %s: tag name. */
													__(
														'Select %s',
														'cliedesk'
													),
													t.name
												) }
											</span>
										</Checkbox>
									</td>
								) }
								<td className="px-3 py-2">
									<span className="flex flex-wrap items-center gap-2">
										{ t.color && (
											<span
												aria-hidden="true"
												className="inline-block size-3 rounded-full border border-line-strong"
												style={ {
													backgroundColor: t.color,
												} }
											/>
										) }
										<bdi className="font-medium">
											{ t.name }
										</bdi>
										{ t.unused && (
											<Pill tone="warning">
												{ __( 'Unused', 'cliedesk' ) }
											</Pill>
										) }
									</span>
									{ t.description && (
										<span className="block text-fg-muted">
											{ t.description }
										</span>
									) }
								</td>
								<td className="cd-tabular px-3 py-2 text-end">
									{ t.usageCount }
								</td>
								<td className="px-3 py-2 text-fg-muted">
									{ t.lastUsedAt
										? relativeTime( t.lastUsedAt )
										: __( 'Never', 'cliedesk' ) }
								</td>
								{ manage && (
									<td className="px-3 py-2 text-end">
										<span className="inline-flex gap-2">
											<Button
												size="sm"
												onPress={ () =>
													setEditing( t )
												}
												aria-label={ sprintf(
													/* translators: %s: tag name. */
													__( 'Edit %s', 'cliedesk' ),
													t.name
												) }
											>
												{ __( 'Edit', 'cliedesk' ) }
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onPress={ () => {
													setRefs( null );
													remove.reset();
													setDeleting( t );
												} }
												aria-label={ sprintf(
													/* translators: %s: tag name. */
													__(
														'Delete %s',
														'cliedesk'
													),
													t.name
												) }
											>
												{ __( 'Delete', 'cliedesk' ) }
											</Button>
										</span>
									</td>
								) }
							</tr>
						) ) }
					</tbody>
				</table>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-wrap items-end gap-3">
					<TextField
						label={ __( 'Search tags', 'cliedesk' ) }
						value={ search }
						onChange={ setSearch }
					/>
					<Select
						label={ __( 'Sort', 'cliedesk' ) }
						value={ sort }
						onChange={ setSort }
						options={ [
							{
								id: 'usage',
								label: __( 'Most used', 'cliedesk' ),
							},
							{ id: 'name', label: __( 'Name', 'cliedesk' ) },
						] }
					/>
				</div>
				<div className="flex flex-wrap gap-2">
					{ manage && (
						<Button
							isDisabled={ chosen.length < 2 }
							onPress={ () => setMerging( true ) }
						>
							{ __( 'Merge selected…', 'cliedesk' ) }
						</Button>
					) }
					{ create && (
						<Button
							variant="primary"
							iconStart={
								<Plus aria-hidden="true" size={ 16 } />
							}
							onPress={ () => setEditing( 'new' ) }
						>
							{ __( 'Add tag', 'cliedesk' ) }
						</Button>
					) }
				</div>
			</div>
			{ body }
			{ editing && (
				<TagDialog
					tag={ editing === 'new' ? null : editing }
					onClose={ () => setEditing( null ) }
				/>
			) }
			{ merging && (
				<MergeDialog
					tags={ chosen }
					onClose={ () => {
						setMerging( false );
						setSelected( [] );
					} }
				/>
			) }
			<ConfirmDestructive
				isOpen={ deleting !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setDeleting( null );
						setRefs( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: tag name. */
					__( 'Delete “%s”?', 'cliedesk' ),
					deleting?.name ?? ''
				) }
				description={
					refs
						? __(
								'This tag is in use. Deleting it removes it from all of these.',
								'cliedesk'
							)
						: __( 'The tag is removed for good.', 'cliedesk' )
				}
				confirmLabel={
					refs
						? __( 'Delete anyway', 'cliedesk' )
						: __( 'Delete tag', 'cliedesk' )
				}
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( deleting ) {
						remove.mutate( {
							tag: deleting,
							confirm: refs !== null,
						} );
					}
				} }
			>
				{ refs && (
					<ul className="list-disc ps-5 text-sm">
						{ usageText( refs ).map( ( u ) => (
							<li key={ u }>{ u }</li>
						) ) }
					</ul>
				) }
				{ remove.error && ! refs && (
					<ActionError error={ remove.error } />
				) }
			</ConfirmDestructive>
			{ remove.isError && refs === null && ! deleting && (
				<Banner
					tone="danger"
					role="alert"
					title={ describeError( remove.error ) }
				/>
			) }
			<TagInheritance />
		</div>
	);
}
