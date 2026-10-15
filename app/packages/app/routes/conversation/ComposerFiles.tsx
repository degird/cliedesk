/**
 * Files for a reply or note being written (SEC-20, CHN-47): each file is uploaded at once (POST /files) and sent with
 * the message as `attachmentIds`. Refused files show the server's reason. Large files reach email customers as links.
 */
import { api } from '@cliedesk/data';
import { IconButton, Spinner } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { actionMessage } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';
import { fileSize } from './Attachments';

export interface ComposerFile {
	id: number;
	name: string;
	size: number;
}

/**
 * State of the files of one composer.
 *
 * @param conversationId Conversation.
 */
export function useComposerFiles( conversationId: number ) {
	const [ files, setFiles ] = useState< ComposerFile[] >( [] );
	const [ uploading, setUploading ] = useState( 0 );
	const [ error, setError ] = useState< string | null >( null );
	const add = async ( list: FileList | File[] ) => {
		setError( null );
		for ( const file of Array.from( list ) ) {
			const form = new FormData();
			form.append( 'file', file, file.name );
			form.append( 'conversationId', String( conversationId ) );
			setUploading( ( n ) => n + 1 );
			try {
				const r = await api.post< ComposerFile >( 'files', {
					body: form,
				} );
				if ( r.data ) {
					setFiles( ( old ) => [ ...old, r.data ] );
					announceResult(
						sprintf(
							/* translators: %s: file name. */
							__( '%s attached.', 'cliedesk' ),
							file.name
						)
					);
				}
			} catch ( e ) {
				setError(
					sprintf(
						/* translators: 1: file name, 2: reason. */
						__( '%1$s was not attached: %2$s', 'cliedesk' ),
						file.name,
						actionMessage( e )
					)
				);
			} finally {
				setUploading( ( n ) => n - 1 );
			}
		}
	};
	return {
		files,
		uploading: uploading > 0,
		error,
		add,
		remove: ( id: number ) =>
			setFiles( ( old ) => old.filter( ( f ) => f.id !== id ) ),
		clear: () => {
			setFiles( [] );
			setError( null );
		},
	};
}

/**
 * Attach button of the composer toolbar.
 *
 * @param props       Props.
 * @param props.state useComposerFiles() result.
 */
export function AttachButton( {
	state,
}: {
	state: ReturnType< typeof useComposerFiles >;
} ) {
	const input = useRef< HTMLInputElement >( null );
	return (
		<>
			<input
				ref={ input }
				type="file"
				multiple
				hidden
				aria-hidden="true"
				tabIndex={ -1 }
				onChange={ ( e ) => {
					if ( e.target.files?.length ) {
						void state.add( e.target.files );
					}
					e.target.value = '';
				} }
			/>
			<IconButton
				label={ __( 'Attach files', 'cliedesk' ) }
				icon={
					state.uploading ? (
						<Spinner size={ 16 } />
					) : (
						<Paperclip size={ 16 } />
					)
				}
				isDisabled={ state.uploading }
				onPress={ () => input.current?.click() }
			/>
		</>
	);
}

/**
 * Attached files (with Remove) and the upload error.
 *
 * @param props       Props.
 * @param props.state useComposerFiles() result.
 */
export function ComposerFiles( {
	state,
}: {
	state: ReturnType< typeof useComposerFiles >;
} ) {
	if ( ! state.files.length && ! state.error ) {
		return null;
	}
	return (
		<div className="flex flex-col gap-1">
			{ state.files.length > 0 && (
				<ul
					aria-label={ __( 'Attached files', 'cliedesk' ) }
					className="flex flex-wrap gap-2"
				>
					{ state.files.map( ( f ) => (
						<li
							key={ f.id }
							className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-sm"
						>
							<bdi>{ f.name }</bdi>
							<span className="text-fg-muted">
								{ fileSize( f.size ) }
							</span>
							<IconButton
								size="sm"
								label={ sprintf(
									/* translators: %s: file name. */
									__( 'Remove %s', 'cliedesk' ),
									f.name
								) }
								icon={ <X size={ 12 } /> }
								onPress={ () => state.remove( f.id ) }
							/>
						</li>
					) ) }
				</ul>
			) }
			{ state.error && (
				<p role="alert" className="text-sm text-danger-fg">
					{ state.error }
				</p>
			) }
		</div>
	);
}
