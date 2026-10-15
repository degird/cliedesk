/**
 * Settings → Channels (CHN-01): the channel matrix. One row per channel account with its product, queue,
 * conversation type and CSAT switch; every change is versioned and can be rolled back from its history. The AI
 * columns come with Pro (PRO badge for staff).
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, EmptyState, Modal, ProPill, Select } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { queuePickerQuery, typesQuery } from '../../inbox/api';
import { announceResult } from '../../workspace/forms';

interface Row {
	id: number;
	channel: string;
	name: string;
	address: string;
	productId: number | null;
	queueId: number | null;
	typeId: number | null;
	csat: boolean | null;
	version: number;
}

interface Version {
	version: number;
	createdAt: string;
	changes: Array< { field: string; from: unknown; to: unknown } >;
}

const KEY = [ 'channels', 'matrix' ] as const;

function csatValue( csat: boolean | null ): string {
	if ( csat === null ) {
		return 'inherit';
	}
	return csat ? 'on' : 'off';
}
const NONE = '0';

function fieldName( field: string ): string {
	const names: Record< string, string > = {
		productId: __( 'Product', 'cliedesk' ),
		queueId: __( 'Queue', 'cliedesk' ),
		typeId: __( 'Type', 'cliedesk' ),
		csat: __( 'CSAT', 'cliedesk' ),
	};
	return names[ field ] ?? field;
}

function History( { row, onClose }: { row: Row; onClose: () => void } ) {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ ...KEY, row.id, 'history' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Version[] } >(
					`channels/matrix/${ row.id }/history`,
					{ signal }
				)
			).data?.items ?? [],
	} );
	const restore = useMutation( {
		mutationFn: ( version: number ) =>
			api.post( `channels/matrix/${ row.id }/restore`, {
				body: { version },
			} ),
		onSuccess: () => {
			announceResult( __( 'Version restored.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: channel account name. */
				__( 'History of %s', 'cliedesk' ),
				row.name
			) }
		>
			<ActionError error={ restore.error } />
			<ol className="flex flex-col gap-3">
				{ ( q.data ?? [] ).map( ( v, i ) => (
					<li key={ v.version } className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<strong>
								{ sprintf(
									/* translators: %d: version number. */
									__( 'Version %d', 'cliedesk' ),
									v.version
								) }
							</strong>
							<span className="text-sm text-fg-muted">
								{ v.createdAt }
							</span>
							{ i > 0 && (
								<Button
									size="sm"
									className="ms-auto"
									isLoading={ restore.isPending }
									onPress={ () =>
										restore.mutate( v.version )
									}
								>
									{ __( 'Restore', 'cliedesk' ) }
								</Button>
							) }
						</div>
						{ v.changes.length > 0 ? (
							<ul className="text-sm">
								{ v.changes.map( ( c ) => (
									<li key={ c.field }>
										{ sprintf(
											/* translators: 1: field, 2: old value, 3: new value. */
											__(
												'%1$s: %2$s → %3$s',
												'cliedesk'
											),
											fieldName( c.field ),
											String( c.from ?? '—' ),
											String( c.to ?? '—' )
										) }
									</li>
								) ) }
							</ul>
						) : (
							<Muted>
								{ __( 'Starting values', 'cliedesk' ) }
							</Muted>
						) }
					</li>
				) ) }
			</ol>
		</Modal>
	);
}

