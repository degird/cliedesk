/**
 * BRD-02: with one active product the product concept stays out of the way (no product picker, column or
 * filter). `useMultiProduct()` says whether the workspace has more than one active product.
 */
import { getBoot, useQueryClient, type QueryClient } from '@cliedesk/data';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Latest `meta.activeCount` from any loaded product list query (`['products', 'list', …]`), or null.
 *
 * @param qc Query client.
 */
export function loadedActiveCount( qc: QueryClient ): number | null {
	let best: { count: number; at: number } | null = null;
	for ( const q of qc
		.getQueryCache()
		.findAll( { queryKey: [ 'products', 'list' ] } ) ) {
		const data = q.state.data as { activeCount?: unknown } | undefined;
		if (
			typeof data?.activeCount === 'number' &&
			( ! best || q.state.dataUpdatedAt >= best.at )
		) {
			best = { count: data.activeCount, at: q.state.dataUpdatedAt };
		}
	}
	return best?.count ?? null;
}

/**
 * Pure selector: more than one active product? Uses the live count when known, else the boot payload.
 *
 * @param bootProducts Products from the boot payload (active only).
 * @param activeCount  `meta.activeCount` from GET /products, when loaded.
 * @param truncated    Boot product list was truncated (more than 100 products).
 */
export function isMultiProduct(
	bootProducts: ReadonlyArray< unknown >,
	activeCount: number | null,
	truncated = false
): boolean {
	if ( activeCount !== null ) {
		return activeCount > 1;
	}
	return truncated || bootProducts.length > 1;
}

/**
 * Whether the workspace has more than one active product (reactive: follows product list queries).
 * Single-product sites hide product pickers, columns and filters (BRD-02).
 */
export function useMultiProduct(): boolean {
	const qc = useQueryClient();
	const subscribe = useCallback(
		( cb: () => void ) => qc.getQueryCache().subscribe( cb ),
		[ qc ]
	);
	const count = useSyncExternalStore(
		subscribe,
		() => loadedActiveCount( qc ),
		() => null
	);
	const boot = getBoot();
	return isMultiProduct( boot.products, count, boot.productsTruncated );
}
