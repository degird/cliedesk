/**
 * Internal note tools (INB-56): edit your own note (or anyone's with cliedesk_edit_others_notes), the "Edited"
 * marker with the earlier versions, delete (with Undo), emoji reactions with who reacted, and replies threaded
 * under a note (POST …/notes with parentId; replies stay one level deep).
 *
 * Calls: PATCH notes/messages/{id} {html}, GET …/history, POST …/trash {trashed}, POST …/reactions {emoji, on}.
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, Menu, MenuItem, Modal, TextField, toast } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { SmilePlus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { AUTHOR_USER, conversationKeys, type Message } from '../../inbox/api';
import {
	ActionError,
	Muted,
	actionMessage,
	useAgents,
} from '../../inbox/components';
import { RichText, htmlToText, textToHtml } from '../../inbox/html';
import { fullTime } from '../../inbox/labels';
import { announceResult } from '../../workspace/forms';

/** The reactions the server accepts (NoteEditor::REACTIONS). */
export const REACTIONS: Array< { emoji: string; name: () => string } > = [
	{ emoji: '👍', name: () => __( 'Thumbs up', 'cliedesk' ) },
	{ emoji: '❤️', name: () => __( 'Heart', 'cliedesk' ) },
	{ emoji: '😄', name: () => __( 'Smile', 'cliedesk' ) },
	{ emoji: '🎉', name: () => __( 'Party', 'cliedesk' ) },
	{ emoji: '👀', name: () => __( 'Eyes', 'cliedesk' ) },
	{ emoji: '✅', name: () => __( 'Done', 'cliedesk' ) },
	{ emoji: '🙏', name: () => __( 'Thanks', 'cliedesk' ) },
	{ emoji: '😮', name: () => __( 'Surprised', 'cliedesk' ) },
];

export const isNote = ( m: Message ): boolean => m.kind === 'note';

/**
 * Reactions of a message as emoji → user ids (the API sends [] when there are none).
 *
 * @param m Message.
 */
export function reactionsOf( m: Message ): Record< string, number[] > {
	const r = m.reactions;
	if ( ! r || Array.isArray( r ) ) {
		return {};
	}
	return Object.fromEntries(
		Object.entries( r ).filter(
			( [ , ids ] ) => Array.isArray( ids ) && ids.length > 0
		)
	);
}

/**
 * Whether the current user may edit or delete a note.
 *
 * @param m Note.
 */
export function mayChangeNote( m: Message ): boolean {
	if ( ! can( 'cliedesk_add_notes' ) ) {
		return false;
	}
	const mine =
		m.authorType === AUTHOR_USER && m.authorId === getBoot().user?.id;
	return mine || can( 'cliedesk_edit_others_notes' );
}

function useRefreshMessages( conversationId: number ) {
	const qc = useQueryClient();
	return () =>
		void qc.invalidateQueries( {
			queryKey: conversationKeys.messages( conversationId ),
		} );
}

/**
 * Earlier versions of a note.
 *
 * @param props         Props.
 * @param props.message Note.
 * @param props.onClose Close.
 */
