/**
 * Bulk merge (CNV-43): choose which selected conversation to keep, then that conversation opens with the merge
 * dialog filled in (the others) and previewed, where the agent picks what to keep and confirms.
 */
import { Button, Modal, RadioGroup } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import type { InboxItem } from './api';

/** Most conversations merged at once from the bulk bar. */
export const MAX_BULK_MERGE = 10;

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.items   Selected conversations (2 to MAX_BULK_MERGE).
 * @param props.onClose Close.
 */
export function BulkMergeDialog( {
	items,
	onClose,
}: {
	items: InboxItem[];
	onClose: () => void;
} ) {
	const navigate = useNavigate();
	const oldest = [ ...items ].sort( ( a, b ) => a.number - b.number )[ 0 ];
	const [ keep, setKeep ] = useState( String( oldest?.number ?? '' ) );
	const go = () => {
		const others = items
			.map( ( i ) => i.number )
			.filter( ( n ) => String( n ) !== keep );
		onClose();
		void navigate( {
			to: '/c/$number',
			params: { number: keep },
			search: { merge: others.join( ',' ) },
		} as never );
	};
	return (
		<Modal
			isOpen
			size="sm"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %d: number of conversations. */
				__( 'Merge %d conversations', 'cliedesk' ),
				items.length
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button variant="primary" onPress={ go }>
						{ __( 'Continue', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="text-sm text-fg-muted">
					{ __(
						'The others are merged into the conversation you keep. You see a preview and choose what to keep before anything changes.',
						'cliedesk'
					) }
				</p>
				<RadioGroup
					label={ __( 'Keep', 'cliedesk' ) }
					value={ keep }
					onChange={ setKeep }
					options={ items.map( ( i ) => ( {
						id: String( i.number ),
						label: `#${ i.number } ${ i.subject }`,
					} ) ) }
				/>
			</div>
		</Modal>
	);
}
