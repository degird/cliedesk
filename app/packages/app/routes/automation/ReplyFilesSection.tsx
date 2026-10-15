/**
 * Files of a saved reply (MAC-01): attached to every reply or note that uses it (each conversation gets its own
 * copy). Same type and size rules as message attachments.
 *
 * - GET saved-replies/{id}/files → {items: [{id, name, mime, size}]}
 * - POST saved-replies/{id}/files (multipart `file`) → {id, name, mime, size}
 * - DELETE saved-replies/{id}/files/{fileId} → {items}
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Banner, Button } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useRef, useState } from 'react';
import { actionMessage } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface ReplyFile {
	id: number;
	name: string;
	mime: string;
	size: number;
}

/**
 * Files section of the saved reply editor.
 *
 * @param props          Props.
 * @param props.replyId  Saved reply.
 * @param props.editable The person may change the reply.
 */
export function ReplyFilesSection( {
	replyId,
	editable,
}: {
	replyId: number;
	editable: boolean;
} ) {
	const qc = useQueryClient();
	const input = useRef< HTMLInputElement >( null );
	const [ error, setError ] = useState< string | null >( null );
	const key = [ 'saved-replies', 'files', replyId ];
	const q = useQuery( {
		queryKey: key,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: ReplyFile[] } >(
					`saved-replies/${ replyId }/files`,
					{ signal }
				)
			).data?.items ?? [],
	} );
	const upload = useMutation( {
		mutationFn: async ( file: File ) => {
			const form = new FormData();
			form.append( 'file', file, file.name );
			return api.post< ReplyFile >( `saved-replies/${ replyId }/files`, {
				body: form,
			} );
		},
		onSuccess: ( _, file ) => {
			setError( null );
			announceResult(
				sprintf(
					/* translators: %s: file name. */
					__( '%s added.', 'cliedesk' ),
					file.name
				)
			);
			void qc.invalidateQueries( { queryKey: key } );
		},
		onError: ( e, file ) =>
			setError(
				sprintf(
					/* translators: 1: file name, 2: reason. */
					__( '%1$s was not added: %2$s', 'cliedesk' ),
					file.name,
					actionMessage( e )
				)
			),
	} );
	const remove = useMutation( {
		mutationFn: ( file: ReplyFile ) =>
			api.del( `saved-replies/${ replyId }/files/${ file.id }` ),
		onSuccess: () => void qc.invalidateQueries( { queryKey: key } ),
	} );
	const files = q.data ?? [];
	return (
		<section
			aria-labelledby={ `cd-reply-files-${ replyId }` }
			className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
		>
			<h2
				id={ `cd-reply-files-${ replyId }` }
				className="text-base font-semibold"
			>
				{ __( 'Files', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Sent with every reply or note that uses this saved reply.',
					'cliedesk'
				) }
			</p>
			{ error && <Banner tone="danger" role="alert" title={ error } /> }
			{ files.length > 0 && (
				<ul className="flex flex-col gap-1 text-sm">
					{ files.map( ( f ) => (
						<li key={ f.id } className="flex items-center gap-2">
							<span className="min-w-0 flex-1 truncate">
								{ f.name }
							</span>
							<span className="text-fg-muted">
								{ sprintf(
									/* translators: %d: size in kilobytes. */
									__( '%d KB', 'cliedesk' ),
									Math.max( 1, Math.round( f.size / 1024 ) )
								) }
							</span>
							{ editable && (
								<Button
									size="sm"
									variant="ghost"
									onPress={ () => remove.mutate( f ) }
									aria-label={ sprintf(
										/* translators: %s: file name. */
										__( 'Remove %s', 'cliedesk' ),
										f.name
									) }
								>
									{ __( 'Remove', 'cliedesk' ) }
								</Button>
							) }
						</li>
					) ) }
				</ul>
			) }
			{ editable && (
				<>
					<Button
						size="sm"
						isLoading={ upload.isPending }
						onPress={ () => input.current?.click() }
					>
						{ __( 'Add a file', 'cliedesk' ) }
					</Button>
					<input
						ref={ input }
						type="file"
						className="sr-only"
						tabIndex={ -1 }
						aria-label={ __( 'File to add', 'cliedesk' ) }
						onChange={ ( e ) => {
							const f = e.target.files?.[ 0 ];
							if ( f ) {
								upload.mutate( f );
							}
							e.target.value = '';
						} }
					/>
				</>
			) }
		</section>
	);
}