export function NoteHistoryDialog( {
	message: m,
	onClose,
}: {
	message: Message;
	onClose: () => void;
} ) {
	const { nameFor } = useAgents();
	const q = useQuery( {
		queryKey: [ 'note-history', m.id ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< {
					items: Array< {
						at: string | null;
						by: number | null;
						html: string | null;
						text: string;
					} >;
				} >( `notes/messages/${ m.id }/history`, { signal } )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Earlier versions of this note', 'cliedesk' ) }
			footer={
				<Button onPress={ onClose }>
					{ __( 'Close', 'cliedesk' ) }
				</Button>
			}
		>
			{ q.isPending && <Muted>{ __( 'Loading…', 'cliedesk' ) }</Muted> }
			{ q.isError && <ActionError error={ q.error } /> }
			{ q.data && ! q.data.length && (
				<Muted>{ __( 'No earlier versions.', 'cliedesk' ) }</Muted>
			) }
			{ q.data && q.data.length > 0 && (
				<ol className="flex flex-col gap-3">
					{ [ ...q.data ].reverse().map( ( v, i ) => (
						<li
							key={ `${ v.at ?? '' }:${ i }` }
							className="flex flex-col gap-1 rounded-md border border-line p-3"
						>
							<p className="text-sm text-fg-muted">
								{ sprintf(
									/* translators: 1: who edited, 2: date and time. */
									__( 'Replaced by %1$s, %2$s', 'cliedesk' ),
									( v.by !== null && nameFor( v.by ) ) ||
										__( 'someone', 'cliedesk' ),
									v.at ? fullTime( v.at ) : '—'
								) }
							</p>
							<RichText html={ v.html } text={ v.text } />
						</li>
					) ) }
				</ol>
			) }
		</Modal>
	);
}

/**
 * "Edited" marker (opens the earlier versions).
 *
 * @param props         Props.
 * @param props.message Note.
 */
export function EditedMarker( { message: m }: { message: Message } ) {
	const [ open, setOpen ] = useState( false );
	if ( ! m.editedAt && ! m.editCount ) {
		return null;
	}
	return (
		<>
			<Button
				size="sm"
				variant="link"
				aria-haspopup="dialog"
				aria-label={
					m.editedAt
						? sprintf(
								/* translators: %s: date and time. */
								__(
									'Edited %s. Show earlier versions',
									'cliedesk'
								),
								fullTime( m.editedAt )
							)
						: __( 'Edited. Show earlier versions', 'cliedesk' )
				}
				onPress={ () => setOpen( true ) }
			>
				{ __( '(edited)', 'cliedesk' ) }
			</Button>
			{ open && (
				<NoteHistoryDialog
					message={ m }
					onClose={ () => setOpen( false ) }
				/>
			) }
		</>
	);
}

function Reactions( {
	message: m,
	conversationId,
}: {
	message: Message;
	conversationId: number;
} ) {
	const refresh = useRefreshMessages( conversationId );
	const me = getBoot().user?.id ?? 0;
	const { nameFor } = useAgents();
	const react = useMutation( {
		mutationFn: ( { emoji, on }: { emoji: string; on: boolean } ) =>
			api.post( `notes/messages/${ m.id }/reactions`, {
				body: { emoji, on },
			} ),
		onSuccess: refresh,
	} );
	const list = reactionsOf( m );
	const names = ( ids: number[] ) =>
		ids
			.map( ( id ) =>
				id === me
					? __( 'you', 'cliedesk' )
					: ( nameFor( id ) ??
						sprintf(
							/* translators: %d: user id. */
							__( 'Agent #%d', 'cliedesk' ),
							id
						) )
			)
			.join( ', ' );
	return (
		<div className="flex flex-wrap items-center gap-1">
			{ Object.entries( list ).map( ( [ emoji, ids ] ) => {
				const mine = ids.includes( me );
				const who = names( ids );
				return (
					<Button
						key={ emoji }
						size="sm"
						variant="secondary"
						aria-pressed={ mine }
						aria-label={ sprintf(
							/* translators: 1: emoji, 2: number of people, 3: their names. */
							_n(
								'%1$s %2$d reaction: %3$s',
								'%1$s %2$d reactions: %3$s',
								ids.length,
								'cliedesk'
							),
							emoji,
							ids.length,
							who
						) }
						isDisabled={ react.isPending }
						onPress={ () => react.mutate( { emoji, on: ! mine } ) }
					>
						<span aria-hidden="true">{ `${ emoji } ${ ids.length }` }</span>
					</Button>
				);
			} ) }
			<Menu
				aria-label={ __( 'Reactions', 'cliedesk' ) }
				placement="bottom start"
				onAction={ ( k ) =>
					react.mutate( {
						emoji: String( k ),
						on: ! ( list[ String( k ) ] ?? [] ).includes( me ),
					} )
				}
				trigger={
					<Button
						size="sm"
						variant="ghost"
						iconStart={
							<SmilePlus aria-hidden="true" size={ 14 } />
						}
					>
						{ __( 'React', 'cliedesk' ) }
					</Button>
				}
			>
				{ REACTIONS.map( ( r ) => (
					<MenuItem
						key={ r.emoji }
						id={ r.emoji }
						textValue={ r.name() }
					>
						<span aria-hidden="true">{ r.emoji }</span> { r.name() }
					</MenuItem>
				) ) }
			</Menu>
			{ react.error ? (
				<span role="alert" className="text-sm text-danger">
					{ actionMessage( react.error ) }
				</span>
			) : null }
		</div>
	);
}

function EditForm( {
	message: m,
	conversationId,
	onDone,
}: {
	message: Message;
	conversationId: number;
	onDone: () => void;
} ) {
	const refresh = useRefreshMessages( conversationId );
	const [ text, setText ] = useState( () =>
		m.html ? htmlToText( m.html ) : m.text
	);
	const [ error, setError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( `notes/messages/${ m.id }`, {
				body: { html: textToHtml( text ) },
			} ),
		onSuccess: () => {
			refresh();
			announceResult( __( 'Note saved.', 'cliedesk' ) );
			onDone();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! text.trim() ) {
			setError( __( 'Write the note first.', 'cliedesk' ) );
			return;
		}
		setError( null );
		save.mutate();
	};
	return (
		<form noValidate onSubmit={ submit } className="flex flex-col gap-2">
			<TextField
				label={ __( 'Edit note', 'cliedesk' ) }
				multiline
				rows={ 4 }
				value={ text }
				onChange={ setText }
				errorMessage={ error }
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus
				onKeyDown={ ( e ) => {
					if ( e.key === 'Escape' ) {
						onDone();
					}
				} }
			/>
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
			<div className="flex gap-2">
				<Button
					type="submit"
					size="sm"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save note', 'cliedesk' ) }
				</Button>
				<Button size="sm" onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

function ReplyForm( {
	message: m,
	conversationId,
	onDone,
}: {
	message: Message;
	conversationId: number;
	onDone: () => void;
} ) {
	const refresh = useRefreshMessages( conversationId );
	const [ text, setText ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const send = useMutation( {
		mutationFn: () =>
			api.post( `conversations/${ conversationId }/notes`, {
				body: { html: textToHtml( text ), parentId: m.id },
			} ),
		onSuccess: () => {
			refresh();
			announceResult( __( 'Reply added.', 'cliedesk' ) );
			onDone();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! text.trim() ) {
			setError( __( 'Write the reply first.', 'cliedesk' ) );
			return;
		}
		setError( null );
		send.mutate();
	};
	return (
		<form noValidate onSubmit={ submit } className="flex flex-col gap-2">
			<TextField
				label={ __( 'Reply to this note', 'cliedesk' ) }
				description={ __(
					'Internal: only your team sees it.',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				value={ text }
				onChange={ setText }
				errorMessage={ error }
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus
				onKeyDown={ ( e ) => {
					if ( e.key === 'Escape' ) {
						onDone();
					}
				} }
			/>
			<ActionError
				error={ send.error }
				onDismiss={ () => send.reset() }
			/>
			<div className="flex gap-2">
				<Button
					type="submit"
					size="sm"
					variant="primary"
					isLoading={ send.isPending }
				>
					{ __( 'Add reply', 'cliedesk' ) }
				</Button>
				<Button size="sm" onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

/**
 * Body and tools of a note: the text (or its edit form), reactions, Reply / Edit / Delete.
 *
 * @param props                Props.
 * @param props.message        Note.
 * @param props.conversationId Conversation.
 * @param props.canReply       Offer Reply (top-level notes).
 * @param props.body           The rendered body.
 */
export function NoteTools( {
	message: m,
	conversationId,
	canReply,
	body,
}: {
	message: Message;
	conversationId: number;
	canReply: boolean;
	body: ReactNode;
} ) {
	const refresh = useRefreshMessages( conversationId );
	const [ mode, setMode ] = useState< 'view' | 'edit' | 'reply' >( 'view' );
	const change = mayChangeNote( m );
	const setTrashed = ( trashed: boolean ) =>
		api.post( `notes/messages/${ m.id }/trash`, { body: { trashed } } );
	const remove = useMutation( {
		mutationFn: () => setTrashed( true ),
		onSuccess: () => {
			refresh();
			toast( {
				tone: 'success',
				title: __( 'Note deleted.', 'cliedesk' ),
				action: {
					label: __( 'Undo', 'cliedesk' ),
					onAction: () =>
						void setTrashed( false )
							.then( () => {
								refresh();
								announceResult(
									__( 'Note restored.', 'cliedesk' )
								);
							} )
							.catch( ( e: unknown ) =>
								toast( {
									tone: 'danger',
									title: __(
										'Could not restore the note',
										'cliedesk'
									),
									description: actionMessage( e ),
								} )
							),
				},
			} );
		},
	} );
	return (
		<>
			{ mode === 'edit' ? (
				<EditForm
					message={ m }
					conversationId={ conversationId }
					onDone={ () => setMode( 'view' ) }
				/>
			) : (
				body
			) }
			<div className="flex flex-wrap items-center gap-2">
				<Reactions message={ m } conversationId={ conversationId } />
				{ canReply &&
					can( 'cliedesk_add_notes' ) &&
					mode !== 'reply' && (
						<Button
							size="sm"
							variant="ghost"
							onPress={ () => setMode( 'reply' ) }
						>
							{ __( 'Reply', 'cliedesk' ) }
						</Button>
					) }
				{ change && mode !== 'edit' && (
					<Button
						size="sm"
						variant="ghost"
						onPress={ () => setMode( 'edit' ) }
					>
						{ __( 'Edit', 'cliedesk' ) }
					</Button>
				) }
				{ change && (
					<Button
						size="sm"
						variant="ghost"
						isLoading={ remove.isPending }
						onPress={ () => remove.mutate() }
					>
						{ __( 'Delete', 'cliedesk' ) }
					</Button>
				) }
			</div>
			<ActionError
				error={ remove.error }
				onDismiss={ () => remove.reset() }
			/>
			{ mode === 'reply' && (
				<ReplyForm
					message={ m }
					conversationId={ conversationId }
					onDone={ () => setMode( 'view' ) }
				/>
			) }
		</>
	);
}
