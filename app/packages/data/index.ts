/**
 * @cliedesk/data — REST client, QueryClient, change feed, boot store (window.cliedesk.data).
 *
 * TanStack Query is bundled here once and re-exported, so @cliedesk/ui, @cliedesk/app and Pro share one copy
 * (one React context, one cache).
 */
export * from './boot';
export * from './errors';
export * from './api';
export * from './session';
export * from './changes';
export * from './query';
export * from './store';
export * from './viewAs';
export { ulid } from './ulid';

export {
	QueryClient,
	QueryClientProvider,
	useQuery,
	useQueries,
	useSuspenseQuery,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
	useIsFetching,
	queryOptions,
	infiniteQueryOptions,
	keepPreviousData,
} from '@tanstack/react-query';
export type {
	QueryKey,
	UseQueryResult,
	UseMutationResult,
} from '@tanstack/react-query';
