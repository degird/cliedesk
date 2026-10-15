/**
 * My status in the header (RTE-31): Online, Busy, Transfers only, Away or Offline, plus an optional status message.
 * The status is read every minute; that read also tells the server the app is open, so a closed browser stops
 * counting as "the team is here" for customers. Pro (FPS-07) fills the `header.status` slot with this menu plus
 * custom statuses, Away reasons, channel choices and idle reports, through the `extension` prop.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	Menu,
	MenuGroup,
	MenuItem,
	MenuSeparator,
	Modal,
	TextField,
	UnstyledButton as AriaButton,
	cx,
	toast,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import {
	ArrowLeftRight,
	CircleCheck,
	CircleMinus,
	CircleOff,
	MessageSquareText,
	Moon,
} from 'lucide-react';
import { useCallback, useState, type Key, type ReactNode } from 'react';

export type AgentStatusKey =
	'online' | 'busy' | 'transfers_only' | 'away' | 'offline';

export interface MyStatus {
	status: AgentStatusKey;
	text: string;
	since: string | null;
	/** After a change: agents customers can reach now (CHN-12). */
	teamAvailable?: number;
	/** What a module adds (Pro: custom statuses, channels…). */
	[ key: string ]: unknown;
}

/** Body of PUT me/status (a module may send more, e.g. Pro's custom status). */
export type StatusBody = {
	status: AgentStatusKey;
	text?: string;
} & Record< string, unknown >;

/** More menu entries from an extension (Pro). */
export interface StatusMenuItem {
	id: string;
	label: string;
	help: string;
	base: AgentStatusKey;
}

export interface StatusMenuExtension {
	/** Entries after the standard statuses. */
	items?: StatusMenuItem[];
	/** The selected entry (default: the standard status). */
	selected?: string;
	/** The name shown in the header (default: the status label). */
	name?: string;
	/** Handle a pick; true when handled. */
	onPick?: ( key: string ) => boolean;
	/** Extra fields sent with a message change (e.g. keep a custom status). */
	keep?: Record< string, unknown >;
	/** More actions at the end of the menu. */
	actions?: { id: string; label: string; onAction: () => void }[];
}

const KEY = [ 'me', 'status' ] as const;

export const STATUS_ORDER: AgentStatusKey[] = [
	'online',
	'busy',
	'transfers_only',
	'away',
	'offline',
];

export function statusLabel( s: AgentStatusKey ): string {
	return {
		online: __( 'Online', 'cliedesk' ),
		busy: __( 'Busy', 'cliedesk' ),
		transfers_only: __( 'Transfers only', 'cliedesk' ),
		away: __( 'Away', 'cliedesk' ),
		offline: __( 'Offline', 'cliedesk' ),
	}[ s ];
}

function statusHelp( s: AgentStatusKey ): string {
	return {
		online: __( 'Gets new conversations', 'cliedesk' ),
		busy: __( 'Keeps my conversations, no new ones', 'cliedesk' ),
		transfers_only: __(
			'Only conversations teammates send me',
			'cliedesk'
		),
		away: __( 'Not at my desk', 'cliedesk' ),
		offline: __( 'Not working now', 'cliedesk' ),
	}[ s ];
}

/** Icon and colour together, so the status never depends on colour alone. */
export function StatusIcon( {
	status,
	size = 16,
}: {
	status: AgentStatusKey;
	size?: number;
} ) {
	const props = { size, 'aria-hidden': true as const };
	const icons: Record< AgentStatusKey, ReactNode > = {
		online: <CircleCheck { ...props } className="text-success" />,
		busy: <CircleMinus { ...props } className="text-danger" />,
		transfers_only: <ArrowLeftRight { ...props } className="text-info" />,
		away: <Moon { ...props } className="text-warning" />,
		offline: <CircleOff { ...props } className="text-fg-subtle" />,
	};
	return <>{ icons[ status ] }</>;
}

/**
 * My status: read every minute, changed with `save`; `merge` puts a status from the server in the cache.
 */
export function useMyStatus() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< MyStatus >( 'me/status', { signal } ) ).data,
		refetchInterval: 60_000,
		refetchIntervalInBackground: true,
	} );
	const mutation = useMutation( {
		mutationFn: ( body: StatusBody ) =>
			api.put< MyStatus >( 'me/status', { body } ),
		onSuccess: ( r ) => {
			qc.setQueryData( KEY, r.data );
			if ( r.data.teamAvailable === 0 ) {
				toast( {
					tone: 'warning',
					title: __(
						'Nobody is online now. The chat widget tells customers the team is away and makes no reply promise.',
						'cliedesk'
					),
				} );
			}
		},
		onError: () =>
			toast( {
				tone: 'danger',
				title: __( 'Your status was not changed.', 'cliedesk' ),
			} ),
	} );
	const merge = useCallback(
		( s: MyStatus ) =>
			qc.setQueryData( KEY, ( old: MyStatus | undefined ) => ( {
				...old,
				...s,
			} ) ),
		[ qc ]
	);
	return { mine: q.data, save: mutation.mutate, merge };
}

