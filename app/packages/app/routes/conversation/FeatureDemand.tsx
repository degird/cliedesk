/**
 * Feature request on a tracker (OTH-03): mark the tracker as a feature request, see the demand (requests, customers,
 * their value and segments) and, when it ships, send the notice to every linked conversation — after a confirmation.
 *
 * - GET trackers/{id}/demand → {marked, requests, customers, value, segments}
 * - POST trackers/{id}/feature {on}; POST trackers/{id}/shipped {html} → {sent} (sent at once).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Modal, TextField } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { textToHtml } from '../../inbox/html';
import { announceResult } from '../../workspace/forms';

interface Demand {
	marked: boolean;
	requests: number;
	customers: number;
	value: number | null;
	segments: Array< { name: string; customers: number } >;
}

export function FeatureDemand( { id }: { id: number } ) {
	const qc = useQueryClient();
	const key = [ 'feature-demand', id ];
	const q = useQuery( {
		queryKey: key,
		queryFn: async ( { signal } ) =>
			( await api.get< Demand >( `trackers/${ id }/demand`, { signal } ) )
				.data,
	} );
	const [ text, setText ] = useState( '' );
	const [ confirming, setConfirming ] = useState( false );
	const mark = useMutation( {
		mutationFn: ( on: boolean ) =>
			api.post( `trackers/${ id }/feature`, { body: { on } } ),
		onSuccess: () => void qc.invalidateQueries( { queryKey: key } ),
	} );
	const shipped = useMutation( {
		mutationFn: async () =>
			(
				await api.post< { sent?: number } >(
					`trackers/${ id }/shipped`,
					{ body: { html: textToHtml( text ) } }
				)
			).data?.sent ?? 0,
		onSuccess: ( sent ) => {
			setText( '' );
			setConfirming( false );
			announceResult(
				sprintf(
					/* translators: %d: number of conversations. */
					_n(
						'Sent to %d conversation.',
						'Sent to %d conversations.',
						sent,
						'cliedesk'
					),
					sent
				)
			);
		},
		onError: () => setConfirming( false ),
	} );
	const d = q.data;
	if ( ! d || typeof d.marked !== 'boolean' ) {
		return null;
	}
	if ( ! d.marked ) {
		return (
			<Button
				size="sm"
				className="self-start"
				isLoading={ mark.isPending }
				onPress={ () => mark.mutate( true ) }
			>
				{ __( 'This is a feature request', 'cliedesk' ) }
			</Button>
		);
	}
	return (
		<section
			aria-labelledby={ `cd-feature-${ id }` }
			className="flex flex-col gap-2 rounded-md border border-line p-3"
		>
			<h3 id={ `cd-feature-${ id }` } className="text-sm font-semibold">
				{ __( 'Feature request', 'cliedesk' ) }
			</h3>
			<p className="text-sm">
				{ sprintf(
					/* translators: 1: requests, 2: customers. */
					__( '%1$d requests from %2$d customers', 'cliedesk' ),
					d.requests,
					d.customers
				) }
			</p>
			{ d.value !== null && (
				<p className="text-sm">
					{ sprintf(
						/* translators: %s: summed customer value. */
						__( 'Customer value: %s', 'cliedesk' ),
						d.value.toLocaleString()
					) }
				</p>
			) }
			{ d.segments.length > 0 && (
				<Muted>
					{ d.segments
						.map( ( s ) => `${ s.name } (${ s.customers })` )
						.join( ', ' ) }
				</Muted>
			) }
			<ActionError error={ shipped.error ?? mark.error } />
			<TextField
				label={ __( 'Shipped: message to every customer', 'cliedesk' ) }
				multiline
				rows={ 3 }
				value={ text }
				onChange={ setText }
			/>
			<div className="flex gap-2">
				<Button
					size="sm"
					variant="primary"
					isDisabled={ ! text.trim() }
					isLoading={ shipped.isPending }
					onPress={ () => setConfirming( true ) }
				>
					{ __( 'Send to customers', 'cliedesk' ) }
				</Button>
				<Button size="sm" onPress={ () => mark.mutate( false ) }>
					{ __( 'Not a feature request', 'cliedesk' ) }
				</Button>
			</div>
			<Modal
				isOpen={ confirming }
				size="sm"
				role="alertdialog"
				onOpenChange={ setConfirming }
				title={ sprintf(
					/* translators: %d: number of conversations. */
					_n(
						'Send this message to the %d conversation that asked for it?',
						'Send this message to the %d conversations that asked for it?',
						d.requests,
						'cliedesk'
					),
					d.requests
				) }
				footer={
					<>
						<Button
							// Confirmations focus Cancel first (§8.3).
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
							onPress={ () => setConfirming( false ) }
						>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
						<Button
							variant="primary"
							isLoading={ shipped.isPending }
							onPress={ () => shipped.mutate() }
						>
							{ __( 'Send', 'cliedesk' ) }
						</Button>
					</>
				}
			>
				<p className="text-sm text-fg-muted">
					{ __(
						'The message is sent to the customer of each conversation. This cannot be undone.',
						'cliedesk'
					) }
				</p>
			</Modal>
		</section>
	);
}
