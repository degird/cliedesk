/**
 * Blocked list (SEC-18): blocked contacts (with channels, mode, who, when and why) and blocked IP addresses, ranges
 * and countries.
 *
 * - GET blocks → {contacts: [...], networks: [...]}.
 * - POST blocks {type: ip | country, value, reason} (400 with fields.value on bad input); DELETE blocks/{id}.
 * - Blocking a contact: POST contacts/{id}/block {blocked: true, reason, channels (empty = all), mode} with the
 *   contact's version as If-Match; unblocking sends {blocked: false}.
 */
import { api, queryOptions } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';
import type { Contact } from '../inbox/api';
import { versionTag } from '../workspace/api';

export type BlockMode = 'quarantine' | 'drop';

export interface BlockedContact {
	contactId: number;
	name: string;
	/** Channel keys; empty means every channel. */
	channels: string[];
	mode: BlockMode | string;
	reason: string;
	blockedBy: number | null;
	/** Display name of who blocked it; null for automation or a deleted user. */
	blockedByName?: string | null;
	blockedAt: string;
	hits: number;
	/** Contact version, sent as If-Match when unblocking. */
	version?: number | null;
}

export interface NetworkBlock {
	id: number;
	type: 'ip' | 'country';
	value: string;
	reason: string;
	blockedBy: number | null;
	/** Display name of who blocked it; null for automation or a deleted user. */
	blockedByName?: string | null;
	blockedAt: string;
	hits: number;
}

export interface Blocks {
	contacts: BlockedContact[];
	networks: NetworkBlock[];
}

export const blockKeys = { all: [ 'blocks' ] as const };

export const blocksQuery = () =>
	queryOptions( {
		queryKey: blockKeys.all,
		queryFn: async ( { signal } ): Promise< Blocks > => {
			const d = ( await api.get< Blocks >( 'blocks', { signal } ) ).data;
			return {
				contacts: Array.isArray( d?.contacts ) ? d.contacts : [],
				networks: Array.isArray( d?.networks ) ? d.networks : [],
			};
		},
	} );

export interface BlockInput {
	reason?: string;
	/** Empty: every channel. */
	channels?: string[];
	mode?: BlockMode;
}

/**
 * Block or unblock a contact.
 *
 * @param id      Contact.
 * @param blocked Block (true) or unblock.
 * @param version Contact version (If-Match); fetched first when unknown.
 * @param details Reason, channels and mode (blocking only).
 */
export async function setContactBlocked(
	id: number,
	blocked: boolean,
	version: number | null,
	details: BlockInput = {}
): Promise< Contact > {
	let v = version;
	if ( v === null ) {
		v =
			( await api.get< Contact >( `contacts/${ id }` ) ).data?.version ??
			null;
	}
	return (
		await api.post< Contact >( `contacts/${ id }/block`, {
			body: blocked ? { blocked: true, ...details } : { blocked: false },
			...( v !== null ? { ifMatch: versionTag( v ) } : {} ),
		} )
	).data;
}

/**
 * Mode label.
 *
 * @param mode Mode.
 */
export function blockModeLabel( mode: string ): string {
	return mode === 'drop'
		? __( 'Drop', 'cliedesk' )
		: __( 'Spam silently', 'cliedesk' );
}
