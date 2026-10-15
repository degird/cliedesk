/**
 * Translated labels for product, brand and settings values.
 */
import { __ } from '@wordpress/i18n';
import type {
	ColorRole,
	MappingKind,
	MatchType,
	MergeStatus,
	ProductStatus,
} from './api';

/**
 * Human label for a setting source.
 *
 * @param source Source key from the settings API.
 */
export function sourceLabel( source: string ): string {
	switch ( source ) {
		case 'default':
			return __( 'Default', 'cliedesk' );
		case 'workspace':
			return __( 'Workspace setting', 'cliedesk' );
		case 'brand':
			return __( 'Brand setting', 'cliedesk' );
		case 'product':
			return __( 'Product setting', 'cliedesk' );
		case 'constant':
			return __( 'wp-config.php constant', 'cliedesk' );
		case 'filter':
			return __( 'Filter in code', 'cliedesk' );
		default:
			return source;
	}
}

/**
 * Label for a product status.
 *
 * @param s Status.
 */
export function productStatusLabel( s: ProductStatus ): string {
	return s === 'archived'
		? __( 'Archived', 'cliedesk' )
		: __( 'Active', 'cliedesk' );
}

/**
 * Label for a mapping kind.
 *
 * @param k Kind.
 */
export function mappingKindLabel( k: MappingKind ): string {
	switch ( k ) {
		case 'domain':
			return __( 'Website domain', 'cliedesk' );
		case 'url_rule':
			return __( 'Page address (URL rule)', 'cliedesk' );
		case 'email':
			return __( 'Support email address', 'cliedesk' );
		case 'form':
			return __( 'Form', 'cliedesk' );
		case 'channel_account':
			return __( 'Channel account', 'cliedesk' );
		case 'woo_product':
			return __( 'WooCommerce product ID', 'cliedesk' );
		case 'woo_category':
			return __( 'WooCommerce category ID', 'cliedesk' );
		case 'edd_download':
			return __( 'Easy Digital Downloads download ID', 'cliedesk' );
		case 'stripe_price':
			return __( 'Stripe price ID', 'cliedesk' );
		default:
			return __( 'External ID', 'cliedesk' );
	}
}

/**
 * Label for a match type.
 *
 * @param m Match type.
 */
export function matchTypeLabel( m: MatchType ): string {
	switch ( m ) {
		case 'contains':
			return __( 'Contains', 'cliedesk' );
		case 'wildcard':
			return __( 'Wildcard (*)', 'cliedesk' );
		case 'prefix':
			return __( 'Starts with', 'cliedesk' );
		default:
			return __( 'Exactly', 'cliedesk' );
	}
}

/**
 * Label for a colour role.
 *
 * @param r Role.
 */
export function colorRoleLabel( r: ColorRole ): string {
	switch ( r ) {
		case 'accent':
			return __( 'Accent colour', 'cliedesk' );
		case 'background':
			return __( 'Background colour', 'cliedesk' );
		case 'text':
			return __( 'Text colour', 'cliedesk' );
		default:
			return __( 'Primary colour', 'cliedesk' );
	}
}

/**
 * Label for a merge status.
 *
 * @param s Status.
 */
export function mergeStatusLabel( s: MergeStatus ): string {
	switch ( s ) {
		case 'running':
			return __( 'Moving items…', 'cliedesk' );
		case 'undoing':
			return __( 'Undoing…', 'cliedesk' );
		case 'undone':
			return __( 'Undone', 'cliedesk' );
		default:
			return __( 'Done', 'cliedesk' );
	}
}
