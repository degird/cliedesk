/**
 * Settings → Security → Stored credentials (DEV-25): passwords and keys in the encrypted vault, with a hint, where
 * each is used, when it was last used and changed, and a reminder when it is old. Values are never shown: an admin
 * can replace one, or remove one nothing uses.
 *
 * - GET security/credentials → {items: [{id, label, hint, usedBy, changedAt, lastUsed, rotateDue}], rotationDays}.
 * - PUT security/credentials/{id} {value}; DELETE security/credentials/{id}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, ConfirmDestructive, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Credential {
	id: string;
	label: string;
	hint: string | null;
	usedBy: string[];
	changedAt: string;
	lastUsed: string | null;
	rotateDue: boolean;
}

const KEY = [ 'security', 'credentials' ];

function Replace( { item, onDone }: { item: Credential; onDone: () => void } ) {
	const qc = useQueryClient();
	const [ value, setValue ] = useState( '' );
	const save = useMutation( {
		mutationFn: () =>
			api.put( `security/credentials/${ item.id }`, {
				body: { value },
			} ),
		onSuccess: () => {
			announceResult( __( 'Credential replaced.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
			onDone();
		},
	} );
	return (
		<div className="flex flex-col gap-2 rounded-md border border-line p-3">
			<ActionError error={ save.error } />
			<TextField
				label={ sprintf(
					/* translators: %s: credential name. */
					__( 'New value for %s', 'cliedesk' ),
					item.label
				) }
				type="password"
				autoComplete="new-password"
				maxLength={ 4000 }
				value={ value }
				onChange={ setValue }
			/>
			<div className="flex gap-2">
				<Button
					variant="primary"
					isDisabled={ ! value }
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save new value', 'cliedesk' ) }
				</Button>
				<Button onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}

export function CredentialsCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Credential[] } >(
					'security/credentials',
					{ signal }
				)
			).data?.items ?? [],
	} );
	const [ replacing, setReplacing ] = useState< string | null >( null );
	const [ removing, setRemoving ] = useState< Credential | null >( null );
	const remove = useMutation( {
		mutationFn: ( id: string ) => api.del( `security/credentials/${ id }` ),
		onSuccess: () => {
			setRemoving( null );
			announceResult( __( 'Credential removed.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const items = q.data ?? [];
	return (
		<section
			aria-labelledby="cd-credentials"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-credentials" className="font-semibold">
				{ __( 'Stored credentials', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Passwords and keys are encrypted and never shown again. Replace one when it changes, or when it is old.',
					'cliedesk'
				) }
			</Muted>
			{ items.length === 0 && ! q.isPending && (
				<Muted>
					{ __( 'No credentials stored yet.', 'cliedesk' ) }
				</Muted>
			) }
			<ul className="flex flex-col divide-y divide-line">
				{ items.map( ( c ) => (
					<li key={ c.id } className="flex flex-col gap-2 py-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="flex flex-col">
								<span className="font-medium">
									{ c.label }
									{ c.hint && (
										<span className="ms-2 font-mono text-sm text-fg-muted">
											…{ c.hint }
										</span>
									) }
								</span>
								<span className="text-sm text-fg-muted">
									{ c.usedBy.length
										? c.usedBy.join( ' · ' )
										: __(
												'Not used anywhere',
												'cliedesk'
											) }
								</span>
								<span className="text-xs text-fg-muted">
									{ sprintf(
										/* translators: 1: date changed, 2: date last used or "never". */
										__(
											'Changed %1$s · Last used %2$s',
											'cliedesk'
										),
										c.changedAt.slice( 0, 10 ),
										c.lastUsed
											? c.lastUsed.slice( 0, 10 )
											: __( 'never', 'cliedesk' )
									) }
								</span>
								{ c.rotateDue && (
									<span className="text-sm font-medium text-warning">
										{ __(
											'Old: replace it with a new value.',
											'cliedesk'
										) }
									</span>
								) }
							</span>
							<span className="flex gap-2">
								<Button
									size="sm"
									onPress={ () => setReplacing( c.id ) }
								>
									{ __( 'Replace', 'cliedesk' ) }
								</Button>
								{ c.usedBy.length === 0 && (
									<Button
										size="sm"
										variant="danger"
										onPress={ () => setRemoving( c ) }
									>
										{ __( 'Remove', 'cliedesk' ) }
									</Button>
								) }
							</span>
						</div>
						{ replacing === c.id && (
							<Replace
								item={ c }
								onDone={ () => setReplacing( null ) }
							/>
						) }
					</li>
				) ) }
			</ul>
			<ConfirmDestructive
				isOpen={ removing !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setRemoving( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: credential name. */
					__( 'Remove “%s”?', 'cliedesk' ),
					removing?.label ?? ''
				) }
				description={ __(
					'The value is deleted for good. Nothing uses it now.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Remove credential', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( removing ) {
						remove.mutate( removing.id );
					}
				} }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</section>
	);
}
