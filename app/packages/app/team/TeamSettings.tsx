/**
 * Team settings (module `team`): auto-join by email domain (TEAM-02) on the People screen and profile field
 * locks per role (TEAM-05) on the Roles screen. Both save through PATCH /settings/team with the module ETag.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { settingsQuery } from '../queries';
import {
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	pickError,
	type SummaryItem,
} from '../workspace/forms';
import {
	normaliseLocks,
	type ProfileField,
	type ProfileLocks,
	type Role,
} from './api';
import { QueryError } from './components';
import { profileFieldLabel, roleName } from './labels';

const AUTOJOIN_ROLES = [
	'cliedesk_agent',
	'cliedesk_collaborator',
	'cliedesk_viewer',
];

const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/**
 * Split and check a list of domains (one per line, or separated by commas or spaces).
 *
 * @param text Input.
 */
export function parseDomains( text: string ): {
	domains: string[];
	invalid: string[];
} {
	const items = text
		.split( /[\s,;]+/ )
		.map( ( d ) => d.trim().toLowerCase().replace( /^@/, '' ) )
		.filter( Boolean );
	const domains = [ ...new Set( items ) ];
	return { domains, invalid: domains.filter( ( d ) => ! DOMAIN.test( d ) ) };
}

const LOCKABLE: ProfileField[] = [
	'displayName',
	'jobTitle',
	'timezone',
	'languages',
	'signature',
	'notifications',
	'theme',
	'shortcuts',
	'alias',
	'aliasAvatarAttachmentId',
];

function useTeamSettings() {
	return useQuery( settingsQuery( 'team' ) );
}

function useSaveTeamSettings( etag: string | null, onSaved: () => void ) {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: ( values: Record< string, unknown > ) =>
			api.patch( 'settings/team', {
				body: { values },
				ifMatch: etag ?? undefined,
			} ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: [ 'settings', 'team' ] } );
			onSaved();
		},
	} );
}

function SavedNote( { show }: { show: boolean } ) {
	return (
		<p role="status" className="text-sm text-success">
			{ show ? __( 'Saved', 'cliedesk' ) : '' }
		</p>
	);
}

