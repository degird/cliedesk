/**
 * Attachment previews (INB-37): images as thumbnails that open in a lightbox with zoom up to 5×, PDFs in a preview
 * dialog, audio and video with players. Links are the short-lived signed file URLs.
 */
import { Button, Modal } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import type { MessageFile } from '../../inbox/api';

export const MAX_ZOOM = 5;

export type PreviewKind = 'image' | 'pdf' | 'audio' | 'video' | null;

/** What kind of preview a file gets. */
export function previewKind( mime: string ): PreviewKind {
	if ( /^image\/(jpeg|png|gif|webp)$/.test( mime ) ) {
		return 'image';
	}
	if ( mime === 'application/pdf' ) {
		return 'pdf';
	}
	if ( /^audio\/(mpeg|ogg|wav|webm)$/.test( mime ) ) {
		return 'audio';
	}
	if ( /^video\/(mp4|webm|ogg)$/.test( mime ) ) {
		return 'video';
	}
	return null;
}

function Lightbox( {
	file,
	onClose,
}: {
	file: MessageFile;
	onClose: () => void;
} ) {
	const [ zoom, setZoom ] = useState( 1 );
	return (
		<Modal
			isOpen
			size="lg"
			title={ file.name }
			onOpenChange={ ( open ) => ! open && onClose() }
			footer={
				<>
					<Button
						isDisabled={ zoom <= 1 }
						onPress={ () =>
							setZoom( ( z ) => Math.max( 1, z - 1 ) )
						}
					>
						{ __( 'Zoom out', 'cliedesk' ) }
					</Button>
					<span className="cd-tabular text-sm" aria-live="polite">
						{ sprintf(
							/* translators: %d: zoom factor. */
							__( '%d×', 'cliedesk' ),
							zoom
						) }
					</span>
					<Button
						isDisabled={ zoom >= MAX_ZOOM }
						onPress={ () =>
							setZoom( ( z ) => Math.min( MAX_ZOOM, z + 1 ) )
						}
					>
						{ __( 'Zoom in', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="max-h-[70vh] overflow-auto">
				<img
					src={ file.url ?? '' }
					alt={ file.name }
					style={ { width: `${ zoom * 100 }%`, maxWidth: 'none' } }
				/>
			</div>
		</Modal>
	);
}

/**
 * Preview of one file.
 *
 * @param props      Props.
 * @param props.file File.
 */
export function FilePreview( { file }: { file: MessageFile } ) {
	const [ open, setOpen ] = useState( false );
	const kind = previewKind( file.mime );
	if ( ! file.url || ! kind ) {
		return null;
	}
	if ( kind === 'audio' ) {
		return (
			<audio
				controls
				preload="none"
				src={ file.url }
				aria-label={ file.name }
			>
				<track kind="captions" />
			</audio>
		);
	}
	if ( kind === 'video' ) {
		return (
			<video
				controls
				preload="metadata"
				src={ file.url }
				aria-label={ file.name }
				className="max-h-64 max-w-full rounded-md"
			>
				<track kind="captions" />
			</video>
		);
	}
	return (
		<>
			{ kind === 'image' ? (
				<button
					type="button"
					onClick={ () => setOpen( true ) }
					className="rounded-md outline-none focus-visible:outline-2 focus-visible:outline-focus"
					aria-label={ sprintf(
						/* translators: %s: file name. */
						__( 'View %s', 'cliedesk' ),
						file.name
					) }
				>
					<img
						src={ file.url }
						alt=""
						className="max-h-28 max-w-[12rem] rounded-md border border-line object-cover"
					/>
				</button>
			) : (
				<Button size="sm" onPress={ () => setOpen( true ) }>
					{ __( 'Preview', 'cliedesk' ) }
				</Button>
			) }
			{ open && kind === 'image' && (
				<Lightbox file={ file } onClose={ () => setOpen( false ) } />
			) }
			{ open && kind === 'pdf' && (
				<Modal
					isOpen
					size="lg"
					title={ file.name }
					onOpenChange={ ( o ) => ! o && setOpen( false ) }
				>
					<iframe
						title={ file.name }
						src={ file.url }
						className="h-[70vh] w-full rounded-md border border-line"
					/>
				</Modal>
			) }
		</>
	);
}