/**
 * Header status menu.
 *
 * @param props           Props.
 * @param props.extension More entries and handlers (Pro).
 */
export function StatusMenu( {
	extension,
}: {
	extension?: StatusMenuExtension;
} = {} ) {
	const [ editing, setEditing ] = useState( false );
	const { mine, save } = useMyStatus();
	if ( ! mine?.status ) {
		return null;
	}
	const items = extension?.items ?? [];
	const name = extension?.name || statusLabel( mine.status );
	const selected = extension?.selected ?? mine.status;
	const pick = ( key: string ) => {
		if ( ! extension?.onPick?.( key ) ) {
			save( { status: key as AgentStatusKey } );
		}
	};
	const label = mine.text
		? sprintf(
				/* translators: 1: status, 2: status message. */
				__( 'My status: %1$s, %2$s', 'cliedesk' ),
				name,
				mine.text
			)
		: sprintf(
				/* translators: %s: status. */
				__( 'My status: %s', 'cliedesk' ),
				name
			);
	const face = (
		<>
			<StatusIcon status={ mine.status } />
			<span className="hidden text-sm sm:inline">{ name }</span>
		</>
	);
	const triggerClass = cx(
		'inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-fg-muted outline-none',
		'data-[hovered]:bg-sunken data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus'
	);
	if ( ! can( 'cliedesk_set_own_status' ) ) {
		return (
			<span className={ triggerClass } role="img" aria-label={ label }>
				{ face }
			</span>
		);
	}
	return (
		<>
			<Menu
				aria-label={ __( 'My status', 'cliedesk' ) }
				trigger={
					<AriaButton aria-label={ label } className={ triggerClass }>
						{ face }
					</AriaButton>
				}
			>
				<MenuGroup
					title={ __( 'My status', 'cliedesk' ) }
					selectionMode="single"
					selectedKeys={ [ selected ] }
					disallowEmptySelection
					onSelectionChange={ ( keys: 'all' | Set< Key > ) => {
						const [ key ] = keys === 'all' ? [] : [ ...keys ];
						if ( key !== undefined && key !== selected ) {
							pick( String( key ) );
						}
					} }
				>
					{ [
						...STATUS_ORDER.map( ( s ) => ( {
							id: s as string,
							label: statusLabel( s ),
							help: statusHelp( s ),
							base: s,
						} ) ),
						...items,
					].map( ( o ) => (
						<MenuItem
							key={ o.id }
							id={ o.id }
							icon={ <StatusIcon status={ o.base } /> }
							textValue={ o.label }
						>
							<span className="flex flex-col">
								<span>{ o.label }</span>
								<span className="text-xs text-fg-muted">
									{ o.help }
								</span>
							</span>
						</MenuItem>
					) ) }
				</MenuGroup>
				<MenuSeparator />
				<MenuGroup>
					{ [
						{
							id: 'message',
							label: mine.text
								? __( 'Change status message…', 'cliedesk' )
								: __( 'Set a status message…', 'cliedesk' ),
							onAction: () => setEditing( true ),
						},
						...( extension?.actions ?? [] ),
					].map( ( a ) => (
						<MenuItem
							key={ a.id }
							id={ a.id }
							icon={
								a.id === 'message' ? (
									<MessageSquareText size={ 16 } />
								) : undefined
							}
							onAction={ a.onAction }
						>
							{ a.label }
						</MenuItem>
					) ) }
				</MenuGroup>
			</Menu>
			{ editing && (
				<MessageDialog
					initial={ mine.text }
					onClose={ () => setEditing( false ) }
					onSave={ ( text ) => {
						save( {
							status: mine.status,
							text,
							...( extension?.keep ?? {} ),
						} );
						setEditing( false );
					} }
				/>
			) }
		</>
	);
}

function MessageDialog( {
	initial,
	onClose,
	onSave,
}: {
	initial: string;
	onClose: () => void;
	onSave: ( text: string ) => void;
} ) {
	const [ text, setText ] = useState( initial );
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Status message', 'cliedesk' ) }
			size="sm"
			footer={
				<>
					{ initial && (
						<Button variant="ghost" onPress={ () => onSave( '' ) }>
							{ __( 'Clear', 'cliedesk' ) }
						</Button>
					) }
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						onPress={ () => onSave( text.trim() ) }
					>
						{ __( 'Save status message', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<TextField
				label={ __( 'Message', 'cliedesk' ) }
				description={ __(
					'Teammates see it next to your name, e.g. “In a meeting until 3”.',
					'cliedesk'
				) }
				maxLength={ 100 }
				value={ text }
				onChange={ setText }
			/>
		</Modal>
	);
}

/** Pieces Pro's status fills reuse (the `kit` fill prop). */
export const statusKit = {
	STATUS_ORDER,
	StatusIcon,
	StatusMenu,
	statusLabel,
	useMyStatus,
};

export type StatusKit = typeof statusKit;
