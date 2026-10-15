/**
 * Custom records (CRM-46): types (with their fields) and records. GET custom-record-types, GET/POST custom-records,
 * GET/PATCH/DELETE custom-records/{id}.
 */
import { api, queryOptions } from '@cliedesk/data';
import type { FieldDef } from '../inbox/api';

export interface RecordAccess {
	read: string[];
	update: string[];
	delete: string[];
	rule: 'all' | 'my_products' | 'mine' | 'my_organization';
	/** TEAM-21: shown in the customer portal: no, the customer's own records, or also their organizations'. */
	portal?: 'off' | 'own' | 'organization';
}

export interface RecordType {
	id: number;
	key: string;
	name: string;
	plural: string;
	icon: string | null;
	source: string;
	fields: FieldDef[];
	/** TEAM-21: roles per operation (empty: everyone with the base capability) and the record rule. */
	access?: RecordAccess;
	archived: boolean;
	version: number;
}

export interface CustomRecord {
	id: number;
	uid: string;
	typeId: number;
	title: string;
	contactId: number | null;
	organizationId: number | null;
	productId?: number | null;
	values: Record< string, unknown >;
	createdAt: string;
	updatedAt: string;
	version: number;
}

export const recordKeys = {
	types: [ 'custom-record-types' ] as const,
	list: ( typeId: number, q: string ) =>
		[ 'custom-records', typeId, q ] as const,
	all: [ 'custom-records' ] as const,
};

export const recordTypesQuery = () =>
	queryOptions( {
		queryKey: recordKeys.types,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: RecordType[] } >(
					'custom-record-types',
					{ signal }
				)
			).data?.items ?? [],
		staleTime: 60 * 1000,
	} );

/**
 * Records of a type.
 *
 * @param typeId Type.
 * @param q      Title search.
 */
export const recordsQuery = ( typeId: number, q: string ) =>
	queryOptions( {
		queryKey: recordKeys.list( typeId, q ),
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: CustomRecord[] } >( 'custom-records', {
					query: { typeId, ...( q ? { q } : {} ), limit: 100 },
					signal,
				} )
			).data?.items ?? [],
	} );
