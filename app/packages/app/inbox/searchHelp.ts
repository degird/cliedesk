/**
 * Search help as you type (INB-30): the operators the server understands (mirrors Search::help() and the
 * SearchQuery keys), matched against the word being typed.
 */
import { __ } from '@wordpress/i18n';

export interface OperatorHelp {
	/** Operator as typed, e.g. `status:` or `created>`. */
	key: string;
	example: string;
	description: string;
}

/** Operators, in the order they are offered. */
export const operators = (): OperatorHelp[] => [
	{
		key: 'status:',
		example: 'status:open',
		description: __( 'Status or status group', 'cliedesk' ),
	},
	{
		key: 'tag:',
		example: 'tag:refund',
		description: __( 'Tagged', 'cliedesk' ),
	},
	{
		key: 'assignee:',
		example: 'assignee:none',
		description: __( 'Unassigned, me, or a user', 'cliedesk' ),
	},
	{
		key: 'customer:',
		example: 'customer:ana@example.com',
		description: __( 'Customer by email, phone or name', 'cliedesk' ),
	},
	{
		key: 'email:',
		example: 'email:ana@example.com',
		description: __( 'Customer email address', 'cliedesk' ),
	},
	{
		key: 'order:',
		example: 'order:1042',
		description: __( 'Linked order', 'cliedesk' ),
	},
	{
		key: 'type:',
		example: 'type:request',
		description: __( 'Conversation type', 'cliedesk' ),
	},
	{
		key: 'queue:',
		example: 'queue:billing',
		description: __( 'Queue', 'cliedesk' ),
	},
	{
		key: 'team:',
		example: 'team:support',
		description: __( 'Team', 'cliedesk' ),
	},
	{
		key: 'priority:',
		example: 'priority:urgent',
		description: __( 'Priority', 'cliedesk' ),
	},
	{
		key: 'channel:',
		example: 'channel:email',
		description: __( 'Channel', 'cliedesk' ),
	},
	{
		key: 'product:',
		example: 'product:shop',
		description: __( 'Product', 'cliedesk' ),
	},
	{
		key: 'brand:',
		example: 'brand:acme',
		description: __( 'Brand', 'cliedesk' ),
	},
	{
		key: 'field.',
		example: 'field.plan:pro',
		description: __( 'Custom field value', 'cliedesk' ),
	},
	{
		key: 'has:',
		example: 'has:attachment',
		description: __(
			'Has attachments, notes, tags or an assignee',
			'cliedesk'
		),
	},
	{
		key: 'note:',
		example: 'note:refund',
		description: __( 'Only in internal notes', 'cliedesk' ),
	},
	{
		key: 'from:',
		example: 'from:customer',
		description: __(
			'Messages from customer, agent, ai or a person',
			'cliedesk'
		),
	},
	{
		key: 'after:',
		example: 'after:2026-01-01',
		description: __( 'Created after this day', 'cliedesk' ),
	},
	{
		key: 'before:',
		example: 'before:2026-01-01',
		description: __( 'Created before this day', 'cliedesk' ),
	},
	{
		key: 'on:',
		example: 'on:2026-01-01',
		description: __( 'Created on this day', 'cliedesk' ),
	},
	{
		key: 'between:',
		example: 'between:2026-01-01..2026-01-31',
		description: __( 'Created between two days', 'cliedesk' ),
	},
	{
		key: 'created>',
		example: 'created>7d',
		description: __(
			'Older than 7 days (created<7d: newer; also updated, resolved)',
			'cliedesk'
		),
	},
	{
		key: 'in:',
		example: 'in:trash',
		description: __( 'Search trash, spam or all', 'cliedesk' ),
	},
];

/** Most suggestions shown at once. */
const MAX = 5;

/**
 * The word being typed (after the last space, ignoring a leading `-`).
 *
 * @param value Search text.
 */
export function currentWord( value: string ): string {
	const word = value.split( /\s/ ).pop() ?? '';
	return word.replace( /^-/, '' ).toLowerCase();
}

/**
 * Help for the word being typed: operators it could start, or the operator it uses.
 *
 * @param value Search text.
 */
export function helpFor( value: string ): {
	suggestions: OperatorHelp[];
	using: OperatorHelp | null;
} {
	const word = currentWord( value );
	if ( ! word || word.startsWith( '"' ) || word.startsWith( '#' ) ) {
		return { suggestions: [], using: null };
	}
	const all = operators();
	const using =
		all.find(
			( o ) =>
				word.startsWith( o.key ) ||
				( o.key === 'created>' &&
					/^(created|updated|resolved)[<>]/.test( word ) )
		) ?? null;
	if ( using ) {
		return { suggestions: [], using };
	}
	return {
		suggestions: all
			.filter( ( o ) => o.key.startsWith( word ) && o.key !== word )
			.slice( 0, MAX ),
		using: null,
	};
}

/**
 * Replace the word being typed with an operator.
 *
 * @param value Search text.
 * @param key   Operator key.
 */
export function completeWord( value: string, key: string ): string {
	const m = /(^|\s)(-?)(\S*)$/.exec( value );
	if ( ! m ) {
		return value + key;
	}
	return (
		value.slice( 0, value.length - m[ 2 ]!.length - m[ 3 ]!.length ) +
		m[ 2 ] +
		key
	);
}
