/**
 * Spam (CNV-22, SEC-15) and trusted / blocked senders (SEC-16): reason texts, sender rule types and calls.
 *
 * Keys: ['senders', 'list', kind, q], ['senders', 'check', email]. Everything here needs cliedesk_manage_spam
 * (canManageSpam()); without it the spam UI is hidden.
 */
import { api, can, queryOptions } from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import type { SpamInfo } from './api';

export const SPAM_VIEW = 'spam';
export const QUARANTINE_LANE = 'quarantine';

/** Whether the current user may mark spam, release it and manage sender rules. */
export const canManageSpam = (): boolean => can( 'cliedesk_manage_spam' );

/**
 * Why a conversation is in Spam, in plain words (the raw key for reasons this screen does not know).
 *
 * @param spam Spam info.
 */
export function spamReasonText( spam: SpamInfo | null | undefined ): string {
	if ( ! spam ) {
		return __( 'This conversation is in Spam.', 'cliedesk' );
	}
	const pattern =
		typeof spam.detail?.pattern === 'string' ? spam.detail.pattern : '';
	switch ( spam.reason ) {
		case 'marked_spam':
			return __( 'Marked as spam by an agent', 'cliedesk' );
		case 'sender_rule':
			return pattern
				? sprintf(
						/* translators: %s: sender pattern, e.g. *.example.com. */
						__( 'Matches the blocked sender rule %s', 'cliedesk' ),
						pattern
					)
				: __( 'Matches a blocked sender rule', 'cliedesk' );
		case 'sender_marked_spam':
			return __(
				'This sender’s earlier conversation was marked as spam',
				'cliedesk'
			);
		case 'auth_failed':
			return __(
				'The sender’s address failed email authentication (SPF, DKIM or DMARC). It may be forged.',
				'cliedesk'
			);
		case 'spam_score':
			if ( spam.detail?.phishing ) {
				return sprintf(
					/* translators: 1: spam score 0-100, 2: what raised it, e.g. "spam_words,links". */
					__(
						'Spam score %1$d of 100, looks like phishing (%2$s)',
						'cliedesk'
					),
					Number( spam.detail?.score ?? 0 ),
					String( spam.detail?.reason ?? '' )
				);
			}
			return sprintf(
				/* translators: 1: spam score 0-100, 2: what raised it, e.g. "spam_words,links". */
				__( 'Spam score %1$d of 100 (%2$s)', 'cliedesk' ),
				Number( spam.detail?.score ?? 0 ),
				String( spam.detail?.reason ?? '' )
			);
	}
	return spam.reason;
}

/**
 * Short reason for a list row chip.
 *
 * @param spam Spam info.
 */
export function spamReasonShort( spam: SpamInfo ): string {
	switch ( spam.reason ) {
		case 'marked_spam':
			return __( 'Marked by an agent', 'cliedesk' );
		case 'sender_rule':
			return typeof spam.detail?.pattern === 'string'
				? sprintf(
						/* translators: %s: sender pattern. */
						__( 'Blocked sender: %s', 'cliedesk' ),
						spam.detail.pattern
					)
				: __( 'Blocked sender', 'cliedesk' );
		case 'sender_marked_spam':
			return __( 'Sender marked as spam before', 'cliedesk' );
		case 'auth_failed':
			return __( 'Failed authentication', 'cliedesk' );
		case 'spam_score':
			return spam.detail?.certain
				? __( 'Almost certainly spam', 'cliedesk' )
				: sprintf(
						/* translators: %d: spam score 0-100. */
						__( 'Spam score %d', 'cliedesk' ),
						Number( spam.detail?.score ?? 0 )
					);
	}
	return spam.reason;
}

// ------------------------------------------------------------------ Sender rules.

export type SenderKind = 'trust' | 'quarantine' | 'drop';
export const SENDER_KINDS: SenderKind[] = [ 'trust', 'quarantine', 'drop' ];

export interface SenderRule {
	id: number;
	pattern: string;
	kind: SenderKind;
	note: string;
	hits: number;
	lastHitAt: string | null;
	createdBy: number | null;
	createdAt: string;
}

export interface SenderCheck {
	/** trust, drop, quarantine or none. */
	action: SenderKind | 'none';
	rules: SenderRule[];
}

/**
 * Name of a rule kind.
 *
 * @param k Kind.
 */
export function senderKindLabel( k: string ): string {
	switch ( k ) {
		case 'trust':
			return __( 'Trusted', 'cliedesk' );
		case 'quarantine':
			return __( 'Blocked: goes to Spam', 'cliedesk' );
		case 'drop':
			return __( 'Blocked: refused', 'cliedesk' );
	}
	return k;
}

/**
 * What a kind does.
 *
 * @param k Kind.
 */
export function senderKindHelp( k: string ): string {
	switch ( k ) {
		case 'trust':
			return __(
				'Mail from this sender always reaches the inbox, even when another rule matches.',
				'cliedesk'
			);
		case 'quarantine':
			return __(
				'New conversations from this sender go to Spam, where you can review them.',
				'cliedesk'
			);
		case 'drop':
			return __(
				'Mail from this sender is refused and never becomes a conversation.',
				'cliedesk'
			);
	}
	return '';
}

/**
 * Result of "check an address", in plain words.
 *
 * @param action Verdict.
 */
export function senderCheckText( action: string ): string {
	switch ( action ) {
		case 'trust':
			return __( 'Trusted: mail reaches the inbox.', 'cliedesk' );
		case 'quarantine':
			return __( 'Blocked: new conversations go to Spam.', 'cliedesk' );
		case 'drop':
			return __( 'Blocked: mail is refused.', 'cliedesk' );
		case 'none':
			return __(
				'No rule matches. The spam filter decides as usual.',
				'cliedesk'
			);
	}
	return action;
}

export const senderKeys = {
	all: [ 'senders' ] as const,
	list: ( kind: string, q: string ) =>
		[ 'senders', 'list', kind, q ] as const,
	check: ( email: string ) => [ 'senders', 'check', email ] as const,
};

export const sendersQuery = ( kind: SenderKind | 'all', q: string ) =>
	queryOptions( {
		queryKey: senderKeys.list( kind, q.trim() ),
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: SenderRule[] } >( 'senders', {
					query: {
						kind: kind === 'all' ? undefined : kind,
						q: q.trim() || undefined,
					},
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

/**
 * What would happen to mail from an address.
 *
 * @param email Address.
 */
export async function checkSender( email: string ): Promise< SenderCheck > {
	const d = (
		await api.get< SenderCheck >( 'senders/check', {
			query: { email: email.trim() },
		} )
	).data;
	return {
		action: d?.action ?? 'none',
		rules: Array.isArray( d?.rules ) ? d.rules : [],
	};
}
