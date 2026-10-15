/**
 * Settings → Workspace → Products (BRD-02, BRD-03): list with a status filter, keyboard reordering (Move up / Move
 * down) and the "Add product" dialog. Each row links to the product detail page. With Pro's brands (BRD-04) a Brand
 * column shows each product's brand (`products.row.brand` slot).
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
	Button,
	EmptyState,
	ErrorState,
	IconButton,
	LoadingRegion,
	Select,
	Slot,
	toast,
	useSlotHasFills,
} from '@cliedesk/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Package, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { describeError } from '../../components/RouteError';
import {
	productKeys,
	productListQuery,
	type ProductFilter,
	type ProductList,
	type ProductSummary,
} from '../../workspace/api';
import { announceResult } from '../../workspace/forms';
import { productStatusLabel } from '../../workspace/labels';
import { productPath } from '../../workspace/paths';
import { ProductWizard } from '../../workspace/ProductWizard';

/**
 * Move one item of a list up or down.
 *
 * @param items List.
 * @param index Index of the item.
 * @param delta -1 (up) or 1 (down).
 */
export function moveItem< T >( items: T[], index: number, delta: -1 | 1 ): T[] {
	const to = index + delta;
	if ( to < 0 || to >= items.length ) {
		return items;
	}
	const next = [ ...items ];
	const [ item ] = next.splice( index, 1 );
	next.splice( to, 0, item as T );
	return next;
}

/**
 * Products list section.
 */
