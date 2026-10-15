/**
 * Saved reply picker in the composer (MAC-08, MAC-09, MAC-11). Typing `\`, `!` (or `/` at a line start) or pressing
 * ⌘K/Ctrl+K opens a list of the saved replies that fit this conversation and mode, filtered to the customer's
 * language (Alt+A: all languages), with a preview of the active one. Arrow keys and Enter insert it: the server
 * renders it for this conversation (POST saved-replies/render), the text replaces the trigger, and its actions are
 * sent with the message (`macro`), so they run when the reply is sent or the note added.
 */
import {
	api,
	can,
	keepPreviousData,
	useMutation,
	useQuery,
} from '@cliedesk/data';
import { Banner, Button, IconButton, announce, cx } from '@cliedesk/ui';
import { X } from 'lucide-react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { contactQuery, type Conversation } from '../../inbox/api';
import { htmlToText } from '../../inbox/html';
import {
	filterByLanguage,
	insertAt,
	previewHtml,
	recommendedFirst,
	replyTriggerAt,
} from '../../inbox/replyPicker';
import { panelContextQuery } from '../../inbox/panel';
import type { MacroStep, SavedReply } from '../../macros/api';
import { stepLabel } from '../../macros/stepLabel';
import { manualRulesQuery, requestRunRule } from './ManualRules';

const MAX_OPTIONS = 8;

export interface Macro {
	savedReplyIds: number[];
	steps: MacroStep[];
	names: string[];
	missing: string[];
}

const EMPTY: Macro = { savedReplyIds: [], steps: [], names: [], missing: [] };

interface Rendered {
	savedReplyIds: number[];
	html: string;
	steps: MacroStep[];
	missing: string[];
}

/**
 * Picker state and handlers for one composer.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 * @param props.mode         Composer mode.
 * @param props.text         Editor text.
 * @param props.setText      Set the editor text.
 * @param props.caret        Current caret of the editor.
 * @param props.focus        Focus the editor at a caret.
 */
