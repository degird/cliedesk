/**
 * Macro step names (shared by the editor and the composer, kept small for the conversation chunk).
 */
import { __ } from '@wordpress/i18n';
import { extensionStep } from './extensions';

/**
 * Name of a step type.
 *
 * @param t Step type.
 */
export function stepLabel( t: string ): string {
	switch ( t ) {
		case 'status':
			return __( 'Set status', 'cliedesk' );
		case 'priority':
			return __( 'Set priority', 'cliedesk' );
		case 'type':
			return __( 'Set type', 'cliedesk' );
		case 'queue':
			return __( 'Move to queue', 'cliedesk' );
		case 'assign':
			return __( 'Assign', 'cliedesk' );
		case 'tags':
			return __( 'Add or remove tags', 'cliedesk' );
		case 'field':
			return __( 'Set a field', 'cliedesk' );
		case 'follow':
			return __( 'Follow the conversation', 'cliedesk' );
		case 'cc':
			return __( 'Add a CC', 'cliedesk' );
		case 'link':
			return __( 'Link to a conversation', 'cliedesk' );
		case 'task':
			return __( 'Create a task', 'cliedesk' );
		case 'commerce':
			return __( 'Order action', 'cliedesk' );
	}
	return extensionStep( t )?.label ?? t;
}
