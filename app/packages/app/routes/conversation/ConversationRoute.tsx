/**
 * `/c/$number`: one conversation. The number resolves to an id (GET conversations/number/{n}; merged
 * conversations resolve to the conversation they were merged into), then the detail loads. Opening marks it read;
 * the change feed polls in "conversation" mode while the screen is open.
 *
 * Deep links (INB-04): `/c/1042#m-88` (or `/c/1042/m/88`) scrolls to message 88 and highlights it, also after a
 * merge. Presence (INB-59): heartbeats while open, avatars under the header, "Updated while you were typing".
 * The same view renders in the inbox's conversation pane (`ConversationView` with `inPane`, INB-02).
 */
import { api, can, isApiError, useQuery, useQueryClient } from '@cliedesk/data';
import { Banner, Button, LoadingRegion } from '@cliedesk/ui';
import {
	Link,
	useNavigate,
	useParams,
	useRouterState,
	useSearch,
} from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import {
	Suspense,
	lazy,
	useEffect,
	useState,
	useSyncExternalStore,
} from 'react';
import { PageHeader } from '../../components/PageHeader';
import {
	contactQuery,
	conversationQuery,
	inboxKeys,
	numberQuery,
} from '../../inbox/api';
import { QueryFailed } from '../../inbox/components';
import { PlayBar } from '../../inbox/PlayBar';
import {
	PresenceStack,
	describeChange,
	usePresence,
} from '../../inbox/presence';
import { messageIdFromHash } from '../../links';
import { getChangeFeed } from '../../mount';
import { openConversationStore } from '../../state';
import { useShortcut } from '../../shortcuts';
import { NotFound } from '../NotFound';
import { Composer } from './Composer';
import { DuplicateBanner, SplitDialog } from './Duplicates';
import { forwardStore } from './compose';
import { Header } from './Header';
import { PaneContext, usePane } from './shared';
import { Timeline } from './Timeline';

// The side panel loads in its own chunk, after the timeline and composer.
const SidePanel = lazy( () =>
	import( /* webpackChunkName: "conversation-side" */ './SidePanel' ).then(
		( m ) => ( { default: m.SidePanel } )
	)
);
// INB-12: tabs, split view and the related list load after the conversation.
const ConversationTabs = lazy( () =>
	import(
		/* webpackChunkName: "conversation-tabs" */ './ConversationTabs'
	).then( ( m ) => ( { default: m.ConversationTabs } ) )
);
const RelatedList = lazy( () =>
	import(
		/* webpackChunkName: "conversation-tabs" */ './ConversationTabs'
	).then( ( m ) => ( { default: m.RelatedList } ) )
);
const MergeDialog = lazy(
	() => import( /* webpackChunkName: "conversation-merge" */ './MergeDialog' )
);
const ForwardDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "conversation-forward" */ './ForwardDialog'
		)
);

function Loading() {
	const pane = usePane();
	return (
		<div className="flex flex-col">
			<PageHeader
				level={ pane.inPane ? 2 : 1 }
				title={ __( 'Conversation', 'cliedesk' ) }
			/>
			<LoadingRegion
				label={ __( 'Loading the conversation…', 'cliedesk' ) }
			/>
		</div>
	);
}

