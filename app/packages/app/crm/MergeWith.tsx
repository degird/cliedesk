/**
 * "Merge with…": pick another contact (GET contacts?q=) or organization (GET organizations?q=), then open the
 * merge dialog with the current record as the primary.
 */
import { Button, Modal } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ContactPicker, OrgPicker, type PickedItem } from './components';
import MergeDialog, { type MergeKind } from './MergeDialog';

/**
 * Picker, then merge dialog.
 *
 * @param props         Props.
 * @param props.kind    contact | organization.
 * @param props.current The record whose page is open (kept by default).
 * @param props.onClose Close.
 */
export function MergeWithDialog( {
	kind,
	current,
	onClose,
}: {
	kind: MergeKind;
	current: PickedItem;
	onClose: () => void;
} ) {
	const [ picked, setPicked ] = useState< PickedItem | null >( null );
	const [ step, setStep ] = useState< 'pick' | 'merge' >( 'pick' );
	if ( step === 'merge' && picked ) {
		return (
			<MergeDialog
				kind={ kind }
				first={ current }
				second={ picked }
				onClose={ onClose }
			/>
		);
	}
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				kind === 'contact'
					? __( 'Merge with another contact', 'cliedesk' )
					: __( 'Merge with another organization', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isDisabled={ ! picked }
						onPress={ () => setStep( 'merge' ) }
					>
						{ __( 'Continue', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			{ kind === 'contact' ? (
				<ContactPicker
					exclude={ [ current.id ] }
					value={ picked }
					onChange={ setPicked }
				/>
			) : (
				<OrgPicker
					exclude={ [ current.id ] }
					value={ picked }
					onChange={ setPicked }
				/>
			) }
		</Modal>
	);
}
