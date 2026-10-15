/**
 * Apps in the sidebar (DEV-19, DEV-21): the admin's link buttons, then the panels other plugins registered, loaded
 * when the sidebar shows them. Each panel shows its card, or its own error without affecting the others.
 *
 * - GET link-buttons/for?entity&entityId → {items: [{key, label, url}]}; POST link-buttons/open logs a use.
 * - GET context-panels?entity=conversation|contact&entityId → {items: [{key, title, card? , error?}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';
import { ExternalLink } from 'lucide-react';
import { CardView, type Card, type CardSubject } from './CardView';

interface Panel {
	key: string;
	title: string;
	card?: Card;
	error?: string;
}

interface Link {
	key: string;
	label: string;
	url: string;
}

function LinkButtons( { entity, entityId }: CardSubject ) {
	const q = useQuery( {
		queryKey: [ 'link-buttons', entity, entityId ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Link[] } >( 'link-buttons/for', {
					query: { entity, entityId },
					signal,
				} )
			).data?.items ?? [],
		staleTime: 60_000,
		retry: false,
	} );
	const links = q.data ?? [];
	if ( links.length === 0 ) {
		return null;
	}
	return (
		<ul
			aria-label={ __( 'Links', 'cliedesk' ) }
			className="flex flex-wrap gap-2"
		>
			{ links.map( ( l ) => (
				<li key={ l.key }>
					<a
						href={ l.url }
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-sm hover:bg-sunken"
						onClick={ () =>
							void api
								.post( 'link-buttons/open', {
									body: { entity, entityId, key: l.key },
								} )
								.catch( () => undefined )
						}
					>
						{ l.label }
						<ExternalLink aria-hidden="true" size={ 14 } />
					</a>
				</li>
			) ) }
		</ul>
	);
}

export default function AppPanels( { entity, entityId }: CardSubject ) {
	const q = useQuery( {
		queryKey: [ 'context-panels', entity, entityId ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Panel[] } >( 'context-panels', {
					query: { entity, entityId },
					signal,
				} )
			).data?.items ?? [],
		staleTime: 60_000,
		retry: false,
	} );
	const panels = q.data ?? [];
	return (
		<div className="flex flex-col gap-3 border-t border-line py-3 empty:hidden">
			<LinkButtons entity={ entity } entityId={ entityId } />
			{ panels.map( ( p ) => (
				<section
					key={ p.key }
					aria-labelledby={ `cd-app-${ p.key }` }
					className="flex flex-col gap-2"
				>
					<h3
						id={ `cd-app-${ p.key }` }
						className="text-sm font-semibold"
					>
						{ p.title }
					</h3>
					{ p.card ? (
						<CardView
							card={ p.card }
							subject={ { entity, entityId } }
						/>
					) : (
						<p role="alert" className="text-sm text-danger">
							{ p.error ??
								__( 'This panel could not load.', 'cliedesk' ) }
						</p>
					) }
				</section>
			) ) }
		</div>
	);
}
