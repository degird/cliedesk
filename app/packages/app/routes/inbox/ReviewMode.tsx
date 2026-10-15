/**
 * Review mode (INB-27): one card at a time with one-key actions, on by default in the Spam view. Keys: A "Not
 * spam" (POST conversations/{id}/not-spam), D "Move to Trash" (…/trash), R assign (…/assign, If-Match), E or Enter
 * opens the conversation to edit it, J / K next and previous, "." repeats the last action on the current card. The
 * counter shows how many are left. With Pro, the same mode reviews AI work (slot).
 */
import { api, can, getBoot, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Menu, MenuItem, announce } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { inboxKeys, type InboxItem } from '../../inbox/api';
import { ActionError, useAgents } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import { spamReasonText } from '../../inbox/spam';
import { useShortcut } from '../../shortcuts';
import { versionTag } from '../../workspace/api';

type ReviewAction =
	| { kind: 'not_spam' }
	| { kind: 'trash' }
	| { kind: 'assign'; assigneeId: number | null };

/**
 * Request of an action on a conversation.
 *
 * @param item Conversation row.
 * @param a    Action.
 */
export function reviewRequest(
	item: InboxItem,
	a: ReviewAction
): { path: string; body: Record< string, unknown >; ifMatch?: string } {
	switch ( a.kind ) {
		case 'not_spam':
			return { path: `conversations/${ item.id }/not-spam`, body: {} };
		case 'trash':
			return { path: `conversations/${ item.id }/trash`, body: {} };
		default:
			return {
				path: `conversations/${ item.id }/assign`,
				body: { assigneeId: a.assigneeId },
				ifMatch: versionTag( item.version ),
			};
	}
}

function actionLabel(
	a: ReviewAction,
	name: ( id: number ) => string | null
): string {
	switch ( a.kind ) {
		case 'not_spam':
			return __( 'Not spam', 'cliedesk' );
		case 'trash':
			return __( 'Move to Trash', 'cliedesk' );
		default:
			return a.assigneeId === null
				? __( 'Unassign', 'cliedesk' )
				: sprintf(
						/* translators: %s: agent name. */
						__( 'Assign to %s', 'cliedesk' ),
						name( a.assigneeId ) ?? `#${ a.assigneeId }`
					);
	}
}

/**
 * Review cards.
 *
 * @param props        Props.
 * @param props.items  Conversations of the view (loaded pages).
 * @param props.total  How many the view has, when known.
 * @param props.onOpen Open a conversation.
 */
