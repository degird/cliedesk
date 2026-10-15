/**
 * Help article picker in the composer (KB-48). Typing `?` at the start of a word searches help articles the agent may
 * see (customer replies never offer internal ones). Enter inserts a link, Alt+Q a short quote, Alt+F the full text.
 * For a customer reply, an article with a translation in the conversation's language comes as that translation.
 */
import { api, keepPreviousData, useQuery } from '@cliedesk/data';
import { announce, cx, toast } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { insertAt } from '../../inbox/replyPicker';

export interface ArticleHit {
	id: number;
	title: string;
	url: string;
	excerpt: string;
	visibility?: string;
	/** KB-18 (Pro): customers must sign in to read it. */
	signIn?: boolean;
}

type How = 'link' | 'quote' | 'full';

/**
 * The `?word` being typed before the caret, or null.
 *
 * @param text  Text.
 * @param caret Caret.
 */
export function articleTriggerAt(
	text: string,
	caret: number
): { start: number; query: string } | null {
	const m = /(^|\s)\?([^\s?]{0,40})$/u.exec( text.slice( 0, caret ) );
	if ( ! m ) {
		return null;
	}
	const query = m[ 2 ] ?? '';
	return { start: caret - query.length - 1, query };
}

/**
 * Text to insert for an article.
 *
 * @param hit  Article.
 * @param how  Link, quote or full text.
 * @param full Full text (for "full").
 */
export function articleText( hit: ArticleHit, how: How, full = '' ): string {
	if ( how === 'quote' ) {
		return `${ hit.excerpt.replace( /^…|…$/g, '' ).trim() }\n${ hit.url }`;
	}
	if ( how === 'full' ) {
		return `${ hit.title }\n\n${ full }\n\n${ hit.url }`;
	}
	return `${ hit.title }: ${ hit.url }`;
}

/**
 * Picker state and handlers for one composer.
 *
 * @param props         Props.
 * @param props.mode    Composer mode.
 * @param props.text    Editor text.
 * @param props.setText Set the editor text.
 * @param props.caret   Current caret.
 * @param props.focus   Focus the editor at a caret.
 * @param props.id      Unique id prefix.
 * @param props.lang    Conversation language (customer replies).
 */
export function useArticlePicker( {
	mode,
	text,
	setText,
	caret,
	focus,
	id,
	lang,
}: {
	mode: 'reply' | 'note';
	text: string;
	setText: ( t: string ) => void;
	caret: () => number;
	focus: ( caret: number ) => void;
	id: string;
	lang?: string;
} ) {
	const [ at, setAt ] = useState< { start: number; query: string } | null >(
		null
	);
	const [ index, setIndex ] = useState( 0 );
	const [ busy, setBusy ] = useState( false );
	const query = at?.query.trim() ?? '';
	const list = useQuery( {
		queryKey: [ 'knowledge', 'search', mode, query, lang ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< ArticleHit[] >( 'knowledge/search', {
					query: {
						q: query,
						audience: mode === 'reply' ? 'customer' : 'agent',
						...( lang ? { lang } : {} ),
					},
					signal,
				} )
			).data ?? [],
		enabled: query.length >= 2,
		placeholderData: keepPreviousData,
	} );
	const options =
		at && query.length >= 2 ? ( list.data ?? [] ).slice( 0, 8 ) : [];
	const open = !! at;
	const active = Math.max( 0, Math.min( index, options.length - 1 ) );
	const count = open && list.isFetched ? options.length : -1;
	useEffect( () => {
		if ( count >= 0 ) {
			announce(
				sprintf(
					/* translators: %d: number of articles. */
					_n(
						'%d article. Enter inserts a link, Alt+Q a quote, Alt+F the full text.',
						'%d articles. Enter inserts a link, Alt+Q a quote, Alt+F the full text.',
						count,
						'cliedesk'
					),
					count
				)
			);
		}
	}, [ count ] );

	const insert = async ( hit: ArticleHit | undefined, how: How ) => {
		if ( ! hit || ! at || busy ) {
			return;
		}
		let full = '';
		if ( how === 'full' ) {
			setBusy( true );
			try {
				full =
					(
						await api.get< { text: string } >(
							`knowledge/articles/${ hit.id }`,
							lang ? { query: { lang } } : undefined
						)
					).data?.text ?? '';
			} finally {
				setBusy( false );
			}
		}
		const next = insertAt(
			text,
			at.start,
			caret(),
			articleText( hit, how, full )
		);
		setText( next.text );
		setAt( null );
		announce(
			sprintf(
				/* translators: %s: article title. */
				__( 'Article “%s” inserted.', 'cliedesk' ),
				hit.title
			)
		);
		// KB-18: warn when the customer must sign in to read it.
		if ( mode === 'reply' && hit.signIn ) {
			toast( {
				tone: 'warning',
				title: __(
					'The customer must sign in to read this article.',
					'cliedesk'
				),
			} );
		}
		focus( next.caret );
	};

	const listId = `${ id }-articles`;
	const optionId = ( i: number ) => `${ listId }-${ i }`;
	return {
		open,
		/** The toolbar's article button: start a search at the caret (as typing `?`). */
		start() {
			const pos = caret();
			const space = pos > 0 && ! /\s/.test( text[ pos - 1 ] ?? '' );
			const next = insertAt( text, pos, pos, space ? ' ?' : '?' );
			setText( next.text );
			setAt( { start: next.caret - 1, query: '' } );
			setIndex( 0 );
			focus( next.caret );
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
			const t = articleTriggerAt( next, pos );
			setAt( t );
			if ( t?.query !== at?.query ) {
				setIndex( 0 );
			}
		},
		/** Keys in the editor; true when the picker used the key. */
		onKeyDown( e: KeyboardEvent ): boolean {
			if ( ! open ) {
				return false;
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
			if ( e.altKey && [ 'q', 'f' ].includes( e.key.toLowerCase() ) ) {
				e.preventDefault();
				void insert(
					options[ active ],
					e.key.toLowerCase() === 'q' ? 'quote' : 'full'
				);
				return true;
			}
			if (
				( e.key === 'Enter' && ! e.ctrlKey && ! e.metaKey ) ||
				e.key === 'Tab'
			) {
				e.preventDefault();
				void insert( options[ active ], 'link' );
				return true;
			}
			return false;
		},
		popup: open ? (
			<div className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-md border border-line bg-raised shadow-2">
				{ options.length ? (
					<ul
						id={ listId }
						role="listbox"
						aria-label={ __( 'Help articles', 'cliedesk' ) }
						className="max-h-64 overflow-y-auto py-1"
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
								onClick={ () => void insert( o, 'link' ) }
								className={ cx(
									'flex cursor-pointer flex-col px-3 py-1.5 text-sm',
									i === active &&
										'bg-accent-subtle text-accent-fg'
								) }
							>
								<bdi>{ o.title }</bdi>
								<span className="line-clamp-1 text-xs text-fg-muted">
									{ o.excerpt }
								</span>
							</li>
						) ) }
					</ul>
				) : (
					<p id={ listId } className="px-3 py-2 text-sm">
						{ query.length < 2
							? __( 'Type to search help articles.', 'cliedesk' )
							: __( 'No help articles match.', 'cliedesk' ) }
					</p>
				) }
				<p className="border-t border-line px-3 py-1.5 text-xs text-fg-muted">
					{ __(
						'Enter: link · Alt+Q: quote · Alt+F: full text · Esc: close',
						'cliedesk'
					) }
				</p>
			</div>
		) : null,
	};
}
