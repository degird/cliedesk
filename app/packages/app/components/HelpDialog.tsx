/**
 * Help (ADM-06): search the documentation, open the keyboard shortcuts, see what is new, and report a problem. The
 * Setup Health report is added to a problem report only after the person ticks the box; Cliedesk sends nothing — the
 * person copies the text into their message on the support page.
 *
 * - GET help/changelog → {version, items: [{version, items}]}; GET help/report → {report} (manage settings).
 */
import { api, can, useQuery } from '@cliedesk/data';
import { Button, Checkbox, Modal, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { overlayStore } from '../state';
import { announceResult } from '../workspace/forms';

export const DOCS_URL = 'https://cliedesk.com/docs/';
export const SUPPORT_URL = 'https://cliedesk.com/support/';

export default function HelpDialog( { onClose }: { onClose: () => void } ) {
	const [ query, setQuery ] = useState( '' );
	const [ problem, setProblem ] = useState( '' );
	const [ attach, setAttach ] = useState( false );
	const log = useQuery( {
		queryKey: [ 'help', 'changelog' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					version: string;
					items: Array< { version: string; items: string[] } >;
				} >( 'help/changelog', { signal } )
			).data,
	} );
	// Loaded only after consent.
	const report = useQuery( {
		queryKey: [ 'help', 'report' ],
		queryFn: async ( { signal } ) =>
			( await api.get< { report: string } >( 'help/report', { signal } ) )
				.data?.report ?? '',
		enabled: attach,
	} );
	const reportText = () =>
		[ problem.trim(), attach ? ( report.data ?? '' ) : '' ]
			.filter( Boolean )
			.join( '\n\n' );
	const copy = () => {
		void navigator.clipboard
			?.writeText( reportText() )
			.then( () => announceResult( __( 'Copied.', 'cliedesk' ) ) );
	};
	// ADM-11: the same redacted text as a file to attach to a support message.
	const download = () => {
		const url = URL.createObjectURL(
			new Blob( [ reportText() ], { type: 'text/plain' } )
		);
		const a = document.createElement( 'a' );
		a.href = url;
		a.download = 'cliedesk-report.txt';
		a.click();
		window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Help', 'cliedesk' ) }
			footer={
				<Button variant="primary" onPress={ onClose }>
					{ __( 'Close', 'cliedesk' ) }
				</Button>
			}
		>
			<div className="flex flex-col gap-5">
				<form
					className="flex items-end gap-2"
					onSubmit={ ( e ) => {
						e.preventDefault();
						window.open(
							`${ DOCS_URL }?s=${ encodeURIComponent( query ) }`,
							'_blank',
							'noopener'
						);
					} }
				>
					<TextField
						className="flex-1"
						label={ __( 'Search the documentation', 'cliedesk' ) }
						type="search"
						value={ query }
						onChange={ setQuery }
					/>
					<Button type="submit" isDisabled={ ! query.trim() }>
						{ __( 'Search', 'cliedesk' ) }
					</Button>
				</form>
				<Button
					className="self-start"
					onPress={ () => overlayStore.set( 'shortcuts' ) }
				>
					{ __( 'Keyboard shortcuts', 'cliedesk' ) }
				</Button>
				<section
					aria-labelledby="cd-help-new"
					className="flex flex-col gap-1"
				>
					<h3 id="cd-help-new" className="font-semibold">
						{ log.data
							? sprintf(
									/* translators: %s: version. */
									__(
										'What is new (you have %s)',
										'cliedesk'
									),
									log.data.version
								)
							: __( 'What is new', 'cliedesk' ) }
					</h3>
					{ ( log.data?.items ?? [] ).map( ( v ) => (
						<div key={ v.version } className="text-sm">
							<p className="font-medium">{ v.version }</p>
							<ul className="list-disc ps-5 text-fg-muted">
								{ v.items.map( ( i ) => (
									<li key={ i }>{ i }</li>
								) ) }
							</ul>
						</div>
					) ) }
				</section>
				<section
					aria-labelledby="cd-help-problem"
					className="flex flex-col gap-2"
				>
					<h3 id="cd-help-problem" className="font-semibold">
						{ __( 'Report a problem', 'cliedesk' ) }
					</h3>
					<TextField
						label={ __( 'What happened?', 'cliedesk' ) }
						multiline
						rows={ 3 }
						value={ problem }
						onChange={ setProblem }
					/>
					{ can( 'cliedesk_manage_settings' ) && (
						<Checkbox isSelected={ attach } onChange={ setAttach }>
							{ __(
								'Add the Setup Health report (versions and checks; no emails or links)',
								'cliedesk'
							) }
						</Checkbox>
					) }
					<div className="flex flex-wrap gap-2">
						<Button
							isDisabled={
								! problem.trim() ||
								( attach && report.isPending )
							}
							onPress={ copy }
						>
							{ __( 'Copy the report', 'cliedesk' ) }
						</Button>
						<Button
							variant="secondary"
							isDisabled={
								! problem.trim() ||
								( attach && report.isPending )
							}
							onPress={ download }
						>
							{ __( 'Download the report', 'cliedesk' ) }
						</Button>
						<a
							href={ SUPPORT_URL }
							target="_blank"
							rel="noopener noreferrer"
							className="self-center text-sm underline"
						>
							{ __( 'Open the support page', 'cliedesk' ) }
						</a>
					</div>
				</section>
			</div>
		</Modal>
	);
}