export default function ChannelsSection() {
	const qc = useQueryClient();
	const [ history, setHistory ] = useState< Row | null >( null );
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Row[] } >( 'channels/matrix', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const queues = useQuery( queuePickerQuery() );
	const types = useQuery( typesQuery() );
	const save = useMutation( {
		mutationFn: ( { id, patch }: { id: number; patch: Partial< Row > } ) =>
			api.patch( `channels/matrix/${ id }`, { body: patch } ),
		onSuccess: () => {
			announceResult( __( 'Channel saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const products = getBoot().products ?? [];
	const idOrNull = ( v: unknown ) => ( v === NONE ? null : Number( v ) );
	const rows = q.data ?? [];
	return (
		<section aria-labelledby="cd-channels" className="flex flex-col gap-3">
			<h2 id="cd-channels" className="text-lg font-semibold">
				{ __( 'Channel matrix', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'One row per channel account. New conversations arriving through it take its product, queue and type. Every change is kept and can be restored.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ save.error } />
			{ q.isSuccess && ! rows.length && (
				<EmptyState
					headingLevel={ 3 }
					title={ __(
						'No channel accounts yet. Mailboxes and messaging channels come with Cliedesk Pro.',
						'cliedesk'
					) }
					actions={
						// ADM-04: every empty state offers a way to start.
						can( 'cliedesk_manage_email' ) && (
							<Link
								to="/settings/$area/$section"
								params={ {
									area: 'channels',
									section: 'email',
								} }
								className="inline-flex h-(--cd-control-h) items-center rounded-md border border-line-strong bg-surface px-(--cd-control-px) font-medium text-fg hover:bg-sunken"
							>
								{ __( 'Email settings', 'cliedesk' ) }
							</Link>
						)
					}
				/>
			) }
			{ rows.length > 0 && (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-start">
								<th className="px-2 py-1 text-start">
									{ __( 'Channel', 'cliedesk' ) }
								</th>
								<th className="px-2 py-1 text-start">
									{ __( 'Product', 'cliedesk' ) }
								</th>
								<th className="px-2 py-1 text-start">
									{ __( 'Queue', 'cliedesk' ) }
								</th>
								<th className="px-2 py-1 text-start">
									{ __( 'Type', 'cliedesk' ) }
								</th>
								<th className="px-2 py-1 text-start">
									{ __( 'CSAT', 'cliedesk' ) }
								</th>
								<th className="px-2 py-1 text-start">
									{ __( 'AI', 'cliedesk' ) } <ProPill />
								</th>
								<th className="px-2 py-1">
									<span className="sr-only">
										{ __( 'History', 'cliedesk' ) }
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{ rows.map( ( r ) => (
								<tr
									key={ r.id }
									className="border-t border-line"
								>
									<td className="px-2 py-1">
										<bdi>{ r.name }</bdi>
										<div className="text-fg-muted">
											<bdi>{ r.address }</bdi>
										</div>
									</td>
									<td className="px-2 py-1">
										<Select
											label={ __(
												'Product',
												'cliedesk'
											) }
											labelHidden
											value={ String(
												r.productId ?? NONE
											) }
											onChange={ ( v ) =>
												save.mutate( {
													id: r.id,
													patch: {
														productId:
															idOrNull( v ),
													},
												} )
											}
											options={ [
												{
													id: NONE,
													label: __(
														'Default',
														'cliedesk'
													),
												},
												...products.map( ( p ) => ( {
													id: String( p.id ),
													label: p.name,
												} ) ),
											] }
										/>
									</td>
									<td className="px-2 py-1">
										<Select
											label={ __( 'Queue', 'cliedesk' ) }
											labelHidden
											value={ String(
												r.queueId ?? NONE
											) }
											onChange={ ( v ) =>
												save.mutate( {
													id: r.id,
													patch: {
														queueId: idOrNull( v ),
													},
												} )
											}
											options={ [
												{
													id: NONE,
													label: __(
														'None',
														'cliedesk'
													),
												},
												...( queues.data ?? [] ).map(
													( x ) => ( {
														id: String( x.id ),
														label: x.name,
													} )
												),
											] }
										/>
									</td>
									<td className="px-2 py-1">
										<Select
											label={ __( 'Type', 'cliedesk' ) }
											labelHidden
											value={ String( r.typeId ?? NONE ) }
											onChange={ ( v ) =>
												save.mutate( {
													id: r.id,
													patch: {
														typeId: idOrNull( v ),
													},
												} )
											}
											options={ [
												{
													id: NONE,
													label: __(
														'Default',
														'cliedesk'
													),
												},
												...( types.data ?? [] ).map(
													( x ) => ( {
														id: String( x.id ),
														label: x.name,
													} )
												),
											] }
										/>
									</td>
									<td className="px-2 py-1">
										<Select
											label={ __( 'CSAT', 'cliedesk' ) }
											labelHidden
											value={ csatValue( r.csat ) }
											onChange={ ( v ) =>
												save.mutate( {
													id: r.id,
													patch: {
														csat:
															v === 'inherit'
																? null
																: v === 'on',
													},
												} )
											}
											options={ [
												{
													id: 'inherit',
													label: __(
														'Product setting',
														'cliedesk'
													),
												},
												{
													id: 'on',
													label: __(
														'On',
														'cliedesk'
													),
												},
												{
													id: 'off',
													label: __(
														'Off',
														'cliedesk'
													),
												},
											] }
										/>
									</td>
									<td className="px-2 py-1 text-fg-muted">
										—
									</td>
									<td className="px-2 py-1">
										<Button
											size="sm"
											onPress={ () => setHistory( r ) }
										>
											{ __( 'History', 'cliedesk' ) }
										</Button>
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
			) }
			{ history && (
				<History row={ history } onClose={ () => setHistory( null ) } />
			) }
		</section>
	);
}
