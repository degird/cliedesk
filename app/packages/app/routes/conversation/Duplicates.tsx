/**
 * Duplicate banner (CNV-46) and split dialog (CNV-47) of a conversation.
 * - GET conversations/{id}/duplicates lists open conversations of the same customer, or about the same order,
 *   created shortly before. The banner offers "Link as duplicate" (POST …/links {targetId, type: duplicate_of}) for
 *   the best candidate that is not linked yet, and can be dismissed for this visit.
 * - Split (cliedesk_merge_conversations): choose messages, a subject and the fields to copy; POST …/split creates a
 *   split-from conversation (customer, channel and queue copied; the intake pipeline runs on it), then opens it.
 */
import {
	api,
	can,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Banner, Button, Checkbox, Modal, TextField } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import {
	conversationKeys,
	fieldsQuery,
	linksQuery,
	messagesQuery,
	type Conversation,
} from '../../inbox/api';
import { ActionError, Muted } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import { announceResult } from '../../workspace/forms';
import { isNote } from './Notes';
import { afterChange } from './shared';

export interface DuplicateCandidate {
	conversationId: number;
	number: number;
	subject: string;
	reason: 'same_customer' | 'same_order' | string;
	score: number;
}

export const duplicatesQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'conversation', id, 'duplicates' ] as const,
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< DuplicateCandidate[] >(
					`conversations/${ id }/duplicates`,
					{ signal }
				)
			).data;
			return Array.isArray( d ) ? d : [];
		},
		staleTime: 60 * 1000,
	} );

/**
 * Banner for the best duplicate candidate not linked yet.
 *
 * @param props   Props.
 * @param props.c Conversation.
 */
export function DuplicateBanner( { c }: { c: Conversation } ) {
	const qc = useQueryClient();
	const q = useQuery( duplicatesQuery( c.id ) );
	const links = useQuery( linksQuery( c.id ) );
	const [ dismissed, setDismissed ] = useState< number[] >( [] );
	const link = useMutation( {
		mutationFn: ( d: DuplicateCandidate ) =>
			api.post( `conversations/${ c.id }/links`, {
				body: { targetId: d.conversationId, type: 'duplicate_of' },
			} ),
		onSuccess: () => {
			announceResult( __( 'Linked as a duplicate.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: conversationKeys.links( c.id ),
			} );
			afterChange( qc, c.id );
		},
	} );
	const linked = new Set(
		( links.data?.links ?? [] ).map( ( l ) => l.conversationId )
	);
	const d = ( q.data ?? [] ).find(
		( x ) =>
			! linked.has( x.conversationId ) &&
			! dismissed.includes( x.conversationId )
	);
	if ( ! d || ! links.data ) {
		return null;
	}
	const why =
		d.reason === 'same_order'
			? __( 'same order', 'cliedesk' )
			: __( 'same customer', 'cliedesk' );
	return (
		<Banner
			tone="info"
			title={ sprintf(
				/* translators: 1: conversation number, 2: subject, 3: reason, e.g. "same order". */
				__(
					'This may be a duplicate of #%1$d “%2$s” (%3$s).',
					'cliedesk'
				),
				d.number,
				d.subject,
				why
			) }
			actions={
				<>
					{ can( 'cliedesk_edit_conversation_fields' ) && (
						<Button
							size="sm"
							isLoading={ link.isPending }
							onPress={ () => link.mutate( d ) }
						>
							{ __( 'Link as duplicate', 'cliedesk' ) }
						</Button>
					) }
					<Button
						size="sm"
						variant="ghost"
						onPress={ () =>
							setDismissed( ( l ) => [ ...l, d.conversationId ] )
						}
					>
						{ __( 'Not a duplicate', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<ActionError error={ link.error } />
		</Banner>
	);
}

/**
 * Split dialog.
 *
 * @param props         Props.
 * @param props.c       Conversation.
 * @param props.onClose Close.
 */
export function SplitDialog( {
	c,
	onClose,
}: {
	c: Conversation;
	onClose: () => void;
} ) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const messages = useQuery( messagesQuery( c.id ) );
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const [ chosen, setChosen ] = useState< number[] >( [] );
	const [ fieldIds, setFieldIds ] = useState< number[] >( [] );
	const [ subject, setSubject ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const split = useMutation( {
		mutationFn: () =>
			api.post< Conversation >( `conversations/${ c.id }/split`, {
				body: {
					messageIds: chosen,
					...( fieldIds.length ? { fieldIds } : {} ),
					...( subject.trim() ? { subject: subject.trim() } : {} ),
				},
			} ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %d: new conversation number. */
					__( 'Split into #%d.', 'cliedesk' ),
					r.data.number
				)
			);
			afterChange( qc, c.id );
			onClose();
			void navigate( {
				to: '/c/$number',
				params: { number: String( r.data.number ) },
			} );
		},
	} );
	const list = ( messages.data ?? [] ).filter(
		( m ) => ! isNote( m ) && ! m.deletedAt && m.kind !== 'forward'
	);
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! chosen.length ) {
			setError( __( 'Choose at least one message.', 'cliedesk' ) );
			return;
		}
		setError( null );
		split.mutate();
	};
	const toggle = ( set: typeof setChosen, id: number, on: boolean ) =>
		set( ( l ) => ( on ? [ ...l, id ] : l.filter( ( x ) => x !== id ) ) );
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %d: conversation number. */
				__( 'Split #%d', 'cliedesk' ),
				c.number
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-split"
						variant="primary"
						isLoading={ split.isPending }
					>
						{ __( 'Split into a new conversation', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-split"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ __(
						'The chosen messages move to a new conversation with the same customer, channel and queue. Both conversations are linked.',
						'cliedesk'
					) }
				</p>
				<ActionError error={ split.error } />
				<fieldset className="flex flex-col gap-2">
					<legend className="pb-1 text-sm font-medium">
						{ __( 'Messages to move', 'cliedesk' ) }
					</legend>
					{ messages.isPending && (
						<Muted>{ __( 'Loading…', 'cliedesk' ) }</Muted>
					) }
					{ list.map( ( m ) => (
						<Checkbox
							key={ m.id }
							isSelected={ chosen.includes( m.id ) }
							onChange={ ( on ) => toggle( setChosen, m.id, on ) }
						>
							<span className="flex flex-col">
								<span className="text-xs text-fg-muted">
									{ fullTime( m.createdAt ) }
								</span>
								<span className="line-clamp-2">{ m.text }</span>
							</span>
						</Checkbox>
					) ) }
					{ error && (
						<p role="alert" className="text-sm text-danger">
							{ error }
						</p>
					) }
				</fieldset>
				<TextField
					label={ __(
						'Subject of the new conversation',
						'cliedesk'
					) }
					description={ __(
						'Optional. Empty: made from the first message.',
						'cliedesk'
					) }
					value={ subject }
					onChange={ setSubject }
					maxLength={ 255 }
				/>
				{ ( fields.data ?? [] ).length > 0 && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Copy these fields', 'cliedesk' ) }
						</legend>
						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{ ( fields.data ?? [] ).map( ( f ) => (
								<Checkbox
									key={ f.id }
									isSelected={ fieldIds.includes( f.id ) }
									onChange={ ( on ) =>
										toggle( setFieldIds, f.id, on )
									}
								>
									{ f.label }
								</Checkbox>
							) ) }
						</div>
					</fieldset>
				) }
			</form>
		</Modal>
	);
}
