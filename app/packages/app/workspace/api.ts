/**
 * Products, the workspace brand and media images (BRD-01…03): types, query keys and query options for the
 * Settings → Workspace screens. Keys: ['products', …], ['brands', …], ['media', …]. Several brands, identity
 * overrides, help scopes and the inheritance view are Pro (FPS-05), which keeps the same keys.
 */
import { api, isApiError, queryOptions, type ApiResult } from '@cliedesk/data';

export type ProductStatus = 'active' | 'archived';
export type ProductFilter = ProductStatus | 'all';

export interface ProductSummary {
	id: number;
	uid: string;
	slug: string;
	name: string;
	status: ProductStatus;
	brandId: number | null;
	iconAttachmentId: number | null;
	sort: number;
	mergedIntoId: number | null;
	version: number;
}

export type ColorRole = 'primary' | 'accent' | 'background' | 'text';
export const COLOR_ROLES: ColorRole[] = [
	'primary',
	'accent',
	'background',
	'text',
];
export type Colors = Partial< Record< ColorRole, string > >;

export type MappingKind =
	| 'domain'
	| 'url_rule'
	| 'email'
	| 'form'
	| 'channel_account'
	| 'woo_product'
	| 'woo_category'
	| 'edd_download'
	| 'stripe_price'
	| 'external';
export type MatchType = 'exact' | 'contains' | 'wildcard' | 'prefix';

export const MAPPING_KINDS: MappingKind[] = [
	'domain',
	'url_rule',
	'email',
	'form',
	'channel_account',
	'woo_product',
	'woo_category',
	'edd_download',
	'stripe_price',
	'external',
];
export const MATCH_TYPES: MatchType[] = [
	'exact',
	'contains',
	'wildcard',
	'prefix',
];
/** Kinds whose value is matched as text (the others are exact ids). */
export const MATCHABLE_KINDS = new Set< MappingKind >( [
	'domain',
	'url_rule',
	'email',
] );

export interface Mapping {
	id?: number;
	kind: MappingKind;
	matchType: MatchType;
	value: string;
	priority: number;
}

export type IdentityField =
	| 'name'
	| 'logo_light_attachment_id'
	| 'logo_dark_attachment_id'
	| 'colors'
	| 'email_from_name'
	| 'signature';

export interface Identity {
	brandId: number | null;
	name: string;
	logoLightAttachmentId: number | null;
	logoDarkAttachmentId: number | null;
	colors: Colors;
	emailFromName: string;
	signature: string;
	/** snake_case identity field names overridden by the product (Pro). */
	overridden: IdentityField[];
}

export type MergeStatus = 'running' | 'done' | 'undoing' | 'undone';

export interface MergeRecord {
	mergeId: number;
	sourceId: number;
	targetId: number;
	status: MergeStatus;
	moved: number;
	createdAt: string;
	undoUntil: string;
	canUndo: boolean;
}

export interface ProductDetail extends ProductSummary {
	description: string;
	ownerTeamId: number | null;
	defaultQueueId: number | null;
	website: string;
	supportEmail: string;
	mappings: Mapping[];
	createdAt: string;
	updatedAt: string;
	archivedAt: string | null;
	identity: Identity;
	merges: MergeRecord[];
}

/** Product input; Pro adds its own keys (brand, overrides, help scope, copy settings). */
export interface ProductInput {
	name?: string;
	slug?: string;
	description?: string;
	iconAttachmentId?: number | null;
	website?: string;
	supportEmail?: string;
	mappings?: Array< Omit< Mapping, 'id' > >;
	[ key: string ]: unknown;
}

export interface Brand {
	id: number;
	uid: string;
	slug: string;
	name: string;
	isDefault: boolean;
	logoLightAttachmentId: number | null;
	logoDarkAttachmentId: number | null;
	colors: Colors;
	emailFromName: string;
	signature: string;
	/** PRT-06: favicon of the portal. */
	faviconAttachmentId?: number | null;
	archived: boolean;
	version: number;
	updatedAt: string;
}

export interface BrandDetail extends Brand {
	products: Array< { id: number; name: string; status: ProductStatus } >;
}

export interface BrandInput {
	name?: string;
	logoLightAttachmentId?: number | null;
	logoDarkAttachmentId?: number | null;
	faviconAttachmentId?: number | null;
	colors?: Colors;
	emailFromName?: string;
	signature?: string;
}

export interface MediaImage {
	id: number;
	title: string;
	alt: string;
	thumbnail: string | null;
	url: string | null;
}

export interface ProductList {
	items: ProductSummary[];
	activeCount: number | null;
}

/** Product list pages are fetched up to this many products. */
const MAX_PAGES = 10;

export const productKeys = {
	all: [ 'products' ] as const,
	list: ( status: ProductFilter ) => [ 'products', 'list', status ] as const,
	detail: ( id: number ) => [ 'products', 'detail', id ] as const,
};

export const brandKeys = {
	all: [ 'brands' ] as const,
	list: ( archived: boolean ) => [ 'brands', 'list', archived ] as const,
	detail: ( id: number ) => [ 'brands', 'detail', id ] as const,
};

