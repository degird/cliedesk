/**
 * Settings → Security → Signed identity (SEC-07) and visitor sessions (SEC-10).
 *
 * - Keys that another site's or app's server uses to sign identity tokens (HS256). Two can be active, so a new key
 *   can be rolled out before the old one is removed. A new key's secret is shown once.
 * - Test tool: paste a token to see what it says and what is wrong with it.
 * - How long the browser keeps a visitor's chat session (widget.session_days; 0: until the browser closes).
 *
 * GET/POST security/identity-keys, DELETE security/identity-keys/{kid}, POST security/identity-keys/check,
 * PATCH settings/widget.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

interface Key {
	kid: string;
	hint: string | null;
	createdAt: string;
	lastUsed: string | null;
}

interface Check {
	valid: boolean;
	claims: Record< string, unknown >;
	errors: string[];
}

const KEY = [ 'security', 'identity-keys' ];

function TokenTest() {
	const [ token, setToken ] = useState( '' );
	const check = useMutation( {
		mutationFn: async () =>
			(
				await api.post< Check >( 'security/identity-keys/check', {
					body: { token: token.trim() },
				} )
			).data,
	} );
	const result = check.data;
	return (
		<div className="flex flex-col gap-2">
			<TextField
				label={ __( 'Test a token', 'cliedesk' ) }
				description={ __(
					'Paste a token your server made to see what it says and whether it is accepted.',
					'cliedesk'
				) }
				multiline
				rows={ 2 }
				maxLength={ 8000 }
				value={ token }
				onChange={ setToken }
			/>
			<Button
				className="self-start"
				isDisabled={ ! token.trim() }
				isLoading={ check.isPending }
				onPress={ () => check.mutate() }
			>
				{ __( 'Check token', 'cliedesk' ) }
			</Button>
			<ActionError error={ check.error } />
			{ result && (
				<div role="status" className="flex flex-col gap-1 text-sm">
					<strong>
						{ result.valid
							? __(
									'Accepted: the visitor becomes this customer.',
									'cliedesk'
								)
							: __(
									'Not accepted: the visitor stays a guest.',
									'cliedesk'
								) }
					</strong>
					{ result.errors.length > 0 && (
						<ul className="list-disc ps-5">
							{ result.errors.map( ( e ) => (
								<li key={ e }>{ e }</li>
							) ) }
						</ul>
					) }
					<pre className="overflow-x-auto rounded bg-surface-sunken p-2 text-xs">
						{ JSON.stringify( result.claims, null, 2 ) }
					</pre>
				</div>
			) }
		</div>
	);
}

function SessionDays() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'widget' ) );
	const [ draft, setDraft ] = useState< string | null >( null );
	const value = draft ?? String( q.data?.values?.session_days?.value ?? '' );
	const n = Number( value );
	const ok = value !== '' && Number.isInteger( n ) && n >= 0 && n <= 365;
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/widget', {
				body: { values: { session_days: n } },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( null );
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'widget' ] } );
		},
	} );
	return (
		<div className="flex flex-wrap items-end gap-2">
			<TextField
				label={ __( 'Keep visitor chat sessions (days)', 'cliedesk' ) }
				description={ __(
					'How long a visitor’s browser remembers their chat after the last visit (0–365). 0 means until the browser closes.',
					'cliedesk'
				) }
				inputMode="numeric"
				value={ value }
				onChange={ setDraft }
				errorMessage={
					ok || draft === null
						? undefined
						: __( 'Enter a number from 0 to 365.', 'cliedesk' )
				}
			/>
			<Button
				isDisabled={ draft === null || ! ok }
				isLoading={ save.isPending }
				onPress={ () => save.mutate() }
			>
				{ __( 'Save', 'cliedesk' ) }
			</Button>
			<ActionError error={ save.error } />
		</div>
	);
}

export function IdentityKeysCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Key[] } >( 'security/identity-keys', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const [ secret, setSecret ] = useState< string | null >( null );
	const create = useMutation( {
		mutationFn: async () =>
			(
				await api.post< { kid: string; secret: string } >(
					'security/identity-keys'
				)
			).data,
		onSuccess: ( d ) => {
			setSecret( d?.secret ?? null );
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( kid: string ) =>
			api.del( `security/identity-keys/${ kid }` ),
		onSuccess: () => {
			announceResult( __( 'Key removed.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const items = q.data ?? [];
	return (
		<section
			aria-labelledby="cd-identity-keys"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-identity-keys" className="font-semibold">
				{ __( 'Signed identity and visitor sessions', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Other sites and apps can tell the chat who the visitor is: their server signs a short-lived token with a key from here. Signed-in WordPress users are recognised without a key. Invalid tokens make the visitor a guest.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ create.error ?? remove.error } />
			{ items.length === 0 && ! q.isPending && (
				<Muted>{ __( 'No keys yet.', 'cliedesk' ) }</Muted>
			) }
			<ul className="flex flex-col divide-y divide-line">
				{ items.map( ( k ) => (
					<li
						key={ k.kid }
						className="flex flex-wrap items-center justify-between gap-2 py-2"
					>
						<span className="text-sm">
							{ sprintf(
								/* translators: 1: key id, 2: date. */
								__( 'Key %1$s, made %2$s', 'cliedesk' ),
								k.kid,
								k.createdAt.slice( 0, 10 )
							) }
							{ k.lastUsed && (
								<Muted>
									{ ' ' +
										sprintf(
											/* translators: %s: date. */
											__( '(last used %s)', 'cliedesk' ),
											k.lastUsed.slice( 0, 10 )
										) }
								</Muted>
							) }
						</span>
						<Button
							variant="danger"
							isLoading={
								remove.isPending && remove.variables === k.kid
							}
							onPress={ () => remove.mutate( k.kid ) }
						>
							{ __( 'Remove', 'cliedesk' ) }
						</Button>
					</li>
				) ) }
			</ul>
			<Button
				className="self-start"
				isLoading={ create.isPending }
				onPress={ () => create.mutate() }
			>
				{ items.length >= 2
					? __( 'New key (replaces the oldest)', 'cliedesk' )
					: __( 'New key', 'cliedesk' ) }
			</Button>
			{ secret && (
				<div
					role="status"
					className="flex flex-col gap-1 rounded-md border border-line p-3 text-sm"
				>
					<strong>
						{ __(
							'Copy this secret to your server now. It is not shown again.',
							'cliedesk'
						) }
					</strong>
					<code className="break-all">{ secret }</code>
				</div>
			) }
			<TokenTest />
			<SessionDays />
		</section>
	);
}
