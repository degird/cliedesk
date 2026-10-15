/**
 * Play mode UI (INB-26): the Play button for a view, the Play bar above a conversation opened by Play (Skip, after
 * send choice, Stop) and the skip dialog (optional reason). Logic and state: `./play`.
 */
import { isApiError } from '@cliedesk/data';
import {
	Button,
	Menu,
	MenuItem,
	Modal,
	TextField,
	announce,
	toast,
} from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { Play, SkipForward, Square } from 'lucide-react';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { ActionError } from './components';
import type { SortKey } from './api';
import {
	afterSendPref,
	playStore,
	setAfterSendPref,
	skipConversation,
	startPlay,
	stopPlay,
	type AfterSend,
} from './play';

/** Navigate to a conversation number, or to the view's list when null. */
export function usePlayGo() {
	const navigate = useNavigate();
	return ( n: number | null, view: string ) => {
		if ( n === null ) {
			void navigate( { to: '/inbox/$view', params: { view } } );
		} else {
			void navigate( {
				to: '/c/$number',
				params: { number: String( n ) },
			} );
		}
	};
}

/** Current Play state. */
export function usePlay() {
	return useSyncExternalStore(
		playStore.subscribe,
		playStore.get,
		playStore.get
	);
}

export function afterSendLabel( v: AfterSend ): string {
	switch ( v ) {
		case 'list':
			return __( 'Back to the list', 'cliedesk' );
		case 'stay':
			return __( 'Stay on the conversation', 'cliedesk' );
		default:
			return __( 'Open the next conversation', 'cliedesk' );
	}
}

/**
 * Start Play on a view: opens its first conversation.
 *
 * @param target          View.
 * @param target.view     View reference.
 * @param target.viewName View name.
 * @param target.sort     Sort chosen on the list (null: the view's).
 */
export function usePlayStart( target: {
	view: string;
	viewName: string;
	sort: SortKey | null;
} ) {
	const go = usePlayGo();
	const [ busy, setBusy ] = useState( false );
	const start = () => {
		setBusy( true );
		startPlay( target, go )
			.catch( ( e ) =>
				toast( {
					tone: 'danger',
					title: isApiError( e )
						? e.message
						: __( 'Could not start Play.', 'cliedesk' ),
				} )
			)
			.finally( () => setBusy( false ) );
	};
	return { start, busy };
}

/**
 * Play button (roles that work through Play only).
 *
 * @param props          Props.
 * @param props.view     View reference.
 * @param props.viewName View name.
 * @param props.sort     Sort chosen on the list (null: the view's).
 * @param props.variant  Button style.
 */
export function PlayButton( {
	view,
	viewName,
	sort,
	variant = 'secondary',
}: {
	view: string;
	viewName: string;
	sort: SortKey | null;
	variant?: 'primary' | 'secondary';
} ) {
	const play = usePlayStart( { view, viewName, sort } );
	return (
		<Button
			variant={ variant }
			isLoading={ play.busy }
			iconStart={ <Play aria-hidden="true" size={ 14 } /> }
			onPress={ play.start }
		>
			{ __( 'Play', 'cliedesk' ) }
		</Button>
	);
}

/**
 * Skip dialog: optional reason, then the next conversation opens.
 *
 * @param props                Props.
 * @param props.conversationId Conversation.
 * @param props.onClose        Close.
 */
export function SkipDialog( {
	conversationId,
	onClose,
}: {
	conversationId: number;
	onClose: () => void;
} ) {
	const go = usePlayGo();
	const [ reason, setReason ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState< unknown >( null );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		setBusy( true );
		setError( null );
		skipConversation( conversationId, reason, go )
			.then( () => {
				announce( __( 'Skipped.', 'cliedesk' ) );
				onClose();
			} )
			.catch( ( err ) => {
				setError( err );
				setBusy( false );
			} );
	};
	return (
		<Modal
			isOpen
			size="sm"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Skip this conversation', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-play-skip"
						variant="primary"
						isLoading={ busy }
					>
						{ __( 'Skip', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-play-skip"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ __(
						'It stays out of your Play queue for 4 hours. Skips are counted in reports.',
						'cliedesk'
					) }
				</p>
				<ActionError error={ error } />
				<TextField
					label={ __( 'Reason', 'cliedesk' ) }
					description={ __( 'Optional.', 'cliedesk' ) }
					value={ reason }
					onChange={ setReason }
					maxLength={ 500 }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
			</form>
		</Modal>
	);
}

/**
 * Play bar above a conversation that Play opened.
 *
 * @param props                Props.
 * @param props.conversationId Conversation on screen.
 */
export function PlayBar( { conversationId }: { conversationId: number } ) {
	const play = usePlay();
	const go = usePlayGo();
	const [ skipping, setSkipping ] = useState( false );
	const [ after, setAfter ] = useState< AfterSend >( afterSendPref );
	if ( ! play || play.current !== conversationId ) {
		return null;
	}
	return (
		<section
			aria-label={ __( 'Play mode', 'cliedesk' ) }
			className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-subtle px-4 py-2"
		>
			<p className="me-auto text-sm font-medium">
				{ sprintf(
					/* translators: %s: view name. */
					__( 'Playing: %s', 'cliedesk' ),
					play.viewName
				) }
			</p>
			<Menu
				aria-label={ __( 'After sending', 'cliedesk' ) }
				selectionMode="single"
				selectedKeys={ [ after ] }
				onAction={ ( k ) => {
					const v = k as AfterSend;
					setAfter( v );
					setAfterSendPref( v );
				} }
				trigger={
					<Button size="sm">
						{ sprintf(
							/* translators: %s: what happens after a reply is sent. */
							__( 'After sending: %s', 'cliedesk' ),
							afterSendLabel( after )
						) }
					</Button>
				}
			>
				{ ( [ 'next', 'list', 'stay' ] as AfterSend[] ).map( ( v ) => (
					<MenuItem key={ v } id={ v }>
						{ afterSendLabel( v ) }
					</MenuItem>
				) ) }
			</Menu>
			<Button
				size="sm"
				iconStart={ <SkipForward aria-hidden="true" size={ 14 } /> }
				onPress={ () => setSkipping( true ) }
			>
				{ __( 'Skip', 'cliedesk' ) }
			</Button>
			<Button
				size="sm"
				iconStart={ <Square aria-hidden="true" size={ 14 } /> }
				onPress={ () => {
					stopPlay();
					announce( __( 'Play stopped.', 'cliedesk' ) );
					go( null, play.view );
				} }
			>
				{ __( 'Stop', 'cliedesk' ) }
			</Button>
			{ skipping && (
				<SkipDialog
					conversationId={ conversationId }
					onClose={ () => setSkipping( false ) }
				/>
			) }
		</section>
	);
}
