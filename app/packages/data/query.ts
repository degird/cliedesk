/**
 * QueryClient factory (plan.frontend-ux.md §4.3). One client per page, shared with Pro through
 * `window.cliedesk.data`. The REST client already retries per §4.7, so TanStack Query does not retry again.
 */
import { QueryClient } from '@tanstack/react-query';

export const QUERY_DEFAULTS = {
	staleTime: 30_000,
	gcTime: 600_000,
	refetchOnWindowFocus: false,
	retry: false,
	networkMode: 'online',
} as const;

let shared: QueryClient | null = null;

/** Create a QueryClient with the Cliedesk conventions. */
export function createQueryClient(): QueryClient {
	return new QueryClient( {
		defaultOptions: {
			queries: { ...QUERY_DEFAULTS },
			mutations: { retry: false, networkMode: 'online' },
		},
	} );
}

/** The page-wide QueryClient (created on first use). */
export function getQueryClient(): QueryClient {
	if ( ! shared ) {
		shared = createQueryClient();
	}
	return shared;
}