export function useReplyPicker( {
	conversation,
	mode,
	text,
	setText,
	caret,
	focus,
}: {
	conversation: Conversation;
	mode: 'reply' | 'note';
	text: string;
	setText: ( t: string ) => void;
	caret: () => number;
	focus: ( caret: number ) => void;
} ) {
	const [ at, setAt ] = useState< { start: number; query: string } | null >(
		null
	);
	const [ index, setIndex ] = useState( 0 );
	const [ all, setAll ] = useState( false );
	const [ macro, setMacro ] = useState< Macro >( EMPTY );
	const [ checked, setChecked ] = useState( false );
	const requester = useQuery( {
		...contactQuery( conversation.requesterId ),
		enabled: can( 'cliedesk_view_contacts' ),
	} );
	// MAC-08: the conversation language (TRI-03: customer choice, locale or an agent's change), else the customer's.
	const language = conversation.language ?? requester.data?.language ?? null;
	const list = useQuery( {
		queryKey: [
			'saved-replies',
			'composer',
			conversation.id,
			mode,
			at?.query ?? '',
		] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: SavedReply[] } >( 'saved-replies', {
					query: {
						conversationId: conversation.id,
						mode,
						status: 'active',
						sort: 'relevance',
						limit: 30,
						q: at?.query.trim() || undefined,
					},
					signal,
				} )
			).data?.items ?? [],
		enabled: !! at,
		placeholderData: keepPreviousData,
	} );
	// INB-67: saved replies a context rule recommends come first until the agent types a search.
	const recommended =
		useQuery( { ...panelContextQuery( conversation.id ), enabled: !! at } )
			.data?.macros ?? [];
	// AUT-20: manual rules the agent may run are offered next to the saved replies.
	const rules = (
		useQuery( { ...manualRulesQuery(), enabled: !! at } ).data ?? []
	).filter( ( r ) =>
		r.name
			.toLowerCase()
			.includes( ( at?.query ?? '' ).trim().toLowerCase() )
	);
	const options = at
		? recommendedFirst(
				filterByLanguage( list.data ?? [], language, all ),
				at.query.trim() ? [] : recommended
			).slice( 0, MAX_OPTIONS )
		: [];
	const open = !! at && ( options.length > 0 || list.isFetched );
	const active = Math.max( 0, Math.min( index, options.length - 1 ) );
	const count = open ? options.length : -1;
	useEffect( () => {
		if ( count >= 0 ) {
			announce(
				sprintf(
					/* translators: %d: number of saved replies. */
					_n(
						'%d saved reply. Use the arrow keys and Enter to insert.',
						'%d saved replies. Use the arrow keys and Enter to insert.',
						count,
						'cliedesk'
					),
					count
				)
			);
		}
	}, [ count ] );
	const render = useMutation( {
		mutationFn: async ( reply: SavedReply ) =>
			(
				await api.post< Rendered >( 'saved-replies/render', {
					body: {
						ids: [ reply.id ],
						conversationId: conversation.id,
					},
				} )
			).data,
		onSuccess: ( r, reply ) => {
			const start = at?.start ?? caret();
			const next = insertAt( text, start, caret(), htmlToText( r.html ) );
			setText( next.text );
			setAt( null );
			if ( r.missing.length ) {
				setChecked( false );
			}
			setMacro( ( m ) => ( {
				savedReplyIds: [ ...m.savedReplyIds, ...r.savedReplyIds ],
				steps: [ ...m.steps, ...r.steps ],
				names: [ ...m.names, reply.name ],
				missing: [ ...new Set( [ ...m.missing, ...r.missing ] ) ],
			} ) );
			announce(
				sprintf(
					/* translators: %s: saved reply name. */
					__( 'Saved reply “%s” inserted.', 'cliedesk' ),
					reply.name
				)
			);
			focus( next.caret );
		},
	} );
	const pick = ( reply: SavedReply | undefined ) => {
		if ( reply && ! render.isPending ) {
			render.mutate( reply );
		}
	};
	const listId = `cd-reply-list-${ conversation.id }-${ mode }`;
	const optionId = ( i: number ) => `${ listId }-${ i }`;
	// ⌘K, or the Saved replies button on touch screens (MAC-20): start a search at the caret.
	const start = () => {
		const pos = caret();
		const needsSpace = pos > 0 && ! /\s/.test( text[ pos - 1 ] ?? '' );
		const next = insertAt( text, pos, pos, needsSpace ? ' \\' : '\\' );
		setText( next.text );
		setAt( { start: next.caret - 1, query: '' } );
		setIndex( 0 );
		focus( next.caret );
	};
	return {
		open,
		start,
		/** The customer's language (null when unknown). */
		language,
		macro: macro.savedReplyIds.length ? macro : null,
		clearMacro: () => {
			setMacro( EMPTY );
			setChecked( false );
		},
		ariaProps: open
			? {
					'aria-controls': listId,
					'aria-activedescendant': options.length
						? optionId( active )
						: undefined,
				}
			: {},
		/** After a text change: open, follow or close the picker. */
		onChange( next: string, pos: number ) {
			const t = replyTriggerAt( next, pos );
			setAt( t );
			if ( t?.query !== at?.query ) {
				setIndex( 0 );
			}
		},
		/** Keys in the editor; true when the picker used the key. */
		onKeyDown( e: KeyboardEvent ): boolean {
			if (
				( e.metaKey || e.ctrlKey ) &&
				! e.shiftKey &&
				e.key.toLowerCase() === 'k'
			) {
				// ⌘K in the editor opens the picker; React Aria keeps the key from the command palette.
				e.preventDefault();
				start();
				return true;
			}
			if ( ! open ) {
				return false;
			}
			if ( e.altKey && e.key.toLowerCase() === 'a' ) {
				e.preventDefault();
				setAll( ( v ) => ! v );
				return true;
			}
			if ( e.key === 'Escape' ) {
				e.preventDefault();
				setAt( null );
				return true;
			}
			if ( ! options.length ) {
				return false;
			}
			if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
				e.preventDefault();
				const step = e.key === 'ArrowDown' ? 1 : -1;
				setIndex( ( active + step + options.length ) % options.length );
				return true;
			}
			if (
				( e.key === 'Enter' && ! e.ctrlKey && ! e.metaKey ) ||
				e.key === 'Tab'
			) {
				e.preventDefault();
				pick( options[ active ] );
				return true;
			}
			return false;
		},
		popup: open ? (
			<div className="absolute inset-x-0 z-20 mt-1 flex flex-col overflow-hidden rounded-md border border-line bg-raised shadow-2 sm:flex-row">
				{ options.length ? (
					<ul
						id={ listId }
						role="listbox"
						aria-label={ __( 'Saved replies', 'cliedesk' ) }
						className="max-h-64 min-w-0 flex-1 overflow-y-auto py-1"
					>
						{ options.map( ( o, i ) => (
							// Picked from the editor with the keyboard (aria-activedescendant) or clicked.
							// eslint-disable-next-line jsx-a11y/click-events-have-key-events
							<li
								key={ o.id }
								id={ optionId( i ) }
								role="option"
								tabIndex={ -1 }
								aria-selected={ i === active }
								onMouseDown={ ( e ) => e.preventDefault() }
								onClick={ () => pick( o ) }
								className={ cx(
									'flex cursor-pointer flex-col px-3 py-1.5 text-sm',
									i === active &&
										'bg-accent-subtle text-accent-fg'
								) }
							>
								<bdi>{ o.name }</bdi>
								{ ( o.shortcut || o.category ) && (
									<span className="text-xs text-fg-muted">
										{ [ o.shortcut, o.category ]
											.filter( Boolean )
											.join( ' · ' ) }
									</span>
								) }
							</li>
						) ) }
					</ul>
				) : (
					<p id={ listId } className="flex-1 px-3 py-2 text-sm">
						{ __( 'No saved replies match.', 'cliedesk' ) }
					</p>
				) }
				<div className="flex min-w-0 flex-1 flex-col gap-2 border-t border-line p-3 text-sm sm:border-s sm:border-t-0">
					{ rules.length > 0 && (
						<div className="flex flex-wrap items-center gap-1">
							<span className="text-xs text-fg-muted">
								{ __( 'Run a rule:', 'cliedesk' ) }
							</span>
							{ rules.slice( 0, 4 ).map( ( rule ) => (
								<Button
									key={ rule.id }
									size="sm"
									variant="ghost"
									onPress={ () => {
										const next = insertAt(
											text,
											at?.start ?? caret(),
											caret(),
											''
										);
										setText( next.text );
										setAt( null );
										requestRunRule( rule );
									} }
								>
									{ rule.name }
								</Button>
							) ) }
						</div>
					) }
					{ options[ active ] && (
						<p
							aria-hidden="true"
							className="line-clamp-6 whitespace-pre-wrap text-fg-muted"
						>
							{ htmlToText(
								previewHtml( options[ active ]!, language )
							) }
						</p>
					) }
					{ language && (
						<Button
							size="sm"
							variant="ghost"
							excludeFromTabOrder
							onPress={ () => setAll( ( v ) => ! v ) }
						>
							{ all
								? __(
										'Customer language only (Alt+A)',
										'cliedesk'
									)
								: __( 'All languages (Alt+A)', 'cliedesk' ) }
						</Button>
					) }
				</div>
			</div>
		) : null,
		error: render.error,
		resetError: () => render.reset(),
		/**
		 * Before sending (MAC-05): the first send with empty placeholders is held with a message; sending again
		 * goes through (the agent has checked the text).
		 */
		gate(): string | null {
			if ( ! macro.missing.length || checked ) {
				return null;
			}
			setChecked( true );
			return sprintf(
				/* translators: %s: comma-separated placeholder names. */
				__(
					'Some details were empty: %s. Check the text, then send again.',
					'cliedesk'
				),
				macro.missing.join( ', ' )
			);
		},
		chip: macro.savedReplyIds.length ? (
			<MacroChip
				macro={ macro }
				onRemoveStep={ ( i ) =>
					setMacro( ( m ) => ( {
						...m,
						steps: m.steps.filter( ( _s, j ) => j !== i ),
					} ) )
				}
				onRemove={ () => setMacro( EMPTY ) }
			/>
		) : null,
	};
}

