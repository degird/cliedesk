/**
 * Composer (CNV-08): Reply / Note tabs (R and N switch and focus the editor; Ctrl/⌘+Enter sends). Replies go to
 * the customer (POST …/replies), notes stay internal (POST …/notes). Collaborators, who may not reply, see Note
 * only.
 *
 * Drafts: the text is loaded from GET …/drafts when the conversation opens and autosaved (PUT …/drafts/{mode})
 * about 3 s after the last change. Undo send: a reply held for the undo window ('pending_undo', meta.sendAt) gets
 * an "Undo" toast until it goes out (POST messages/{id}/undo puts it back in the composer). "Send now" skips the
 * undo window (sendNow). Send later: a reply with sendAt is 'scheduled' (ifNoReply: cancelled when the customer
 * writes first). Team draft mode: replies are submitted for review (the reply draft with meta.review) instead of
 * being sent.
 *
 * Collisions (INB-59, INB-60): the composer reports replying / noting while typing (presence), shows "Maria is
 * replying" when someone else is, and sends seenMessageId (the newest message it saw). A reply that comes back
 * 'held' opens the collision dialog (Send anyway / Edit / Discard).
 *
 * Signature (INB-53): a preview under the reply editor (GET …/signature?channel=), with "No signature".
 * Mentions (INB-57): "@" in a note opens a picker of people (GET agents/picker) and teams (GET teams, when
 * allowed); picked mentions become `<span data-mention="user:ID">@Name</span>` in the note HTML.
 *
 * Send split-button (INB-49): the main button uses the default choice (GET …/drafts → postSend); the menu sends with
 * `then: {action, snoozeUntil?, assigneeId?}`. Reply to a message (INB-46): "Reply to this" in the timeline shows a
 * quote chip and sends `parentId`. CC / BCC (INB-47): address chips sent as `cc` and `bcc`.
 */
import {
	api,
	can,
	hasModule,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	IconButton,
	Select,
	Slot,
	Tab,
	TabList,
	TabPanel,
	Tabs,
	TextField,
	announce,
	cx,
	toast,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	Suspense,
	lazy,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type FormEvent,
	type Key,
} from 'react';
import { BookOpen, Clock, ListPlus, MessageSquareText, X } from 'lucide-react';
import {
	agentLookupQuery,
	conversationKeys,
	draftsQuery,
	inboxKeys,
	teamsLookupQuery,
	type Conversation,
	type Draft,
	type Drafts,
	type Message,
} from '../../inbox/api';
import { ActionError, actionMessage } from '../../inbox/components';
import { RichText, htmlToText, textToHtml } from '../../inbox/html';
import { RESTORE_EVENT } from '../../inbox/keys';
import { channelLabel, fullTime } from '../../inbox/labels';
import { afterSend } from '../../inbox/play';
import { usePlayGo } from '../../inbox/PlayBar';
import {
	insertMention,
	mentionAt,
	mentionsFromHtml,
	textToHtmlWithMentions,
	type Mention,
} from '../../inbox/mentions';
import {
	IDLE_MS,
	presenceSentence,
	setComposerState,
	type PresenceOther,
} from '../../inbox/presence';
import { prefsStore, type Prefs } from '../../prefs';
import { useShortcut } from '../../shortcuts';
import { announceResult } from '../../workspace/forms';
import { AttachButton, ComposerFiles, useComposerFiles } from './ComposerFiles';
import { EmojiPicker } from './EmojiPicker';
import { CollisionDialog } from './Held';
import { mergeDetail } from './shared';
import { flushQueued, queueSend } from './offline';
import { useReplyPicker } from './ReplyPicker';
import { useArticlePicker } from './ArticlePicker';

// COM-25: product cards on a reply (WooCommerce).
const VoiceNoteButton = lazy( () =>
	import( /* webpackChunkName: "voice-note" */ './VoiceNote' ).then(
		( m ) => ( {
			default: m.VoiceNoteButton,
		} )
	)
);
const ProductPicker = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-products" */ './ProductPicker'
		)
);
const ProductChips = lazy( () =>
	import(
		/* webpackChunkName: "conversation-products" */ './ProductPicker'
	).then( ( m ) => ( { default: m.ProductChips } ) )
);
const SendLaterDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-send-later" */ './SendLater'
		)
);
import {
	buttonList,
	indexErrors,
	isPostSend,
	replyTargetStore,
	thenBody,
	type AfterAssignee,
	type PostSend,
	editReplyStore,
} from './compose';
import type { ProductCardInput } from './ProductPicker';
import { EmailChips } from './EmailChips';
import {
	AfterSendAssignee,
	SendSplitButton,
	SnoozeSendDialog,
} from './SendMenu';
import { conversationEmailKit } from './sideThreads';
import { parseRemind } from './remindCommand';
import { utcValue } from '../../inbox/snooze';

export type ComposerMode = 'reply' | 'note';

export const AUTOSAVE_MS = 3000;

/**
 * Modes the current user may use.
 */
export function composerModes(): ComposerMode[] {
	return [
		...( can( 'cliedesk_reply_conversations' )
			? [ 'reply' as const ]
			: [] ),
		...( can( 'cliedesk_add_notes' ) ? [ 'note' as const ] : [] ),
	];
}

const editorId = ( m: ComposerMode ) => `cd-composer-${ m }`;

function editorEl( m: ComposerMode ): HTMLTextAreaElement | null {
	const el = document.getElementById( editorId( m ) );
	return el?.matches( 'textarea' )
		? ( el as HTMLTextAreaElement )
		: ( el?.querySelector< HTMLTextAreaElement >( 'textarea' ) ?? null );
}

function focusEditor( m: ComposerMode, caret?: number ) {
	window.setTimeout( () => {
		const el = editorEl( m );
		el?.focus();
		if ( el && caret !== undefined ) {
			el.setSelectionRange( caret, caret );
		}
	}, 0 );
}

/**
 * The newest message id the composer has seen (for collision pause).
 *
 * @param messages Cached messages.
 */
export function newestMessageId( messages: Message[] | undefined ): number {
	return ( messages ?? [] ).reduce( ( max, m ) => Math.max( max, m.id ), 0 );
}

