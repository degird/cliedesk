/**
 * Settings → Workspace → Brand: the workspace brand (one shared setup) — name, logos, colours, favicon, email From
 * name and signature, used by the portal, the sign-in page, emails, the survey page and signatures. Several brands
 * with a brand per product are Pro (BRD-04): Pro fills the `workspace.brands` slot with its brand list and gets the
 * edit dialog through the workspace kit.
 */
import { can, getBoot, isApiError, useQuery } from '@cliedesk/data';
import { Button, ErrorState, LoadingRegion, Slot } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { describeError } from '../../components/RouteError';
import { COLOR_ROLES, brandDetailQuery, type Brand } from '../../workspace/api';
import { BrandDialog } from '../../workspace/BrandDialog';
import { ImagePreview } from '../../workspace/ImagePicker';
import { workspaceKit } from '../../workspace/kit';
import { colorRoleLabel } from '../../workspace/labels';

/**
 * Colour swatches of a brand.
 *
 * @param props       Props.
 * @param props.brand Brand.
 */
export function BrandColors( { brand }: { brand: Brand } ) {
	const roles = COLOR_ROLES.filter( ( r ) => brand.colors?.[ r ] );
	if ( ! roles.length ) {
		return null;
	}
	return (
		<ul
			className="flex flex-wrap gap-1"
			aria-label={ __( 'Colours', 'cliedesk' ) }
		>
			{ roles.map( ( r ) => (
				<li
					key={ r }
					className="inline-flex items-center gap-1 text-xs text-fg-muted"
				>
					<span
						aria-hidden="true"
						className="inline-block size-3 rounded-sm border border-line-strong"
						style={ { backgroundColor: brand.colors[ r ] } }
					/>
					<span className="sr-only">{ colorRoleLabel( r ) }</span>
					<bdi dir="ltr">{ brand.colors[ r ] }</bdi>
				</li>
			) ) }
		</ul>
	);
}

function WorkspaceBrand( { id }: { id: number } ) {
	const [ open, setOpen ] = useState( false );
	const q = useQuery( brandDetailQuery( id ) );
	if ( q.isPending ) {
		return (
			<LoadingRegion label={ __( 'Loading the brand…', 'cliedesk' ) } />
		);
	}
	if ( q.isError ) {
		return (
			<ErrorState
				title={ __( 'Could not load the brand', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const brand = q.data;
	return (
		<div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
			<ImagePreview id={ brand.logoLightAttachmentId } />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<h2 className="text-base font-semibold">
					<bdi>{ brand.name }</bdi>
				</h2>
				<p className="text-sm text-fg-muted">
					{ brand.emailFromName
						? sprintf(
								/* translators: %s: email sender name. */
								__( 'Emails are sent as “%s”.', 'cliedesk' ),
								brand.emailFromName
							)
						: __( 'Every product uses this brand.', 'cliedesk' ) }
				</p>
				<BrandColors brand={ brand } />
			</div>
			{ can( 'cliedesk_manage_products' ) && (
				<Button
					onPress={ () => setOpen( true ) }
					aria-label={ sprintf(
						/* translators: %s: brand name. */
						__( 'Edit %s', 'cliedesk' ),
						brand.name
					) }
				>
					{ __( 'Edit', 'cliedesk' ) }
				</Button>
			) }
			<BrandDialog
				isOpen={ open }
				onOpenChange={ setOpen }
				brand={ brand }
			/>
		</div>
	);
}

/**
 * Brand section.
 */
export default function BrandsSection() {
	const id = getBoot().workspace.brandId;
	return (
		<div className="flex flex-col gap-4">
			<Slot
				name="workspace.brands"
				fillProps={ { kit: workspaceKit, defaultBrandId: id } }
				className="flex flex-col gap-4"
				fallback={
					id ? (
						<WorkspaceBrand id={ id } />
					) : (
						<p className="text-fg-muted">
							{ __(
								'The workspace brand is missing.',
								'cliedesk'
							) }
						</p>
					)
				}
			/>
		</div>
	);
}
