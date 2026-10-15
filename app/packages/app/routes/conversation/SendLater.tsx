/**
 * Send later dialog (INB-51), loaded on demand: tomorrow 9:00, Monday 9:00 or a chosen time, in the agent's time
 * zone or the customer's (when the customer's profile has one), and whether to send only if the customer has not
 * replied by then.
 */
import { can, useQuery } from '@cliedesk/data';
import { Button, Checkbox, Modal, RadioGroup, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { contactQuery } from '../../inbox/api';
import {
	customSendAt,
	sendPresets,
	validZone,
	whenIn,
	type SendPreset,
} from '../../inbox/sendLater';
import { utcValue } from '../../inbox/snooze';

/**
 * Dialog.
 *
 * @param props             Props.
 * @param props.requesterId Customer of the conversation (time zone).
 * @param props.onClose     Close.
 * @param props.onSchedule  Schedule at a UTC time.
 * @param props.isLoading   Saving.
 */
export default function SendLaterDialog( {
	requesterId,
	onClose,
	onSchedule,
	isLoading,
}: {
	requesterId: number;
	onClose: () => void;
	onSchedule: ( at: string, ifNoReply: boolean ) => void;
	isLoading: boolean;
} ) {
	const requester = useQuery( {
		...contactQuery( requesterId ),
		enabled: can( 'cliedesk_view_contacts' ),
	} );
	const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const theirs = requester.data?.timezone;
	const offerTheirs = validZone( theirs ) && theirs !== mine;
	const [ preset, setPreset ] = useState< SendPreset >( 'tomorrow' );
	const [ custom, setCustom ] = useState( '' );
	const [ customerZone, setCustomerZone ] = useState( false );
	const [ ifNoReply, setIfNoReply ] = useState( true );
	const [ error, setError ] = useState< string | null >( null );
	const zone = customerZone && offerTheirs ? theirs : null;
	const presets = sendPresets( new Date(), zone );
	const label = ( id: Exclude< SendPreset, 'custom' > ) =>
		id === 'tomorrow'
			? __( 'Tomorrow at 9:00', 'cliedesk' )
			: __( 'Monday at 9:00', 'cliedesk' );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		// The dialog is rendered inside the composer form (React tree): do not submit that one too.
		e.stopPropagation();
		const p = presets.find( ( x ) => x.id === preset );
		const at = p ? utcValue( p.at ) : customSendAt( custom, zone );
		if ( ! at || new Date( at ).getTime() < Date.now() + 60_000 ) {
			setError(
				__( 'Choose a time at least one minute from now.', 'cliedesk' )
			);
			return;
		}
		onSchedule( at, ifNoReply );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Send later', 'cliedesk' ) }
			size="sm"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-send-later"
						variant="primary"
						isLoading={ isLoading }
					>
						{ __( 'Schedule reply', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-send-later"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ offerTheirs && (
					<Checkbox
						isSelected={ customerZone }
						onChange={ setCustomerZone }
					>
						{ sprintf(
							/* translators: %s: time zone, e.g. Europe/Berlin. */
							__(
								'Use the customer’s time zone (%s)',
								'cliedesk'
							),
							theirs
						) }
					</Checkbox>
				) }
				<RadioGroup
					label={ __( 'Send at', 'cliedesk' ) }
					value={ preset }
					onChange={ ( v ) => {
						setPreset( v as SendPreset );
						setError( null );
					} }
					options={ [
						...presets.map( ( p ) => ( {
							id: p.id,
							label: `${ label( p.id ) } (${ whenIn(
								p.at,
								zone
							) })`,
						} ) ),
						{
							id: 'custom',
							label: __( 'Pick a date and time', 'cliedesk' ),
						},
					] }
				/>
				{ preset === 'custom' && (
					<TextField
						label={ __( 'Date and time', 'cliedesk' ) }
						description={
							zone
								? sprintf(
										/* translators: %s: time zone. */
										__( 'Time in %s.', 'cliedesk' ),
										zone
									)
								: __( 'Your time zone.', 'cliedesk' )
						}
						type="datetime-local"
						isRequired
						value={ custom }
						onChange={ ( x ) => {
							setCustom( x );
							setError( null );
						} }
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
					/>
				) }
				{ error && (
					<p role="alert" className="text-sm text-danger">
						{ error }
					</p>
				) }
				<Checkbox isSelected={ ifNoReply } onChange={ setIfNoReply }>
					{ __(
						'Only send if the customer has not replied by then',
						'cliedesk'
					) }
				</Checkbox>
			</form>
		</Modal>
	);
}