interface SendInput {
	html: string;
	sendAt?: string;
	ifNoReply?: boolean;
	sendNow?: boolean;
	then?: Record< string, unknown >;
}

const useReplyTarget = () =>
	useSyncExternalStore(
		replyTargetStore.subscribe,
		replyTargetStore.get,
		replyTargetStore.get
	);

/**
 * Signature preview under the reply editor, with "No signature".
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 * @param props.off          Signature turned off.
 * @param props.onOffChange  Toggle.
 */
function SignaturePreview( {
	conversation,
	off,
	onOffChange,
}: {
	conversation: Conversation;
	off: boolean;
	onOffChange: ( off: boolean ) => void;
} ) {
	const [ open, setOpen ] = useState( false );
	const q = useQuery( {
		queryKey: [
			'conversation',
			conversation.id,
			'signature',
			conversation.currentChannel,
		] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { html: string } >(
					`conversations/${ conversation.id }/signature`,
					{
						query: { channel: conversation.currentChannel },
						signal,
					}
				)
			).data?.html ?? '',
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );
	if ( q.isPending || q.isError || ! q.data?.trim() ) {
		return null;
	}
	const regionId = `cd-signature-${ conversation.id }`;
	return (
		<div className="flex flex-col gap-2 rounded-md border border-dashed border-line-strong px-3 py-2">
			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="link"
					size="sm"
					aria-expanded={ open }
					aria-controls={ regionId }
					onPress={ () => setOpen( ( x ) => ! x ) }
				>
					{ open
						? __( 'Hide signature', 'cliedesk' )
						: __( 'Show signature', 'cliedesk' ) }
				</Button>
				<Checkbox isSelected={ off } onChange={ onOffChange }>
					{ __( 'No signature', 'cliedesk' ) }
				</Checkbox>
			</div>
			<div
				id={ regionId }
				hidden={ ! open }
				className={ cx( 'text-sm', off && 'opacity-60' ) }
			>
				{ off && (
					<p className="text-fg-muted">
						{ __(
							'This signature is left out of this reply.',
							'cliedesk'
						) }
					</p>
				) }
				<RichText html={ q.data } text="" />
			</div>
		</div>
	);
}

interface MentionOption {
	ref: string;
	label: string;
	kind: 'user' | 'team';
}

const MAX_MENTION_OPTIONS = 8;

/**
 * People and teams to mention.
 */
function useMentionOptions( enabled: boolean ): MentionOption[] {
	const agents = useQuery( { ...agentLookupQuery(), enabled } );
	// GET teams needs cliedesk_manage_team; without it, people only.
	const teams = useQuery( {
		...teamsLookupQuery(),
		enabled: enabled && can( 'cliedesk_manage_team' ),
	} );
	return useMemo(
		() => [
			...( agents.data ?? [] )
				.filter( ( a ) => a.status !== 'deactivated' )
				.map( ( a ) => ( {
					ref: `user:${ a.userId }`,
					label: a.name,
					kind: 'user' as const,
				} ) ),
			...( teams.isError ? [] : ( teams.data ?? [] ) ).map( ( t ) => ( {
				ref: `team:${ t.id }`,
				label: t.name,
				kind: 'team' as const,
			} ) ),
		],
		[ agents.data, teams.data, teams.isError ]
	);
}

