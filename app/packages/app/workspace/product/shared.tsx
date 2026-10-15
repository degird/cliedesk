/**
 * Shared pieces of the product detail tabs: the save mutation (If-Match with the version the form was
 * opened with, so a change made meanwhile is reported instead of overwritten) and the save bar.
 */
import { api, useMutation, type ApiResult } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import {
	isConflict,
	versionTag,
	type ProductDetail,
	type ProductInput,
} from '../api';
import { ConflictBanner, SaveError } from '../forms';

export interface ProductTabProps {
	product: ProductDetail;
	/** ETag of the read the form started from. */
	etag: string | null;
	/** After a successful save (updates the cache and re-opens the forms). */
	onSaved: ( r: ApiResult< ProductDetail > ) => void;
	/** Reload the latest version and reset the forms. */
	onReload: () => void;
	canManage: boolean;
}

/**
 * PATCH /products/{id} with If-Match.
 *
 * @param product Product the form was opened with.
 * @param etag    ETag of that read.
 * @param onSaved Success callback.
 * @param onError Error callback.
 */
export function useProductPatch(
	product: ProductDetail,
	etag: string | null,
	onSaved: ( r: ApiResult< ProductDetail > ) => void,
	onError?: ( e: unknown ) => void
) {
	const [ base ] = useState( () => etag ?? versionTag( product.version ) );
	return useMutation( {
		mutationFn: ( body: ProductInput ) =>
			api.patch< ProductDetail >( `products/${ product.id }`, {
				body,
				ifMatch: base,
			} ),
		onSuccess: onSaved,
		onError,
	} );
}

/**
 * Save button with the conflict banner and general save errors.
 *
 * @param props          Props.
 * @param props.error    Mutation error.
 * @param props.pending  Saving.
 * @param props.onReload Reload after a conflict.
 * @param props.label    Button label.
 * @param props.disabled Disabled (no permission).
 */
export function SaveBar( {
	error,
	pending,
	onReload,
	label,
	disabled,
}: {
	error: unknown;
	pending: boolean;
	onReload: () => void;
	label?: string;
	disabled?: boolean;
} ) {
	return (
		<div className="flex flex-col gap-3">
			{ isConflict( error ) && (
				<ConflictBanner
					onReload={ onReload }
					message={ __(
						'Someone else changed this product. Reload to see their changes.',
						'cliedesk'
					) }
				/>
			) }
			<SaveError error={ error } />
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="submit"
					variant="primary"
					isLoading={ pending }
					isDisabled={ disabled || isConflict( error ) }
				>
					{ label ?? __( 'Save changes', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}
