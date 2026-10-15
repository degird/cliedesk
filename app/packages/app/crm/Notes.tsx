/**
 * Notes card (CRM-22) on the contact and organization pages: pinned first, author and relative date, add, edit,
 * pin / unpin and delete with confirmation. Notes are plain text (line breaks kept), never HTML.
 * Without cliedesk_edit_contacts people may change only their own notes (the server answers 403 otherwise).
 * Contacts also show read-only notes from other plugins (`external`: notes customers left on WooCommerce orders).
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, Checkbox, ConfirmDestructive, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ActionError, Muted, Pill } from '../inbox/components';
import { fullTime, relativeTime } from '../inbox/labels';
import { announceResult, apiFieldErrors } from '../workspace/forms';
import {
	NOTE_MAX,
	noteKeys,
	notesQuery,
	sortNotes,
	type Note,
	type NoteEntity,
} from './api';
import { Section } from './components';

/**
 * Whether the current user may edit or delete a note.
 *
 * @param note Note.
 */
export function canChangeNote( note: Pick< Note, 'authorId' > ): boolean {
	if ( can( 'cliedesk_edit_contacts' ) ) {
		return true;
	}
	const me = getBoot().user?.id;
	return me !== undefined && note.authorId !== null && note.authorId === me;
}

/**
 * Client check of a note body.
 *
 * @param body Text.
 */
export function validateNote( body: string ): string | null {
	if ( body.trim() === '' ) {
		return __( 'Write something first.', 'cliedesk' );
	}
	if ( body.length > NOTE_MAX ) {
		return sprintf(
			/* translators: %d: maximum number of characters. */
			__( 'Enter up to %d characters.', 'cliedesk' ),
			NOTE_MAX
		);
	}
	return null;
}

