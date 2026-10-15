/**
 * Conversation history (CNV-20): every recorded change with who made it, when, and the value before and after,
 * including changes the timeline leaves out. Events are append-only; this screen only reads them.
 */
import { Button, Modal, Select } from '@cliedesk/ui';
import { useQuery } from '@tanstack/react-query';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import {
	AUTHOR_CONTACT,
	AUTHOR_SYSTEM,
	AUTHOR_USER,
	eventsQuery,
	fieldsQuery,
	statusesQuery,
	tagsQuery,
	type TimelineEvent,
} from '../../inbox/api';
import { useAgents } from '../../inbox/components';
import {
	actorName,
	describeEvent,
	fullTime,
	priorityLabel,
	statusLabelFor,
} from '../../inbox/labels';

/** Actor type codes (database Appendix A). */
const AUTHOR_AI = 3;
const AUTHOR_RULE = 4;
const AUTHOR_API = 6;
const AUTHOR_IMPORT = 7;

/**
 * Kind of actor, as shown next to the name.
 *
 * @param type Actor type code.
 */
export function actorKind( type: number ): string {
	switch ( type ) {
		case AUTHOR_CONTACT:
			return __( 'Customer', 'cliedesk' );
		case AUTHOR_USER:
			return __( 'Agent', 'cliedesk' );
		case AUTHOR_AI:
			return __( 'AI', 'cliedesk' );
		case AUTHOR_RULE:
			return __( 'Workflow', 'cliedesk' );
		case AUTHOR_SYSTEM:
			return __( 'System', 'cliedesk' );
		case AUTHOR_API:
			return __( 'API', 'cliedesk' );
		case AUTHOR_IMPORT:
			return __( 'Import', 'cliedesk' );
	}
	return __( 'Other', 'cliedesk' );
}

export type HistoryFilter = 'all' | 'people' | 'automation';

/**
 * Whether an event passes the "Who" filter.
 *
 * @param e      Event.
 * @param filter Filter.
 */
export function matchesFilter(
	e: TimelineEvent,
	filter: HistoryFilter
): boolean {
	if ( 'all' === filter ) {
		return true;
	}
	const person =
		e.actorType === AUTHOR_USER || e.actorType === AUTHOR_CONTACT;
	return 'people' === filter ? person : ! person;
}

export interface Change {
	label: string;
	/** Absent for one-sided changes (tags added or removed). */
	from?: string;
	to: string;
}

interface Lookups {
	statusLabel: ( key: unknown ) => string;
	agentName: ( id: number ) => string;
	tagName: ( id: number ) => string;
	fieldLabel: ( key: string ) => string;
}

const text = ( v: unknown ): string => {
	if ( null === v || undefined === v || '' === v ) {
		return '';
	}
	if ( Array.isArray( v ) ) {
		return v.map( text ).join( ', ' );
	}
	if ( 'object' === typeof v ) {
		return JSON.stringify( v );
	}
	return String( v );
};

const fromTo = ( v: unknown ): v is { from?: unknown; to?: unknown } =>
	!! v && 'object' === typeof v && ( 'from' in v || 'to' in v );

/**
 * Before/after values recorded on an event, in readable form.
 *
 * @param e  Event.
 * @param lk Name lookups.
 */
export function eventChanges( e: TimelineEvent, lk: Lookups ): Change[] {
	const d = e.data ?? {};
	switch ( e.type ) {
		case 'conversation.status_changed':
			return [
				{
					label: __( 'Status', 'cliedesk' ),
					from: d.from ? lk.statusLabel( d.from ) : '',
					to: lk.statusLabel( d.to ),
				},
			];
		case 'conversation.priority_changed':
			return [
				{
					label: __( 'Priority', 'cliedesk' ),
					from: priorityLabel( text( d.from ) ),
					to: priorityLabel( text( d.to ) ),
				},
				// CNV-25: why the computed priority changed.
				...( d.reason
					? [
							{
								label: __( 'Reason', 'cliedesk' ),
								from: '',
								to: text( d.reason ),
							},
						]
					: [] ),
			];
		case 'conversation.language_changed':
			return [
				{
					label: __( 'Language', 'cliedesk' ),
					from: text( d.from ),
					to: text( d.to ),
				},
			];
		case 'conversation.subject_changed':
			return [
				{
					label: __( 'Subject', 'cliedesk' ),
					from: text( d.from ),
					to: text( d.to ),
				},
			];
		case 'conversation.assigned': {
			const labels: Record< string, string > = {
				assignee_id: __( 'Assignee', 'cliedesk' ),
				team_id: __( 'Team', 'cliedesk' ),
				queue_id: __( 'Queue', 'cliedesk' ),
			};
			return Object.entries( d )
				.filter( ( [ , v ] ) => fromTo( v ) )
				.map( ( [ k, v ] ) => {
					const c = v as { from?: unknown; to?: unknown };
					const show = ( x: unknown ) => {
						if ( null === x || undefined === x ) {
							return '';
						}
						return 'assignee_id' === k
							? lk.agentName( Number( x ) )
							: `#${ text( x ) }`;
					};
					return {
						label: labels[ k ] ?? k,
						from: show( c.from ),
						to: show( c.to ),
					};
				} );
		}
		case 'conversation.tags_changed': {
			const names = ( v: unknown ) =>
				( Array.isArray( v ) ? v : [] )
					.map( ( id ) => lk.tagName( Number( id ) ) )
					.join( ', ' );
			return [
				{ label: __( 'Added', 'cliedesk' ), to: names( d.added ) },
				{ label: __( 'Removed', 'cliedesk' ), to: names( d.removed ) },
			].filter( ( c ) => '' !== c.to );
		}
		case 'conversation.fields_changed': {
			const changes =
				d.changes && 'object' === typeof d.changes
					? ( d.changes as Record< string, unknown > )
					: {};
			return Object.entries( changes )
				.filter( ( [ , v ] ) => fromTo( v ) )
				.map( ( [ k, v ] ) => {
					const c = v as { from?: unknown; to?: unknown };
					return {
						label: lk.fieldLabel( k ),
						from: text( c.from ),
						to: text( c.to ),
					};
				} );
		}
	}
	return fromTo( d )
		? [
				{
					label: __( 'Value', 'cliedesk' ),
					from: text( d.from ),
					to: text( d.to ),
				},
			]
		: [];
}