function AutoJoinForm( {
	domains: initialDomains,
	role: initialRole,
	etag,
}: {
	domains: string[];
	role: string;
	etag: string | null;
} ) {
	const [ text, setText ] = useState( initialDomains.join( '\n' ) );
	const [ role, setRole ] = useState( initialRole );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ saved, setSaved ] = useState( false );
	const save = useSaveTeamSettings( etag, () => {
		setSaved( true );
		announceResult( __( 'Auto-join settings saved.', 'cliedesk' ) );
	} );
	const parsed = parseDomains( text );
	const clientError = parsed.invalid.length
		? sprintf(
				/* translators: %s: list of invalid domains. */
				__(
					'These are not valid domains: %s. Use a form like example.com.',
					'cliedesk'
				),
				parsed.invalid.join( ', ' )
			)
		: null;
	const serverError = pickError(
		apiFieldErrors( save.error ),
		'autojoin_domains'
	);
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSaved( false );
		if ( clientError ) {
			setSummary( [
				{ fieldId: 'cd-autojoin-domains', message: clientError },
			] );
			return;
		}
		setSummary( [] );
		save.mutate( {
			autojoin_domains: parsed.domains,
			autojoin_role: role,
		} );
	};
	return (
		<form
			noValidate
			onSubmit={ onSubmit }
			className="flex max-w-xl flex-col gap-4"
		>
			<ErrorSummary items={ summary } />
			<SaveError error={ save.error } />
			<TextField
				id="cd-autojoin-domains"
				label={ __( 'Approved email domains', 'cliedesk' ) }
				description={ __(
					'People who register on this site with one of these domains can ask to join. You confirm each person on this screen. One domain per line.',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				value={ text }
				onChange={ ( v ) => {
					setText( v );
					setSaved( false );
				} }
				errorMessage={ summary.length ? clientError : serverError }
			/>
			<Select
				id="cd-autojoin-role"
				label={ __( 'Role after confirmation', 'cliedesk' ) }
				value={ role }
				onChange={ ( v ) => {
					setRole( v );
					setSaved( false );
				} }
				options={ AUTOJOIN_ROLES.map( ( k ) => ( {
					id: k,
					label: roleName( k ),
				} ) ) }
				errorMessage={ pickError(
					apiFieldErrors( save.error ),
					'autojoin_role'
				) }
			/>
			<div className="flex items-center gap-3">
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save auto-join settings', 'cliedesk' ) }
				</Button>
				<SavedNote show={ saved } />
			</div>
		</form>
	);
}

/**
 * Auto-join settings panel (People screen, admins).
 */
export function AutoJoinSettings() {
	const q = useTeamSettings();
	let body;
	if ( q.isPending ) {
		body = (
			<p className="text-fg-muted">{ __( 'Loading…', 'cliedesk' ) }</p>
		);
	} else if ( q.isError ) {
		body = (
			<QueryError
				title={ __(
					'Could not load the auto-join settings',
					'cliedesk'
				) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else {
		const v = q.data.values;
		const domains = Array.isArray( v.autojoin_domains?.value )
			? ( v.autojoin_domains.value as unknown[] ).map( String )
			: [];
		const role =
			typeof v.autojoin_role?.value === 'string'
				? v.autojoin_role.value
				: 'cliedesk_agent';
		body = (
			<AutoJoinForm
				key={ q.dataUpdatedAt }
				domains={ domains }
				role={ role }
				etag={ q.data.etag }
			/>
		);
	}
	return (
		<section
			aria-labelledby="cd-autojoin-title"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
		>
			<h2 id="cd-autojoin-title" className="text-lg font-semibold">
				{ __( 'Auto-join by email domain', 'cliedesk' ) }
			</h2>
			{ body }
		</section>
	);
}

function LocksForm( {
	locks: initial,
	roles,
	etag,
}: {
	locks: ProfileLocks;
	roles: Role[];
	etag: string | null;
} ) {
	const [ locks, setLocks ] = useState< ProfileLocks >( initial );
	const [ saved, setSaved ] = useState( false );
	const save = useSaveTeamSettings( etag, () => {
		setSaved( true );
		announceResult( __( 'Profile locks saved.', 'cliedesk' ) );
	} );
	const toggle = ( role: string, field: ProfileField, on: boolean ) => {
		setSaved( false );
		setLocks( ( old ) => {
			const cur = old[ role ] ?? [];
			const next = on
				? [ ...new Set( [ ...cur, field ] ) ]
				: cur.filter( ( f ) => f !== field );
			return { ...old, [ role ]: next };
		} );
	};
	return (
		<form
			noValidate
			className="flex flex-col gap-3"
			onSubmit={ ( e ) => {
				e.preventDefault();
				const clean: ProfileLocks = {};
				for ( const [ k, f ] of Object.entries( locks ) ) {
					if ( f.length ) {
						clean[ k ] = f;
					}
				}
				save.mutate( { profile_locks: clean } );
			} }
		>
			<SaveError error={ save.error } />
			<div className="overflow-x-auto rounded-lg border border-line">
				<table className="w-full text-start text-sm">
					<caption className="sr-only">
						{ __( 'Locked profile fields per role', 'cliedesk' ) }
					</caption>
					<thead className="border-b border-line text-fg-muted">
						<tr>
							<th
								scope="col"
								className="px-3 py-2 text-start font-medium"
							>
								{ __( 'Field', 'cliedesk' ) }
							</th>
							{ roles.map( ( r ) => (
								<th
									key={ r.key }
									scope="col"
									className="px-3 py-2 text-center font-medium"
								>
									<bdi>{ roleName( r.key, roles ) }</bdi>
								</th>
							) ) }
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{ LOCKABLE.map( ( f ) => (
							<tr key={ f }>
								<th
									scope="row"
									className="px-3 py-2 text-start font-normal"
								>
									{ profileFieldLabel( f ) }
								</th>
								{ roles.map( ( r ) => (
									<td
										key={ r.key }
										className="px-3 py-2 text-center"
									>
										<Checkbox
											isSelected={ (
												locks[ r.key ] ?? []
											).includes( f ) }
											onChange={ ( on ) =>
												toggle( r.key, f, on )
											}
										>
											<span className="sr-only">
												{ sprintf(
													/* translators: 1: profile field, 2: role name. */
													__(
														'Lock %1$s for %2$s',
														'cliedesk'
													),
													profileFieldLabel( f ),
													roleName( r.key, roles )
												) }
											</span>
										</Checkbox>
									</td>
								) ) }
							</tr>
						) ) }
					</tbody>
				</table>
			</div>
			<div className="flex items-center gap-3">
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save profile locks', 'cliedesk' ) }
				</Button>
				<SavedNote show={ saved } />
			</div>
		</form>
	);
}

/**
 * Profile locks panel (Roles screen, admins).
 *
 * @param props       Props.
 * @param props.roles Roles (the Owner is left out: Owners always edit their own profile).
 */
export function ProfileLocksSettings( { roles }: { roles: Role[] } ) {
	const q = useTeamSettings();
	const lockable = roles.filter( ( r ) => r.type !== 'owner' );
	let body;
	if ( q.isPending ) {
		body = (
			<p className="text-fg-muted">{ __( 'Loading…', 'cliedesk' ) }</p>
		);
	} else if ( q.isError ) {
		body = (
			<QueryError
				title={ __( 'Could not load the profile locks', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else {
		body = (
			<LocksForm
				key={ q.dataUpdatedAt }
				locks={ normaliseLocks( q.data.values.profile_locks?.value ) }
				roles={ lockable }
				etag={ q.data.etag }
			/>
		);
	}
	return (
		<section
			aria-labelledby="cd-locks-title"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
		>
			<h2 id="cd-locks-title" className="text-lg font-semibold">
				{ __( 'Profile fields people cannot change', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Locked fields are read-only on the person’s own profile. Administrators can still change them.',
					'cliedesk'
				) }
			</p>
			{ body }
		</section>
	);
}