function NoteItem( {
	note,
	entity,
	entityId,
}: {
	note: Note;
	entity: NoteEntity;
	entityId: number;
} ) {
	const qc = useQueryClient();
	const [ editing, setEditing ] = useState( false );
	const [ body, setBody ] = useState( note.body );
	const [ error, setError ] = useState< string | null >( null );
	const [ confirm, setConfirm ] = useState( false );
	const actionsRef = useRef< HTMLDivElement >( null );
	const wasEditing = useRef( false );
	const mayChange = canChangeNote( note );
	const key = noteKeys.list( entity, entityId );
	const replace = ( n: Note ) =>
		qc.setQueryData< Note[] >( key, ( old ) =>
			sortNotes( ( old ?? [] ).map( ( x ) => ( x.id === n.id ? n : x ) ) )
		);
	const update = useMutation( {
		mutationFn: ( patch: { body?: string; pinned?: boolean } ) =>
			api.patch< Note >( `notes/${ note.id }`, { body: patch } ),
		onSuccess: ( r, patch ) => {
			if ( r.data?.id ) {
				replace( r.data );
			}
			void qc.invalidateQueries( { queryKey: key } );
			if ( patch.body !== undefined ) {
				setEditing( false );
				announceResult( __( 'Note saved.', 'cliedesk' ) );
			} else {
				announceResult(
					patch.pinned
						? __( 'Note pinned.', 'cliedesk' )
						: __( 'Note unpinned.', 'cliedesk' )
				);
			}
		},
	} );
	const remove = useMutation( {
		mutationFn: () => api.del( `notes/${ note.id }` ),
		onSuccess: () => {
			setConfirm( false );
			qc.setQueryData< Note[] >( key, ( old ) =>
				( old ?? [] ).filter( ( x ) => x.id !== note.id )
			);
			void qc.invalidateQueries( { queryKey: key } );
			announceResult( __( 'Note deleted.', 'cliedesk' ) );
		},
	} );
	// Focus returns to "Edit" when the editor closes.
	useEffect( () => {
		if ( wasEditing.current && ! editing ) {
			actionsRef.current
				?.querySelector< HTMLElement >( 'button' )
				?.focus();
		}
		wasEditing.current = editing;
	}, [ editing ] );
	const save = ( e: FormEvent ) => {
		e.preventDefault();
		const msg = validateNote( body );
		setError( msg );
		if ( ! msg ) {
			update.mutate( { body } );
		}
	};
	const author = note.authorName || __( 'Someone', 'cliedesk' );
	const edited = note.updatedAt && note.updatedAt !== note.createdAt;
	return (
		<li className="flex flex-col gap-2 px-4 py-3">
			<div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
				{ note.pinned && (
					<Pill tone="accent">{ __( 'Pinned', 'cliedesk' ) }</Pill>
				) }
				<span className="font-medium text-fg">
					<bdi>{ author }</bdi>
				</span>
				<time
					dateTime={ note.createdAt }
					title={ fullTime( note.createdAt ) }
				>
					{ relativeTime( note.createdAt ) }
				</time>
				{ edited && <span>{ __( '(edited)', 'cliedesk' ) }</span> }
			</div>
			<ActionError
				error={ update.error ?? remove.error }
				onDismiss={ () => {
					update.reset();
					remove.reset();
				} }
			/>
			{ editing ? (
				<form
					noValidate
					onSubmit={ save }
					className="flex flex-col gap-2"
				>
					<TextField
						multiline
						rows={ 4 }
						// The editor opens on request; its field takes focus.
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						label={ __( 'Edit note', 'cliedesk' ) }
						value={ body }
						onChange={ ( x ) => {
							setBody( x );
							setError( null );
						} }
						errorMessage={
							error ?? apiFieldErrors( update.error ).body ?? null
						}
					/>
					<div className="flex gap-2">
						<Button
							type="submit"
							size="sm"
							variant="primary"
							isLoading={ update.isPending }
						>
							{ __( 'Save note', 'cliedesk' ) }
						</Button>
						<Button
							size="sm"
							onPress={ () => {
								setBody( note.body );
								setError( null );
								update.reset();
								setEditing( false );
							} }
						>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
					</div>
				</form>
			) : (
				<p className="whitespace-pre-wrap break-words">{ note.body }</p>
			) }
			{ mayChange && ! editing && (
				<div ref={ actionsRef } className="flex flex-wrap gap-1">
					<Button
						size="sm"
						variant="ghost"
						onPress={ () => {
							setBody( note.body );
							setEditing( true );
						} }
					>
						{ __( 'Edit', 'cliedesk' ) }
					</Button>
					<Button
						size="sm"
						variant="ghost"
						isLoading={
							update.isPending &&
							update.variables?.pinned !== undefined
						}
						onPress={ () =>
							update.mutate( { pinned: ! note.pinned } )
						}
					>
						{ note.pinned
							? __( 'Unpin', 'cliedesk' )
							: __( 'Pin', 'cliedesk' ) }
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onPress={ () => setConfirm( true ) }
					>
						{ __( 'Delete', 'cliedesk' ) }
					</Button>
				</div>
			) }
			<ConfirmDestructive
				isOpen={ confirm }
				onOpenChange={ setConfirm }
				title={ __( 'Delete this note?', 'cliedesk' ) }
				description={ __(
					'The note is removed for everyone.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete note', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => remove.mutate() }
			/>
		</li>
	);
}

/**
 * Notes card.
 *
 * @param props          Props.
 * @param props.entity   contact | organization.
 * @param props.entityId Id.
 * @param props.addLabel Add button text.
 */
export function NotesCard( {
	entity,
	entityId,
	addLabel,
}: {
	entity: NoteEntity;
	entityId: number;
	/** Text of the add button (the conversation panel tells it apart from the composer's). */
	addLabel?: string;
} ) {
	const qc = useQueryClient();
	const q = useQuery( notesQuery( entity, entityId ) );
	const [ body, setBody ] = useState( '' );
	const [ pinned, setPinned ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );
	const id = `cd-${ entity }-notes`;
	const add = useMutation( {
		mutationFn: () =>
			api.post< Note >( 'notes', {
				body: { entity, entityId, body, pinned },
			} ),
		onSuccess: ( r ) => {
			if ( r.data?.id ) {
				qc.setQueryData< Note[] >(
					noteKeys.list( entity, entityId ),
					( old ) => sortNotes( [ r.data, ...( old ?? [] ) ] )
				);
			}
			void qc.invalidateQueries( {
				queryKey: noteKeys.list( entity, entityId ),
			} );
			setBody( '' );
			setPinned( false );
			announceResult( __( 'Note added.', 'cliedesk' ) );
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const msg = validateNote( body );
		setError( msg );
		if ( ! msg ) {
			add.mutate();
		}
	};
	const notes = q.data ?? [];
	// CRM-22: read-only notes from other plugins (WooCommerce order notes from the customer).
	const external = useQuery( {
		queryKey: [ entity, entityId, 'notes', 'external' ] as const,
		queryFn: async ( { signal } ) => {
			const list = (
				await api.get< { external?: ExternalNote[] } >( 'notes', {
					query: { entity, entityId },
					signal,
				} )
			).data?.external;
			return Array.isArray( list ) ? list : [];
		},
		enabled: entity === 'contact',
	} );
	return (
		<Section id={ id } title={ __( 'Notes', 'cliedesk' ) }>
			{ q.isPending && (
				<Muted>{ __( 'Loading notes…', 'cliedesk' ) }</Muted>
			) }
			{ q.isError && (
				<div className="flex items-center gap-2">
					<Muted>
						{ __( 'Could not load the notes.', 'cliedesk' ) }
					</Muted>
					<Button size="sm" onPress={ () => void q.refetch() }>
						{ __( 'Retry', 'cliedesk' ) }
					</Button>
				</div>
			) }
			{ q.isSuccess && ! notes.length && (
				<Muted>{ __( 'No notes yet.', 'cliedesk' ) }</Muted>
			) }
			{ notes.length > 0 && (
				<ul
					aria-labelledby={ id }
					className="flex flex-col divide-y divide-line rounded-md border border-line"
				>
					{ notes.map( ( n ) => (
						<NoteItem
							key={ n.id }
							note={ n }
							entity={ entity }
							entityId={ entityId }
						/>
					) ) }
				</ul>
			) }
			{ ( external.data ?? [] ).length > 0 && (
				<ul
					aria-label={ __( 'Notes from the customer', 'cliedesk' ) }
					className="flex flex-col gap-1 text-sm"
				>
					{ ( external.data ?? [] ).map( ( n ) => (
						<li
							key={ `${ n.source }-${ n.id }` }
							className="rounded-md border border-line bg-sunken p-2"
						>
							<span className="flex flex-wrap items-center gap-2 text-fg-muted">
								<span className="font-medium text-fg">
									{ n.title }
								</span>
								<Pill>{ __( 'Read-only', 'cliedesk' ) }</Pill>
								{ n.date && (
									<time
										dateTime={ n.date }
										title={ fullTime( n.date ) }
									>
										{ relativeTime( n.date ) }
									</time>
								) }
							</span>
							<p className="whitespace-pre-line break-words">
								{ n.text }
							</p>
						</li>
					) ) }
				</ul>
			) }
			<form
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-2"
			>
				<ActionError
					error={
						apiFieldErrors( add.error ).body ? null : add.error
					}
					onDismiss={ () => add.reset() }
				/>
				<TextField
					multiline
					rows={ 3 }
					label={ __( 'Add a note', 'cliedesk' ) }
					description={ __(
						'Visible to your team only. Plain text.',
						'cliedesk'
					) }
					value={ body }
					onChange={ ( x ) => {
						setBody( x );
						setError( null );
					} }
					errorMessage={
						error ?? apiFieldErrors( add.error ).body ?? null
					}
				/>
				<div className="flex flex-wrap items-center gap-3">
					<Checkbox isSelected={ pinned } onChange={ setPinned }>
						{ __( 'Pin to the top', 'cliedesk' ) }
					</Checkbox>
					<Button type="submit" isLoading={ add.isPending }>
						{ addLabel ?? __( 'Add note', 'cliedesk' ) }
					</Button>
				</div>
			</form>
		</Section>
	);
}

/** A read-only note from another plugin (CRM-22). */
interface ExternalNote {
	source: string;
	id: string;
	title: string;
	text: string;
	date: string | null;
}
