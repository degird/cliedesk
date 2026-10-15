/**
 * Manual call log (VOX-01): direction, number, duration and notes of a phone call, saved as a call message on this
 * conversation (POST conversations/{id}/calls). Nothing is sent to the customer.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Modal, Select, TextField, toast } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { conversationKeys } from '../../inbox/api';
import { textToHtml } from '../../inbox/html';

export interface CallValues {
	direction: 'inbound' | 'outbound';
	number: string;
	minutes: string;
}

/** The call object sent to the server. */
export function callPayload( v: CallValues ) {
	const minutes = Number( v.minutes.replace( ',', '.' ) );
	return {
		direction: v.direction,
		...( v.number.trim() ? { number: v.number.trim() } : {} ),
		...( Number.isFinite( minutes ) && minutes > 0
			? { durationSeconds: Math.min( 86400, Math.round( minutes * 60 ) ) }
			: {} ),
	};
}

/**
 * Direction, number and duration fields.
 *
 * @param props          Props.
 * @param props.value    Values.
 * @param props.onChange Change.
 */
export function CallFields( {
	value,
	onChange,
}: {
	value: CallValues;
	onChange: ( v: CallValues ) => void;
} ) {
	return (
		<div className="grid gap-3 sm:grid-cols-3">
			<Select
				label={ __( 'Call', 'cliedesk' ) }
				value={ value.direction }
				onChange={ ( d ) =>
					onChange( {
						...value,
						direction: d as CallValues[ 'direction' ],
					} )
				}
				options={ [
					{ id: 'inbound', label: __( 'They called', 'cliedesk' ) },
					{ id: 'outbound', label: __( 'We called', 'cliedesk' ) },
				] }
			/>
			<TextField
				label={ __( 'Phone number', 'cliedesk' ) }
				inputMode="tel"
				maxLength={ 40 }
				value={ value.number }
				onChange={ ( n ) => onChange( { ...value, number: n } ) }
			/>
			<TextField
				label={ __( 'Minutes', 'cliedesk' ) }
				inputMode="decimal"
				maxLength={ 6 }
				value={ value.minutes }
				onChange={ ( m ) => onChange( { ...value, minutes: m } ) }
			/>
		</div>
	);
}

/**
 * "Log a phone call" dialog (opened from the conversation's More menu).
 *
 * @param props                Props.
 * @param props.conversationId Conversation.
 * @param props.onClose        Close.
 */
export function CallLogDialog( {
	conversationId,
	onClose,
}: {
	conversationId: number;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ call, setCall ] = useState< CallValues >( {
		direction: 'outbound',
		number: '',
		minutes: '',
	} );
	const [ notes, setNotes ] = useState( '' );
	const log = useMutation( {
		mutationFn: () =>
			api.post( `conversations/${ conversationId }/calls`, {
				body: {
					call: callPayload( call ),
					...( notes.trim() ? { notes: textToHtml( notes ) } : {} ),
				},
			} ),
		onSuccess: () => {
			onClose();
			toast( {
				tone: 'success',
				title: __( 'Call logged.', 'cliedesk' ),
			} );
			void qc.invalidateQueries( {
				queryKey: conversationKeys.all( conversationId ),
			} );
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		log.mutate();
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Log a phone call', 'cliedesk' ) }
			size="sm"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-call-log"
						variant="primary"
						isLoading={ log.isPending }
					>
						{ __( 'Log call', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-call-log"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ActionError error={ log.error } />
				<CallFields value={ call } onChange={ setCall } />
				<TextField
					label={ __( 'Notes', 'cliedesk' ) }
					multiline
					rows={ 4 }
					value={ notes }
					onChange={ setNotes }
				/>
			</form>
		</Modal>
	);
}
