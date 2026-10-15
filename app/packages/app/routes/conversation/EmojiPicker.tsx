/**
 * Emoji for replies and notes (INB-44): a small menu of common emoji inserted at the end of the text.
 */
import { Menu, MenuItem, UnstyledButton } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { Smile } from 'lucide-react';
import { TOOL_BUTTON } from './shared';

export const EMOJI = [
	'😊',
	'🙂',
	'😉',
	'😄',
	'🙏',
	'👍',
	'👋',
	'🎉',
	'❤️',
	'✅',
	'⭐',
	'📦',
	'🚚',
	'💳',
	'🔁',
	'⏳',
];

/**
 * Emoji menu.
 *
 * @param props          Props.
 * @param props.onInsert Insert the emoji.
 */
export function EmojiPicker( {
	onInsert,
}: {
	onInsert: ( e: string ) => void;
} ) {
	return (
		<Menu
			aria-label={ __( 'Emoji', 'cliedesk' ) }
			placement="top start"
			onAction={ ( k ) => onInsert( String( k ) ) }
			trigger={
				<UnstyledButton
					aria-label={ __( 'Insert emoji', 'cliedesk' ) }
					className={ TOOL_BUTTON }
				>
					<Smile aria-hidden="true" size={ 16 } />
				</UnstyledButton>
			}
		>
			{ EMOJI.map( ( e ) => (
				<MenuItem key={ e } id={ e }>
					{ e }
				</MenuItem>
			) ) }
		</Menu>
	);
}
