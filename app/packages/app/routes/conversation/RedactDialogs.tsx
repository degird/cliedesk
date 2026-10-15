/**
 * Redaction dialogs (SEC-25), loaded on demand from the message menu and the "Redacted" marker: redact a selection
 * or classes of data in a message, and view an original.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, Modal, TextField, toast } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { conversationKeys, inboxKeys, type Message } from '../../inbox/api';
import { ActionError } from '../../inbox/components';
import { RichText } from '../../inbox/html';
import { fullTime } from '../../inbox/labels';
import {
	REDACT_CLASSES,
	redactClassLabel,
	type RedactClass,
	type Redaction,
} from './Redact';

export function RedactDialog( {
	message,
	conversationId,
	selected,
	onClose,
}: {
	message: Message;
	conversationId: number;
	selected: string;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ text, setText ] = useState( selected );
	const [ classes, setClasses ] = useState< RedactClass[] >( [] );
	const [ error, setError ] = useState< string | null >( null );
	const [ nothing, setNothing ] = useState( false );
	const redact = useMutation( {
		mutationFn: ( body: { texts?: string[]; classes?: RedactClass[] } ) =>
			api.post< { redactionId: number | null; replaced: number } >(
				`messages/${ message.id }/redact`,
				{ body }
			),
		onSuccess: ( r ) => {
			const n = Number( r.data?.replaced ) || 0;
			if ( ! n ) {
				setNothing( true );
				return;
			}
			void qc.invalidateQueries( {
				queryKey: conversationKeys.all( conversationId ),
			} );
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: number of redacted items. */
					_n(
						'%d item redacted.',
						'%d items redacted.',
						n,
						'cliedesk'
					),
					n
				),
			} );
			onClose();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const texts = text
			.split( /\r?\n/ )
			.map( ( t ) => t.trim() )
			.filter( Boolean );
		if ( ! texts.length && ! classes.length ) {
			setError(
				__(
					'Enter the text to redact or choose what to find.',
					'cliedesk'
				)
			);
			return;
		}
		setNothing( false );
		redact.mutate( {
			...( texts.length ? { texts } : {} ),
			...( classes.length ? { classes } : {} ),
		} );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Redact this message', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form={ `cd-redact-${ message.id }` }
						variant="danger"
						isLoading={ redact.isPending }
					>
						{ __( 'Redact', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id={ `cd-redact-${ message.id }` }
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-fg-muted">
					{ __(
						'Redacted text is replaced with [redacted] for everyone. Depending on your settings the original is kept for a while for people allowed to see it.',
						'cliedesk'
					) }
				</p>
				<ActionError
					error={ redact.error }
					onDismiss={ () => redact.reset() }
				/>
				{ nothing && (
					<p role="status" className="text-sm text-fg">
						{ __(
							'Nothing matched. The message is unchanged.',
							'cliedesk'
						) }
					</p>
				) }
				<TextField
					label={ __( 'Selected text', 'cliedesk' ) }
					description={ __(
						'Exact text to remove, one per line. Select text in the message before opening this to fill it in.',
						'cliedesk'
					) }
					multiline
					rows={ 3 }
					value={ text }
					onChange={ ( x ) => {
						setText( x );
						setError( null );
					} }
					errorMessage={ error }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<fieldset className="flex flex-col gap-2">
					<legend className="mb-1 text-sm font-medium">
						{ __( 'Also find and redact', 'cliedesk' ) }
					</legend>
					{ REDACT_CLASSES.map( ( c ) => (
						<Checkbox
							key={ c }
							isSelected={ classes.includes( c ) }
							onChange={ ( on ) => {
								setError( null );
								setClasses( ( old ) =>
									on
										? [ ...old, c ]
										: old.filter( ( x ) => x !== c )
								);
							} }
						>
							{ redactClassLabel( c ) }
						</Checkbox>
					) ) }
				</fieldset>
			</form>
		</Modal>
	);
}

export function OriginalDialog( {
	message,
	onClose,
}: {
	message: Message;
	onClose: () => void;
} ) {
	const list = useQuery( {
		queryKey: [ 'message', message.id, 'redactions' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Redaction[] } >(
					`messages/${ message.id }/redactions`,
					{ signal }
				)
			).data?.items ?? [],
		retry: false,
	} );
	const original = useMutation( {
		mutationFn: ( id: number ) =>
			api.get< { text: string; html: string | null; messageId: number } >(
				`redactions/${ id }/original`
			),
	} );
	const items = list.data ?? [];
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Redacted original', 'cliedesk' ) }
			footer={
				<Button variant="primary" onPress={ onClose }>
					{ __( 'Close', 'cliedesk' ) }
				</Button>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="text-sm text-fg-muted">
					{ __(
						'Viewing an original is recorded in the audit log.',
						'cliedesk'
					) }
				</p>
				<ActionError
					error={ list.error ?? original.error }
					onDismiss={ () => original.reset() }
				/>
				{ list.isPending && (
					<p className="text-sm text-fg-muted">
						{ __( 'Loading redactions…', 'cliedesk' ) }
					</p>
				) }
				{ list.isSuccess && ! items.length && (
					<p className="text-sm text-fg-muted">
						{ __(
							'No redactions recorded for this message.',
							'cliedesk'
						) }
					</p>
				) }
				{ items.length > 0 && (
					<ul className="flex flex-col gap-2">
						{ items.map( ( r ) => (
							<li
								key={ r.id }
								className="flex flex-wrap items-center gap-2 text-sm"
							>
								<span className="flex-1">
									{ sprintf(
										/* translators: 1: what was redacted, 2: date and time. */
										__( '%1$s, %2$s', 'cliedesk' ),
										redactClassLabel( r.class ),
										fullTime( r.createdAt )
									) }
								</span>
								{ r.hasOriginal ? (
									<Button
										size="sm"
										isLoading={
											original.isPending &&
											original.variables === r.id
										}
										onPress={ () =>
											original.mutate( r.id )
										}
									>
										{ __( 'View original', 'cliedesk' ) }
									</Button>
								) : (
									<span className="text-fg-muted">
										{ __(
											'Original not kept',
											'cliedesk'
										) }
									</span>
								) }
							</li>
						) ) }
					</ul>
				) }
				{ original.data?.data && (
					<section
						aria-label={ __( 'Original text', 'cliedesk' ) }
						className="rounded-md border border-warning-line bg-warning-subtle p-3"
					>
						<RichText
							html={ original.data.data.html ?? null }
							text={ original.data.data.text ?? '' }
						/>
					</section>
				) }
			</div>
		</Modal>
	);
}
