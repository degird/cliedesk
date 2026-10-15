/**
 * Settings → Notices (PRO-17, PRO-18 Free parts): incident, maintenance and announcement notices shown in the chat
 * widget, the portal, the help center and as a site-wide banner. Maintenance can be scheduled with a start and an
 * end. An incident can open a tracker conversation: link affected conversations to it, and resolving it ends the
 * notice (its resolve prompt sends the update to linked customers). TRI-30: the incident bundle also takes conditions
 * (new matching conversations join the tracker) and a saved reply for agents.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	EmptyState,
	LoadingRegion,
	Modal,
	Select,
	TextField,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { Megaphone, Plus } from 'lucide-react';
import { useState } from 'react';
import {
	RuleConditions,
	conditionsJson,
} from '../../components/RuleConditions';
import { ActionError } from '../../inbox/components';
import { fromJson, type GroupNode } from '../../inbox/conditions';
import { versionTag } from '../../workspace/api';
import { announceResult } from '../../workspace/forms';

export interface Notice {
	id: number;
	uid: string;
	kind: 'incident' | 'maintenance' | 'announcement';
	title: string;
	body: string;
	surfaces: string[];
	productId: number | null;
	trackerId: number | null;
	trackerNumber?: number | null;
	startsAt: string | null;
	endsAt: string | null;
	state: 'live' | 'scheduled' | 'ended';
	version: number;
}

const SURFACES = [ 'widget', 'portal', 'help', 'banner' ] as const;

const surfaceLabel = ( s: string ): string =>
	( {
		widget: __( 'Chat widget', 'cliedesk' ),
		portal: __( 'Portal', 'cliedesk' ),
		help: __( 'Help center', 'cliedesk' ),
		banner: __( 'Banner on every page', 'cliedesk' ),
	} )[ s ] ?? s;

const kindLabel = ( k: string ): string =>
	( {
		incident: __( 'Incident', 'cliedesk' ),
		maintenance: __( 'Maintenance', 'cliedesk' ),
		announcement: __( 'Announcement', 'cliedesk' ),
	} )[ k ] ?? k;

const stateLabel = ( s: string ): string =>
	( {
		live: __( 'Showing now', 'cliedesk' ),
		scheduled: __( 'Scheduled', 'cliedesk' ),
		ended: __( 'Ended', 'cliedesk' ),
	} )[ s ] ?? s;

/**
 * Local "YYYY-MM-DDTHH:mm" (datetime-local) from an ISO time, and back.
 *
 * @param iso ISO time.
 */
export function toLocalInput( iso: string | null ): string {
	if ( ! iso ) {
		return '';
	}
	const d = new Date( iso );
	const pad = ( n: number ) => String( n ).padStart( 2, '0' );
	return `${ d.getFullYear() }-${ pad( d.getMonth() + 1 ) }-${ pad(
		d.getDate()
	) }T${ pad( d.getHours() ) }:${ pad( d.getMinutes() ) }`;
}

