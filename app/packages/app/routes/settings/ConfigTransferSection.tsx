/**
 * Settings → Developer → Move configuration (ADM-08): download the configuration as JSON, or load a file from
 * another site: Cliedesk first shows what it would create, update or cannot apply, then applies it.
 *
 * - GET config/export → {document}; POST config/import {json, dryRun} → {create, update, same, conflicts, changes}.
 */
import { api, useMutation } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Report {
	create: number;
	update: number;
	same: number;
	conflicts: Array< { item: string; reason: string } >;
	changes: Array< { item: string; action: string } >;
}

export default function ConfigTransferSection() {
	const [ json, setJson ] = useState< string | null >( null );
	const [ report, setReport ] = useState< Report | null >( null );
	const download = useMutation( {
		mutationFn: async () =>
			( await api.get< { document: unknown } >( 'config/export' ) ).data
				?.document,
		onSuccess: ( doc ) => {
			const blob = new Blob( [ JSON.stringify( doc, null, 2 ) ], {
				type: 'application/json',
			} );
			const a = document.createElement( 'a' );
			a.href = URL.createObjectURL( blob );
			a.download = `cliedesk-config-${ new Date()
				.toISOString()
				.slice( 0, 10 ) }.json`;
			a.click();
			URL.revokeObjectURL( a.href );
		},
	} );
	const run = useMutation( {
		mutationFn: async ( dryRun: boolean ) =>
			(
				await api.post< Report >( 'config/import', {
					body: { json: json ?? '', dryRun },
				} )
			).data as Report,
		onSuccess: ( data, dryRun ) => {
			if ( dryRun ) {
				setReport( data );
				return;
			}
			setReport( null );
			setJson( null );
			announceResult( __( 'Configuration imported.', 'cliedesk' ) );
		},
	} );
	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-2">
				<h2 className="font-semibold">
					{ __( 'Export', 'cliedesk' ) }
				</h2>
				<Muted>
					{ __(
						'Settings of every group, tags and the triage taxonomy as one JSON file. No passwords, people or conversations.',
						'cliedesk'
					) }
				</Muted>
				<Button
					className="self-start"
					isLoading={ download.isPending }
					onPress={ () => download.mutate() }
				>
					{ __( 'Download configuration', 'cliedesk' ) }
				</Button>
				<ActionError error={ download.error } />
			</section>
			<section className="flex flex-col gap-2">
				<h2 className="font-semibold">
					{ __( 'Import', 'cliedesk' ) }
				</h2>
				<label htmlFor="cd-config-file" className="text-sm font-medium">
					{ __( 'Configuration file from another site', 'cliedesk' ) }
				</label>
				<input
					id="cd-config-file"
					type="file"
					accept="application/json,.json"
					onChange={ ( e ) => {
						const file = e.target.files?.[ 0 ];
						setReport( null );
						if ( file ) {
							void file.text().then( setJson );
						}
					} }
				/>
				<ActionError error={ run.error } />
				{ json && ! report && (
					<Button
						className="self-start"
						isLoading={ run.isPending }
						onPress={ () => run.mutate( true ) }
					>
						{ __( 'Check what changes', 'cliedesk' ) }
					</Button>
				) }
				{ report && (
					<div className="flex flex-col gap-2 rounded-md border border-line p-3 text-sm">
						<p>
							{ sprintf(
								/* translators: 1: creates, 2: updates, 3: unchanged, 4: conflicts. */
								__(
									'%1$d to create, %2$d to update, %3$d unchanged, %4$d cannot be applied.',
									'cliedesk'
								),
								report.create,
								report.update,
								report.same,
								report.conflicts.length
							) }
						</p>
						{ report.conflicts.length > 0 && (
							<ul className="list-disc ps-5 text-warning">
								{ report.conflicts.map( ( c ) => (
									<li
										key={ c.item }
									>{ `${ c.item }: ${ c.reason }` }</li>
								) ) }
							</ul>
						) }
						<ul className="list-disc ps-5 text-fg-muted">
							{ report.changes.slice( 0, 50 ).map( ( c ) => (
								<li
									key={ c.item }
								>{ `${ c.action }: ${ c.item }` }</li>
							) ) }
						</ul>
						<Button
							variant="primary"
							className="self-start"
							isDisabled={ report.create + report.update === 0 }
							isLoading={ run.isPending }
							onPress={ () => run.mutate( false ) }
						>
							{ __( 'Apply', 'cliedesk' ) }
						</Button>
					</div>
				) }
			</section>
		</div>
	);
}
