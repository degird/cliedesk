/**
 * More Settings → Security cards (cliedesk_manage_security):
 *
 * - Strict mode (SEC-40): GET security/strict → {on, since, by, switches:[{key, label, on, pro}]}; POST
 *   security/strict {on} (sensitive: the password dialog may come first). Turning it on is confirmed first; a 422
 *   cliedesk_lockout_risk shows the server's message.
 * - Compliance pack (SEC-39): GET security/compliance → {documents:[{key, title, filename, markdown}],
 *   subprocessors}; each document downloads as a Markdown file, or all at once.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, LoadingRegion, Modal, Switch, toast } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Check, Download, Minus } from 'lucide-react';
import { useState } from 'react';
import { ActionError, Pill, QueryFailed } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import { announceResult } from '../../workspace/forms';

export interface StrictStatus {
	on: boolean;
	since: string | null;
	by: number | null;
	switches: Array< {
		key: string;
		label: string;
		on: boolean;
		pro: boolean;
	} >;
}

export interface ComplianceDoc {
	key: string;
	title: string;
	filename: string;
	markdown: string;
}

/**
 * Strict mode status with safe defaults.
 *
 * @param d Status from the API.
 */
export function normaliseStrict(
	d: Partial< StrictStatus > | undefined
): StrictStatus {
	return {
		on: !! d?.on,
		since: d?.since ?? null,
		by: d?.by ?? null,
		switches: Array.isArray( d?.switches ) ? d.switches : [],
	};
}

export const strictKey = [ 'security', 'strict' ] as const;

/**
 * Save text as a file (a Blob link, clicked once).
 *
 * @param filename File name.
 * @param text     Content.
 * @param type     Media type.
 */
export function downloadText(
	filename: string,
	text: string,
	type = 'text/markdown'
): void {
	const url = URL.createObjectURL( new Blob( [ text ], { type } ) );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild( a );
	a.click();
	a.remove();
	window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
}

/**
 * Strict mode card.
 */