function NoticeDialog( {
	notice,
	onClose,
}: {
	notice: Notice | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ kind, setKind ] = useState< string >( notice?.kind ?? 'incident' );
	const [ title, setTitle ] = useState( notice?.title ?? '' );
	const [ body, setBody ] = useState( notice?.body ?? '' );
	const [ surfaces, setSurfaces ] = useState< string[] >(
		notice?.surfaces ?? [ 'widget', 'portal', 'help' ]
	);
	const [ starts, setStarts ] = useState(
		toLocalInput( notice?.startsAt ?? null )
	);
	const [ ends, setEnds ] = useState(
		toLocalInput( notice?.endsAt ?? null )
	);
	const [ tracker, setTracker ] = useState( true );
	const [ root, setRoot ] = useState< GroupNode >( () => fromJson( {} ) );
	const [ reply, setReply ] = useState( '' );
	const save = useMutation( {
		mutationFn: () => {
			const body2 = {
				kind,
				title: title.trim(),
				body,
				surfaces,
				startsAt: starts ? new Date( starts ).toISOString() : null,
				endsAt: ends ? new Date( ends ).toISOString() : null,
			};
			return notice
				? api.patch< Notice >( `notices/${ notice.id }`, {
						body: body2,
						ifMatch: versionTag( notice.version ),
					} )
				: api.post< Notice >( 'notices', {
						body: {
							...body2,
							tracker: kind === 'incident' && tracker,
							...( kind === 'incident' &&
							tracker &&
							root.children.length
								? { matchConditions: conditionsJson( root ) }
								: {} ),
							...( kind === 'incident' && tracker && reply.trim()
								? {
										replyHtml: `<p>${ reply
											.trim()
											.replace( /&/g, '&amp;' )
											.replace( /</g, '&lt;' ) }</p>`,
									}
								: {} ),
						},
					} );
		},
		onSuccess: () => {
			announceResult( __( 'Notice saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'notices' ] } );
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				notice
					? __( 'Edit notice', 'cliedesk' )
					: __( 'Add notice', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ ! title.trim() || surfaces.length === 0 }
						onPress={ () => save.mutate() }
					>
						{ __( 'Save notice', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<ActionError error={ save.error } />
				<Select
					label={ __( 'Kind', 'cliedesk' ) }
					value={ kind }
					onChange={ setKind }
					options={ [ 'incident', 'maintenance', 'announcement' ].map(
						( k ) => ( {
							id: k,
							label: kindLabel( k ),
						} )
					) }
				/>
				<TextField
					label={ __( 'Title', 'cliedesk' ) }
					value={ title }
					onChange={ setTitle }
					maxLength={ 120 }
					isRequired
				/>
				<TextField
					label={ __( 'Details', 'cliedesk' ) }
					multiline
					value={ body }
					onChange={ setBody }
					maxLength={ 1000 }
				/>
				<fieldset className="flex flex-col gap-1">
					<legend className="text-sm font-medium">
						{ __( 'Show in', 'cliedesk' ) }
					</legend>
					{ SURFACES.map( ( s ) => (
						<Checkbox
							key={ s }
							isSelected={ surfaces.includes( s ) }
							onChange={ ( on ) =>
								setSurfaces( ( all ) =>
									on
										? [ ...all, s ]
										: all.filter( ( x ) => x !== s )
								)
							}
						>
							{ surfaceLabel( s ) }
						</Checkbox>
					) ) }
				</fieldset>
				<div className="flex flex-wrap gap-3">
					<TextField
						label={ __( 'Starts', 'cliedesk' ) }
						description={ __( 'Empty: now.', 'cliedesk' ) }
						type="datetime-local"
						value={ starts }
						onChange={ setStarts }
					/>
					<TextField
						label={ __( 'Ends', 'cliedesk' ) }
						description={ __(
							'Empty: until you end it.',
							'cliedesk'
						) }
						type="datetime-local"
						value={ ends }
						onChange={ setEnds }
					/>
				</div>
				{ ! notice && kind === 'incident' && (
					<Checkbox isSelected={ tracker } onChange={ setTracker }>
						{ __(
							'Open a tracker conversation: link affected conversations to it; resolving it ends this notice',
							'cliedesk'
						) }
					</Checkbox>
				) }
				{ ! notice && kind === 'incident' && tracker && (
					<>
						<p className="text-sm font-medium">
							{ __(
								'New conversations that match join the tracker',
								'cliedesk'
							) }
						</p>
						<RuleConditions root={ root } onChange={ setRoot } />
						<TextField
							label={ __( 'Saved reply for agents', 'cliedesk' ) }
							description={ __(
								'Optional. Added as a shared saved reply named after the notice.',
								'cliedesk'
							) }
							multiline
							rows={ 3 }
							maxLength={ 5000 }
							value={ reply }
							onChange={ setReply }
						/>
					</>
				) }
			</div>
		</Modal>
	);
}

/**
 * Notices section.
 */
export default function NoticesSection() {
	const qc = useQueryClient();
	const [ ended, setEnded ] = useState( false );
	const [ editing, setEditing ] = useState< Notice | 'new' | null >( null );
	const q = useQuery( {
		queryKey: [ 'notices', ended ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< Notice[] >( 'notices', {
					query: { ended },
					signal,
				} )
			).data ?? [],
	} );
	const end = useMutation( {
		mutationFn: ( n: Notice ) =>
			api.post( `notices/${ n.id }/end`, { body: {} } ),
		onSuccess: () =>
			void qc.invalidateQueries( { queryKey: [ 'notices' ] } ),
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	const list = Array.isArray( q.data ) ? q.data : [];
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-fg-muted">
				{ __(
					'Tell customers about incidents, maintenance or news in the chat widget, the portal, the help center and as a banner on every page.',
					'cliedesk'
				) }
			</p>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Checkbox isSelected={ ended } onChange={ setEnded }>
					{ __( 'Show ended notices', 'cliedesk' ) }
				</Checkbox>
				<Button
					variant="primary"
					iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add notice', 'cliedesk' ) }
				</Button>
			</div>
			<ActionError error={ end.error } />
			{ list.length === 0 ? (
				<EmptyState
					icon={ <Megaphone size={ 32 } strokeWidth={ 1.75 } /> }
					title={ __( 'No notices', 'cliedesk' ) }
					description={ __(
						'For example “Shipping delays this week” on the widget, the portal and the help center.',
						'cliedesk'
					) }
					actions={
						<Button onPress={ () => setEditing( 'new' ) }>
							{ __( 'Add a notice', 'cliedesk' ) }
						</Button>
					}
				/>
			) : (
				<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
					{ list.map( ( n ) => (
						<li
							key={ n.id }
							className="flex flex-wrap items-center gap-3 p-3"
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="font-medium">{ n.title }</span>
								<span className="text-sm text-fg-muted">
									{ [
										kindLabel( n.kind ),
										stateLabel( n.state ),
										n.surfaces
											.map( surfaceLabel )
											.join( ', ' ),
									].join( ' · ' ) }
								</span>
								{ n.trackerNumber && (
									<Link
										to="/c/$number"
										params={ {
											number: String( n.trackerNumber ),
										} }
										className="text-sm underline"
									>
										{ sprintf(
											/* translators: %d: conversation number. */
											__( 'Tracker #%d', 'cliedesk' ),
											n.trackerNumber
										) }
									</Link>
								) }
							</div>
							{ n.state !== 'ended' && (
								<>
									<Button
										size="sm"
										onPress={ () => setEditing( n ) }
										aria-label={ sprintf(
											/* translators: %s: notice title. */
											__( 'Edit %s', 'cliedesk' ),
											n.title
										) }
									>
										{ __( 'Edit', 'cliedesk' ) }
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onPress={ () => end.mutate( n ) }
										aria-label={ sprintf(
											/* translators: %s: notice title. */
											__( 'End %s', 'cliedesk' ),
											n.title
										) }
									>
										{ __( 'End now', 'cliedesk' ) }
									</Button>
								</>
							) }
						</li>
					) ) }
				</ul>
			) }
			{ editing && (
				<NoticeDialog
					notice={ editing === 'new' ? null : editing }
					onClose={ () => setEditing( null ) }
				/>
			) }
		</div>
	);
}