function ComposerForm( {
	mode,
	conversation,
	draft,
	draftMode,
	requesterName,
	postSend = 'send',
	showCopies = false,
	setShowCopies = () => {},
}: {
	mode: ComposerMode;
	conversation: Conversation;
	draft: Draft | null;
	draftMode: boolean;
	requesterName: string;
	postSend?: PostSend;
	/** Cc / Bcc fields shown (the link is in the tab row). */
	showCopies?: boolean;
	setShowCopies?: ( show: boolean ) => void;
} ) {
	const qc = useQueryClient();
	const playGo = usePlayGo();
	const [ cc, setCc ] = useState< string[] >( [] );
	const [ bcc, setBcc ] = useState< string[] >( [] );
	// CHN-22: quick-reply buttons (one per line; numbered text on email).
	const [ buttons, setButtons ] = useState< string | null >( null );
	const [ products, setProducts ] = useState< ProductCardInput[] >( [] );
	// INB-43: the channels a reply can use (shown when there is a choice).
	const channels = useQuery( {
		queryKey: [ 'conversation', conversation.id, 'reply-channels' ],
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< {
					channels?: string[];
					closed?: string[];
					default?: string;
				} >( `conversations/${ conversation.id }/reply-channels`, {
					signal,
				} )
			).data;
			return {
				channels: Array.isArray( d?.channels ) ? d.channels : [],
				closed: Array.isArray( d?.closed ) ? d.closed : [],
				default: String( d?.default ?? '' ),
			};
		},
		enabled: mode === 'reply',
	} );
	const [ channel, setChannel ] = useState< string | null >( null );
	const replyChannel = channel ?? channels.data?.default ?? '';
	const [ assignee, setAssignee ] = useState< AfterAssignee >( 'keep' );
	const [ snoozing, setSnoozing ] = useState( false );
	const replyTarget = useReplyTarget();
	const target =
		mode === 'reply' && replyTarget?.conversationId === conversation.id
			? replyTarget.target
			: null;
	const [ text, setText ] = useState( () =>
		draft ? htmlToText( draft.html ) : ''
	);
	const [ error, setError ] = useState< string | null >( null );
	const [ draftState, setDraftState ] = useState<
		'idle' | 'saved' | 'error'
	>( 'idle' );
	const [ later, setLater ] = useState( false );
	const [ inReview, setInReview ] = useState( !! draft?.review );
	const [ noSignature, setNoSignature ] = useState( false );
	const [ held, setHeld ] = useState< Message | null >( null );
	const mentions = useRef< Mention[] >(
		draft && mode === 'note' ? mentionsFromHtml( draft.html ) : []
	);
	const [ picker, setPicker ] = useState< {
		start: number;
		query: string;
	} | null >( null );
	const [ pickerIndex, setPickerIndex ] = useState( 0 );
	const mentionOptions = useMentionOptions( mode === 'note' );
	const prefs = useSyncExternalStore(
		prefsStore().subscribe,
		prefsStore().get,
		prefsStore().get
	) as Prefs | null;
	const spellCheck = prefs?.layout.spellCheck !== false;
	const replies = useReplyPicker( {
		conversation,
		mode,
		text,
		setText: ( t ) => {
			setText( t );
			setError( null );
			setDraftState( 'idle' );
		},
		caret: () => editorEl( mode )?.selectionStart ?? text.length,
		focus: ( c ) => focusEditor( mode, c ),
	} );
	// KB-48: `?` searches help articles.
	const articles = useArticlePicker( {
		mode,
		text,
		setText: ( t ) => {
			setText( t );
			setError( null );
			setDraftState( 'idle' );
		},
		caret: () => editorEl( mode )?.selectionStart ?? text.length,
		focus: ( c ) => focusEditor( mode, c ),
		id: `cd-composer-${ conversation.id }-${ mode }`,
		lang: mode === 'reply' ? ( replies.language ?? undefined ) : undefined,
	} );
	const saved = useRef( text );
	const mounted = useRef( true );
	const setTextRef = useRef( setText );
	setTextRef.current = setText;
	useEffect(
		() => () => {
			mounted.current = false;
		},
		[]
	);
	const draftPath = `conversations/${ conversation.id }/drafts/${ mode }`;
	const textRef = useRef( text );
	textRef.current = text;
	// INB-52: a draft saved on another device shows here (drafts are re-read every 10 s) unless I have unsaved text.
	const remote = draft?.html ?? '';
	useEffect( () => {
		const value = remote ? htmlToText( remote ) : '';
		if ( textRef.current === saved.current && value !== textRef.current ) {
			saved.current = value;
			setText( value );
		}
	}, [ remote ] );

	const toHtml = ( value: string ) =>
		mode === 'note'
			? textToHtmlWithMentions( value, mentions.current )
			: textToHtml( value );
	const toHtmlRef = useRef( toHtml );
	toHtmlRef.current = toHtml;

	// SEC-20, CHN-47: files sent with this message.
	const attached = useComposerFiles( conversation.id );
	// Presence: replying / noting while typing, viewing after 10 s without a keystroke.
	const idle = useRef< number | undefined >( undefined );
	const typing = () => {
		setComposerState(
			conversation.id,
			mode === 'reply' ? 'replying' : 'noting'
		);
		window.clearTimeout( idle.current );
		idle.current = window.setTimeout(
			() => setComposerState( conversation.id, 'viewing' ),
			IDLE_MS
		);
	};
	useEffect(
		() => () => {
			window.clearTimeout( idle.current );
			setComposerState( conversation.id, 'viewing' );
		},
		[ conversation.id ]
	);

	const saveDraft = useRef( ( value: string ) => {
		const html = value.trim() ? toHtmlRef.current( value ) : '';
		// Keep the cached draft in step, so switching tabs restores the text.
		qc.setQueryData< Drafts >(
			draftsQuery( conversation.id ).queryKey,
			( old ) =>
				old && {
					...old,
					[ mode ]: html
						? {
								...( old[ mode ] ?? {
									id: 0,
									mode,
									review: false,
									updatedAt: '',
								} ),
								html,
							}
						: null,
				}
		);
		return api
			.put( draftPath, { body: { html } } )
			.then( () => {
				saved.current = value;
				if ( mounted.current ) {
					setDraftState( 'saved' );
				}
			} )
			.catch( () => {
				if ( mounted.current ) {
					setDraftState( 'error' );
				}
			} );
	} );

	// A held reply moved back to the draft from the timeline comes back into the editor.
	// APP-04: send what was written offline once the app is open and online.
	useEffect( () => {
		if ( navigator.onLine ) {
			void flushQueued();
		}
	}, [] );
	useEffect( () => {
		if ( mode !== 'reply' ) {
			return undefined;
		}
		const onRestore = ( e: Event ) => {
			const d = (
				e as CustomEvent< { conversationId: number; html: string } >
			 ).detail;
			if ( d?.conversationId === conversation.id ) {
				const restored = htmlToText( d.html );
				saved.current = restored;
				setText( restored );
				focusEditor( 'reply' );
			}
		};
		window.addEventListener( RESTORE_EVENT, onRestore );
		return () => window.removeEventListener( RESTORE_EVENT, onRestore );
	}, [ mode, conversation.id ] );

	// Autosave about 3 s after the last change (empty text deletes the draft); flush when the tab closes.
	useEffect( () => {
		if ( text === saved.current ) {
			return undefined;
		}
		const t = window.setTimeout(
			() => void saveDraft.current( text ),
			AUTOSAVE_MS
		);
		return () => window.clearTimeout( t );
	}, [ text ] );
	useEffect(
		() => () => {
			if ( textRef.current !== saved.current ) {
				void saveDraft.current( textRef.current );
			}
		},
		[]
	);

	const refresh = () => {
		void qc.invalidateQueries( {
			queryKey: conversationKeys.messages( conversation.id ),
		} );
		void qc.invalidateQueries( {
			queryKey: conversationKeys.events( conversation.id ),
		} );
		void qc.invalidateQueries( { queryKey: inboxKeys.all } );
	};

	const undo = ( message: Message ) =>
		void api
			.post< { draft: Draft | null } >( `messages/${ message.id }/undo` )
			.then( ( r ) => {
				const html = r.data?.draft?.html ?? message.html ?? '';
				const restored = htmlToText( html );
				saved.current = restored;
				setTextRef.current( restored );
				focusEditor( 'reply' );
				refresh();
				announceResult(
					__(
						'Reply not sent. It is back in the composer.',
						'cliedesk'
					)
				);
			} )
			.catch( ( e ) =>
				toast( {
					tone: 'danger',
					title: __( 'Could not undo', 'cliedesk' ),
					description: actionMessage( e ),
				} )
			);

	const send = useMutation( {
		mutationFn: ( input: SendInput ) => {
			const body: Record< string, unknown > = { ...input };
			if ( mode === 'reply' ) {
				const seen = newestMessageId(
					qc.getQueryData< Message[] >(
						conversationKeys.messages( conversation.id )
					)
				);
				if ( seen > 0 ) {
					body.seenMessageId = seen;
				}
				if ( noSignature ) {
					body.signature = false;
				}
				if ( target ) {
					body.parentId = target.id;
				}
				if ( cc.length ) {
					body.cc = cc;
				}
				if ( bcc.length ) {
					body.bcc = bcc;
				}
				const options = buttonList( buttons );
				if ( options.length || products.length ) {
					body.rich = {
						...( options.length ? { options } : {} ),
						...( products.length ? { cards: products } : {} ),
					};
				}
				if (
					( channels.data?.channels.length ?? 0 ) > 1 &&
					replyChannel
				) {
					body.channel = replyChannel;
				}
			}
			if ( ! body.then ) {
				delete body.then;
			}
			if ( attached.files.length ) {
				body.attachmentIds = attached.files.map( ( f ) => f.id );
			}
			if ( replies.macro ) {
				body.macro = {
					savedReplyIds: replies.macro.savedReplyIds,
					steps: replies.macro.steps,
				};
			}
			const path = `conversations/${ conversation.id }/${
				mode === 'reply' ? 'replies' : 'notes'
			}`;
			return api
				.post< { message: Message; conversation: Conversation } >(
					path,
					{
						body,
					}
				)
				.catch( ( e: unknown ) => {
					// APP-04: no network: keep it on this device and send it once when back online.
					if (
						isApiError( e ) &&
						e.isNetwork &&
						! attached.files.length
					) {
						queueSend( path, body );
						return { data: undefined, queued: true };
					}
					throw e;
				} );
		},
		onSuccess: ( r ) => {
			saved.current = '';
			setText( '' );
			mentions.current = [];
			replies.clearMacro();
			attached.clear();
			qc.setQueryData< Drafts >(
				draftsQuery( conversation.id ).queryKey,
				( old ) => old && { ...old, [ mode ]: null }
			);
			setDraftState( 'idle' );
			setLater( false );
			setSnoozing( false );
			if ( mode === 'reply' ) {
				setCc( [] );
				setBcc( [] );
				setShowCopies( false );
				setButtons( null );
				setProducts( [] );
				setAssignee( 'keep' );
				replyTargetStore.set( ( cur ) =>
					cur?.conversationId === conversation.id ? null : cur
				);
			}
			setComposerState( conversation.id, 'viewing' );
			if ( 'queued' in r ) {
				return; // APP-04: kept offline; sent when back online.
			}
			if ( r.data?.conversation ) {
				mergeDetail( qc, conversation.id, r.data.conversation );
			}
			refresh();
			const m = r.data?.message;
			const sendAt =
				m?.meta && typeof m.meta.sendAt === 'string'
					? m.meta.sendAt
					: null;
			if ( m?.status === 'held' ) {
				setHeld( m );
				announce(
					__(
						'Your reply is on hold: new messages arrived while you were writing.',
						'cliedesk'
					),
					'assertive'
				);
				return;
			}
			if ( m?.status === 'pending_undo' ) {
				const ms = sendAt
					? Math.max(
							1000,
							new Date( sendAt ).getTime() - Date.now()
						)
					: 10000;
				toast( {
					tone: 'success',
					title: __( 'Sending reply…', 'cliedesk' ),
					timeout: ms,
					action: {
						label: __( 'Undo', 'cliedesk' ),
						onAction: () => undo( m ),
					},
				} );
				window.setTimeout( refresh, ms + 1000 );
			} else if ( m?.status === 'scheduled' ) {
				toast( {
					tone: 'success',
					title: sprintf(
						/* translators: %s: date and time. */
						__( 'Reply scheduled for %s.', 'cliedesk' ),
						sendAt ? fullTime( sendAt ) : ''
					),
				} );
			}
			announceResult(
				mode === 'reply'
					? __( 'Reply sent.', 'cliedesk' )
					: __( 'Note added.', 'cliedesk' )
			);
			// Play mode (INB-26): next conversation, back to the list or stay, as the agent chose.
			if ( mode === 'reply' ) {
				void afterSend( conversation.id, playGo );
			}
		},
	} );
	const review = useMutation( {
		mutationFn: ( html: string ) =>
			api.put< { draft: Draft | null } >(
				`conversations/${ conversation.id }/drafts/reply`,
				{ body: { html, meta: { review: true } } }
			),
		onSuccess: () => {
			saved.current = text;
			setInReview( true );
			send.reset();
			toast( {
				tone: 'success',
				title: __( 'Reply submitted for review.', 'cliedesk' ),
			} );
		},
	} );
	const mustReview =
		mode === 'reply' &&
		( draftMode ||
			( isApiError( send.error ) &&
				send.error.code === 'cliedesk_draft_mode' ) );

	const check = () => {
		if ( text.trim() === '' ) {
			setError(
				mode === 'reply'
					? __( 'Write a reply first.', 'cliedesk' )
					: __( 'Write a note first.', 'cliedesk' )
			);
			return false;
		}
		// MAC-05: empty placeholders from a saved reply hold the first send.
		const gated = replies.gate();
		if ( gated ) {
			setError( gated );
			return false;
		}
		setError( null );
		return true;
	};
	const sendWith = ( action: PostSend, snoozeUntil?: string ) => {
		if ( action === 'snooze' && ! snoozeUntil ) {
			if ( check() ) {
				setSnoozing( true );
			}
			return;
		}
		if ( ! check() ) {
			return;
		}
		send.mutate( {
			html: toHtml( text ),
			then: thenBody( action, assignee, snoozeUntil ),
		} );
	};
	const submit = ( e?: FormEvent, extra: Partial< SendInput > = {} ) => {
		e?.preventDefault();
		if ( mode === 'reply' && ! mustReview && ! extra.sendNow ) {
			sendWith( postSend );
			return;
		}
		if ( ! check() ) {
			return;
		}
		if ( mustReview ) {
			review.mutate( textToHtml( text ) );
		} else {
			send.mutate( {
				html: toHtml( text ),
				...( mode === 'reply'
					? { then: thenBody( 'send', assignee ) }
					: {} ),
				...extra,
			} );
		}
	};
	const sendFields = isApiError( send.error ) ? send.error.fields : {};

	// Mention picker (notes).
	const q = picker?.query.toLowerCase() ?? '';
	const options = picker
		? mentionOptions
				.filter(
					( o ) =>
						! q ||
						o.label
							.toLowerCase()
							.split( /\s+/ )
							.some( ( w ) => w.startsWith( q ) ) ||
						o.label.toLowerCase().startsWith( q )
				)
				.slice( 0, MAX_MENTION_OPTIONS )
		: [];
	const pickerOpen = !! picker && options.length > 0;
	const activeOption = Math.min( pickerIndex, options.length - 1 );
	const pickerCount = pickerOpen ? options.length : 0;
	useEffect( () => {
		if ( pickerCount ) {
			announce(
				sprintf(
					/* translators: %d: number of people and teams. */
					_n(
						'%d suggestion. Use the arrow keys and Enter to pick.',
						'%d suggestions. Use the arrow keys and Enter to pick.',
						pickerCount,
						'cliedesk'
					),
					pickerCount
				)
			);
		}
	}, [ pickerCount ] );
	const pick = ( o: MentionOption ) => {
		const el = editorEl( mode );
		const caret = el?.selectionStart ?? text.length;
		const start = picker?.start ?? caret;
		const next = insertMention( text, start, caret, o.label );
		mentions.current = [
			...mentions.current.filter( ( m ) => m.label !== o.label ),
			{ ref: o.ref, label: o.label },
		];
		setText( next.text );
		setPicker( null );
		focusEditor( mode, next.caret );
	};
	const listId = `cd-mention-list-${ conversation.id }`;
	const optionId = ( i: number ) => `${ listId }-${ i }`;

	let draftNote = '';
	if ( draftState === 'saved' ) {
		draftNote = __( 'Draft saved', 'cliedesk' );
	} else if ( draftState === 'error' ) {
		draftNote = __( 'Draft not saved', 'cliedesk' );
	}
	return (
		<form noValidate onSubmit={ submit } className="flex flex-col gap-3">
			{ mustReview && (
				<Banner
					tone="info"
					title={
						inReview
							? __(
									'This reply is waiting for review. A reviewer sends it.',
									'cliedesk'
								)
							: __(
									'Your team reviews replies before they are sent.',
									'cliedesk'
								)
					}
				/>
			) }
			{ ! (
				isApiError( send.error ) &&
				send.error.code === 'cliedesk_draft_mode'
			) && (
				<ActionError
					error={ send.error }
					onDismiss={ () => send.reset() }
				/>
			) }
			<ActionError
				error={ review.error }
				onDismiss={ () => review.reset() }
			/>
			{ target && (
				<div className="flex items-start gap-2 rounded-md border border-line border-s-4 border-s-accent bg-sunken px-3 py-2 text-sm">
					<div className="min-w-0 flex-1">
						<p className="font-medium">
							{ sprintf(
								/* translators: %s: author of the quoted message. */
								__( 'Replying to %s', 'cliedesk' ),
								target.author
							) }
						</p>
						<p className="truncate text-fg-muted">
							<bdi>{ target.excerpt }</bdi>
						</p>
					</div>
					<IconButton
						size="sm"
						label={ __(
							'Stop replying to this message',
							'cliedesk'
						) }
						icon={ <X size={ 14 } /> }
						onPress={ () => {
							replyTargetStore.set( null );
							focusEditor( 'reply' );
						} }
					/>
				</div>
			) }
			{ mode === 'reply' &&
				( channels.data?.channels.length ?? 0 ) > 1 && (
					<div className="max-w-xs">
						<Select
							label={ __( 'Reply by', 'cliedesk' ) }
							value={ replyChannel }
							onChange={ setChannel }
							options={ ( channels.data?.channels ?? [] ).map(
								( c ) => ( {
									id: c,
									label: replyChannelLabel(
										c,
										channels.data?.closed.includes( c ) ??
											false
									),
								} )
							) }
						/>
						{ channels.data?.closed.includes( replyChannel ) && (
							<p className="mt-1 text-sm text-warning">
								{ __(
									'The messaging window has closed. Send an approved template or reply by email.',
									'cliedesk'
								) }
							</p>
						) }
					</div>
				) }
			{ mode === 'reply' && ! mustReview && (
				<div className="flex flex-col gap-2">
					{ ( showCopies || cc.length > 0 || bcc.length > 0 ) && (
						<div className="grid gap-3 sm:grid-cols-2">
							<EmailChips
								id={ `cd-composer-cc-${ conversation.id }` }
								label={ __( 'Cc', 'cliedesk' ) }
								values={ cc }
								onChange={ setCc }
								errors={ indexErrors( sendFields, 'cc' ) }
							/>
							<EmailChips
								id={ `cd-composer-bcc-${ conversation.id }` }
								label={ __( 'Bcc', 'cliedesk' ) }
								values={ bcc }
								onChange={ setBcc }
								errors={ indexErrors( sendFields, 'bcc' ) }
							/>
						</div>
					) }
					{ buttons !== null && (
						<TextField
							label={ __( 'Buttons', 'cliedesk' ) }
							description={ __(
								'One per line. Chat shows buttons; email shows numbered options the customer can answer with a number.',
								'cliedesk'
							) }
							multiline
							rows={ 3 }
							value={ buttons }
							onChange={ setButtons }
						/>
					) }
					{ products.length > 0 && (
						<Suspense fallback={ null }>
							<ProductChips
								value={ products }
								onChange={ setProducts }
							/>
						</Suspense>
					) }
				</div>
			) }
			<div className="relative">
				<TextField
					id={ editorId( mode ) }
					label={
						mode === 'reply'
							? __( 'Reply to the customer', 'cliedesk' )
							: __(
									'Internal note (only your team sees it)',
									'cliedesk'
								)
					}
					// The Reply tab already names it; a note keeps its "only your team sees it" label.
					labelHidden={ mode === 'reply' }
					description={
						mode === 'note'
							? __(
									'Type @ to mention a person or team, \\ or Ctrl+K for a saved reply.',
									'cliedesk'
								)
							: __(
									'Type \\ or Ctrl+K for a saved reply.',
									'cliedesk'
								)
					}
					multiline
					rows={ 4 }
					// INB-54: the browser's checker, in the customer's language for replies.
					spellCheck={ spellCheck ? 'true' : 'false' }
					lang={
						mode === 'reply'
							? ( replies.language ?? undefined )
							: undefined
					}
					value={ text }
					aria-autocomplete="list"
					aria-haspopup="listbox"
					aria-controls={ pickerOpen ? listId : undefined }
					aria-activedescendant={
						pickerOpen ? optionId( activeOption ) : undefined
					}
					{ ...replies.ariaProps }
					{ ...articles.ariaProps }
					onChange={ ( x ) => {
						setText( x );
						setError( null );
						setDraftState( 'idle' );
						typing();
						replies.onChange(
							x,
							editorEl( mode )?.selectionStart ?? x.length
						);
						if ( hasModule( 'knowledge' ) ) {
							articles.onChange(
								x,
								editorEl( mode )?.selectionStart ?? x.length
							);
						}
						if ( mode === 'note' ) {
							const caret =
								editorEl( mode )?.selectionStart ?? x.length;
							const at = mentionAt( x, caret );
							setPicker( at );
							setPickerIndex( 0 );
						}
					} }
					errorMessage={ error }
					onKeyDown={ ( e ) => {
						// INB-71: "/remind <when> [note]" sets a reminder instead of sending.
						if (
							e.key === 'Enter' &&
							! e.shiftKey &&
							/^\/remind\b/i.test( text.trim() )
						) {
							e.preventDefault();
							const cmd = parseRemind( text );
							if ( ! cmd ) {
								setError(
									__(
										'Write /remind and a time, for example /remind tomorrow 15:00 Call back.',
										'cliedesk'
									)
								);
								return;
							}
							void api
								.post(
									`conversations/${ conversation.id }/reminders`,
									{
										body: {
											at: utcValue( cmd.at ),
											...( cmd.note
												? { note: cmd.note }
												: {} ),
										},
									}
								)
								.then( () => {
									setText( '' );
									void qc.invalidateQueries( {
										queryKey: [
											'conversation',
											conversation.id,
											'reminders',
										],
									} );
									announceResult(
										__( 'Reminder added.', 'cliedesk' )
									);
								} )
								.catch( () =>
									setError(
										__(
											'The reminder could not be saved.',
											'cliedesk'
										)
									)
								);
							return;
						}
						if (
							articles.onKeyDown( e ) ||
							replies.onKeyDown( e )
						) {
							return;
						}
						if ( pickerOpen ) {
							if ( e.key === 'ArrowDown' ) {
								e.preventDefault();
								setPickerIndex(
									( activeOption + 1 ) % options.length
								);
								return;
							}
							if ( e.key === 'ArrowUp' ) {
								e.preventDefault();
								setPickerIndex(
									( activeOption - 1 + options.length ) %
										options.length
								);
								return;
							}
							if (
								( e.key === 'Enter' &&
									! e.ctrlKey &&
									! e.metaKey ) ||
								e.key === 'Tab'
							) {
								e.preventDefault();
								const o = options[ activeOption ];
								if ( o ) {
									pick( o );
								}
								return;
							}
							if ( e.key === 'Escape' ) {
								e.preventDefault();
								setPicker( null );
								return;
							}
						}
						if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
							e.preventDefault();
							submit();
							return;
						}
						// INB-41: ↑ in an empty reply edits my last chat reply.
						if (
							e.key === 'ArrowUp' &&
							mode === 'reply' &&
							! text.trim() &&
							conversation.currentChannel === 'widget'
						) {
							e.preventDefault();
							editReplyStore.set( {
								conversationId: conversation.id,
								messageId: 'last',
							} );
						}
					} }
				/>
				{ replies.popup }
				{ articles.popup }
				{ pickerOpen && (
					<ul
						id={ listId }
						role="listbox"
						aria-label={ __(
							'People and teams to mention',
							'cliedesk'
						) }
						className="absolute inset-x-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-line bg-raised py-1 shadow-2"
					>
						{ options.map( ( o, i ) => (
							// Options are picked with the keyboard from the editor (aria-activedescendant) or clicked.
							// eslint-disable-next-line jsx-a11y/click-events-have-key-events
							<li
								key={ o.ref }
								id={ optionId( i ) }
								role="option"
								tabIndex={ -1 }
								aria-selected={ i === activeOption }
								onMouseDown={ ( e ) => e.preventDefault() }
								onClick={ () => pick( o ) }
								className={ cx(
									'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
									i === activeOption &&
										'bg-accent-subtle text-accent-fg'
								) }
							>
								<bdi>{ `@${ o.label }` }</bdi>
								{ o.kind === 'team' && (
									<span className="text-xs text-fg-muted">
										{ __( '(team)', 'cliedesk' ) }
									</span>
								) }
							</li>
						) ) }
					</ul>
				) }
			</div>
			<ActionError
				error={ replies.error }
				onDismiss={ replies.resetError }
			/>
			{ replies.chip }
			<ComposerFiles state={ attached } />
			{ mode === 'reply' && ! mustReview && (
				<SignaturePreview
					conversation={ conversation }
					off={ noSignature }
					onOffChange={ setNoSignature }
				/>
			) }
			<div className="flex flex-wrap items-end gap-2">
				<div
					role="group"
					aria-label={ __( 'Insert', 'cliedesk' ) }
					className="flex flex-wrap items-center gap-0.5"
				>
					<AttachButton state={ attached } />
					<EmojiPicker
						onInsert={ ( e ) =>
							setText( ( t ) =>
								t.endsWith( ' ' ) || ! t
									? t + e
									: `${ t } ${ e }`
							)
						}
					/>
					{ /* MAC-20: saved replies without a keyboard shortcut (phones and the PWA). */ }
					<IconButton
						label={ __( 'Saved replies', 'cliedesk' ) }
						shortcut={ '\\' }
						icon={ <MessageSquareText size={ 16 } /> }
						onPress={ replies.start }
					/>
					<IconButton
						label={ __( 'Insert a help article', 'cliedesk' ) }
						shortcut="?"
						icon={ <BookOpen size={ 16 } /> }
						onPress={ articles.start }
					/>
					{ mode === 'reply' && ! mustReview && (
						<>
							<Suspense fallback={ null }>
								<ProductPicker
									value={ products }
									onChange={ setProducts }
								/>
							</Suspense>
							<IconButton
								label={ __( 'Add buttons', 'cliedesk' ) }
								icon={ <ListPlus size={ 16 } /> }
								isDisabled={ buttons !== null }
								onPress={ () => setButtons( '' ) }
							/>
						</>
					) }
					{ mode === 'reply' && (
						<Suspense fallback={ null }>
							<VoiceNoteButton
								onDone={ ( f ) => void attached.add( [ f ] ) }
							/>
						</Suspense>
					) }
					{ mode === 'reply' && (
						<Slot
							name="composer.ai"
							fillProps={ { conversationId: conversation.id } }
						/>
					) }
				</div>
				<div className="ms-auto flex flex-wrap items-end justify-end gap-2">
					{ mode === 'reply' && ! mustReview && (
						<AfterSendAssignee
							value={ assignee }
							onChange={ setAssignee }
						/>
					) }
					{ mode === 'reply' && ! mustReview && (
						<>
							<Button
								variant="ghost"
								isLoading={
									send.isPending && !! send.variables?.sendNow
								}
								onPress={ () =>
									submit( undefined, { sendNow: true } )
								}
							>
								{ __( 'Send now', 'cliedesk' ) }
							</Button>
							<IconButton
								label={ __( 'Send later…', 'cliedesk' ) }
								icon={ <Clock size={ 16 } /> }
								onPress={ () => {
									if ( check() ) {
										setLater( true );
									}
								} }
							/>
						</>
					) }
					{ mode === 'reply' && ! mustReview ? (
						<SendSplitButton
							defaultAction={ postSend }
							isLoading={
								send.isPending &&
								! send.variables?.sendNow &&
								! send.variables?.sendAt
							}
							onSend={ ( a ) => sendWith( a ) }
						/>
					) : (
						<Button
							type="submit"
							variant="primary"
							isLoading={
								( send.isPending &&
									! send.variables?.sendNow ) ||
								review.isPending
							}
						>
							{ mode === 'note'
								? __( 'Add note', 'cliedesk' )
								: __( 'Submit for review', 'cliedesk' ) }
						</Button>
					) }
				</div>
			</div>
			<p className="flex flex-wrap gap-x-3 text-xs text-fg-muted">
				<span>
					{ mode === 'reply' && ! mustReview
						? __(
								'Ctrl+Enter or ⌘+Enter sends. Send now skips the undo delay.',
								'cliedesk'
							)
						: __( 'Ctrl+Enter or ⌘+Enter sends.', 'cliedesk' ) }
				</span>
				{ draftNote && <span>{ draftNote }</span> }
			</p>
			{ later && (
				<Suspense fallback={ null }>
					<SendLaterDialog
						requesterId={ conversation.requesterId }
						isLoading={ send.isPending }
						onClose={ () => setLater( false ) }
						onSchedule={ ( sendAt, ifNoReply ) =>
							send.mutate( {
								html: toHtml( text ),
								sendAt,
								ifNoReply,
							} )
						}
					/>
				</Suspense>
			) }
			{ snoozing && (
				<SnoozeSendDialog
					isLoading={ send.isPending }
					onClose={ () => setSnoozing( false ) }
					onConfirm={ ( until ) => sendWith( 'snooze', until ) }
				/>
			) }
			{ held && (
				<CollisionDialog
					message={ held }
					conversationId={ conversation.id }
					requesterName={ requesterName }
					onClose={ () => setHeld( null ) }
				/>
			) }
		</form>
	);
}

