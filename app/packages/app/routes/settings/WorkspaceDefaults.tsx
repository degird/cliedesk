/**
 * Settings → Workspace (INB-09): defaults for agents (send button, sidebar, agents as customers) and the history of
 * settings changes with roll back.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Select, Switch, toast } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

const value = ( v: unknown, d: unknown ) => ( v === undefined ? d : v );

/** Defaults for new agents and conversations. */
export function WorkspaceDefaults() {
	const qc = useQueryClient();
	const inbox = useQuery( settingsQuery( 'inbox' ) );
	const conv = useQuery( settingsQuery( 'conversations' ) );
	const save = useMutation( {
		mutationFn: ( {
			module,
			values,
		}: {
			module: string;
			values: Record< string, unknown >;
		} ) => api.patch( `settings/${ module }`, { body: { values } } ),
		onSuccess: ( _r, v ) => {
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', v.module ] } );
		},
	} );
	if ( ! inbox.data || ! conv.data ) {
		return null;
	}
	const postSend = String(
		value( inbox.data.values?.post_send?.value, 'send' )
	);
	const sidebar = String(
		value( inbox.data.values?.default_sidebar?.value, 'shown' )
	);
	const agents = Boolean(
		value( conv.data.values?.agents_as_requesters?.value, true )
	);
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
			<h2 className="text-base font-semibold">
				{ __( 'Defaults', 'cliedesk' ) }
			</h2>
			<ActionError error={ save.error } />
			<div className="grid gap-3 sm:grid-cols-2">
				<Select
					label={ __( 'Send button does', 'cliedesk' ) }
					value={ postSend }
					onChange={ ( v ) =>
						save.mutate( {
							module: 'inbox',
							values: { post_send: v },
						} )
					}
					options={ [
						{ id: 'send', label: __( 'Send', 'cliedesk' ) },
						{
							id: 'resolve',
							label: __( 'Send and resolve', 'cliedesk' ),
						},
						{
							id: 'wait',
							label: __(
								'Send and wait for the customer',
								'cliedesk'
							),
						},
						{
							id: 'snooze',
							label: __( 'Send and snooze', 'cliedesk' ),
						},
					] }
				/>
				<Select
					label={ __( 'Sidebar for new agents', 'cliedesk' ) }
					value={ sidebar }
					onChange={ ( v ) =>
						save.mutate( {
							module: 'inbox',
							values: { default_sidebar: v },
						} )
					}
					options={ [
						{ id: 'shown', label: __( 'Shown', 'cliedesk' ) },
						{ id: 'hidden', label: __( 'Hidden', 'cliedesk' ) },
					] }
				/>
			</div>
			<Switch
				isSelected={ agents }
				onChange={ ( on ) =>
					save.mutate( {
						module: 'conversations',
						values: { agents_as_requesters: on },
					} )
				}
			>
				{ __(
					'Agents can be the customer of a conversation',
					'cliedesk'
				) }
			</Switch>
		</section>
	);
}

interface Version {
	version: number;
	authorName: string;
	createdAt: string;
	changes: Array< { path: string; before: unknown; after: unknown } >;
}

const MODULES = () => [
	{ id: 'core', label: __( 'Workspace', 'cliedesk' ) },
	{ id: 'inbox', label: __( 'Inbox', 'cliedesk' ) },
	{ id: 'conversations', label: __( 'Conversations', 'cliedesk' ) },
	{ id: 'team', label: __( 'Team', 'cliedesk' ) },
	{ id: 'email', label: __( 'Email', 'cliedesk' ) },
	{ id: 'widget', label: __( 'Chat widget', 'cliedesk' ) },
	{ id: 'knowledge', label: __( 'Help center', 'cliedesk' ) },
	{ id: 'security', label: __( 'Security', 'cliedesk' ) },
];

const show = ( v: unknown ) =>
	v === null || v === undefined ? '—' : JSON.stringify( v );

/** History of settings changes, with roll back. */
export function SettingsHistory() {
	const qc = useQueryClient();
	const [ module, setModule ] = useState( 'core' );
	const q = useQuery( {
		queryKey: [ 'settings', module, 'versions' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Version[] } >(
					`settings/${ module }/versions`,
					{ signal }
				)
			).data?.items ?? [],
	} );
	const revert = useMutation( {
		mutationFn: ( version: number ) =>
			api.post( `settings/${ module }/versions/${ version }/revert`, {
				body: {},
			} ),
		onSuccess: () => {
			toast( {
				tone: 'success',
				title: __( 'Settings rolled back.', 'cliedesk' ),
			} );
			void qc.invalidateQueries( { queryKey: [ 'settings', module ] } );
		},
	} );
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
			<h2 className="text-base font-semibold">
				{ __( 'Settings history', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Every change is kept. Roll back to put the settings back as they were after that change.',
					'cliedesk'
				) }
			</Muted>
			<div className="max-w-xs">
				<Select
					label={ __( 'Settings of', 'cliedesk' ) }
					value={ module }
					onChange={ setModule }
					options={ MODULES() }
				/>
			</div>
			<ActionError error={ revert.error } />
			<ul className="flex flex-col divide-y divide-line">
				{ ( q.data ?? [] ).map( ( v, i ) => (
					<li
						key={ v.version }
						className="flex flex-col gap-1 py-2 text-sm"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-medium">
								{ sprintf(
									/* translators: 1: version number, 2: date, 3: person. */
									__(
										'Version %1$d · %2$s · %3$s',
										'cliedesk'
									),
									v.version,
									new Date( v.createdAt ).toLocaleString(),
									v.authorName || __( 'System', 'cliedesk' )
								) }
							</span>
							{ i > 0 && (
								<Button
									size="sm"
									isLoading={
										revert.isPending &&
										revert.variables === v.version
									}
									onPress={ () => revert.mutate( v.version ) }
								>
									{ __( 'Roll back to this', 'cliedesk' ) }
								</Button>
							) }
						</div>
						<ul className="text-fg-muted">
							{ v.changes.slice( 0, 10 ).map( ( c ) => (
								<li key={ c.path } className="break-all">
									{ `${ c.path }: ${ show( c.before ) } → ${ show( c.after ) }` }
								</li>
							) ) }
						</ul>
					</li>
				) ) }
			</ul>
		</section>
	);
}
