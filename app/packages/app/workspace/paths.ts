/**
 * Paths of the workspace screens (below the app base).
 */
export const PRODUCTS_PATH = '/settings/workspace/products';
export const BRANDS_PATH = '/settings/workspace/brands';

/**
 * Product detail path.
 *
 * @param id Product id.
 */
export const productPath = ( id: number ): string =>
	`${ PRODUCTS_PATH }/${ id }`;
