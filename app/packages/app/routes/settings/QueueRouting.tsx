/**
 * Queue routing (RTE-03, RTE-07, RTE-15, RTE-36): how the queue's conversations are assigned (manually or round robin
 * among the linked teams' Online agents), who gets them when nobody is available, whether offline agents may get
 * them and the order of the queue view. Conversations reach a queue by a rule for new conversations, an automation
 * rule or by hand. Pro (FPS-07) fills `queue.routing` with entry conditions, sticky assignment, chat offers, keeping
 * the owner, reopen and long-wait re-routing and privacy (saved with this dialog through `addSave`), and
 * `queue.schedule` with the queue's business hours (SLA-24).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Modal, Select, Slot, Switch } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useCallback, useRef, useState } from 'react';
import {
	RuleConditions,
	conditionsJson,
} from '../../components/RuleConditions';
import { ActionError, useAgents } from '../../inbox/components';
import { fromJson } from '../../inbox/conditions';
import { moreSorts, vocabularyQuery } from '../../inbox/api';
import { versionTag } from '../../workspace/api';
import { announceResult } from '../../workspace/forms';

export interface RoutingQueue {
	id: number;
	name: string;
	version: number;
	ownerTeamId?: number | null;
	assignment?: 'manual' | 'round_robin';
	defaultAssigneeId?: number | null;
	offlineAgents?: boolean;
	/** priority, oldest, newest, or an order a module adds (Pro: sla). */
	listOrder?: string;
}

/** Free's condition editor for Pro's queue rules (the `kit` fill prop). */
export const routingKit = { RuleConditions, conditionsJson, fromJson };

export type RoutingKit = typeof routingKit;

/** A save a fill adds to the dialog's Save button; returns a function that removes it. */
export type AddSave = ( save: () => Promise< unknown > ) => () => void;

export function QueueRouting( {
	queue,
	onClose,
}: {
	queue: RoutingQueue;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const { agents } = useAgents();
	const [ assignment, setAssignment ] = useState< 'manual' | 'round_robin' >(
		queue.assignment ?? 'manual'
	);
	const [ fallback, setFallback ] = useState< number | null >(
		queue.defaultAssigneeId ?? null
	);
	const [ offline, setOffline ] = useState( queue.offlineAgents ?? false );
	const [ order, setOrder ] = useState< string >(
		queue.listOrder ?? 'priority'
	);
	// RTE-03: orders modules add (Pro: next SLA breach), from the view vocabulary's sorts.
	const vocabulary = useQuery( vocabularyQuery() );
	const extra = useRef< Array< () => Promise< unknown > > >( [] );
	const addSave = useCallback< AddSave >( ( fn ) => {
		extra.current.push( fn );
		return () => {
			extra.current = extra.current.filter( ( f ) => f !== fn );
		};
	}, [] );
	const save = useMutation( {
		mutationFn: async () => {
			await api.patch( `queues/${ queue.id }`, {
				body: {
					assignment,
					defaultAssigneeId: fallback,
					offlineAgents: offline,
					listOrder: order,
				},
				ifMatch: versionTag( queue.version ),
			} );
			for ( const fn of extra.current ) {
				await fn();
			}
		},
		onSuccess: () => {
			announceResult(
				sprintf(
					/* translators: %s: queue name. */
					__( 'Routing of “%s” saved.', 'cliedesk' ),
					queue.name
				)
			);
			void qc.invalidateQueries( { queryKey: [ 'queues' ] } );
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: queue name. */
				__( 'Routing for %s', 'cliedesk' ),
				queue.name
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ save.isPending }
						onPress={ () => save.mutate() }
					>
						{ __( 'Save routing', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<ActionError error={ save.error } />
				<p className="text-sm text-fg-muted">
					{ __(
						'Conversations come into this queue by a rule for new conversations, an automation rule or when someone moves them here.',
						'cliedesk'
					) }
				</p>
				<Select
					label={ __( 'Assignment', 'cliedesk' ) }
					value={ assignment }
					onChange={ ( x ) =>
						setAssignment( x as 'manual' | 'round_robin' )
					}
					options={ [
						{
							id: 'manual',
							label: __(
								'Manual: agents take or assign conversations',
								'cliedesk'
							),
						},
						{
							id: 'round_robin',
							label: __(
								'Round robin: to the Online team member who waited longest',
								'cliedesk'
							),
						},
					] }
				/>
				<Slot name="routing.methods.pro" />
				{ assignment === 'round_robin' && (
					<>
						<Select
							label={ __(
								'When nobody is available',
								'cliedesk'
							) }
							value={ String( fallback ?? 0 ) }
							onChange={ ( x ) =>
								setFallback( Number( x ) || null )
							}
							options={ [
								{
									id: '0',
									label: __(
										'Wait, and give it to the next agent who comes online',
										'cliedesk'
									),
								},
								...agents.map( ( a ) => ( {
									id: String( a.userId ),
									label: sprintf(
										/* translators: %s: agent name. */
										__( 'Give it to %s', 'cliedesk' ),
										a.name
									),
								} ) ),
							] }
						/>
						<Switch isSelected={ offline } onChange={ setOffline }>
							{ __(
								'Offline agents may get conversations too',
								'cliedesk'
							) }
						</Switch>
					</>
				) }
				<Select
					label={ __( 'Order of conversations', 'cliedesk' ) }
					description={ __( 'Used by the queue view.', 'cliedesk' ) }
					value={ order }
					onChange={ setOrder }
					options={ [
						...moreSorts( vocabulary.data ).map( ( x ) => ( {
							id: x.key,
							label: x.label,
						} ) ),
						{
							id: 'priority',
							label: __( 'Priority, then oldest', 'cliedesk' ),
						},
						{
							id: 'oldest',
							label: __( 'Waiting longest first', 'cliedesk' ),
						},
						{
							id: 'newest',
							label: __( 'Newest first', 'cliedesk' ),
						},
					] }
				/>
				{ /* FPS-07 (Pro): entry conditions, sticky, offers, re-routing and privacy. */ }
				<Slot
					name="queue.routing"
					fillProps={ {
						queueId: queue.id,
						roundRobin: assignment === 'round_robin',
						owned: !! queue.ownerTeamId,
						addSave,
						kit: routingKit,
					} }
				/>
				{ /* SLA-24 (Pro): the queue's business hours. */ }
				<Slot
					name="queue.schedule"
					fillProps={ { queueId: queue.id } }
				/>
			</div>
		</Modal>
	);
}
