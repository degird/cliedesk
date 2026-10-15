/**
 * Product → Lifecycle (BRD-03): archive / restore, merge into another product (background job, undo within the
 * workspace's undo period), merge history with "Undo merge", and delete (only without conversations or channels).
 */
import {
	api,
	can,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	ConfirmDestructive,
	Select,
	Slot,
	Spinner,
	toast,
} from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, type ReactNode } from 'react';
import { ReasonButton, needsRole } from '../../components/DisabledReason';
import { describeError } from '../../components/RouteError';
import { settingsQuery } from '../../queries';
import {
	formatDate,
	productKeys,
	productListQuery,
	versionTag,
	type MergeRecord,
	type ProductDetail,
} from '../api';
import { announceResult } from '../forms';
import { mergeStatusLabel } from '../labels';
import { PRODUCTS_PATH } from '../paths';
import { workspaceKit } from '../kit';

function Section( {
	title,
	children,
}: {
	title: string;
	children: ReactNode;
} ) {
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
			<h2 className="text-lg font-semibold">{ title }</h2>
			{ children }
		</section>
	);
}

function ActionError( { error }: { error: unknown } ) {
	if ( ! error ) {
		return null;
	}
	return (
		<Banner tone="danger" role="alert" title={ describeError( error ) }>
			{ isApiError( error ) && error.requestId
				? sprintf(
						/* translators: %s: request id. */
						__( 'Request ID: %s', 'cliedesk' ),
						error.requestId
					)
				: null }
		</Banner>
	);
}

/**
 * Lifecycle tab.
 *
 * @param props           Props.
 * @param props.product   Product.
 * @param props.canManage May manage products.
 * @param props.onChanged Called after an action changed the product.
 */
