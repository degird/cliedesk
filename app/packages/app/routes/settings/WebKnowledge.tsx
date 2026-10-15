/**
 * Settings → Help center → Web pages as knowledge (KB-29): a sitemap or a list of addresses, with address patterns to
 * keep or skip; fetch again by hand. Private and local addresses are refused.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface WebSource {
	id: string;
	kind: 'sitemap' | 'urls';
	urls: string[];
	include: string[];
	exclude: string[];
	syncedAt: string | null;
	pages: number;
	changed: number;
	failed: number;
}

const KEY = [ 'knowledge', 'web' ] as const;

const lines = ( v: string ) =>
	v
		.split( /\n+/ )
		.map( ( x ) => x.trim() )
		.filter( Boolean );

export function WebKnowledge() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: WebSource[] } >( 'knowledge/web', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const [ kind, setKind ] = useState< string >( 'sitemap' );
	const [ urls, setUrls ] = useState( '' );
	const [ include, setInclude ] = useState( '' );
	const [ exclude, setExclude ] = useState( '' );
	const refresh = () => void qc.invalidateQueries( { queryKey: KEY } );
	const add = useMutation( {
		mutationFn: () =>
			api.post< WebSource >( 'knowledge/web', {
				body: {
					kind,
					urls: lines( urls ),
					include: lines( include ),
					exclude: lines( exclude ),
				},
			} ),
		onSuccess: ( r ) => {
			setUrls( '' );
			announceResult(
				sprintf(
					/* translators: %d: number of pages. */
					__( 'Added: %d pages are now knowledge.', 'cliedesk' ),
					r.data.pages
				)
			);
			refresh();
		},
	} );
	const sync = useMutation( {
		mutationFn: ( id: string ) =>
			api.post< WebSource >( `knowledge/web/${ id }/sync`, { body: {} } ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: 1: pages, 2: changed pages. */
					__(
						'Fetched again: %1$d pages, %2$d changed.',
						'cliedesk'
					),
					r.data.pages,
					r.data.changed
				)
			);
			refresh();
		},
	} );
	const remove = useMutation( {
		mutationFn: ( id: string ) => api.del( `knowledge/web/${ id }` ),
		onSuccess: refresh,
	} );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		add.mutate();
	};
	const list = Array.isArray( q.data ) ? q.data : [];
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
			<h2 className="text-base font-semibold">
				{ __( 'Web pages as knowledge', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'An old docs site, store policies or a status page: agents find their text next to help articles. Fetch them again when they change.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ add.error ?? sync.error ?? remove.error } />
			{ list.length > 0 && (
				<ul className="flex flex-col divide-y divide-line">
					{ list.map( ( s ) => (
						<li
							key={ s.id }
							className="flex flex-wrap items-center gap-2 py-2 text-sm"
						>
							<span className="min-w-0 flex-1 break-all">
								{ s.urls[ 0 ] }
								{ s.urls.length > 1 &&
									` +${ s.urls.length - 1 }` }
								<span className="block text-fg-muted">
									{ sprintf(
										/* translators: 1: pages, 2: failed pages. */
										__(
											'%1$d pages, %2$d could not be read',
											'cliedesk'
										),
										s.pages,
										s.failed
									) }
								</span>
							</span>
							<Button
								size="sm"
								isLoading={
									sync.isPending && sync.variables === s.id
								}
								onPress={ () => sync.mutate( s.id ) }
							>
								{ __( 'Fetch again', 'cliedesk' ) }
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onPress={ () => remove.mutate( s.id ) }
							>
								{ __( 'Remove', 'cliedesk' ) }
							</Button>
						</li>
					) ) }
				</ul>
			) }
			<form
				noValidate
				onSubmit={ onSubmit }
				className="flex flex-col gap-3"
			>
				<Select
					label={ __( 'Add', 'cliedesk' ) }
					value={ kind }
					onChange={ setKind }
					options={ [
						{ id: 'sitemap', label: __( 'A sitemap', 'cliedesk' ) },
						{
							id: 'urls',
							label: __( 'Web addresses', 'cliedesk' ),
						},
					] }
				/>
				<TextField
					label={
						kind === 'sitemap'
							? __( 'Sitemap address', 'cliedesk' )
							: __( 'Addresses (one per line)', 'cliedesk' )
					}
					multiline={ kind === 'urls' }
					rows={ kind === 'urls' ? 4 : undefined }
					value={ urls }
					onChange={ setUrls }
				/>
				{ kind === 'sitemap' && (
					<div className="grid gap-3 sm:grid-cols-2">
						<TextField
							label={ __(
								'Only addresses like (one per line)',
								'cliedesk'
							) }
							description={ __(
								'For example */docs/*',
								'cliedesk'
							) }
							multiline
							rows={ 2 }
							value={ include }
							onChange={ setInclude }
						/>
						<TextField
							label={ __(
								'Skip addresses like (one per line)',
								'cliedesk'
							) }
							multiline
							rows={ 2 }
							value={ exclude }
							onChange={ setExclude }
						/>
					</div>
				) }
				<div>
					<Button
						type="submit"
						isLoading={ add.isPending }
						isDisabled={ ! urls.trim() }
					>
						{ __( 'Add and fetch', 'cliedesk' ) }
					</Button>
				</div>
			</form>
		</section>
	);
}
