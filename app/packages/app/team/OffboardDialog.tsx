/**
 * Offboard one person (TEAM-04): shows their open conversations, personal views and saved replies, asks where the
 * conversations go (a person, a queue or unassigned) and who receives the views and replies, then deactivates.
 * The WordPress user, their messages and history stay.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Modal, Select } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { queuePickerQuery } from '../inbox/api';
import { ActionError, useAgents } from '../inbox/components';
import { announceResult } from '../workspace/forms';

interface Preview {
	open: number;
	conversations: Array< { id: number; number: number; subject: string } >;
	views: number;
	savedReplies: number;
}

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.userId  Person.
 * @param props.name    Their name.
 * @param props.onClose Close.
 * @param props.onDone  After deactivating.
 */
export function OffboardDialog( {
	userId,
	name,
	onClose,
	onDone,
}: {
	userId: number;
	name: string;
	onClose: () => void;
	onDone: () => void;
} ) {
	const qc = useQueryClient();
	const { agents } = useAgents();
	const queues = useQuery( queuePickerQuery() );
	const [ to, setTo ] = useState< 'person' | 'queue' | 'unassigned' >(
		'person'
	);
	const [ person, setPerson ] = useState< string | null >( null );
	const [ queue, setQueue ] = useState< string | null >( null );
	const [ heir, setHeir ] = useState< string | null >( null );
	const preview = useQuery( {
		queryKey: [ 'team', 'offboard', userId ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< Preview >( `agents/${ userId }/offboard`, {
					signal,
				} )
			).data,
	} );
	const p = preview.data;
	const others = agents
		.filter( ( a ) => a.userId !== userId )
		.map( ( a ) => ( { id: String( a.userId ), label: a.name } ) );
	const run = useMutation( {
		mutationFn: () =>
			api.post( `agents/${ userId }/deactivate`, {
				body: {
					...( p?.open
						? {
								reassignTo: to,
								...( to === 'person' && person
									? { userId: Number( person ) }
									: {} ),
								...( to === 'queue' && queue
									? { queueId: Number( queue ) }
									: {} ),
							}
						: {} ),
					...( heir ? { transferTo: Number( heir ) } : {} ),
				},
			} ),
		onSuccess: () => {
			announceResult(
				sprintf(
					/* translators: %s: person. */
					__( '%s was deactivated.', 'cliedesk' ),
					name
				)
			);
			void qc.invalidateQueries( { queryKey: [ 'team' ] } );
			onDone();
		},
	} );
	const missing =
		!! p?.open &&
		( ( to === 'person' && ! person ) || ( to === 'queue' && ! queue ) );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: person. */
				__( 'Deactivate %s', 'cliedesk' ),
				name
			) }
			size="md"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="danger"
						isDisabled={ ! p || missing }
						isLoading={ run.isPending }
						onPress={ () => run.mutate() }
					>
						{ __( 'Deactivate', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<p className="text-sm text-fg-muted">
					{ __(
						'They lose access to Cliedesk. Their WordPress account, messages and history stay.',
						'cliedesk'
					) }
				</p>
				<ActionError error={ run.error } />
				{ p && p.open > 0 && (
					<>
						<p>
							{ sprintf(
								/* translators: %d: number of conversations. */
								_n(
									'%d open conversation is assigned to them:',
									'%d open conversations are assigned to them:',
									p.open,
									'cliedesk'
								),
								p.open
							) }
						</p>
						<ul className="max-h-40 overflow-auto text-sm">
							{ p.conversations.map( ( c ) => (
								<li key={ c.id }>
									<bdi>{ `#${ c.number } ${ c.subject }` }</bdi>
								</li>
							) ) }
						</ul>
						<Select
							label={ __( 'Move them to', 'cliedesk' ) }
							value={ to }
							onChange={ ( v ) => setTo( v as typeof to ) }
							options={ [
								{
									id: 'person',
									label: __( 'A person', 'cliedesk' ),
								},
								{
									id: 'queue',
									label: __( 'A queue', 'cliedesk' ),
								},
								{
									id: 'unassigned',
									label: __( 'Unassigned', 'cliedesk' ),
								},
							] }
						/>
						{ to === 'person' && (
							<Select
								label={ __( 'Person', 'cliedesk' ) }
								value={ person }
								onChange={ ( v ) => setPerson( String( v ) ) }
								options={ others }
							/>
						) }
						{ to === 'queue' && (
							<Select
								label={ __( 'Queue', 'cliedesk' ) }
								value={ queue }
								onChange={ ( v ) => setQueue( String( v ) ) }
								options={ ( queues.data ?? [] ).map(
									( q ) => ( {
										id: String( q.id ),
										label: q.name,
									} )
								) }
							/>
						) }
					</>
				) }
				{ p && p.views + p.savedReplies > 0 && (
					<Select
						label={ sprintf(
							/* translators: 1: personal views, 2: saved replies. */
							__(
								'Give their %1$d views and %2$d saved replies to',
								'cliedesk'
							),
							p.views,
							p.savedReplies
						) }
						value={ heir }
						onChange={ ( v ) => setHeir( String( v ) ) }
						options={ others }
					/>
				) }
			</div>
		</Modal>
	);
}