export default function ProductsSection() {
	const [ filter, setFilter ] = useState< ProductFilter >( 'active' );
	const [ adding, setAdding ] = useState( false );
	const qc = useQueryClient();
	const navigate = useNavigate();
	const q = useQuery( productListQuery( filter ) );
	const brandColumn = useSlotHasFills( 'products.row.brand' );
	const canManage = can( 'cliedesk_manage_products' );
	const tableRef = useRef< HTMLTableElement >( null );

	const reorder = useMutation( {
		mutationFn: ( ids: number[] ) =>
			api.put< ProductSummary[] >( 'products/order', { body: { ids } } ),
		onMutate: async ( ids ) => {
			const key = productKeys.list( filter );
			await qc.cancelQueries( { queryKey: key } );
			const prev = qc.getQueryData< ProductList >( key );
			if ( prev ) {
				const byId = new Map( prev.items.map( ( p ) => [ p.id, p ] ) );
				qc.setQueryData< ProductList >( key, {
					...prev,
					items: ids
						.map( ( id ) => byId.get( id ) )
						.filter( ( p ): p is ProductSummary => !! p ),
				} );
			}
			return { prev, key };
		},
		onError: ( e, _ids, ctx ) => {
			if ( ctx?.prev ) {
				qc.setQueryData( ctx.key, ctx.prev );
			}
			toast( {
				tone: 'danger',
				title: __( 'Could not change the order', 'cliedesk' ),
				description: describeError( e ),
			} );
		},
		onSettled: () =>
			void qc.invalidateQueries( { queryKey: productKeys.all } ),
	} );

	const move = ( index: number, delta: -1 | 1 ) => {
		const items = q.data?.items ?? [];
		const item = items[ index ];
		const next = moveItem( items, index, delta );
		if ( ! item || next === items ) {
			return;
		}
		reorder.mutate( next.map( ( p ) => p.id ) );
		const pos = index + delta;
		announceResult(
			sprintf(
				/* translators: 1: product name, 2: new position, 3: number of products. */
				__( '%1$s moved to position %2$d of %3$d.', 'cliedesk' ),
				item.name,
				pos + 1,
				items.length
			)
		);
		// Keep focus on the moved row: same button, or the other one when this end is reached.
		window.requestAnimationFrame( () => {
			const row = tableRef.current?.querySelector(
				`[data-product-row="${ item.id }"]`
			);
			const want = row?.querySelector< HTMLButtonElement >(
				`[data-move="${ delta < 0 ? 'up' : 'down' }"]:not([disabled])`
			);
			const other = row?.querySelector< HTMLButtonElement >(
				`[data-move="${ delta < 0 ? 'down' : 'up' }"]:not([disabled])`
			);
			( want ?? other )?.focus();
		} );
	};

	let body;
	if ( q.isPending ) {
		body = (
			<LoadingRegion label={ __( 'Loading products…', 'cliedesk' ) } />
		);
	} else if ( q.isError ) {
		body = (
			<ErrorState
				title={ __( 'Could not load the products', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.items.length ) {
		body = (
			<EmptyState
				icon={ <Package size={ 32 } strokeWidth={ 1.75 } /> }
				title={
					filter === 'archived'
						? __( 'No archived products', 'cliedesk' )
						: __( 'No products yet', 'cliedesk' )
				}
				description={
					filter === 'archived'
						? __(
								'Archived products keep their conversations but leave pickers and routing.',
								'cliedesk'
							)
						: __(
								'A product is something you support, such as your shop or a plugin you sell. Each one can have its own team, sender and help center.',
								'cliedesk'
							)
				}
				actions={
					// ADM-04: every empty state offers a way to start.
					<>
						{ filter !== 'active' && (
							<Button onPress={ () => setFilter( 'active' ) }>
								{ __( 'Show active products', 'cliedesk' ) }
							</Button>
						) }
						{ filter !== 'archived' && canManage && (
							<Button
								variant="primary"
								onPress={ () => setAdding( true ) }
							>
								{ __( 'Add your first product', 'cliedesk' ) }
							</Button>
						) }
					</>
				}
			/>
		);
	} else {
		const items = q.data.items;
		body = (
			<div className="overflow-x-auto rounded-lg border border-line bg-surface">
				<table ref={ tableRef } className="w-full text-start text-base">
					<caption className="sr-only">
						{ __( 'Products', 'cliedesk' ) }
					</caption>
					<thead className="border-b border-line text-sm text-fg-muted">
						<tr>
							<th
								scope="col"
								className="px-4 py-2 text-start font-medium"
							>
								{ __( 'Name', 'cliedesk' ) }
							</th>
							<th
								scope="col"
								className="px-4 py-2 text-start font-medium"
							>
								{ __( 'Status', 'cliedesk' ) }
							</th>
							{ brandColumn && (
								<th
									scope="col"
									className="px-4 py-2 text-start font-medium"
								>
									{ __( 'Brand', 'cliedesk' ) }
								</th>
							) }
							<th
								scope="col"
								className="px-4 py-2 text-start font-medium"
							>
								{ __( 'Slug', 'cliedesk' ) }
							</th>
							{ canManage && (
								<th
									scope="col"
									className="px-4 py-2 text-end font-medium"
								>
									{ __( 'Order', 'cliedesk' ) }
								</th>
							) }
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{ items.map( ( p, i ) => (
							<tr key={ p.id } data-product-row={ p.id }>
								<th
									scope="row"
									className="px-4 py-2 text-start font-medium"
								>
									<Link
										to={ productPath( p.id ) }
										className="text-accent-fg underline-offset-2 hover:underline"
									>
										<bdi>{ p.name }</bdi>
									</Link>
								</th>
								<td className="px-4 py-2">
									<span className="rounded-full border border-line px-2 text-xs font-medium text-fg-muted">
										{ p.mergedIntoId
											? __( 'Merged', 'cliedesk' )
											: productStatusLabel( p.status ) }
									</span>
								</td>
								{ brandColumn && (
									<td className="px-4 py-2 text-fg-muted">
										<Slot
											name="products.row.brand"
											fillProps={ { product: p } }
										/>
									</td>
								) }
								<td className="px-4 py-2 font-mono text-sm text-fg-muted">
									<bdi dir="ltr">{ p.slug }</bdi>
								</td>
								{ canManage && (
									<td className="px-4 py-2">
										<div className="flex justify-end gap-1">
											<IconButton
												size="sm"
												data-move="up"
												label={ sprintf(
													/* translators: %s: product name. */
													__(
														'Move %s up',
														'cliedesk'
													),
													p.name
												) }
												icon={ <ArrowUp size={ 14 } /> }
												isDisabled={
													i === 0 || reorder.isPending
												}
												onPress={ () => move( i, -1 ) }
											/>
											<IconButton
												size="sm"
												data-move="down"
												label={ sprintf(
													/* translators: %s: product name. */
													__(
														'Move %s down',
														'cliedesk'
													),
													p.name
												) }
												icon={
													<ArrowDown size={ 14 } />
												}
												isDisabled={
													i === items.length - 1 ||
													reorder.isPending
												}
												onPress={ () => move( i, 1 ) }
											/>
										</div>
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
				<Select
					className="w-48"
					label={ __( 'Show', 'cliedesk' ) }
					value={ filter }
					onChange={ ( x ) => setFilter( x as ProductFilter ) }
					options={ [
						{ id: 'active', label: __( 'Active', 'cliedesk' ) },
						{ id: 'archived', label: __( 'Archived', 'cliedesk' ) },
						{ id: 'all', label: __( 'All', 'cliedesk' ) },
					] }
				/>
				{ canManage && (
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
						onPress={ () => setAdding( true ) }
					>
						{ __( 'Add product', 'cliedesk' ) }
					</Button>
				) }
			</div>
			{ body }
			{ canManage && (
				<ProductWizard
					isOpen={ adding }
					onOpenChange={ setAdding }
					onCreated={ ( p ) =>
						void navigate( { to: productPath( p.id ) } )
					}
				/>
			) }
		</div>
	);
}
