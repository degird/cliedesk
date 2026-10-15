/**
 * Bulk "Link to…" (CNV-48): link the selected conversations to one conversation, given by its number, with a link
 * type. POST conversations/links/bulk {ids, targetId, type} (cliedesk_bulk_actions and
 * cliedesk_edit_conversation_fields).
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Modal, Select, TextField } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { announceResult } from '../workspace/forms';
import { ActionError } from './components';
import { LINK_TYPES, linkLabel } from './labels';

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.ids     Selected conversation ids.
 * @param props.onClose Close.
 * @param props.onDone  After linking.
 */
export function BulkLinkDialog( {
	ids,
	onClose,
	onDone,
}: {
	ids: number[];
	onClose: () => void;
	onDone: () => void;
} ) {
	const qc = useQueryClient();
	const [ type, setType ] = useState( 'related' );
	const [ number, setNumber ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const link = useMutation( {
		mutationFn: async () => {
			const n = Number( number.trim().replace( /^#/, '' ) );
			const target = (
				await api.get< { id: number } >( `conversations/number/${ n }` )
			).data;
			return (
				await api.post< { added: number } >(
					'conversations/links/bulk',
					{
						body: { ids, targetId: target.id, type },
					}
				)
			).data;
		},
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %d: number of links added. */
					_n(
						'%d link added.',
						'%d links added.',
						r.added,
						'cliedesk'
					),
					r.added
				)
			);
			void qc.invalidateQueries( { queryKey: [ 'conversation' ] } );
			onDone();
			onClose();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! /^#?\d+$/.test( number.trim() ) ) {
			setError(
				__( 'Enter a conversation number, such as 1042.', 'cliedesk' )
			);
			return;
		}
		setError( null );
		link.mutate();
	};
	return (
		<Modal
			isOpen
			size="sm"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %d: number of selected conversations. */
				_n(
					'Link %d conversation to…',
					'Link %d conversations to…',
					ids.length,
					'cliedesk'
				),
				ids.length
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-bulk-link"
						variant="primary"
						isLoading={ link.isPending }
					>
						{ __( 'Link', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-bulk-link"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ActionError error={ link.error } />
				<Select
					label={ __( 'Each selected conversation is', 'cliedesk' ) }
					value={ type }
					onChange={ setType }
					options={ LINK_TYPES.map( ( t ) => ( {
						id: t,
						label: linkLabel( t ),
					} ) ) }
				/>
				<TextField
					label={ __( 'Conversation #', 'cliedesk' ) }
					inputMode="numeric"
					value={ number }
					onChange={ setNumber }
					errorMessage={ error }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
			</form>
		</Modal>
	);
}
