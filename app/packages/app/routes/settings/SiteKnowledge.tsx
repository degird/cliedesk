/**
 * Settings → Help center → Knowledge from your site (KB-26): post types and single pages agents find next to help
 * articles in the inbox (read-only; the public help center keeps showing articles only).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Overview {
	postTypes: string[];
	pageIds: number[];
	availableTypes: Array< { key: string; label: string } >;
	availablePages: Array< { id: number; title: string } >;
	counts: Record< string, Record< string, number > >;
}

const KEY = [ 'knowledge', 'sources' ] as const;

export function SiteKnowledge() {
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< Overview >( 'knowledge/sources', { signal } ) )
				.data,
	} );
	if ( ! q.data ) {
		return null;
	}
	return (
		<SiteForm
			key={ JSON.stringify( [ q.data.postTypes, q.data.pageIds ] ) }
			data={ q.data }
		/>
	);
}

function SiteForm( { data }: { data: Overview } ) {
	const qc = useQueryClient();
	const [ types, setTypes ] = useState< string[] >( data.postTypes ?? [] );
	const [ pages, setPages ] = useState< number[] >( data.pageIds ?? [] );
	const save = useMutation( {
		mutationFn: () =>
			api.put< { indexed: number } >( 'knowledge/sources/site', {
				body: { postTypes: types, pageIds: pages },
			} ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %d: number of pages and posts. */
					_n(
						'%d item is now knowledge.',
						'%d items are now knowledge.',
						r.data.indexed,
						'cliedesk'
					),
					r.data.indexed
				)
			);
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const toggle = < T, >( list: T[], v: T, on: boolean ): T[] =>
		on ? [ ...list, v ] : list.filter( ( x ) => x !== v );
	const indexed = data.counts?.site?.indexed ?? 0;
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
			<h2 className="text-base font-semibold">
				{ __( 'Knowledge from your site', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ sprintf(
					/* translators: %d: number of pages and posts. */
					__(
						'Agents find these next to help articles. They stay as they are; customers see only articles in the help center. Now: %d.',
						'cliedesk'
					),
					indexed
				) }
			</p>
			<ActionError error={ save.error } />
			<fieldset className="flex flex-wrap gap-4">
				<legend className="pb-1 text-sm font-medium">
					{ __( 'All published items of', 'cliedesk' ) }
				</legend>
				{ ( data.availableTypes ?? [] ).map( ( t ) => (
					<Checkbox
						key={ t.key }
						isSelected={ types.includes( t.key ) }
						onChange={ ( on ) =>
							setTypes( toggle( types, t.key, on ) )
						}
					>
						{ t.label }
					</Checkbox>
				) ) }
			</fieldset>
			{ ( data.availablePages ?? [] ).length > 0 && (
				<fieldset className="flex max-h-48 flex-col gap-1 overflow-auto">
					<legend className="pb-1 text-sm font-medium">
						{ __( 'Or single pages', 'cliedesk' ) }
					</legend>
					{ data.availablePages.map( ( p ) => (
						<Checkbox
							key={ p.id }
							isSelected={ pages.includes( p.id ) }
							onChange={ ( on ) =>
								setPages( toggle( pages, p.id, on ) )
							}
						>
							{ p.title }
						</Checkbox>
					) ) }
				</fieldset>
			) }
			<div>
				<Button
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save site knowledge', 'cliedesk' ) }
				</Button>
			</div>
		</section>
	);
}
