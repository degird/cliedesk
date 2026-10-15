/**
 * Settings → Health → Hooks (DEV-07): the documented Cliedesk actions and filters, loaded when opened. With WP_DEBUG
 * on, each hook also lists the callbacks attached to it.
 *
 * - GET system/hooks → {items: [{name, type, summary, params, callbacks?: [{priority, callback}]}], debug}.
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { Muted } from '../../inbox/components';

interface Hook {
	name: string;
	type: 'action' | 'filter';
	summary: string;
	params: string[];
	callbacks?: Array< { priority: number; callback: string } >;
}

function Hooks() {
	const [ search, setSearch ] = useState( '' );
	const q = useQuery( {
		queryKey: [ 'system', 'hooks' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Hook[]; debug: boolean } >(
					'system/hooks',
					{ signal }
				)
			).data ?? { items: [], debug: false },
	} );
	if ( q.isPending ) {
		return <LoadingRegion label={ __( 'Loading hooks…', 'cliedesk' ) } />;
	}
	if ( q.isError ) {
		return (
			<Muted>
				{ __( 'The hooks could not be loaded.', 'cliedesk' ) }
			</Muted>
		);
	}
	const term = search.trim().toLowerCase();
	const items = q.data.items.filter(
		( h ) =>
			! term ||
			h.name.includes( term ) ||
			h.summary.toLowerCase().includes( term )
	);
	return (
		<div className="flex flex-col gap-3">
			<Muted>
				{ q.data.debug
					? __(
							'Debug mode is on: each hook lists the callbacks attached to it, in run order.',
							'cliedesk'
						)
					: __(
							'Turn on WP_DEBUG to see the callbacks attached to each hook.',
							'cliedesk'
						) }
			</Muted>
			<TextField
				label={ __( 'Search hooks', 'cliedesk' ) }
				type="search"
				value={ search }
				onChange={ setSearch }
			/>
			<ul className="flex flex-col divide-y divide-line">
				{ items.map( ( h ) => (
					<li key={ h.name } className="flex flex-col gap-1 py-2">
						<code className="text-sm font-semibold">
							{ h.name }{ ' ' }
							<span className="font-normal text-fg-muted">
								{ h.type === 'action'
									? __( 'action', 'cliedesk' )
									: __( 'filter', 'cliedesk' ) }
							</span>
						</code>
						<span className="text-sm">{ h.summary }</span>
						{ h.params.length > 0 && (
							<code className="text-xs text-fg-muted">
								{ h.params.join( ', ' ) }
							</code>
						) }
						{ h.callbacks && (
							<span className="text-xs text-fg-muted">
								{ h.callbacks.length
									? h.callbacks
											.map(
												( c ) =>
													`${ c.priority }: ${ c.callback }`
											)
											.join( ' · ' )
									: __( 'Nothing attached.', 'cliedesk' ) }
							</span>
						) }
					</li>
				) ) }
			</ul>
			<Muted>
				{ sprintf(
					/* translators: %d: number of hooks. */
					__( '%d hooks', 'cliedesk' ),
					items.length
				) }
			</Muted>
		</div>
	);
}

export function HooksList() {
	const [ open, setOpen ] = useState( false );
	return (
		<details
			className="rounded-lg border border-line bg-surface p-4"
			onToggle={ ( e ) => setOpen( e.currentTarget.open ) }
		>
			<summary className="cursor-pointer font-semibold">
				{ __( 'Hooks for developers', 'cliedesk' ) }
			</summary>
			{ open && (
				<div className="pt-3">
					<Hooks />
				</div>
			) }
		</details>
	);
}
