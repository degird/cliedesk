/**
 * TEAM-21: the customer's custom records in the portal, read-only: their own records and, for record types with the
 * organization view, those of their organizations. Only fields marked visible to customers come from the server.
 * Signed-in customers use the REST nonce; guests who verified their email send their 30-minute token
 * (X-Cliedesk-Guest). Without access (for example a magic link to one request) the section stays hidden.
 */
import { useEffect, useState } from 'react';
import type { PortalConfig } from './portal';
import { widgetUrl } from './url';

export interface PortalRecord {
	id: number;
	type: string;
	typeName: string;
	title: string;
	mine: boolean;
	fields: Array< { key: string; title: string; value: unknown } >;
	updatedAt: string;
}

const GUEST = 'cliedesk-portal-guest';

/**
 * The customer's records from the server; null when they may not see any.
 *
 * @param config Portal config.
 */
export async function loadRecords(
	config: PortalConfig
): Promise< PortalRecord[] | null > {
	const headers: Record< string, string > = { Accept: 'application/json' };
	if ( config.nonce ) {
		headers[ 'X-WP-Nonce' ] = config.nonce;
	}
	try {
		const guest = window.sessionStorage.getItem( GUEST );
		if ( guest ) {
			headers[ 'X-Cliedesk-Guest' ] = guest;
		}
	} catch {
		// No storage: signed-in customers only.
	}
	const r = await fetch(
		widgetUrl(
			config.api,
			'portal/records',
			config.lang ? { lang: config.lang } : {}
		),
		{ method: 'GET', headers, credentials: 'same-origin' }
	);
	if ( r.status === 401 || r.status === 403 ) {
		return null;
	}
	const json = await r.json().catch( () => ( {} ) );
	if ( ! r.ok ) {
		throw new Error( json?.message ?? String( r.status ) );
	}
	return ( json?.data?.items ?? [] ) as PortalRecord[];
}

/**
 * A field value as text.
 *
 * @param value Value.
 */
function text( value: unknown ): string {
	if ( null === value || undefined === value ) {
		return '';
	}
	if ( typeof value === 'boolean' ) {
		return value ? '✓' : '✗';
	}
	return Array.isArray( value ) ? value.join( ', ' ) : String( value );
}

/**
 * Records grouped by type, in the order they came.
 *
 * @param items Records.
 */
export function byType(
	items: PortalRecord[]
): Array< { type: string; name: string; items: PortalRecord[] } > {
	const groups: Array< {
		type: string;
		name: string;
		items: PortalRecord[];
	} > = [];
	items.forEach( ( item ) => {
		let group = groups.find( ( g ) => g.type === item.type );
		if ( ! group ) {
			group = { type: item.type, name: item.typeName, items: [] };
			groups.push( group );
		}
		group.items.push( item );
	} );
	return groups;
}

export default function RecordsList( { config }: { config: PortalConfig } ) {
	const t = config.records?.texts ?? {};
	const [ items, setItems ] = useState< PortalRecord[] | null | undefined >(
		undefined
	);
	const [ failed, setFailed ] = useState( false );
	useEffect( () => {
		let live = true;
		loadRecords( config )
			.then( ( list ) => live && setItems( list ) )
			.catch( () => live && setFailed( true ) );
		return () => {
			live = false;
		};
	}, [ config ] );
	if ( items === null ) {
		return null;
	}
	return (
		<section className="cdp-records" aria-labelledby="cdp-records-title">
			<h2 id="cdp-records-title">{ t.title }</h2>
			{ failed && <p role="alert">{ t.error }</p> }
			{ ! failed && items === undefined && <p>{ t.loading }</p> }
			{ items?.length === 0 && <p>{ t.empty }</p> }
			{ items &&
				byType( items ).map( ( group ) => (
					<div key={ group.type }>
						<h3>{ group.name }</h3>
						<ul className="cdp-list">
							{ group.items.map( ( record ) => (
								<li key={ record.id } className="cdp-item">
									<div>
										<strong>{ record.title }</strong>
										{ ! record.mine && t.org && (
											<span> · { t.org }</span>
										) }
									</div>
									{ record.fields.length > 0 && (
										<dl>
											{ record.fields.map( ( f ) => (
												<div key={ f.key }>
													<dt>{ f.title }</dt>
													<dd>{ text( f.value ) }</dd>
												</div>
											) ) }
										</dl>
									) }
								</li>
							) ) }
						</ul>
					</div>
				) ) }
		</section>
	);
}
