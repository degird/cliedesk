/**
 * "Customize panel" (INB-66): my own side panel layout, saved in my preferences so it follows me across devices.
 * "Use the team layout" drops it, so the layout an admin set for my team or the conversation type applies again.
 */
import { Button, Modal } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { PanelOrderEditor, fullLayout } from '../../inbox/PanelOrderEditor';
import type { PanelLayout } from '../../inbox/panel';
import { savePrefs } from '../../prefs';

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.layout  Layout in use.
 * @param props.own     Whether it is my own layout.
 * @param props.onClose Close.
 */
export default function PanelCustomizeDialog( {
	layout,
	own,
	onClose,
}: {
	layout: PanelLayout | null;
	own: boolean;
	onClose: () => void;
} ) {
	const [ draft, setDraft ] = useState( () => fullLayout( layout ) );
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Customize the side panel', 'cliedesk' ) }
			size="lg"
			footer={
				<>
					{ own && (
						<Button
							onPress={ () => {
								savePrefs( { layout: { panel: null } } );
								onClose();
							} }
						>
							{ __( 'Use the team layout', 'cliedesk' ) }
						</Button>
					) }
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						onPress={ () => {
							savePrefs( { layout: { panel: draft } } );
							onClose();
						} }
					>
						{ __( 'Save', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<p className="mb-3 text-sm text-fg-muted">
				{ __(
					'Only you see this layout. It follows you to other devices.',
					'cliedesk'
				) }
			</p>
			<PanelOrderEditor value={ draft } onChange={ setDraft } />
		</Modal>
	);
}
