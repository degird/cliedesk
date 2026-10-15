/**
 * Settings → Help center → Files as knowledge (KB-28): PDF, Word, Excel, CSV, TXT and Markdown files kept privately;
 * agents find their text next to help articles. Scanned PDFs without text are flagged.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useId } from 'react';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface KnowledgeFile {
	id: number;
	name: string;
	size: number;
	status: 'indexed' | 'no_text' | 'pending' | 'failed';
	uploadedAt: string;
}

const KEY = [ 'knowledge', 'files' ] as const;

/**
 * A file as base64.
 *
 * @param file File.
 */
export function toBase64( file: File ): Promise< string > {
	return file.arrayBuffer().then( ( buf ) => {
		let bin = '';
		const bytes = new Uint8Array( buf );
		for ( let i = 0; i < bytes.length; i += 0x8000 ) {
			bin += String.fromCharCode( ...bytes.subarray( i, i + 0x8000 ) );
		}
		return window.btoa( bin );
	} );
}

/**
 * What a file's status means for agents (KB-28: the text is read by a background job).
 *
 * @param f File.
 */
export function fileStatus( f: KnowledgeFile ): string {
	if ( f.status === 'indexed' ) {
		return sprintf(
			/* translators: %d: file size in KB. */
			__( '%d KB · text found', 'cliedesk' ),
			Math.max( 1, Math.round( f.size / 1024 ) )
		);
	}
	if ( f.status === 'pending' ) {
		return __(
			'Reading the text… (a background job, usually within a minute)',
			'cliedesk'
		);
	}
	return __(
		'No text found (a scanned file?). Agents will not find it.',
		'cliedesk'
	);
}
const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md,.markdown';

export function FileKnowledge() {
	const inputId = useId();
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: KnowledgeFile[] } >(
					'knowledge/files',
					{
						signal,
					}
				)
			).data?.items ?? [],
	} );
	const refresh = () => void qc.invalidateQueries( { queryKey: KEY } );
	const upload = useMutation( {
		mutationFn: async ( { files, id }: { files: File[]; id?: number } ) => {
			for ( const f of files ) {
				await api.post< KnowledgeFile >(
					id ? `knowledge/files/${ id }` : 'knowledge/files',
					{ body: { name: f.name, data: await toBase64( f ) } }
				);
			}
			return files.length;
		},
		onSuccess: ( n ) => {
			announceResult(
				sprintf(
					/* translators: %d: number of files. */
					__( 'Saved: %d files are now knowledge.', 'cliedesk' ),
					n
				)
			);
		},
		onSettled: refresh,
	} );
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `knowledge/files/${ id }` ),
		onSuccess: refresh,
	} );
	const list = Array.isArray( q.data ) ? q.data : [];
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
			<h2 className="text-base font-semibold">
				{ __( 'Files as knowledge', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Manuals, price lists or policies: agents find their text next to help articles. Files stay private and are never shown to visitors.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ upload.error ?? remove.error } />
			{ list.length > 0 && (
				<ul className="flex flex-col divide-y divide-line">
					{ list.map( ( f ) => (
						<li
							key={ f.id }
							className="flex flex-wrap items-center gap-2 py-2 text-sm"
						>
							<span className="min-w-0 flex-1 break-all">
								{ f.name }
								<span className="block text-fg-muted">
									{ fileStatus( f ) }
								</span>
							</span>
							<label
								htmlFor={ `${ inputId }-${ f.id }` }
								className="cursor-pointer rounded-md border border-line px-2 py-1 text-xs"
							>
								{ __( 'Replace', 'cliedesk' ) }
								<input
									id={ `${ inputId }-${ f.id }` }
									type="file"
									accept={ ACCEPT }
									className="sr-only"
									aria-label={ sprintf(
										/* translators: %s: file name. */
										__( 'Replace %s', 'cliedesk' ),
										f.name
									) }
									onChange={ ( e ) =>
										e.target.files?.[ 0 ] &&
										upload.mutate( {
											files: [ e.target.files[ 0 ] ],
											id: f.id,
										} )
									}
								/>
							</label>
							<Button
								size="sm"
								variant="ghost"
								onPress={ () => remove.mutate( f.id ) }
							>
								{ __( 'Remove', 'cliedesk' ) }
							</Button>
						</li>
					) ) }
				</ul>
			) }
			<div>
				<label htmlFor={ inputId } className="text-sm font-medium">
					{ __(
						'Add files (PDF, Word, Excel, CSV, TXT, Markdown; 5 MB each)',
						'cliedesk'
					) }
				</label>
				<input
					id={ inputId }
					type="file"
					multiple
					accept={ ACCEPT }
					disabled={ upload.isPending }
					className="mt-1 block text-sm"
					onChange={ ( e ) =>
						upload.mutate( {
							files: Array.from( e.target.files ?? [] ).slice(
								0,
								20
							),
						} )
					}
				/>
			</div>
		</section>
	);
}
