/**
 * Edit a sent chat reply (INB-41): from the message menu, or ↑ in an empty composer for my last chat reply. The
 * customer sees the new text; the original stays in the history. Email replies are never editable.
 */
import { api, getBoot, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Modal, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { conversationKeys, type Message } from '../../inbox/api';
import { ActionError } from '../../inbox/components';
import { textToHtml } from '../../inbox/html';

/** Agent author code (Actor::AUTHOR_CODES human). */
const HUMAN = 2;

/**
 * May I edit this message? My own sent reply in a widget chat.
 *
 * @param m Message.
 */
export function canEditReply( m: Message ): boolean {
	const me = getBoot().user?.id ?? 0;
	return (
		m.kind === 'agent_reply' &&
		m.channel === 'widget' &&
		m.authorType === HUMAN &&
		m.authorId === me &&
		[ 'sent', 'delivered', 'read' ].includes( m.status ) &&
		! m.deletedAt
	);
}

/**
 * My last editable reply in a list of messages.
 *
 * @param messages Messages, oldest first.
 */
export function lastEditable( messages: Message[] ): Message | null {
	return [ ...messages ].reverse().find( ( m ) => canEditReply( m ) ) ?? null;
}

/**
 * The edit dialog.
 *
 * @param props                Props.
 * @param props.message        Reply.
 * @param props.conversationId Conversation.
 * @param props.onClose        Close.
 */
export function EditReplyDialog( {
	message,
	conversationId,
	onClose,
}: {
	message: Message;
	conversationId: number;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ text, setText ] = useState( message.text );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( `messages/${ message.id }`, {
				body: { html: textToHtml( text ) },
			} ),
		onSuccess: () => {
			void qc.invalidateQueries( {
				queryKey: conversationKeys.all( conversationId ),
			} );
			onClose();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<Modal
			isOpen
			title={ __( 'Edit your reply', 'cliedesk' ) }
			onOpenChange={ ( o ) => ! o && onClose() }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-edit-reply"
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ ! text.trim() }
					>
						{ __( 'Save', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-edit-reply"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-3"
			>
				<ActionError error={ save.error } />
				<TextField
					label={ __( 'Reply', 'cliedesk' ) }
					description={ __(
						'The customer sees the new text. The original stays in the history.',
						'cliedesk'
					) }
					multiline
					rows={ 5 }
					value={ text }
					onChange={ setText }
				/>
			</form>
		</Modal>
	);
}
