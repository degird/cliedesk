/**
 * Manage participants (INB-62, Free): everyone on a conversation with their role (customer, CC, assignee, agents,
 * followers). Teammates can be added as agents: they see the conversation and answer it (live chat too, under their
 * own name). The assignee stays responsible for the SLA.
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQueries,
	useQueryClient,
} from '@cliedesk/data';
import { Button, IconButton, Modal, Select } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useState } from 'react';
import {
	contactQuery,
	type Conversation,
	type Participant,
} from '../../inbox/api';
import { ActionError, useAgents } from '../../inbox/components';
import { afterChange, mergeDetail } from './shared';

interface Row {
	key: string;
	name: string;
	role: string;
	/** Removable agent. */
	agentId?: number;
}

/**
 * Button and dialog.
 *
 * @param props              Props.
 * @param props.conversation Conversation.
 */
export function ManageParticipants( {
	conversation: c,
}: {
	conversation: Conversation;
} ) {
	const qc = useQueryClient();
	const [ open, setOpen ] = useState( false );
	const [ pick, setPick ] = useState< string | null >( null );
	const { agents, nameFor } = useAgents();
	const me = getBoot().user?.id ?? 0;
	const others = can( 'cliedesk_assign_others' );
	const contacts = c.participants.filter(
		( p ) => p.partyType === 'contact'
	);
	const names = useQueries( {
		queries: contacts.map( ( p ) => ( {
			...contactQuery( p.partyId ),
			enabled: open && can( 'cliedesk_view_contacts' ),
		} ) ),
	} );
	const write = useMutation( {
		mutationFn: ( {
			method,
			path,
			body,
		}: {
			method: 'POST' | 'DELETE';
			path: string;
			body?: unknown;
		} ) =>
			api.request< { participants: Participant[] } >(
				method,
				`conversations/${ c.id }/${ path }`,
				{ body }
			),
		onSuccess: ( r ) => {
			if ( r.data?.participants ) {
				mergeDetail( qc, c.id, { participants: r.data.participants } );
			}
			afterChange( qc, c.id );
			setPick( null );
		},
	} );
	const userName = ( id: number ) =>
		nameFor( id ) ??
		sprintf(
			/* translators: %d: user id. */
			__( 'User #%d', 'cliedesk' ),
			id
		);
	const rows: Row[] = [];
	contacts.forEach( ( p, i ) => {
		const contact = names[ i ]?.data;
		rows.push( {
			key: `c${ p.role }${ p.partyId }`,
			name:
				contact?.displayName ||
				contact?.email ||
				sprintf(
					/* translators: %d: contact id. */
					__( 'Contact #%d', 'cliedesk' ),
					p.partyId
				),
			role:
				p.role === 'requester'
					? __( 'Customer', 'cliedesk' )
					: __( 'CC', 'cliedesk' ),
		} );
	} );
	if ( c.assigneeId ) {
		rows.push( {
			key: `a${ c.assigneeId }`,
			name: userName( c.assigneeId ),
			role: __( 'Assignee (responsible)', 'cliedesk' ),
		} );
	}
	const added = c.participants.filter(
		( p ) => p.partyType === 'user' && p.role === 'agent'
	);
	added.forEach( ( p ) =>
		rows.push( {
			key: `g${ p.partyId }`,
			name: userName( p.partyId ),
			role: __( 'Agent', 'cliedesk' ),
			agentId: p.partyId,
		} )
	);
	c.participants
		.filter( ( p ) => p.partyType === 'user' && p.role === 'follower' )
		.forEach( ( p ) =>
			rows.push( {
				key: `f${ p.partyId }`,
				name: userName( p.partyId ),
				role: __( 'Follower', 'cliedesk' ),
			} )
		);
	const taken = new Set( [
		c.assigneeId ?? 0,
		...added.map( ( p ) => p.partyId ),
	] );
	const choices = agents.filter(
		( a ) => ! taken.has( a.userId ) && ( others || a.userId === me )
	);
	const canAnswer = can( 'cliedesk_reply_conversations' );
	return (
		<>
			<Button size="sm" variant="ghost" onPress={ () => setOpen( true ) }>
				{ __( 'Manage participants…', 'cliedesk' ) }
			</Button>
			{ open && (
				<Modal
					isOpen
					onOpenChange={ ( o ) => ! o && setOpen( false ) }
					title={ __( 'Participants', 'cliedesk' ) }
					size="md"
					footer={
						<Button onPress={ () => setOpen( false ) }>
							{ __( 'Close', 'cliedesk' ) }
						</Button>
					}
				>
					<div className="flex flex-col gap-4">
						<ActionError
							error={ write.error }
							onDismiss={ () => write.reset() }
						/>
						<ul className="flex flex-col gap-1 text-sm">
							{ rows.map( ( r ) => (
								<li
									key={ r.key }
									className="flex items-center gap-2"
								>
									<span className="min-w-0 flex-1 truncate">
										<bdi>{ r.name }</bdi>
									</span>
									<span className="text-fg-muted">
										{ r.role }
									</span>
									{ r.agentId !== undefined &&
										canAnswer &&
										( others || r.agentId === me ) && (
											<IconButton
												size="sm"
												label={ sprintf(
													/* translators: %s: person. */
													__(
														'Remove %s',
														'cliedesk'
													),
													r.name
												) }
												icon={ <X size={ 12 } /> }
												onPress={ () =>
													write.mutate( {
														method: 'DELETE',
														path: `agents/${ r.agentId }`,
													} )
												}
											/>
										) }
								</li>
							) ) }
						</ul>
						{ canAnswer && choices.length > 0 && (
							<div className="flex items-end gap-2">
								<Select
									className="flex-1"
									label={ __( 'Add an agent', 'cliedesk' ) }
									value={ pick }
									onChange={ ( v ) => setPick( String( v ) ) }
									options={ choices.map( ( a ) => ( {
										id: String( a.userId ),
										label: a.name,
									} ) ) }
								/>
								<Button
									size="sm"
									isDisabled={ ! pick }
									isLoading={ write.isPending }
									onPress={ () =>
										write.mutate( {
											method: 'POST',
											path: 'agents',
											body: { userId: Number( pick ) },
										} )
									}
								>
									{ __( 'Add', 'cliedesk' ) }
								</Button>
							</div>
						) }
						<p className="text-sm text-fg-muted">
							{ __(
								'Added agents see this conversation and can answer it; the customer sees each name. The assignee stays responsible for the deadline.',
								'cliedesk'
							) }
						</p>
					</div>
				</Modal>
			) }
		</>
	);
}