/**
 * What the inserted saved replies will do on send.
 *
 * @param props              Props.
 * @param props.macro        Inserted saved replies.
 * @param props.onRemoveStep Drop one action.
 * @param props.onRemove     Forget the saved replies (the text stays).
 */
function MacroChip( {
	macro,
	onRemoveStep,
	onRemove,
}: {
	macro: Macro;
	onRemoveStep: ( index: number ) => void;
	onRemove: () => void;
} ) {
	return (
		<div className="flex flex-col gap-2">
			{ macro.missing.length > 0 && (
				<Banner
					tone="warning"
					title={ sprintf(
						/* translators: %s: comma-separated placeholder names. */
						__( 'Fill in before sending: %s', 'cliedesk' ),
						macro.missing.join( ', ' )
					) }
				/>
			) }
			<div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
				<span>
					{ macro.steps.length
						? sprintf(
								/* translators: 1: saved reply names, 2: number of actions. */
								_n(
									'%1$s: %2$d action runs when you send.',
									'%1$s: %2$d actions run when you send.',
									macro.steps.length,
									'cliedesk'
								),
								macro.names.join( ', ' ),
								macro.steps.length
							)
						: macro.names.join( ', ' ) }
				</span>
				{ macro.steps.length > 0 && (
					<Button size="sm" variant="ghost" onPress={ onRemove }>
						{ __( 'Skip the actions', 'cliedesk' ) }
					</Button>
				) }
			</div>
			{ macro.steps.length > 0 && (
				<ul
					aria-label={ __( 'Actions when you send', 'cliedesk' ) }
					className="flex flex-wrap gap-1"
				>
					{ macro.steps.map( ( step, i ) => (
						<li
							key={ i }
							className="inline-flex items-center gap-0.5 rounded-full border border-line ps-2 text-xs"
						>
							{ stepLabel( step.type ) }
							<IconButton
								size="sm"
								label={ sprintf(
									/* translators: %s: action name. */
									__( 'Skip action: %s', 'cliedesk' ),
									stepLabel( step.type )
								) }
								icon={ <X size={ 12 } /> }
								onPress={ () => onRemoveStep( i ) }
							/>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}
