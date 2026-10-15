/**
 * Forward dialog (INB-47, INB-48), a lazy chunk opened from the conversation header (the whole conversation) or a
 * message's menu (that message only).
 *
 * - By email: POST conversations/{id}/forward {to, cc?, html?, messageId?}. The public messages go to the
 *   addresses; internal notes are never included and the customer does not see the forward. Bad addresses come
 *   back as `to.N` / `cc.N`.
 * - As a new conversation: POST conversations/{id}/forward-new {email, name?, subject?, html?, messageId?}. The
 *   answer is the new conversation, linked to this one; the dialog offers to open it.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { Banner, Button, Modal, RadioGroup, TextField } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import {
	conversationKeys,
	inboxKeys,
	type Conversation,
	type Message,
} from '../../inbox/api';
import { ActionError } from '../../inbox/components';
import { textToHtml } from '../../inbox/html';
import { apiFieldErrors, announceResult } from '../../workspace/forms';
import { indexErrors, isEmail } from './compose';
import { EmailChips } from './EmailChips';
import { mergeDetail } from './shared';

type Mode = 'email' | 'new';

/**
 * Forward dialog.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 * @param props.messageId    One message to forward, or null for the whole conversation.
 * @param props.onClose      Close.
 */
export default function ForwardDialog( {
	conversation: c,
	messageId,
	onClose,
}: {
	conversation: Conversation;
	messageId: number | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ mode, setMode ] = useState< Mode >( 'email' );
	const [ to, setTo ] = useState< string[] >( [] );
	const [ cc, setCc ] = useState< string[] >( [] );
	const [ email, setEmail ] = useState( '' );
	const [ name, setName ] = useState( '' );
	const [ subject, setSubject ] = useState( '' );
	const [ comment, setComment ] = useState( '' );
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const [ created, setCreated ] = useState< Conversation | null >( null );

	const html = comment.trim() ? textToHtml( comment ) : undefined;
	const forward = useMutation( {
		mutationFn: () =>
			api.post< { message: Message; conversation: Conversation } >(
				`conversations/${ c.id }/forward`,
				{
					body: {
						to,
						...( cc.length ? { cc } : {} ),
						...( html ? { html } : {} ),
						...( messageId ? { messageId } : {} ),
					},
				}
			),
		onSuccess: ( r ) => {
			if ( r.data?.conversation ) {
				mergeDetail( qc, c.id, r.data.conversation );
			}
			void qc.invalidateQueries( {
				queryKey: conversationKeys.messages( c.id ),
			} );
			void qc.invalidateQueries( {
				queryKey: conversationKeys.events( c.id ),
			} );
			announceResult(
				sprintf(
					/* translators: %s: email addresses. */
					__( 'Forwarded to %s.', 'cliedesk' ),
					to.join( ', ' )
				)
			);
			onClose();
		},
	} );
	const forwardNew = useMutation( {
		mutationFn: () =>
			api.post< Conversation >( `conversations/${ c.id }/forward-new`, {
				body: {
					email: email.trim(),
					...( name.trim() ? { name: name.trim() } : {} ),
					...( subject.trim() ? { subject: subject.trim() } : {} ),
					...( html ? { html } : {} ),
					...( messageId ? { messageId } : {} ),
				},
			} ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			void qc.invalidateQueries( {
				queryKey: conversationKeys.links( c.id ),
			} );
			setCreated( r.data );
			announceResult(
				sprintf(
					/* translators: %d: conversation number. */
					__( 'Conversation #%d created.', 'cliedesk' ),
					r.data.number
				)
			);
		},
	} );
	const run = mode === 'email' ? forward : forwardNew;
	const server = apiFieldErrors( run.error );

	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const next: Record< string, string > = {};
		if ( mode === 'email' && ! to.length ) {
			next.to = __( 'Add at least one address.', 'cliedesk' );
		}
		if ( mode === 'new' && ! isEmail( email ) ) {
			next.email = email.trim()
				? __( 'Enter a valid email address.', 'cliedesk' )
				: __( 'Enter the email address to forward to.', 'cliedesk' );
		}
		setErrors( next );
		if ( ! Object.keys( next ).length ) {
			run.mutate();
		}
	};

	const title = messageId
		? __( 'Forward this message', 'cliedesk' )
		: __( 'Forward conversation', 'cliedesk' );

	if ( created ) {
		return (
			<Modal
				isOpen
				size="sm"
				onOpenChange={ ( open ) => ! open && onClose() }
				title={ title }
				footer={
					<>
						<Button onPress={ onClose }>
							{ __( 'Close', 'cliedesk' ) }
						</Button>
						<Button
							variant="primary"
							// The new conversation is the next step (focus moves here when the form is replaced).
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
							onPress={ () => {
								onClose();
								void navigate( {
									to: '/c/$number',
									params: {
										number: String( created.number ),
									},
								} );
							} }
						>
							{ sprintf(
								/* translators: %d: conversation number. */
								__( 'Open #%d', 'cliedesk' ),
								created.number
							) }
						</Button>
					</>
				}
			>
				<Banner
					tone="success"
					title={ sprintf(
						/* translators: %d: conversation number. */
						__( 'Conversation #%d created.', 'cliedesk' ),
						created.number
					) }
				>
					{ __(
						'It is linked to this conversation. Replies from the recipient arrive there; this customer is not told.',
						'cliedesk'
					) }
				</Banner>
			</Modal>
		);
	}

	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ title }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-forward"
						variant="primary"
						isLoading={ run.isPending }
					>
						{ mode === 'email'
							? __( 'Forward', 'cliedesk' )
							: __( 'Create conversation', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-forward"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ messageId
						? __(
								'Only this message is forwarded. Internal notes are never included.',
								'cliedesk'
							)
						: __(
								'The messages of this conversation are forwarded. Internal notes are never included.',
								'cliedesk'
							) }
				</p>
				<RadioGroup
					label={ __( 'Forward', 'cliedesk' ) }
					value={ mode }
					onChange={ ( v ) => {
						setMode( v as Mode );
						setErrors( {} );
						forward.reset();
						forwardNew.reset();
					} }
					options={ [
						{
							id: 'email',
							label: __( 'By email', 'cliedesk' ),
							description: __(
								'The recipients get a copy. Their replies do not come back here.',
								'cliedesk'
							),
						},
						{
							id: 'new',
							label: __( 'As a new conversation', 'cliedesk' ),
							description: __(
								'Start a separate conversation with the recipient, linked to this one.',
								'cliedesk'
							),
						},
					] }
				/>
				<ActionError
					error={ run.error }
					onDismiss={ () => run.reset() }
				/>
				{ mode === 'email' ? (
					<>
						<EmailChips
							id="cd-forward-to"
							label={ __( 'To', 'cliedesk' ) }
							isRequired
							values={ to }
							onChange={ ( v ) => {
								setTo( v );
								setErrors( {} );
							} }
							errors={ indexErrors( server, 'to' ) }
							error={ errors.to ?? server.to ?? null }
							max={ 20 }
						/>
						<EmailChips
							id="cd-forward-cc"
							label={ __( 'Cc', 'cliedesk' ) }
							values={ cc }
							onChange={ setCc }
							errors={ indexErrors( server, 'cc' ) }
							max={ 20 }
						/>
					</>
				) : (
					<>
						<TextField
							label={ __( 'Email address', 'cliedesk' ) }
							inputMode="email"
							isRequired
							maxLength={ 191 }
							value={ email }
							onChange={ ( v ) => {
								setEmail( v );
								setErrors( {} );
							} }
							errorMessage={
								errors.email ?? server.email ?? null
							}
						/>
						<TextField
							label={ __( 'Name', 'cliedesk' ) }
							description={ __( 'Optional.', 'cliedesk' ) }
							maxLength={ 191 }
							value={ name }
							onChange={ setName }
						/>
						<TextField
							label={ __( 'Subject', 'cliedesk' ) }
							description={ sprintf(
								/* translators: %s: subject of this conversation. */
								__(
									'Leave empty to use “Fwd: %s”.',
									'cliedesk'
								),
								c.subject
							) }
							maxLength={ 255 }
							value={ subject }
							onChange={ setSubject }
						/>
					</>
				) }
				<TextField
					label={ __( 'Comment', 'cliedesk' ) }
					description={ __(
						'Optional. Shown above the forwarded messages.',
						'cliedesk'
					) }
					multiline
					rows={ 3 }
					value={ comment }
					onChange={ setComment }
				/>
			</form>
		</Modal>
	);
}
