/**
 * `/settings/workspace/products/$productId`: product detail (BRD-02…05) with tabs Details, Identity, Detection & IDs,
 * Inheritance and Lifecycle. In Free every product uses the workspace brand and the workspace settings (one shared
 * setup); Pro fills the `product.identity` and `product.inheritance` slots (BRD-04, BRD-09) and gets the form pieces
 * through the workspace kit.
 */
import {
	can,
	isApiError,
	useQuery,
	useQueryClient,
	type ApiResult,
} from '@cliedesk/data';
import {
	ErrorState,
	LoadingRegion,
	Slot,
	Tab,
	TabList,
	TabPanel,
	Tabs,
} from '@cliedesk/ui';
import { Link, useParams } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { describeError } from '../../components/RouteError';
import {
	normaliseDetail,
	productDetailQuery,
	productKeys,
	versionTag,
	type ProductDetail,
} from '../../workspace/api';
import { workspaceKit } from '../../workspace/kit';
import { productStatusLabel } from '../../workspace/labels';
import { BRANDS_PATH, PRODUCTS_PATH } from '../../workspace/paths';
import { DetailsTab } from '../../workspace/product/DetailsTab';
import { LifecycleTab } from '../../workspace/product/LifecycleTab';
import { MappingsTab } from '../../workspace/product/MappingsTab';
import { NotFound } from '../NotFound';

function Shell( {
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
} ) {
	return (
		<div className="mx-auto flex max-w-3xl flex-col">
			<Link
				to={ PRODUCTS_PATH }
				className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				<ArrowLeft
					aria-hidden="true"
					size={ 14 }
					className="rtl:rotate-180"
				/>
				{ __( 'All products', 'cliedesk' ) }
			</Link>
			<PageHeader title={ title } description={ description } />
			{ children }
		</div>
	);
}

/**
 * Free's Identity tab: the product uses the workspace brand.
 *
 * @param props         Props.
 * @param props.product Product.
 */
function WorkspaceIdentity( { product }: { product: ProductDetail } ) {
	return (
		<p className="text-fg-muted">
			{ sprintf(
				/* translators: %s: brand name. */
				__(
					'This product uses the workspace brand “%s”: its name, logos, colours and email sender.',
					'cliedesk'
				),
				product.identity.name
			) }{ ' ' }
			<Link
				to={ BRANDS_PATH }
				className="font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				{ __( 'Edit the brand', 'cliedesk' ) }
			</Link>
		</p>
	);
}

/**
 * Product detail page.
 */
export default function ProductDetailRoute() {
	const params = useParams( { strict: false } ) as { productId?: string };
	const id = Number( params.productId );
	const valid = Number.isInteger( id ) && id > 0;
	const qc = useQueryClient();
	const q = useQuery( { ...productDetailQuery( id ), enabled: valid } );
	// Forms re-open (fresh values and base version) after the user's own save or a Reload.
	const [ rev, setRev ] = useState( 0 );
	const [ tab, setTab ] = useState< string >( 'details' );
	const canManage = can( 'cliedesk_manage_products' );

	if ( ! valid ) {
		return <NotFound />;
	}
	if ( q.isPending ) {
		return (
			<Shell title={ __( 'Product', 'cliedesk' ) }>
				<LoadingRegion />
			</Shell>
		);
	}
	if ( q.isError ) {
		if ( isApiError( q.error ) && q.error.status === 404 ) {
			return <NotFound />;
		}
		return (
			<Shell title={ __( 'Product', 'cliedesk' ) }>
				<ErrorState
					title={ __( 'Could not load the product', 'cliedesk' ) }
					message={ describeError( q.error ) }
					code={ isApiError( q.error ) ? q.error.code : null }
					requestId={
						isApiError( q.error ) ? q.error.requestId : null
					}
					onRetry={ () => void q.refetch() }
				/>
			</Shell>
		);
	}

	const { product, etag } = q.data;
	const onSaved = ( r: ApiResult< ProductDetail > ) => {
		qc.setQueryData( productKeys.detail( id ), ( old: typeof q.data ) => ( {
			product: normaliseDetail( {
				...( old?.product ?? product ),
				...r.data,
				identity: old?.product.identity ?? product.identity,
				merges: old?.product.merges ?? product.merges,
			} ),
			etag: r.etag ?? versionTag( r.data.version ),
		} ) );
		setRev( ( n ) => n + 1 );
		void qc.invalidateQueries( { queryKey: productKeys.all } );
	};
	const onReload = () => {
		void q.refetch().then( () => setRev( ( n ) => n + 1 ) );
	};
	const tabProps = { product, etag, onSaved, onReload, canManage };
	const proProps = { ...tabProps, kit: workspaceKit };

	return (
		<Shell
			title={ product.name }
			description={ sprintf(
				/* translators: 1: product status, 2: product slug. */
				__( '%1$s · %2$s', 'cliedesk' ),
				product.mergedIntoId
					? __( 'Merged', 'cliedesk' )
					: productStatusLabel( product.status ),
				product.slug
			) }
		>
			<Tabs
				selectedKey={ tab }
				onSelectionChange={ ( k ) => setTab( String( k ) ) }
			>
				<TabList label={ __( 'Product settings', 'cliedesk' ) }>
					<Tab id="details">{ __( 'Details', 'cliedesk' ) }</Tab>
					<Tab id="identity">{ __( 'Identity', 'cliedesk' ) }</Tab>
					<Tab id="detection">
						{ __( 'Detection & IDs', 'cliedesk' ) }
					</Tab>
					<Tab id="inheritance">
						{ __( 'Inheritance', 'cliedesk' ) }
					</Tab>
					<Tab id="lifecycle">{ __( 'Lifecycle', 'cliedesk' ) }</Tab>
				</TabList>
				<TabPanel id="details">
					<DetailsTab key={ `d${ rev }` } { ...tabProps } />
				</TabPanel>
				<TabPanel id="identity">
					<Slot
						key={ `i${ rev }` }
						name="product.identity"
						fillProps={ proProps }
						className="flex flex-col gap-4"
						fallback={ <WorkspaceIdentity product={ product } /> }
					/>
				</TabPanel>
				<TabPanel id="detection">
					<MappingsTab key={ `m${ rev }` } { ...tabProps } />
				</TabPanel>
				<TabPanel id="inheritance">
					<Slot
						name="product.inheritance"
						fillProps={ { productId: id, kit: workspaceKit } }
						className="flex flex-col gap-4"
						fallback={
							<p className="text-fg-muted">
								{ __(
									'Every product uses the workspace settings.',
									'cliedesk'
								) }
							</p>
						}
					/>
				</TabPanel>
				<TabPanel id="lifecycle">
					<LifecycleTab
						product={ product }
						canManage={ canManage }
						onChanged={ onReload }
					/>
				</TabPanel>
			</Tabs>
		</Shell>
	);
}