/**
 * "Maria is replying" (soft lock): people other than me who are writing on this conversation.
 *
 * @param props        Props.
 * @param props.others People on the conversation.
 */
export function SoftLock( { others }: { others: PresenceOther[] } ) {
	const busy = others.filter( ( o ) => o.state !== 'viewing' );
	return (
		<p role="status" className="text-sm font-medium text-fg">
			{ busy.length > 0 && (
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className="size-2 rounded-full bg-danger-solid"
					/>
					{ busy.map( presenceSentence ).join( ' · ' ) }
				</span>
			) }
		</p>
	);
}

/**
 * Composer.
 *
 * @param props               Props.
 * @param props.conversation  Conversation.
 * @param props.others        Other people on the conversation (presence).
 * @param props.requesterName Customer name (collision dialog).
 */
export function Composer( {
	conversation,
	others = [],
	requesterName = '',
}: {
	conversation: Conversation;
	others?: PresenceOther[];
	requesterName?: string;
} ) {
	const modes = composerModes();
	// CNV-22: no replies while the conversation is in Spam; notes stay available.
	const spam = conversation.lane === 'quarantine';
	const [ mode, setMode ] = useState< ComposerMode | 'side_thread' >(
		spam && modes.includes( 'note' ) ? 'note' : ( modes[ 0 ] ?? 'note' )
	);
	// INB-42, INB-61: side threads are the composer's third mode, for people who may add notes. Pro fills the tab
	// (answers come back through a mailbox); without Pro it shows the PRO badge.
	const sideThreads = can( 'cliedesk_add_notes' );
	// INB-47: Cc / Bcc of the reply, opened from the tab row.
	const [ copies, setCopies ] = useState( false );
	const drafts = useQuery( {
		...draftsQuery( conversation.id ),
		enabled: modes.length > 0,
		// INB-52: drafts follow me across devices.
		refetchInterval: 10_000,
		staleTime: 0,
	} );
	// INB-42: start in my team's default mode once (until I pick one myself).
	const chosen = useRef( false );
	const teamMode = drafts.data?.composerMode;
	useEffect( () => {
		if ( chosen.current || spam || ! teamMode ) {
			return;
		}
		chosen.current = true;
		if (
			( teamMode === 'note' && modes.includes( 'note' ) ) ||
			( teamMode === 'side_thread' && sideThreads )
		) {
			setMode( teamMode );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ teamMode ] );
	const group = __( 'Conversation', 'cliedesk' );
	const switchTo = ( m: ComposerMode ) => {
		chosen.current = true;
		setMode( m );
		focusEditor( m );
	};
	// "Reply to this" in the timeline opens the reply tab and focuses the editor.
	const replyTarget = useReplyTarget();
	const targetSeq =
		replyTarget?.conversationId === conversation.id ? replyTarget.seq : 0;
	useEffect( () => {
		if ( targetSeq && modes.includes( 'reply' ) ) {
			setMode( 'reply' );
			focusEditor( 'reply' );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ targetSeq ] );
	useShortcut(
		{
			id: 'composer-reply',
			keys: 'r',
			label: __( 'Write a reply', 'cliedesk' ),
			group,
			run: () => switchTo( 'reply' ),
		},
		modes.includes( 'reply' )
	);
	useShortcut(
		{
			id: 'composer-note',
			keys: 'n',
			label: __( 'Write an internal note', 'cliedesk' ),
			group,
			run: () => switchTo( 'note' ),
		},
		modes.includes( 'note' )
	);
	useShortcut(
		{
			id: 'composer-side-thread',
			keys: 's',
			label: __( 'Write in a side thread', 'cliedesk' ),
			group,
			run: () => {
				chosen.current = true;
				setMode( 'side_thread' );
			},
		},
		sideThreads
	);
	if ( ! modes.length ) {
		return null;
	}
	// Wait for the drafts so a saved draft is not overwritten by an empty editor (errors: start empty).
	const ready = ! drafts.isPending;
	const defaultSend = drafts.data?.postSend;
	const postSend: PostSend = isPostSend( defaultSend ) ? defaultSend : 'send';
	return (
		<section
			aria-labelledby="cd-composer"
			// Pinned to the bottom of the screen or pane so a reply never needs scrolling (phones: the rail is there).
			className="z-10 flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-2 md:sticky md:bottom-0"
		>
			<h2 id="cd-composer" className="sr-only">
				{ __( 'Write', 'cliedesk' ) }
			</h2>
			<SoftLock others={ others } />
			<Tabs
				selectedKey={ mode }
				onSelectionChange={ ( k: Key ) => {
					chosen.current = true;
					setMode( k as ComposerMode | 'side_thread' );
				} }
			>
				<div className="flex flex-wrap items-end gap-x-3 border-b border-line [&>[role=tablist]]:border-b-0">
					<TabList label={ __( 'Reply or note', 'cliedesk' ) }>
						{ modes.includes( 'reply' ) && (
							<Tab id="reply">
								{ __( 'Reply (R)', 'cliedesk' ) }
							</Tab>
						) }
						{ modes.includes( 'note' ) && (
							<Tab id="note">
								{ __( 'Note (N)', 'cliedesk' ) }
							</Tab>
						) }
						{ sideThreads && (
							<Tab id="side_thread">
								{ __( 'Side thread (S)', 'cliedesk' ) }
							</Tab>
						) }
					</TabList>
					{ mode === 'reply' && ! spam && (
						<p className="ms-auto flex min-w-0 items-center gap-3 pb-2 text-sm text-fg-muted">
							<span className="truncate">
								{ sprintf(
									/* translators: 1: channel, e.g. Email, 2: customer name. */
									__( 'via %1$s to %2$s', 'cliedesk' ),
									channelLabel( conversation.currentChannel ),
									requesterName ||
										__( 'the customer', 'cliedesk' )
								) }
							</span>
							{ ! copies && ! drafts.data?.draftMode && (
								<Button
									variant="link"
									size="sm"
									onPress={ () => {
										setCopies( true );
										window.setTimeout(
											() =>
												document
													.querySelector< HTMLInputElement >(
														`#cd-composer-cc-${ conversation.id }`
													)
													?.focus(),
											0
										);
									} }
								>
									{ __( 'Add Cc or Bcc', 'cliedesk' ) }
								</Button>
							) }
						</p>
					) }
				</div>
				{ modes.map( ( m ) => (
					<TabPanel key={ m } id={ m }>
						{ m === 'reply' && spam && (
							<Banner
								tone="warning"
								title={ __(
									'Replies are turned off while this conversation is in Spam',
									'cliedesk'
								) }
							>
								{ __(
									'Mark it as not spam to reply to the customer. You can still add internal notes.',
									'cliedesk'
								) }
							</Banner>
						) }
						{ ! ( m === 'reply' && spam ) && ready && (
							<ComposerForm
								mode={ m }
								conversation={ conversation }
								draft={ drafts.data?.[ m ] ?? null }
								draftMode={ !! drafts.data?.draftMode }
								requesterName={ requesterName }
								postSend={ postSend }
								showCopies={ copies }
								setShowCopies={ setCopies }
							/>
						) }
						{ ! ( m === 'reply' && spam ) && ! ready && (
							<p className="text-sm text-fg-muted">
								{ __( 'Loading your draft…', 'cliedesk' ) }
							</p>
						) }
					</TabPanel>
				) ) }
				{ sideThreads && (
					<TabPanel id="side_thread">
						{ ready ? (
							<Slot
								name="composer.side_thread"
								fillProps={ {
									conversationId: conversation.id,
									draft: drafts.data?.side_thread?.html ?? '',
									kit: conversationEmailKit,
								} }
							/>
						) : (
							<p className="text-sm text-fg-muted">
								{ __( 'Loading your draft…', 'cliedesk' ) }
							</p>
						) }
					</TabPanel>
				) }
			</Tabs>
		</section>
	);
}

/**
 * INB-43: a reply channel's name, and its state when its messaging window has closed.
 *
 * @param key    Channel key.
 * @param closed The messaging window has closed.
 */
function replyChannelLabel( key: string, closed: boolean ): string {
	const names: Record< string, string > = {
		widget: __( 'Chat', 'cliedesk' ),
		email: __( 'Email', 'cliedesk' ),
		whatsapp: __( 'WhatsApp', 'cliedesk' ),
		sms: __( 'SMS', 'cliedesk' ),
		messenger: __( 'Messenger', 'cliedesk' ),
		instagram: __( 'Instagram', 'cliedesk' ),
		telegram: __( 'Telegram', 'cliedesk' ),
	};
	const name = names[ key ] ?? key;
	return closed
		? sprintf(
				/* translators: %s: channel name. */
				__( '%s (window closed)', 'cliedesk' ),
				name
			)
		: name;
}
