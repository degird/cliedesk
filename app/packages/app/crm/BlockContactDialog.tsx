/**
 * Block a contact (SEC-18): why, on which channels (all, or chosen ones) and how (send their new conversations to
 * Spam silently, the default, or drop them). Sends POST contacts/{id}/block {blocked: true, reason, channels, mode}.
 */
import { Button, Checkbox, Modal, RadioGroup, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../inbox/components';
import { CHANNEL_KEYS, channelLabel } from '../inbox/labels';
import type { BlockInput, BlockMode } from '../security/blocks';
import { apiFieldErrors } from '../workspace/forms';

/**
 * Dialog.
 *
 * @param props           Props.
 * @param props.name      Contact name.
 * @param props.error     Error of the last attempt.
 * @param props.isLoading Saving.
 * @param props.onBlock   Block with these details.
 * @param props.onClose   Close.
 */
export function BlockContactDialog( {
	name,
	error,
	isLoading,
	onBlock,
	onClose,
}: {
	name: string;
	error: unknown;
	isLoading: boolean;
	onBlock: ( details: BlockInput ) => void;
	onClose: () => void;
} ) {
	const [ reason, setReason ] = useState( '' );
	const [ scope, setScope ] = useState< 'all' | 'some' >( 'all' );
	const [ channels, setChannels ] = useState< string[] >( [] );
	const [ mode, setMode ] = useState< BlockMode >( 'quarantine' );
	const [ channelError, setChannelError ] = useState< string | null >( null );
	const server = apiFieldErrors( error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( scope === 'some' && ! channels.length ) {
			setChannelError( __( 'Choose at least one channel.', 'cliedesk' ) );
			return;
		}
		setChannelError( null );
		onBlock( {
			...( reason.trim() ? { reason: reason.trim() } : {} ),
			channels: scope === 'all' ? [] : channels,
			mode,
		} );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: contact name. */
				__( 'Block %s', 'cliedesk' ),
				name
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-block-contact"
						variant="danger"
						isLoading={ isLoading }
					>
						{ __( 'Block contact', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-block-contact"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ __(
						'New messages from this contact no longer reach the inbox. Their data and earlier conversations are kept, and you can unblock them at any time.',
						'cliedesk'
					) }
				</p>
				<ActionError error={ error } />
				<TextField
					label={ __( 'Reason', 'cliedesk' ) }
					description={ __(
						'Optional. Shown in the blocked list.',
						'cliedesk'
					) }
					value={ reason }
					onChange={ setReason }
					maxLength={ 255 }
					errorMessage={ server.reason ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<RadioGroup
					label={ __( 'Channels', 'cliedesk' ) }
					value={ scope }
					onChange={ ( v ) => {
						setScope( v as 'all' | 'some' );
						setChannelError( null );
					} }
					options={ [
						{ id: 'all', label: __( 'All channels', 'cliedesk' ) },
						{
							id: 'some',
							label: __( 'Only these channels', 'cliedesk' ),
						},
					] }
				/>
				{ scope === 'some' && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1 text-sm font-medium">
							{ __( 'Block on', 'cliedesk' ) }
						</legend>
						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{ CHANNEL_KEYS.map( ( c ) => (
								<Checkbox
									key={ c }
									isSelected={ channels.includes( c ) }
									onChange={ ( on ) => {
										setChannelError( null );
										setChannels( ( l ) =>
											on
												? [ ...l, c ]
												: l.filter( ( x ) => x !== c )
										);
									} }
								>
									{ channelLabel( c ) }
								</Checkbox>
							) ) }
						</div>
						{ ( channelError ?? server.channels ) && (
							<p role="alert" className="text-sm text-danger">
								{ channelError ?? server.channels }
							</p>
						) }
					</fieldset>
				) }
				<RadioGroup
					label={ __( 'What happens to their messages', 'cliedesk' ) }
					value={ mode }
					onChange={ ( v ) => setMode( v as BlockMode ) }
					options={ [
						{
							id: 'quarantine',
							label: __( 'Spam silently', 'cliedesk' ),
							description: __(
								'New conversations go to Spam without a notice. You can still look at them.',
								'cliedesk'
							),
						},
						{
							id: 'drop',
							label: __( 'Drop', 'cliedesk' ),
							description: __(
								'New messages are refused and nothing is kept.',
								'cliedesk'
							),
						},
					] }
					errorMessage={ server.mode ?? null }
				/>
			</form>
		</Modal>
	);
}
