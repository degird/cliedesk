/**
 * Inbox sidebar → Live now (INB-25): open real-time conversations (chat, WhatsApp, Messenger, voice) apart from
 * email work, with the customer's state (online, typing). Refreshed every 10 seconds; an ended chat leaves the list.
 * Typing and online customers come first; the first few show, the rest behind "Show all".
 */
import { api, useQuery } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';

interface LiveItem {
	id: number;
	number: number;
	subject: string;
	channel: string;
	assigneeId: number | null;
	online: boolean;
	typing: boolean;
	lastAt: string | null;
}

export const LIVE_POLL_MS = 10_000;
/** Rows shown before "Show all". */
export const LIVE_SHOWN = 5;

function rank( c: LiveItem ): number {
	if ( c.typing ) {
		return 0;
	}
	return c.online ? 1 : 2;
}

export function LiveNow() {
	const q = useQuery( {
		queryKey: [ 'inbox', 'live' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: LiveItem[] } >( 'inbox/live', {
					signal,
				} )
			).data?.items ?? [],
		refetchInterval: LIVE_POLL_MS,
	} );
	const [ all, setAll ] = useState( false );
	const items = q.data ?? [];
	if ( items.length === 0 ) {
		return null;
	}
	const sorted = [ ...items ].sort( ( a, b ) => rank( a ) - rank( b ) );
	const shown = all ? sorted : sorted.slice( 0, LIVE_SHOWN );
	return (
		<section aria-labelledby="cd-live-now" className="flex flex-col gap-1">
			<h2
				id="cd-live-now"
				className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-fg-muted"
			>
				<span
					aria-hidden="true"
					className="inline-block size-2 rounded-full bg-success"
				/>
				{ sprintf(
					/* translators: %d: number of live conversations. */
					__( 'Live now (%d)', 'cliedesk' ),
					items.length
				) }
			</h2>
			<ul id="cd-live-list" className="flex flex-col gap-0.5">
				{ shown.map( ( c ) => {
					let state: string = __( 'Away', 'cliedesk' );
					if ( c.typing ) {
						state = __( 'Typing…', 'cliedesk' );
					} else if ( c.online ) {
						state = __( 'Online', 'cliedesk' );
					}
					return (
						<li key={ c.id }>
							<Link
								to="/c/$number"
								params={ { number: String( c.number ) } }
								className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
							>
								<span
									aria-hidden="true"
									className={ `inline-block size-2 shrink-0 rounded-full ${
										c.online
											? 'bg-success'
											: 'bg-line-strong'
									}` }
								/>
								<span className="min-w-0 flex-1 truncate">
									{ c.subject ||
										sprintf(
											/* translators: %d: conversation number. */
											__( 'Chat #%d', 'cliedesk' ),
											c.number
										) }
								</span>
								<span className="shrink-0 text-xs text-fg-muted">
									{ state }
								</span>
							</Link>
						</li>
					);
				} ) }
			</ul>
			{ items.length > LIVE_SHOWN && (
				<Button
					variant="link"
					size="sm"
					className="self-start px-2"
					aria-expanded={ all }
					aria-controls="cd-live-list"
					onPress={ () => setAll( ( x ) => ! x ) }
				>
					{ all
						? __( 'Show fewer', 'cliedesk' )
						: sprintf(
								/* translators: %d: number of live conversations. */
								__( 'Show all (%d)', 'cliedesk' ),
								items.length
							) }
				</Button>
			) }
		</section>
	);
}
