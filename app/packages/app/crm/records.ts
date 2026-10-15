/**
 * Records from registered sources (CRM-44/45): orders, subscriptions, licences… read live and linked to
 * conversations, contacts and organizations.
 *
 * - GET record-sources → {items: [{key, label, plural, icon, schema, actions, aiRead}]}.
 * - GET record-sources/{source}/records?contactId=&q=&limit= → {items}; 503 `cliedesk_record_source_unavailable`.
 * - GET record-links?entity=&entityId= → {items: [{id, source, sourceLabel, recordId, label, available, record,
 *   linkedAt}]}; POST record-links {entity, entityId, source, recordId}; DELETE record-links/{id}.
 *
 * Record URLs are sanitised by the server; links are still opened only when they are http(s).
 */
import { api, can, queryOptions } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';

export type RecordEntity = 'conversation' | 'contact' | 'organization';

export type SchemaType =
	'text' | 'number' | 'money' | 'date' | 'url' | 'status' | 'bool';

export interface RecordSource {
	key: string;
	label: string;
	plural: string;
	icon: string;
	schema: Record< string, { label: string; type: SchemaType | string } >;
	actions: string[];
	aiRead: boolean;
}

export interface ExternalRecord {
	source: string;
	id: string;
	title: string;
	subtitle: string | null;
	status: string | null;
	url: string | null;
	date: string | null;
	amount: number | null;
	currency: string | null;
	fields: Record< string, string | number | boolean | null >;
}

export interface RecordLink {
	id: number;
	source: string;
	sourceLabel: string;
	recordId: string;
	label: string | null;
	available: boolean;
	record: ExternalRecord | null;
	linkedAt: string;
}

export const recordKeys = {
	sources: [ 'record-sources' ] as const,
	links: ( entity: RecordEntity, id: number ) =>
		[ 'record-links', entity, id ] as const,
	find: ( source: string, contactId: number | null, q: string ) =>
		[ 'record-sources', source, 'find', contactId, q ] as const,
};

export const recordSourcesQuery = () =>
	queryOptions( {
		queryKey: recordKeys.sources,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: RecordSource[] } >( 'record-sources', {
					signal,
				} )
			).data?.items;
			return Array.isArray( items )
				? items.filter( ( s ) => s && typeof s.key === 'string' )
				: [];
		},
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );

export const recordLinksQuery = ( entity: RecordEntity, id: number ) =>
	queryOptions( {
		queryKey: recordKeys.links( entity, id ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: RecordLink[] } >( 'record-links', {
					query: { entity, entityId: id },
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

/**
 * Find records of a source: suggestions for a contact, or a search.
 *
 * @param source    Source key.
 * @param contactId Contact whose records to suggest (null: none).
 * @param q         Search.
 */
export const recordFindQuery = (
	source: string,
	contactId: number | null,
	q: string
) =>
	queryOptions( {
		queryKey: recordKeys.find( source, contactId, q ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: ExternalRecord[] } >(
					`record-sources/${ source }/records`,
					{
						query: {
							...( contactId ? { contactId } : {} ),
							...( q ? { q } : {} ),
							limit: 20,
						},
						signal,
					}
				)
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
		retry: false,
	} );

/**
 * Link a record.
 *
 * @param entity   Entity.
 * @param entityId Entity id.
 * @param source   Source key.
 * @param recordId Record id.
 */
export async function linkRecord(
	entity: RecordEntity,
	entityId: number,
	source: string,
	recordId: string
): Promise< RecordLink > {
	return (
		await api.post< RecordLink >( 'record-links', {
			body: { entity, entityId, source, recordId },
		} )
	).data;
}

/**
 * Whether the person may link and unlink records on an entity.
 *
 * @param entity Entity.
 */
export function canLinkRecords( entity: RecordEntity ): boolean {
	return entity === 'conversation'
		? can( 'cliedesk_edit_conversation_fields' )
		: can( 'cliedesk_edit_contacts' );
}

/**
 * A URL that is safe to open: http(s) only (the server already sanitises record URLs).
 *
 * @param url URL.
 */
export function safeUrl( url: unknown ): string | null {
	if ( typeof url !== 'string' || ! /^https?:\/\//i.test( url.trim() ) ) {
		return null;
	}
	try {
		const u = new URL( url.trim() );
		return u.protocol === 'http:' || u.protocol === 'https:'
			? u.href
			: null;
	} catch {
		return null;
	}
}

/**
 * Amount with its currency, in the site language.
 *
 * @param amount   Amount.
 * @param currency ISO currency code.
 */
export function formatAmount(
	amount: number,
	currency: string | null
): string {
	const lang =
		( typeof document !== 'undefined' && document.documentElement.lang ) ||
		undefined;
	try {
		return currency && /^[A-Za-z]{3}$/.test( currency )
			? new Intl.NumberFormat( lang, {
					style: 'currency',
					currency: currency.toUpperCase(),
				} ).format( amount )
			: new Intl.NumberFormat( lang ).format( amount );
	} catch {
		return currency ? `${ amount } ${ currency }` : String( amount );
	}
}

/**
 * Date of a record (as sent when it cannot be read).
 *
 * @param value Date text.
 */
export function formatRecordDate( value: string ): string {
	const d = new Date(
		/^\d{4}-\d{2}-\d{2} \d/.test( value )
			? value.replace( ' ', 'T' )
			: value
	);
	if ( Number.isNaN( d.getTime() ) ) {
		return value;
	}
	const lang =
		( typeof document !== 'undefined' && document.documentElement.lang ) ||
		undefined;
	try {
		return new Intl.DateTimeFormat( lang, { dateStyle: 'medium' } ).format(
			d
		);
	} catch {
		return value;
	}
}

/**
 * Text of a schema field value.
 *
 * @param type  Schema type.
 * @param value Value.
 */
export function fieldText( type: string, value: unknown ): string {
	if ( value === null || value === undefined || value === '' ) {
		return '—';
	}
	if ( type === 'bool' || typeof value === 'boolean' ) {
		return value === true || value === 'true' || value === 1
			? __( 'Yes', 'cliedesk' )
			: __( 'No', 'cliedesk' );
	}
	if ( type === 'date' ) {
		return formatRecordDate( String( value ) );
	}
	if (
		( type === 'number' || type === 'money' ) &&
		typeof value === 'number'
	) {
		return formatAmount( value, null );
	}
	return String( value );
}
