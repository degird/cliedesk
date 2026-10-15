/**
 * Image picker over GET /media/images (brand logos, product icons). Images are chosen from the WordPress
 * media library; uploading happens in WordPress (Media), so the picker links there.
 */
import { getBoot, isApiError, useQuery, wpAdminUrl } from '@cliedesk/data';
import {
	Button,
	EmptyState,
	ErrorState,
	LoadingRegion,
	Modal,
	TextField,
	UnstyledButton,
	cx,
	focusRing,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ExternalLink, ImageIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { describeError } from '../components/RouteError';
import { mediaImageQuery, mediaImagesQuery, type MediaImage } from './api';

const PER_PAGE = 40;

/** URL of Media → Library in wp-admin (from the boot payload's `rest.adminUrl`). */
export function mediaLibraryUrl(): string | null {
	return getBoot().rest.adminUrl ? wpAdminUrl( 'upload.php' ) : null;
}

function MediaLink() {
	const url = mediaLibraryUrl();
	const text = __( 'Add images under Media in WordPress', 'cliedesk' );
	if ( ! url ) {
		return <p className="text-sm text-fg-muted">{ text }</p>;
	}
	return (
		<a
			href={ url }
			target="_blank"
			rel="noreferrer noopener"
			className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
		>
			{ text }
			<ExternalLink aria-hidden="true" size={ 14 } />
			<span className="sr-only">
				{ __( '(opens in a new tab)', 'cliedesk' ) }
			</span>
		</a>
	);
}

/**
 * Small preview of an attachment by id.
 *
 * @param props    Props.
 * @param props.id Attachment id.
 */
export function ImagePreview( { id }: { id: number | null } ) {
	const q = useQuery( { ...mediaImageQuery( id ?? 0 ), enabled: !! id } );
	const box =
		'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-sunken';
	if ( ! id ) {
		return (
			<span className={ box }>
				<ImageIcon
					aria-hidden="true"
					size={ 20 }
					className="text-fg-subtle"
				/>
			</span>
		);
	}
	const img = q.data;
	return (
		<span className={ box }>
			{ img?.thumbnail ? (
				<img
					src={ img.thumbnail }
					alt={ img.alt || img.title }
					className="size-full object-contain"
				/>
			) : (
				<ImageIcon
					aria-hidden="true"
					size={ 20 }
					className="text-fg-subtle"
				/>
			) }
		</span>
	);
}

/**
 * Label of an attachment for text ("logo.png" or "Image #12").
 *
 * @param props    Props.
 * @param props.id Attachment id.
 */
export function ImageName( { id }: { id: number | null } ) {
	const q = useQuery( { ...mediaImageQuery( id ?? 0 ), enabled: !! id } );
	if ( ! id ) {
		return <>{ __( 'No image', 'cliedesk' ) }</>;
	}
	return (
		<>
			{ q.data?.title ||
				sprintf(
					/* translators: %d: media library attachment id. */
					__( 'Image #%d', 'cliedesk' ),
					id
				) }
		</>
	);
}

function PickerDialog( {
	isOpen,
	onOpenChange,
	title,
	selected,
	onPick,
}: {
	isOpen: boolean;
	onOpenChange: ( open: boolean ) => void;
	title: string;
	selected: number | null;
	onPick: ( img: MediaImage ) => void;
} ) {
	const [ search, setSearch ] = useState( '' );
	const [ debounced, setDebounced ] = useState( '' );
	const [ page, setPage ] = useState( 1 );
	useEffect( () => {
		const t = window.setTimeout( () => {
			setDebounced( search.trim() );
			setPage( 1 );
		}, 300 );
		return () => window.clearTimeout( t );
	}, [ search ] );
	const q = useQuery( {
		...mediaImagesQuery( debounced, page ),
		enabled: isOpen,
	} );
	const pages = Math.max( 1, Math.ceil( ( q.data?.total ?? 0 ) / PER_PAGE ) );

	let body;
	if ( q.isPending ) {
		body = <LoadingRegion label={ __( 'Loading images…', 'cliedesk' ) } />;
	} else if ( q.isError ) {
		body = (
			<ErrorState
				headingLevel={ 3 }
				title={ __( 'Could not load the images', 'cliedesk' ) }
				message={ describeError( q.error ) }
				code={ isApiError( q.error ) ? q.error.code : null }
				requestId={ isApiError( q.error ) ? q.error.requestId : null }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.images.length ) {
		body = (
			<EmptyState
				headingLevel={ 3 }
				title={
					debounced
						? __( 'No images match this search', 'cliedesk' )
						: __(
								'The media library has no images yet',
								'cliedesk'
							)
				}
				actions={ <MediaLink /> }
			/>
		);
	} else {
		body = (
			<ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
				{ q.data.images.map( ( img ) => (
					<li key={ img.id }>
						<UnstyledButton
							onPress={ () => onPick( img ) }
							aria-pressed={ img.id === selected }
							className={ cx(
								'flex w-full flex-col items-center gap-1 rounded-md border p-1 text-xs text-fg data-[hovered]:bg-sunken',
								img.id === selected
									? 'border-accent bg-accent-subtle'
									: 'border-line',
								focusRing
							) }
						>
							<span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm bg-sunken">
								{ img.thumbnail ? (
									<img
										src={ img.thumbnail }
										alt=""
										className="size-full object-cover"
									/>
								) : (
									<ImageIcon aria-hidden="true" size={ 20 } />
								) }
							</span>
							<span className="w-full truncate">
								{ img.title ||
									sprintf(
										/* translators: %d: media library attachment id. */
										__( 'Image #%d', 'cliedesk' ),
										img.id
									) }
							</span>
						</UnstyledButton>
					</li>
				) ) }
			</ul>
		);
	}

	return (
		<Modal
			isOpen={ isOpen }
			onOpenChange={ onOpenChange }
			title={ title }
			size="lg"
			footer={
				<>
					{ pages > 1 && (
						<div className="me-auto flex items-center gap-2">
							<Button
								size="sm"
								isDisabled={ page <= 1 }
								onPress={ () => setPage( ( p ) => p - 1 ) }
							>
								{ __( 'Previous page', 'cliedesk' ) }
							</Button>
							<span className="text-sm text-fg-muted">
								{ sprintf(
									/* translators: 1: current page, 2: number of pages. */
									__( 'Page %1$d of %2$d', 'cliedesk' ),
									page,
									pages
								) }
							</span>
							<Button
								size="sm"
								isDisabled={ page >= pages }
								onPress={ () => setPage( ( p ) => p + 1 ) }
							>
								{ __( 'Next page', 'cliedesk' ) }
							</Button>
						</div>
					) }
					<Button onPress={ () => onOpenChange( false ) }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<TextField
					label={ __( 'Search images', 'cliedesk' ) }
					type="search"
					value={ search }
					onChange={ setSearch }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				{ body }
				<MediaLink />
			</div>
		</Modal>
	);
}

export interface ImagePickerProps {
	id: string;
	label: string;
	value: number | null;
	onChange: ( value: number | null ) => void;
	description?: string;
	errorMessage?: string | null;
	isDisabled?: boolean;
}

/**
 * Labelled image field: preview, "Choose image" (dialog over the media library) and "Remove".
 *
 * @param props Props.
 */
export function ImagePicker( {
	id,
	label,
	value,
	onChange,
	description,
	errorMessage,
	isDisabled,
}: ImagePickerProps ) {
	const [ open, setOpen ] = useState( false );
	const base = useId();
	const labelId = `${ base }-label`;
	const descId = `${ base }-desc`;
	const errId = `${ base }-err`;
	const describedBy =
		[ description && descId, errorMessage && errId ]
			.filter( Boolean )
			.join( ' ' ) || undefined;
	return (
		<div
			id={ id }
			role="group"
			aria-labelledby={ labelId }
			aria-describedby={ describedBy }
			className="flex flex-col gap-1"
		>
			<span id={ labelId } className="text-sm font-medium text-fg">
				{ label }
			</span>
			<div className="flex flex-wrap items-center gap-3">
				<ImagePreview id={ value } />
				<span className="min-w-0 truncate text-sm text-fg-muted">
					<ImageName id={ value } />
				</span>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						isDisabled={ isDisabled }
						onPress={ () => setOpen( true ) }
					>
						{ value
							? __( 'Change image', 'cliedesk' )
							: __( 'Choose image', 'cliedesk' ) }
					</Button>
					{ value && (
						<Button
							size="sm"
							variant="ghost"
							isDisabled={ isDisabled }
							onPress={ () => onChange( null ) }
						>
							{ __( 'Remove image', 'cliedesk' ) }
						</Button>
					) }
				</div>
			</div>
			{ description && (
				<span id={ descId } className="text-sm text-fg-subtle">
					{ description }
				</span>
			) }
			{ errorMessage && (
				<span
					id={ errId }
					className="flex items-start gap-1 text-sm text-danger"
				>
					<span aria-hidden="true">!</span>
					<span>{ errorMessage }</span>
				</span>
			) }
			<PickerDialog
				isOpen={ open }
				onOpenChange={ setOpen }
				title={ label }
				selected={ value }
				onPick={ ( img ) => {
					onChange( img.id );
					setOpen( false );
				} }
			/>
		</div>
	);
}