export function LifecycleTab( {
	product,
	canManage,
	onChanged,
}: {
	product: ProductDetail;
	canManage: boolean;
	onChanged: () => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const canSettings = can( 'cliedesk_manage_settings' );
	const all = useQuery( productListQuery( 'all' ) );
	const ws = useQuery( settingsQuery( 'workspace' ) );
	const [ target, setTarget ] = useState< string | null >( null );
	const [ confirmMerge, setConfirmMerge ] = useState( false );
	const [ confirmDelete, setConfirmDelete ] = useState( false );

	const nameOf = ( id: number ) =>
		all.data?.items.find( ( p ) => p.id === id )?.name ??
		sprintf(
			/* translators: %d: product id. */
			__( 'Product #%d', 'cliedesk' ),
			id
		);
	const refresh = () => {
		void qc.invalidateQueries( { queryKey: productKeys.all } );
		onChanged();
	};

	const archive = useMutation( {
		mutationFn: ( restore: boolean ) =>
			api.post< ProductDetail >(
				`products/${ product.id }/${ restore ? 'restore' : 'archive' }`,
				{ body: {} }
			),
		onSuccess: ( _r, restore ) => {
			announceResult(
				restore
					? __( 'Product restored.', 'cliedesk' )
					: __( 'Product archived.', 'cliedesk' )
			);
			refresh();
		},
	} );

	const merge = useMutation( {
		mutationFn: ( targetId: number ) =>
			api.post< { mergeId: number; undoUntil: string; status: string } >(
				`products/${ product.id }/merge`,
				{ body: { targetId } }
			),
		onSuccess: ( _r, targetId ) => {
			setConfirmMerge( false );
			const msg = sprintf(
				/* translators: %s: target product name. */
				__(
					'Merging into “%s”. Items move in the background.',
					'cliedesk'
				),
				nameOf( targetId )
			);
			toast( { tone: 'info', title: msg } );
			announceResult( msg );
			refresh();
		},
		onError: () => setConfirmMerge( false ),
	} );

	const undo = useMutation( {
		mutationFn: ( mergeId: number ) =>
			api.post( `products/merges/${ mergeId }/undo`, { body: {} } ),
		onSuccess: () => {
			const msg = __(
				'Undoing the merge. Items move back in the background.',
				'cliedesk'
			);
			toast( { tone: 'info', title: msg } );
			announceResult( msg );
			refresh();
		},
	} );

	const del = useMutation( {
		mutationFn: () =>
			api.del( `products/${ product.id }`, {
				ifMatch: versionTag( product.version ),
			} ),
		onSuccess: () => {
			setConfirmDelete( false );
			const msg = sprintf(
				/* translators: %s: product name. */
				__( 'Product “%s” deleted.', 'cliedesk' ),
				product.name
			);
			toast( { tone: 'success', title: msg } );
			qc.removeQueries( { queryKey: productKeys.detail( product.id ) } );
			void qc.invalidateQueries( { queryKey: productKeys.all } );
			void navigate( { to: PRODUCTS_PATH } );
		},
		onError: () => setConfirmDelete( false ),
	} );

	const archived = product.status === 'archived';
	const merged = product.mergedIntoId !== null;
	const targets = ( all.data?.items ?? [] ).filter(
		( p ) =>
			p.id !== product.id && p.status === 'active' && ! p.mergedIntoId
	);
	const rawDays = ws.data?.values.merge_undo_days?.value;
	const days = typeof rawDays === 'number' ? rawDays : 30;
	const undoBy = formatDate(
		new Date( Date.now() + days * 86400000 ),
		false
	);
	const targetName = target ? nameOf( Number( target ) ) : '';

	return (
		<div className="flex flex-col gap-5">
			<Section title={ __( 'Resolved conversations', 'cliedesk' ) }>
				{ /* A value for this product is Pro (BRD-09); Free uses the workspace setting. */ }
				<Slot
					name="product.auto_close"
					fillProps={ {
						productId: product.id,
						canEdit: canSettings,
						kit: workspaceKit,
					} }
					className="flex flex-col gap-3"
					fallback={
						<p className="text-fg-muted">
							{ __(
								'Resolved conversations close after the number of days set in Settings → Conversations.',
								'cliedesk'
							) }
						</p>
					}
				/>
			</Section>
			<Section title={ __( 'Status', 'cliedesk' ) }>
				<p className="text-fg-muted">
					{ archived
						? __(
								'This product is archived. Its conversations stay searchable, but it is hidden from pickers and routing.',
								'cliedesk'
							)
						: __(
								'Archiving hides the product from new-request pickers and routing. Its conversations stay searchable.',
								'cliedesk'
							) }
				</p>
				<ActionError error={ archive.error } />
				<div>
					<ReasonButton
						reason={ canManage ? undefined : needsRole() }
						isLoading={ archive.isPending }
						isDisabled={ archived && merged }
						onPress={ () => archive.mutate( archived ) }
					>
						{ archived
							? __( 'Restore product', 'cliedesk' )
							: __( 'Archive product', 'cliedesk' ) }
					</ReasonButton>
				</div>
				{ archived && merged && (
					<p className="text-sm text-fg-muted">
						{ sprintf(
							/* translators: %s: product name. */
							__(
								'This product was merged into “%s”. Undo the merge to bring it back.',
								'cliedesk'
							),
							nameOf( product.mergedIntoId as number )
						) }
					</p>
				) }
			</Section>

			{ ! archived && ! merged && (
				<Section
					title={ __( 'Merge into another product', 'cliedesk' ) }
				>
					<p className="text-fg-muted">
						{ __(
							'Conversations, rules, links and customer access move to the other product, and this product is archived.',
							'cliedesk'
						) }
					</p>
					<ActionError error={ merge.error } />
					{ targets.length ? (
						<div className="flex flex-wrap items-end gap-2">
							<Select
								className="min-w-56"
								label={ __( 'Merge into', 'cliedesk' ) }
								options={ targets.map( ( p ) => ( {
									id: String( p.id ),
									label: p.name,
								} ) ) }
								value={ target }
								onChange={ setTarget }
								isDisabled={ ! canManage }
								description={
									canManage ? undefined : needsRole()
								}
							/>
							<ReasonButton
								variant="danger"
								reason={ canManage ? undefined : needsRole() }
								isDisabled={ ! target }
								onPress={ () => setConfirmMerge( true ) }
							>
								{ __( 'Merge…', 'cliedesk' ) }
							</ReasonButton>
						</div>
					) : (
						<p className="text-sm text-fg-muted">
							{ __(
								'There is no other active product to merge into.',
								'cliedesk'
							) }
						</p>
					) }
				</Section>
			) }

			<MergeHistory
				merges={ product.merges }
				nameOf={ nameOf }
				canManage={ canManage }
				onUndo={ ( id ) => undo.mutate( id ) }
				undoing={ undo.isPending ? undo.variables : null }
				error={ undo.error }
			/>

			<Section title={ __( 'Delete product', 'cliedesk' ) }>
				<p className="text-fg-muted">
					{ __(
						'Deleting is possible only when the product has no conversations or channels. Otherwise archive it or merge it into another product.',
						'cliedesk'
					) }
				</p>
				<ActionError error={ del.error } />
				<div>
					<ReasonButton
						variant="danger"
						reason={ canManage ? undefined : needsRole() }
						onPress={ () => setConfirmDelete( true ) }
					>
						{ __( 'Delete product', 'cliedesk' ) }
					</ReasonButton>
				</div>
			</Section>

			<ConfirmDestructive
				isOpen={ confirmMerge }
				onOpenChange={ setConfirmMerge }
				title={ sprintf(
					/* translators: 1: product name, 2: target product name. */
					__( 'Merge “%1$s” into “%2$s”?', 'cliedesk' ),
					product.name,
					targetName
				) }
				description={ sprintf(
					/* translators: 1: target product name, 2: date until which the merge can be undone. */
					__(
						'Conversations, rules and links move to “%1$s”, and this product is archived. You can undo the merge until %2$s.',
						'cliedesk'
					),
					targetName,
					undoBy
				) }
				confirmLabel={ __( 'Merge products', 'cliedesk' ) }
				isLoading={ merge.isPending }
				onConfirm={ () => {
					if ( target ) {
						merge.mutate( Number( target ) );
					}
				} }
			/>
			<ConfirmDestructive
				isOpen={ confirmDelete }
				onOpenChange={ setConfirmDelete }
				title={ sprintf(
					/* translators: %s: product name. */
					__( 'Delete “%s” permanently?', 'cliedesk' ),
					product.name
				) }
				description={ __(
					'The product, its rules and its settings are removed. This cannot be undone.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete product', 'cliedesk' ) }
				isLoading={ del.isPending }
				onConfirm={ () => del.mutate() }
			/>
		</div>
	);
}

/**
 * Merge history of a product with progress and "Undo merge".
 *
 * @param props           Props.
 * @param props.merges    Merges.
 * @param props.nameOf    Product name by id.
 * @param props.canManage May manage products.
 * @param props.onUndo    Undo a merge.
 * @param props.undoing   Merge being undone.
 * @param props.error     Undo error.
 */
export function MergeHistory( {
	merges,
	nameOf,
	canManage,
	onUndo,
	undoing,
	error,
}: {
	merges: MergeRecord[];
	nameOf: ( id: number ) => string;
	canManage: boolean;
	onUndo: ( mergeId: number ) => void;
	undoing: number | null | undefined;
	error: unknown;
} ) {
	if ( ! merges.length ) {
		return null;
	}
	return (
		<Section title={ __( 'Merge history', 'cliedesk' ) }>
			<ActionError error={ error } />
			<ul className="flex flex-col divide-y divide-line">
				{ merges.map( ( m ) => {
					const busy =
						m.status === 'running' || m.status === 'undoing';
					return (
						<li
							key={ m.mergeId }
							className="flex flex-wrap items-center justify-between gap-3 py-3"
						>
							<div className="flex min-w-0 flex-col gap-0.5">
								<p className="font-medium">
									{ sprintf(
										/* translators: 1: source product, 2: target product. */
										__(
											'“%1$s” merged into “%2$s”',
											'cliedesk'
										),
										nameOf( m.sourceId ),
										nameOf( m.targetId )
									) }
								</p>
								<p
									className="text-sm text-fg-muted"
									aria-live="polite"
								>
									<span className="inline-flex items-center gap-1">
										{ busy && <Spinner size={ 12 } /> }
										{ mergeStatusLabel( m.status ) }
									</span>
									{ ' · ' }
									{ sprintf(
										/* translators: %d: number of moved items. */
										_n(
											'%d item moved',
											'%d items moved',
											m.moved,
											'cliedesk'
										),
										m.moved
									) }
									{ ' · ' }
									{ formatDate( m.createdAt ) }
								</p>
								{ m.canUndo && (
									<p className="text-sm text-fg-muted">
										{ sprintf(
											/* translators: %s: date and time. */
											__(
												'Can be undone until %s.',
												'cliedesk'
											),
											formatDate( m.undoUntil )
										) }
									</p>
								) }
							</div>
							{ m.canUndo && (
								<ReasonButton
									reason={
										canManage ? undefined : needsRole()
									}
									isLoading={ undoing === m.mergeId }
									onPress={ () => onUndo( m.mergeId ) }
								>
									{ __( 'Undo merge', 'cliedesk' ) }
								</ReasonButton>
							) }
						</li>
					);
				} ) }
			</ul>
		</Section>
	);
}