export function StrictModeCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: strictKey,
		queryFn: async ( { signal } ) =>
			normaliseStrict(
				(
					await api.get< StrictStatus >( 'security/strict', {
						signal,
					} )
				).data
			),
		retry: false,
	} );
	const [ confirming, setConfirming ] = useState( false );
	const set = useMutation( {
		mutationFn: ( on: boolean ) =>
			api.post< StrictStatus >( 'security/strict', { body: { on } } ),
		onSuccess: ( r, on ) => {
			setConfirming( false );
			if ( r.data && typeof r.data === 'object' && 'on' in r.data ) {
				qc.setQueryData( strictKey, normaliseStrict( r.data ) );
			}
			void qc.invalidateQueries( { queryKey: [ 'security' ] } );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'security' ],
			} );
			const msg = on
				? __( 'Strict mode is on.', 'cliedesk' )
				: __(
						'Strict mode is off. Your previous settings are back.',
						'cliedesk'
					);
			toast( { tone: 'success', title: msg } );
			announceResult( msg );
		},
		onError: () => setConfirming( false ),
	} );
	return (
		<section
			aria-labelledby="cd-security-strict"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-security-strict" className="text-lg font-semibold">
				{ __( 'Strict mode', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'One switch for the strictest privacy and security settings. While it is on, security settings can only be made stricter.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ set.error } onDismiss={ () => set.reset() } />
			{ q.isPending && (
				<LoadingRegion
					label={ __( 'Loading strict mode…', 'cliedesk' ) }
				/>
			) }
			{ q.isError && (
				<QueryFailed
					headingLevel={ 3 }
					title={ __( 'Could not load strict mode', 'cliedesk' ) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			) }
			{ q.data && (
				<>
					<Switch
						isSelected={ q.data.on }
						isDisabled={ set.isPending }
						onChange={ ( on ) =>
							on ? setConfirming( true ) : set.mutate( false )
						}
					>
						{ __( 'Strict mode', 'cliedesk' ) }
					</Switch>
					{ q.data.on && q.data.since && (
						<p className="text-sm text-fg-muted">
							{ sprintf(
								/* translators: %s: date and time. */
								__( 'On since %s.', 'cliedesk' ),
								fullTime( q.data.since )
							) }
						</p>
					) }
					<ul
						aria-label={ __( 'What strict mode sets', 'cliedesk' ) }
						className="flex flex-col gap-1.5"
					>
						{ q.data.switches.map( ( sw ) => (
							<li
								key={ sw.key }
								className="flex items-center gap-2 text-sm"
							>
								{ sw.on ? (
									<Check
										aria-hidden="true"
										size={ 16 }
										className="text-success"
									/>
								) : (
									<Minus
										aria-hidden="true"
										size={ 16 }
										className="text-fg-muted"
									/>
								) }
								<span className="sr-only">
									{ sw.on
										? __( 'On:', 'cliedesk' )
										: __( 'Off:', 'cliedesk' ) }
								</span>
								<span>{ sw.label }</span>
								{ sw.pro && (
									<Pill tone="accent">
										{ __( 'Pro', 'cliedesk' ) }
									</Pill>
								) }
							</li>
						) ) }
					</ul>
				</>
			) }
			{ confirming && (
				<Modal
					isOpen
					role="alertdialog"
					onOpenChange={ ( o ) => ! o && setConfirming( false ) }
					title={ __( 'Turn on strict mode?', 'cliedesk' ) }
					size="sm"
					footer={
						<>
							<Button
								// eslint-disable-next-line jsx-a11y/no-autofocus
								autoFocus
								onPress={ () => setConfirming( false ) }
							>
								{ __( 'Cancel', 'cliedesk' ) }
							</Button>
							<Button
								variant="primary"
								isLoading={ set.isPending }
								onPress={ () => set.mutate( true ) }
							>
								{ __( 'Turn on strict mode', 'cliedesk' ) }
							</Button>
						</>
					}
				>
					<p>
						{ __(
							'Strict mode tightens these settings; turning it off restores your previous values.',
							'cliedesk'
						) }
					</p>
				</Modal>
			) }
		</section>
	);
}

/**
 * Compliance pack card.
 */
export function ComplianceCard() {
	const q = useQuery( {
		queryKey: [ 'security', 'compliance' ] as const,
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< {
					documents: ComplianceDoc[];
					subprocessors: unknown[];
				} >( 'security/compliance', { signal } )
			).data;
			return {
				documents: Array.isArray( d?.documents ) ? d.documents : [],
				subprocessors: Array.isArray( d?.subprocessors )
					? d.subprocessors
					: [],
			};
		},
		retry: false,
	} );
	const docs = q.data?.documents ?? [];
	const all = () => {
		docs.forEach( ( d ) => downloadText( d.filename, d.markdown ) );
		announceResult(
			sprintf(
				/* translators: %d: number of documents. */
				_n(
					'%d document downloaded.',
					'%d documents downloaded.',
					docs.length,
					'cliedesk'
				),
				docs.length
			)
		);
	};
	return (
		<section
			aria-labelledby="cd-security-compliance"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-security-compliance" className="text-lg font-semibold">
				{ __( 'Compliance pack', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Ready-made documents about how this helpdesk handles data, filled in from your settings. Review them before you share them.',
					'cliedesk'
				) }
			</p>
			{ q.isPending && (
				<LoadingRegion
					label={ __( 'Loading documents…', 'cliedesk' ) }
				/>
			) }
			{ q.isError && (
				<QueryFailed
					headingLevel={ 3 }
					title={ __(
						'Could not load the compliance pack',
						'cliedesk'
					) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			) }
			{ q.data && (
				<>
					<ul className="flex flex-col divide-y divide-line">
						{ docs.map( ( d ) => (
							<li
								key={ d.key }
								className="flex flex-wrap items-center gap-3 py-2"
							>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="font-medium">
										{ d.title }
									</span>
									<span className="text-sm text-fg-muted">
										{ d.filename }
									</span>
								</span>
								<Button
									size="sm"
									iconStart={
										<Download
											aria-hidden="true"
											size={ 14 }
										/>
									}
									aria-label={ sprintf(
										/* translators: %s: document title. */
										__( 'Download %s', 'cliedesk' ),
										d.title
									) }
									onPress={ () =>
										downloadText( d.filename, d.markdown )
									}
								>
									{ __( 'Download', 'cliedesk' ) }
								</Button>
							</li>
						) ) }
					</ul>
					<p className="text-sm text-fg-muted">
						{ sprintf(
							/* translators: %d: number of sub-processors. */
							_n(
								'%d sub-processor listed.',
								'%d sub-processors listed.',
								q.data.subprocessors.length,
								'cliedesk'
							),
							q.data.subprocessors.length
						) }
					</p>
					{ docs.length > 1 && (
						<Button className="self-start" onPress={ all }>
							{ __( 'Download all', 'cliedesk' ) }
						</Button>
					) }
				</>
			) }
		</section>
	);
}