/**
 * Dialog.
 *
 * @param props                Props.
 * @param props.conversationId Conversation id.
 * @param props.onClose        Close.
 */
export default function HistoryDialog( {
	conversationId,
	onClose,
}: {
	conversationId: number;
	onClose: () => void;
} ) {
	const events = useQuery( eventsQuery( conversationId ) );
	const statuses = useQuery( statusesQuery() );
	const tags = useQuery( tagsQuery() );
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const { nameFor } = useAgents();
	const [ filter, setFilter ] = useState< HistoryFilter >( 'all' );
	const lk: Lookups = {
		statusLabel: ( k ) => statusLabelFor( k, statuses.data ),
		agentName: ( id ) => actorName( AUTHOR_USER, id, nameFor ),
		tagName: ( id ) =>
			tags.data?.find( ( t ) => t.id === id )?.name ?? `#${ id }`,
		fieldLabel: ( k ) =>
			fields.data?.find( ( f ) => f.key === k )?.label ?? k,
	};
	// Newest first: an audit trail is read from the latest change back.
	const rows = [ ...( events.data ?? [] ) ]
		.filter( ( e ) => matchesFilter( e, filter ) )
		.reverse();
	const none = __( '(none)', 'cliedesk' );
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'History', 'cliedesk' ) }
			footer={
				<Button onPress={ onClose }>
					{ __( 'Close', 'cliedesk' ) }
				</Button>
			}
		>
			<div className="flex flex-col gap-3">
				<div className="max-w-xs">
					<Select
						label={ __( 'Who', 'cliedesk' ) }
						value={ filter }
						onChange={ ( v ) => setFilter( v as HistoryFilter ) }
						options={ [
							{ id: 'all', label: __( 'Everyone', 'cliedesk' ) },
							{
								id: 'people',
								label: __( 'Agents and customers', 'cliedesk' ),
							},
							{
								id: 'automation',
								label: __(
									'Workflows, AI, API and system',
									'cliedesk'
								),
							},
						] }
					/>
				</div>
				{ events.isPending && (
					<p className="text-sm text-fg-muted">
						{ __( 'Loading…', 'cliedesk' ) }
					</p>
				) }
				{ events.isError && (
					<p className="text-sm text-fg-muted">
						{ __(
							'The history of this conversation could not be loaded.',
							'cliedesk'
						) }
					</p>
				) }
				{ events.isSuccess && 0 === rows.length && (
					<p className="text-sm text-fg-muted">
						{ __( 'No changes match.', 'cliedesk' ) }
					</p>
				) }
				{ rows.length > 0 && (
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ __( 'Changes, newest first', 'cliedesk' ) }
						</caption>
						<thead className="text-xs text-fg-muted">
							<tr>
								<th
									scope="col"
									className="py-1 pe-3 font-medium"
								>
									{ __( 'When', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="py-1 pe-3 font-medium"
								>
									{ __( 'Who', 'cliedesk' ) }
								</th>
								<th scope="col" className="py-1 font-medium">
									{ __( 'What', 'cliedesk' ) }
								</th>
							</tr>
						</thead>
						<tbody>
							{ rows.map( ( e ) => {
								const who = actorName(
									e.actorType,
									e.actorId,
									nameFor
								);
								const changes = eventChanges( e, lk );
								return (
									<tr
										key={ e.id }
										className="border-t border-line align-top"
									>
										<td className="whitespace-nowrap py-2 pe-3">
											<time dateTime={ e.createdAt }>
												{ fullTime( e.createdAt ) }
											</time>
										</td>
										<td className="py-2 pe-3">
											{ who }
											<span className="block text-xs text-fg-muted">
												{ actorKind( e.actorType ) }
											</span>
										</td>
										<td className="py-2">
											{ describeEvent(
												e,
												who,
												statuses.data
											) }
											{ changes.length > 0 && (
												<dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-fg-muted">
													{ changes.map( ( c, i ) => (
														<div
															key={ i }
															className="contents"
														>
															<dt className="font-medium">
																{ c.label }
															</dt>
															<dd>
																{ undefined ===
																c.from
																	? c.to
																	: `${
																			c.from ||
																			none
																		} → ${
																			c.to ||
																			none
																		}` }
															</dd>
														</div>
													) ) }
												</dl>
											) }
										</td>
									</tr>
								);
							} ) }
						</tbody>
					</table>
				) }
			</div>
		</Modal>
	);
}