export function ReviewMode( {
	items,
	total,
	onOpen,
}: {
	items: InboxItem[];
	total: number | null;
	onOpen: ( item: InboxItem ) => void;
} ) {
	const qc = useQueryClient();
	const { agents, nameFor } = useAgents();
	const me = getBoot().user?.id ?? 0;
	const [ done, setDone ] = useState< number[] >( [] );
	const [ at, setAt ] = useState( 0 );
	const [ last, setLast ] = useState< ReviewAction | null >( null );
	const left = items.filter( ( i ) => ! done.includes( i.id ) );
	const index = Math.min( at, Math.max( left.length - 1, 0 ) );
	const current = left[ index ] ?? null;
	const canSpam = can( 'cliedesk_manage_spam' );
	const canTrash = can( 'cliedesk_trash_conversations' );
	const canAssign = can( 'cliedesk_assign_others' );
	const run = useMutation( {
		mutationFn: ( {
			item,
			action,
		}: {
			item: InboxItem;
			action: ReviewAction;
		} ) => {
			const r = reviewRequest( item, action );
			return api.post( r.path, {
				body: r.body,
				...( r.ifMatch ? { ifMatch: r.ifMatch } : {} ),
			} );
		},
		onSuccess: ( _r, { item, action } ) => {
			setDone( ( l ) => [ ...l, item.id ] );
			setLast( action );
			announce(
				sprintf(
					/* translators: 1: action, 2: conversation number. */
					__( '%1$s: #%2$d.', 'cliedesk' ),
					actionLabel( action, nameFor ),
					item.number
				)
			);
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
		},
	} );
	const act = ( action: ReviewAction ) => {
		if ( current && ! run.isPending ) {
			run.mutate( { item: current, action } );
		}
	};
	const group = __( 'Review mode', 'cliedesk' );
	const has = !! current;
	useShortcut(
		{
			id: 'review-approve',
			keys: 'a',
			label: __( 'Not spam', 'cliedesk' ),
			group,
			run: () => act( { kind: 'not_spam' } ),
		},
		has && canSpam
	);
	useShortcut(
		{
			id: 'review-trash',
			keys: 'd',
			label: __( 'Move to Trash', 'cliedesk' ),
			group,
			run: () => act( { kind: 'trash' } ),
		},
		has && canTrash
	);
	useShortcut(
		{
			id: 'review-assign-me',
			keys: 'r',
			label: __( 'Assign to me', 'cliedesk' ),
			group,
			run: () => act( { kind: 'assign', assigneeId: me } ),
		},
		has && canAssign
	);
	useShortcut(
		{
			id: 'review-open',
			keys: 'e',
			label: __( 'Open to edit', 'cliedesk' ),
			group,
			run: () => current && onOpen( current ),
		},
		has
	);
	useShortcut(
		{
			id: 'review-next',
			keys: 'j',
			label: __( 'Next card', 'cliedesk' ),
			group,
			run: () => setAt( ( n ) => Math.min( n + 1, left.length - 1 ) ),
		},
		has
	);
	useShortcut(
		{
			id: 'review-prev',
			keys: 'k',
			label: __( 'Previous card', 'cliedesk' ),
			group,
			run: () => setAt( ( n ) => Math.max( n - 1, 0 ) ),
		},
		has
	);
	useShortcut(
		{
			id: 'review-repeat',
			keys: '.',
			label: __( 'Repeat the last action', 'cliedesk' ),
			group,
			run: () => last && act( last ),
		},
		has && !! last
	);
	const remaining = Math.max(
		( total ?? items.length ) - done.length,
		left.length
	);
	return (
		<section aria-labelledby="cd-review" className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="cd-review" className="text-base font-semibold">
					{ __( 'Review', 'cliedesk' ) }
				</h2>
				<p className="text-sm text-fg-muted" aria-live="polite">
					{ sprintf(
						/* translators: %d: conversations left to review. */
						_n( '%d left', '%d left', remaining, 'cliedesk' ),
						remaining
					) }
				</p>
			</div>
			<ActionError error={ run.error } onDismiss={ () => run.reset() } />
			{ ! current ? (
				<p className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center text-fg-muted">
					{ __( 'Nothing left to review.', 'cliedesk' ) }
				</p>
			) : (
				<article
					aria-label={ sprintf(
						/* translators: 1: conversation number, 2: subject. */
						__( '#%1$d %2$s', 'cliedesk' ),
						current.number,
						current.subject
					) }
					className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
				>
					<header className="flex flex-col gap-1">
						<h3 className="text-lg font-semibold">
							#{ current.number } <bdi>{ current.subject }</bdi>
						</h3>
						<p className="text-sm text-fg-muted">
							<bdi>{ current.requesterName }</bdi>
							{ current.lastMessageAt
								? ` · ${ fullTime( current.lastMessageAt ) }`
								: '' }
						</p>
						{ current.spam && (
							<p className="text-sm">
								{ spamReasonText( current.spam ) }
							</p>
						) }
					</header>
					<p className="whitespace-pre-line">
						{ current.lastMessagePreview }
					</p>
					<div className="flex flex-wrap gap-2">
						{ canSpam && (
							<Button
								variant="primary"
								isDisabled={ run.isPending }
								onPress={ () => act( { kind: 'not_spam' } ) }
							>
								{ __( 'Not spam (A)', 'cliedesk' ) }
							</Button>
						) }
						{ canTrash && (
							<Button
								variant="danger"
								isDisabled={ run.isPending }
								onPress={ () => act( { kind: 'trash' } ) }
							>
								{ __( 'Move to Trash (D)', 'cliedesk' ) }
							</Button>
						) }
						{ canAssign && (
							<Menu
								aria-label={ __( 'Assign to', 'cliedesk' ) }
								onAction={ ( k ) =>
									act( {
										kind: 'assign',
										assigneeId:
											k === 'none' ? null : Number( k ),
									} )
								}
								trigger={
									<Button isDisabled={ run.isPending }>
										{ __(
											'Assign… (R: to me)',
											'cliedesk'
										) }
									</Button>
								}
							>
								<MenuItem id="none">
									{ __( 'Unassigned', 'cliedesk' ) }
								</MenuItem>
								{ agents.map( ( a ) => (
									<MenuItem
										key={ a.userId }
										id={ String( a.userId ) }
									>
										{ a.name }
									</MenuItem>
								) ) }
							</Menu>
						) }
						<Button onPress={ () => onOpen( current ) }>
							{ __( 'Open to edit (E)', 'cliedesk' ) }
						</Button>
						{ last && (
							<Button
								variant="ghost"
								onPress={ () => act( last ) }
							>
								{ sprintf(
									/* translators: %s: last action, e.g. "Not spam". */
									__( 'Repeat: %s (.)', 'cliedesk' ),
									actionLabel( last, nameFor )
								) }
							</Button>
						) }
					</div>
					<p className="text-xs text-fg-muted">
						{ sprintf(
							/* translators: 1: card position, 2: cards loaded. */
							__(
								'Card %1$d of %2$d. J and K move between cards.',
								'cliedesk'
							),
							index + 1,
							left.length
						) }
					</p>
				</article>
			) }
		</section>
	);
}