export const productListQuery = ( status: ProductFilter ) =>
	queryOptions( {
		queryKey: productKeys.list( status ),
		queryFn: async ( { signal } ): Promise< ProductList > => {
			const items: ProductSummary[] = [];
			let after: string | null = null;
			let activeCount: number | null = null;
			for ( let page = 0; page < MAX_PAGES; page++ ) {
				const r: ApiResult< ProductSummary[] > = await api.get<
					ProductSummary[]
				>( 'products', {
					query: { status, limit: 500, after },
					signal,
				} );
				items.push( ...( r.data ?? [] ) );
				activeCount =
					typeof r.meta.activeCount === 'number'
						? r.meta.activeCount
						: activeCount;
				after = typeof r.meta.next === 'string' ? r.meta.next : null;
				if ( ! after ) {
					break;
				}
			}
			return { items, activeCount };
		},
	} );

export const productDetailQuery = ( id: number ) =>
	queryOptions( {
		queryKey: productKeys.detail( id ),
		queryFn: async ( { signal } ) => {
			const r = await api.get< ProductDetail >( `products/${ id }`, {
				signal,
			} );
			return { product: normaliseDetail( r.data ), etag: r.etag };
		},
		// While a merge (or its undo) runs in the background, check its progress.
		refetchInterval: ( q ) =>
			q.state.data?.product.merges.some(
				( m ) => m.status === 'running' || m.status === 'undoing'
			)
				? 3000
				: false,
	} );

export const brandDetailQuery = ( id: number ) =>
	queryOptions( {
		queryKey: brandKeys.detail( id ),
		queryFn: async ( { signal } ) =>
			( await api.get< BrandDetail >( `brands/${ id }`, { signal } ) )
				.data,
	} );

export const mediaImagesQuery = ( search: string, page: number ) =>
	queryOptions( {
		queryKey: [ 'media', 'images', search, page ] as const,
		queryFn: async ( { signal } ) => {
			const r = await api.get< MediaImage[] >( 'media/images', {
				query: { search: search || undefined, page },
				signal,
			} );
			return {
				images: r.data ?? [],
				total: typeof r.meta.total === 'number' ? r.meta.total : 0,
			};
		},
	} );

export const mediaImageQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'media', 'image', id ] as const,
		queryFn: async ( { signal } ) => {
			const r = await api.get< MediaImage[] >( 'media/images', {
				query: { ids: [ id ] },
				signal,
			} );
			return r.data?.find( ( i ) => i.id === id ) ?? null;
		},
		staleTime: 5 * 60 * 1000,
	} );

/**
 * Detail with safe defaults for optional parts (older servers, partial fixtures).
 *
 * @param p Detail from the API.
 */
export function normaliseDetail( p: ProductDetail ): ProductDetail {
	return {
		...p,
		description: p.description ?? '',
		website: p.website ?? '',
		supportEmail: p.supportEmail ?? '',
		mappings: p.mappings ?? [],
		merges: p.merges ?? [],
		identity: {
			brandId: p.identity?.brandId ?? p.brandId ?? null,
			name: p.identity?.name ?? '',
			logoLightAttachmentId: p.identity?.logoLightAttachmentId ?? null,
			logoDarkAttachmentId: p.identity?.logoDarkAttachmentId ?? null,
			colors:
				p.identity?.colors && ! Array.isArray( p.identity.colors )
					? p.identity.colors
					: {},
			emailFromName: p.identity?.emailFromName ?? '',
			signature: p.identity?.signature ?? '',
			overridden: p.identity?.overridden ?? [],
		},
	};
}

/**
 * `If-Match` value for a known version.
 *
 * @param version Version number.
 */
export const versionTag = ( version: number ): string => `"v${ version }"`;

/**
 * Whether an error is an optimistic-concurrency conflict (stale If-Match).
 *
 * @param e Error.
 */
export function isConflict( e: unknown ): boolean {
	return (
		isApiError( e ) &&
		( e.status === 412 ||
			( e.status === 409 &&
				( e.code === 'cliedesk_conflict' ||
					e.code === 'cliedesk_version_conflict' ) ) )
	);
}

/**
 * Parse a MySQL UTC datetime ("2026-10-03 12:00:00") or ISO string.
 *
 * @param value Date string.
 */
export function parseUtc( value: string ): Date | null {
	if ( ! value ) {
		return null;
	}
	// Server times are UTC, with or without the "T" ("2026-10-03 12:00:00" or "2026-10-03T12:00:00").
	const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(
		value
	)
		? value.replace( ' ', 'T' ) + 'Z'
		: value;
	const d = new Date( iso );
	return Number.isNaN( d.getTime() ) ? null : d;
}

/**
 * Localised date (and time) for display.
 *
 * @param value    Date string or Date.
 * @param withTime Include the time.
 */
export function formatDate( value: string | Date, withTime = true ): string {
	const d = typeof value === 'string' ? parseUtc( value ) : value;
	if ( ! d ) {
		return typeof value === 'string' ? value : '';
	}
	const lang = document.documentElement.lang || undefined;
	try {
		return new Intl.DateTimeFormat( lang, {
			dateStyle: 'medium',
			...( withTime ? { timeStyle: 'short' } : {} ),
		} ).format( d );
	} catch {
		return d.toISOString();
	}
}
