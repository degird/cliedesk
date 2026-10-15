/**
 * Settings → Privacy & security → Change history (ADM-07): every settings change is a version with its author and
 * the changed fields. Compare a version with the current settings and restore it (a restore is a new version, and is
 * in the audit log). Rules keep their own versions in the rule editor.
 *
 * - GET settings-modules → {items}; GET settings/{module}/history → {items: [{version, live, author, changed, createdAt}]}
 * - GET settings/{module}/compare?from&to → {changes: [{path, before, after}]}; POST settings/{module}/restore {version}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	ConfirmDestructive,
	LoadingRegion,
	Select,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Version {
	version: number;
	live: boolean;
	author: string | null;
	changed: string[];
	createdAt: string;
}

const show = ( v: unknown ): string => {
	if ( v === null || v === undefined || v === '' ) {
		return '—';
	}
	return typeof v === 'string' ? v : JSON.stringify( v );
};

function Compare( { module, version }: { module: string; version: number } ) {
	const q = useQuery( {
		queryKey: [ 'settings-history', module, 'compare', version ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					changes: Array< {
						path: string;
						before: unknown;
						after: unknown;
					} >;
				} >( `settings/${ module }/compare`, {
					query: { from: version },
					signal,
				} )
			).data?.changes ?? [],
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	const changes = q.data ?? [];
	if ( changes.length === 0 ) {
		return <Muted>{ __( 'Same as now.', 'cliedesk' ) }</Muted>;
	}
	return (
		<table className="w-full text-sm">
			<thead>
				<tr className="text-start text-fg-muted">
					<th className="text-start">
						{ __( 'Setting', 'cliedesk' ) }
					</th>
					<th className="text-start">
						{ __( 'In this version', 'cliedesk' ) }
					</th>
					<th className="text-start">{ __( 'Now', 'cliedesk' ) }</th>
				</tr>
			</thead>
			<tbody>
				{ changes.map( ( c ) => (
					<tr key={ c.path } className="border-t border-line">
						<td className="py-1 font-mono">{ c.path }</td>
						<td className="py-1 break-all">{ show( c.before ) }</td>
						<td className="py-1 break-all">{ show( c.after ) }</td>
					</tr>
				) ) }
			</tbody>
		</table>
	);
}

export default function SettingsHistorySection() {
	const qc = useQueryClient();
	const modules = useQuery( {
		queryKey: [ 'settings-history', 'modules' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: string[] } >( 'settings-modules', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const [ module, setModule ] = useState( 'workspace' );
	const [ open, setOpen ] = useState< number | null >( null );
	const [ restoring, setRestoring ] = useState< number | null >( null );
	const history = useQuery( {
		queryKey: [ 'settings-history', module ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Version[] } >(
					`settings/${ module }/history`,
					{ signal }
				)
			).data?.items ?? [],
	} );
	const restore = useMutation( {
		mutationFn: ( version: number ) =>
			api.post( `settings/${ module }/restore`, { body: { version } } ),
		onSuccess: () => {
			setRestoring( null );
			announceResult( __( 'Settings restored.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings-history' ] } );
			void qc.invalidateQueries( { queryKey: [ 'settings' ] } );
		},
	} );
	return (
		<div className="flex flex-col gap-4">
			<Select
				label={ __( 'Settings', 'cliedesk' ) }
				value={ module }
				options={ ( modules.data ?? [ 'workspace' ] ).map( ( m ) => ( {
					id: m,
					label: m,
				} ) ) }
				onChange={ ( m ) => {
					setModule( String( m ) );
					setOpen( null );
				} }
			/>
			{ history.isPending && <LoadingRegion /> }
			{ history.data && history.data.length === 0 && (
				<Muted>{ __( 'No changes yet.', 'cliedesk' ) }</Muted>
			) }
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ ( history.data ?? [] ).map( ( v ) => (
					<li key={ v.version } className="flex flex-col gap-2 p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="flex flex-col">
								<span className="font-medium">
									{ sprintf(
										/* translators: 1: version number, 2: date. */
										__( 'Version %1$d · %2$s', 'cliedesk' ),
										v.version,
										v.createdAt.slice( 0, 16 )
									) }
									{ v.live && (
										<span className="ms-2 rounded-full border border-line px-2 text-xs text-fg-muted">
											{ __( 'current', 'cliedesk' ) }
										</span>
									) }
								</span>
								<span className="text-sm text-fg-muted">
									{ [ v.author, v.changed.join( ', ' ) ]
										.filter( Boolean )
										.join( ' · ' ) }
								</span>
							</span>
							{ ! v.live && (
								<span className="flex gap-2">
									<Button
										size="sm"
										onPress={ () =>
											setOpen(
												open === v.version
													? null
													: v.version
											)
										}
									>
										{ __( 'Compare with now', 'cliedesk' ) }
									</Button>
									<Button
										size="sm"
										variant="danger"
										onPress={ () =>
											setRestoring( v.version )
										}
									>
										{ __( 'Restore', 'cliedesk' ) }
									</Button>
								</span>
							) }
						</div>
						{ open === v.version && (
							<Compare module={ module } version={ v.version } />
						) }
					</li>
				) ) }
			</ul>
			<ConfirmDestructive
				isOpen={ restoring !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setRestoring( null );
						restore.reset();
					}
				} }
				title={ sprintf(
					/* translators: %d: version number. */
					__( 'Restore version %d?', 'cliedesk' ),
					restoring ?? 0
				) }
				description={ __(
					'Every setting in this group goes back to how it was in that version. This is saved as a new version.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Restore', 'cliedesk' ) }
				isLoading={ restore.isPending }
				onConfirm={ () => {
					if ( restoring ) {
						restore.mutate( restoring );
					}
				} }
			>
				<ActionError error={ restore.error } />
			</ConfirmDestructive>
		</div>
	);
}