function Screen( {
	id,
	requested,
	highlightId,
	mergeNumbers = [],
}: {
	id: number;
	requested: number;
	highlightId: number | null;
	/** Bulk merge: numbers to merge into this conversation (CNV-43). */
	mergeNumbers?: number[];
} ) {
	const qc = useQueryClient();
	const q = useQuery( conversationQuery( id ) );
	const requester = useQuery( {
		...contactQuery( q.data?.requesterId ?? 0 ),
		enabled: !! q.data && can( 'cliedesk_view_contacts' ),
	} );
	const [ merging, setMerging ] = useState( mergeNumbers.length > 0 );
	useShortcut(
		{
			id: 'conversation-merge',
			keys: 'mod+shift+m',
			label: __( 'Merge conversations', 'cliedesk' ),
			group: __( 'Conversation', 'cliedesk' ),
			run: () => setMerging( true ),
			allowInInputs: true,
		},
		can( 'cliedesk_merge_conversations' )
	);
	const [ splitting, setSplitting ] = useState( false );
	// Narrow screens: the details panel is a slide-over (header → Details).
	const [ details, setDetails ] = useState( false );
	const presence = usePresence( id );
	const pane = usePane();
	const number = q.data?.number;
	const forwarding = useSyncExternalStore(
		forwardStore.subscribe,
		forwardStore.get,
		forwardStore.get
	);

	// The forward dialog belongs to this screen: leaving it closes the dialog.
	useEffect(
		() => () =>
			forwardStore.set( ( cur ) =>
				cur?.conversationId === id ? null : cur
			),
		[ id ]
	);

	useEffect( () => {
		void api
			.post( `conversations/${ id }/read`, { body: { read: true } } )
			.then( () => qc.invalidateQueries( { queryKey: inboxKeys.all } ) )
			.catch( () => {} );
	}, [ id, qc ] );

	useEffect( () => {
		if ( ! number ) {
			return undefined;
		}
		const mine = { id, number };
		openConversationStore.set( mine );
		return () =>
			openConversationStore.set( ( cur ) =>
				cur === mine ? null : cur
			);
	}, [ id, number ] );

	if ( q.isPending ) {
		return <Loading />;
	}
	if ( q.isError ) {
		if ( isApiError( q.error ) && q.error.status === 404 ) {
			return <NotFound />;
		}
		return (
			<div className="flex flex-col">
				<PageHeader title={ __( 'Conversation', 'cliedesk' ) } />
				<QueryFailed
					title={ __(
						'Could not load the conversation',
						'cliedesk'
					) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			</div>
		);
	}
	const c = q.data;
	// Changes by others arrive here only while I am writing (otherwise the screen just refreshes).
	const changes = presence.changes;
	return (
		// Conversation column (header, notices, thread, composer) and, beside it from 52rem, the details column.
		// At least one screen tall, so on tall monitors the thread fills the space and the composer sits at the
		// bottom: the whole pane in the inbox, the viewport less the page padding and tabs on the full page.
		<div
			className={
				pane.inPane
					? '@container flex min-h-full flex-col'
					: '@container flex min-h-[calc(100dvh-var(--cd-topbar-h)-7rem)] flex-col'
			}
		>
			<div className="grid flex-1 gap-6 @min-[52rem]:grid-cols-[minmax(0,1fr)_18rem] @6xl:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="flex min-w-0 flex-col gap-4">
					<Header
						conversation={ c }
						onMerge={ () => setMerging( true ) }
						onSplit={ () => setSplitting( true ) }
						presence={
							<PresenceStack others={ presence.others } />
						}
						detailsOpen={ details }
						onDetails={ () => setDetails( ( v ) => ! v ) }
					/>
					<PlayBar conversationId={ c.id } />
					<DuplicateBanner c={ c } />
					{ changes.length > 0 && (
						<Banner
							tone="info"
							title={ sprintf(
								/* translators: %s: what changed and who changed it, e.g. "status changed by Ana". */
								__(
									'Updated while you were typing: %s',
									'cliedesk'
								),
								[
									...changes
										.slice( 0, 2 )
										.map( describeChange ),
									...( changes.length > 2
										? [
												sprintf(
													/* translators: %d: number of other changes. */
													__( '%d more', 'cliedesk' ),
													changes.length - 2
												),
											]
										: [] ),
								].join( ', ' )
							) }
							actions={
								<Button size="sm" onPress={ presence.refresh }>
									{ __( 'Refresh', 'cliedesk' ) }
								</Button>
							}
						/>
					) }
					{ requested !== c.number && (
						<Banner
							tone="info"
							title={ sprintf(
								/* translators: 1: requested number, 2: number of the conversation shown. */
								__(
									'#%1$d was merged into #%2$d, shown here.',
									'cliedesk'
								),
								requested,
								c.number
							) }
						/>
					) }
					<Timeline
						id={ c.id }
						number={ c.number }
						requesterName={ requester.data?.displayName ?? '' }
						highlightId={ highlightId }
					/>
					<Composer
						conversation={ c }
						others={ presence.others }
						requesterName={ requester.data?.displayName ?? '' }
					/>
				</div>
				<Suspense fallback={ <LoadingRegion /> }>
					<SidePanel
						conversation={ c }
						open={ details }
						onClose={ () => setDetails( false ) }
					/>
				</Suspense>
			</div>
			<Suspense fallback={ null }>
				{ splitting && (
					<SplitDialog
						c={ c }
						onClose={ () => setSplitting( false ) }
					/>
				) }
				{ merging && (
					<MergeDialog
						conversation={ c }
						initialNumbers={ mergeNumbers }
						onClose={ () => setMerging( false ) }
					/>
				) }
				{ forwarding?.conversationId === c.id && (
					<ForwardDialog
						conversation={ c }
						messageId={ forwarding.messageId }
						onClose={ () => forwardStore.set( null ) }
					/>
				) }
			</Suspense>
		</div>
	);
}

/**
 * A conversation by number: the full screen or the inbox pane.
 *
 * @param props             Props.
 * @param props.number      Conversation number.
 * @param props.highlightId Deep-linked message.
 * @param props.inPane      In the inbox's conversation pane.
 * @param props.onClose     Close the pane.
 * @param props.onStep      Open the previous or next conversation of the list.
 */
export function ConversationView( {
	number: n,
	highlightId = null,
	mergeNumbers = [],
	inPane = false,
	onClose,
	onStep,
}: {
	number: number;
	highlightId?: number | null;
	mergeNumbers?: number[];
	inPane?: boolean;
	onClose?: () => void;
	onStep?: ( delta: 1 | -1 ) => void;
} ) {
	const valid = Number.isInteger( n ) && n > 0;
	const lookup = useQuery( { ...numberQuery( n ), enabled: valid } );

	useEffect( () => {
		getChangeFeed()?.setMode( 'conversation' );
		return () => getChangeFeed()?.setMode( 'list' );
	}, [] );

	let body;
	if ( ! valid ) {
		body = <NotFound />;
	} else if ( lookup.isPending ) {
		body = <Loading />;
	} else if ( lookup.isError ) {
		body =
			isApiError( lookup.error ) && lookup.error.status === 404 ? (
				<NotFound />
			) : (
				<div className="flex flex-col">
					<PageHeader
						level={ inPane ? 2 : 1 }
						title={ __( 'Conversation', 'cliedesk' ) }
					/>
					<QueryFailed
						title={ __(
							'Could not open the conversation',
							'cliedesk'
						) }
						error={ lookup.error }
						onRetry={ () => void lookup.refetch() }
					/>
					<Link to="/inbox" className="mt-4 text-accent-fg underline">
						{ __( 'Back to the inbox', 'cliedesk' ) }
					</Link>
				</div>
			);
	} else {
		body = (
			<Screen
				key={ lookup.data.id }
				id={ lookup.data.id }
				requested={ n }
				highlightId={ highlightId }
				mergeNumbers={ mergeNumbers }
			/>
		);
	}
	return (
		<PaneContext.Provider value={ { inPane, onClose, onStep } }>
			{ body }
		</PaneContext.Provider>
	);
}

/**
 * Conversation screen.
 */
export default function ConversationRoute() {
	const params = useParams( { strict: false } ) as {
		number?: string;
		messageId?: string;
	};
	const hash = useRouterState( { select: ( s ) => s.location.hash } );
	// Bulk merge opens here with ?merge=1002,1003 (CNV-43).
	const search = useSearch( { strict: false } ) as {
		merge?: unknown;
		with?: unknown;
	};
	const mergeNumbers = String( search.merge ?? '' )
		.split( ',' )
		.map( Number )
		.filter( ( x ) => Number.isInteger( x ) && x > 0 );
	const fromPath = Number( params.messageId );
	const highlightId =
		Number.isInteger( fromPath ) && fromPath > 0
			? fromPath
			: messageIdFromHash( hash );
	const number = Number( params.number );
	// INB-12: split view (?with=1043), tabs and the related list.
	const other = Number( search.with );
	const withNumber =
		Number.isInteger( other ) && other > 0 && other !== number
			? other
			: null;
	const [ related, setRelated ] = useState( relatedOn );
	const navigate = useNavigate();
	const main = (
		<ConversationView
			number={ number }
			highlightId={ highlightId }
			mergeNumbers={ mergeNumbers }
		/>
	);
	if ( ! Number.isInteger( number ) || number < 1 ) {
		return main;
	}
	return (
		<div className="flex flex-col gap-4">
			<Suspense fallback={ null }>
				<ConversationTabs
					current={ number }
					with={ withNumber }
					related={ related }
					onRelated={ () => {
						setRelated( ! related );
						saveRelated( ! related );
					} }
				/>
			</Suspense>
			<div className="flex min-w-0 gap-6">
				{ related && (
					<Suspense fallback={ null }>
						<RelatedList current={ number } />
					</Suspense>
				) }
				<div
					className={
						withNumber
							? 'grid min-w-0 flex-1 gap-6 xl:grid-cols-2'
							: 'min-w-0 flex-1'
					}
				>
					{ main }
					{ withNumber && (
						<section
							aria-label={ __(
								'Second conversation',
								'cliedesk'
							) }
							className="min-w-0 border-line xl:border-s xl:ps-6"
						>
							<ConversationView
								key={ withNumber }
								number={ withNumber }
								inPane
								onClose={ () =>
									void navigate( {
										to: '/c/$number',
										params: { number: String( number ) },
									} )
								}
							/>
						</section>
					) }
				</div>
			</div>
		</div>
	);
}

const RELATED_KEY = 'cliedesk:tabs:related';

/** Whether the related list is shown (remembered in this browser). */
function relatedOn(): boolean {
	try {
		return window.localStorage.getItem( RELATED_KEY ) === '1';
	} catch {
		return false;
	}
}

/**
 * Remember whether the related list is shown.
 *
 * @param on Shown.
 */
function saveRelated( on: boolean ): void {
	try {
		window.localStorage.setItem( RELATED_KEY, on ? '1' : '0' );
	} catch {
		// Storage blocked: not remembered.
	}
}
