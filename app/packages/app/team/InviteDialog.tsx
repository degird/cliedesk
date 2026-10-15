/**
 * Invite people (TEAM-02): paste email addresses or CSV (email, name, role, teams), or upload a CSV file. Rows are
 * parsed in the browser and previewed with their problems; after sending, each row shows its result.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	Modal,
	Select,
	TextField,
	cx,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { announceResult } from '../workspace/forms';
import { teamKeys, type InviteResult, type InviteRow, type Team } from './api';
import { Badge, serverMessage } from './components';
import { parseInvites, MAX_INVITE_ROWS, type ParsedInvite } from './csv';
import { inviteStatusLabel } from './labels';

export interface InviteDialogProps {
	isOpen: boolean;
	onOpenChange: ( open: boolean ) => void;
	/** Roles the user may give (key and display name). */
	roles: Array< { key: string; name: string } >;
	teams: Team[];
}

function teamNames( ids: number[], teams: Team[] ): string {
	return ids
		.map( ( id ) => teams.find( ( t ) => t.id === id )?.name ?? `#${ id }` )
		.join( ', ' );
}

function InviteForm( {
	roles,
	teams,
	onDone,
}: Omit< InviteDialogProps, 'isOpen' | 'onOpenChange' > & {
	onDone: () => void;
} ) {
	const qc = useQueryClient();
	const fileId = useId();
	const [ text, setText ] = useState( '' );
	const [ fileName, setFileName ] = useState< string | null >( null );
	const [ fileError, setFileError ] = useState< string | null >( null );
	const defaultRoleKey =
		roles.find( ( r ) => r.key === 'cliedesk_agent' )?.key ??
		roles[ 0 ]?.key ??
		'';
	const [ role, setRole ] = useState( defaultRoleKey );
	const [ defaultTeams, setDefaultTeams ] = useState< number[] >( [] );
	const [ results, setResults ] = useState< {
		rows: ParsedInvite[];
		results: InviteResult[];
	} | null >( null );

	const parsed = useMemo(
		() =>
			parseInvites( text, {
				roles,
				teams,
				defaultRole: role,
				defaultTeams,
			} ),
		[ text, roles, teams, role, defaultTeams ]
	);
	const valid = parsed.filter( ( p ) => ! p.problems.length );
	const skipped = parsed.length - valid.length;

	const send = useMutation( {
		mutationFn: ( rows: InviteRow[] ) =>
			api.post< InviteResult[] >( 'invites', { body: { rows } } ),
		onSuccess: ( r ) => {
			const list = r.data ?? [];
			setResults( { rows: valid, results: list } );
			const ok = list.filter( ( x ) => x.status !== 'error' ).length;
			announceResult(
				sprintf(
					/* translators: 1: people invited, 2: rows sent. */
					__( '%1$d of %2$d invitations done.', 'cliedesk' ),
					ok,
					list.length
				)
			);
			void qc.invalidateQueries( { queryKey: teamKeys.allAgents } );
		},
	} );

	const onFile = ( e: ChangeEvent< HTMLInputElement > ) => {
		const file = e.target.files?.[ 0 ];
		setFileError( null );
		if ( ! file ) {
			return;
		}
		if ( file.size > 1024 * 1024 ) {
			setFileError(
				__( 'Choose a CSV file smaller than 1 MB.', 'cliedesk' )
			);
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			setText( String( reader.result ?? '' ) );
			setFileName( file.name );
		};
		reader.onerror = () =>
			setFileError( __( 'The file could not be read.', 'cliedesk' ) );
		reader.readAsText( file );
	};

	if ( results ) {
		const failed = results.results.filter( ( x ) => x.status === 'error' );
		return (
			<div className="flex flex-col gap-4">
				<Banner
					tone={ failed.length ? 'warning' : 'success' }
					title={ sprintf(
						/* translators: 1: rows done, 2: rows sent. */
						__( '%1$d of %2$d invitations done', 'cliedesk' ),
						results.results.length - failed.length,
						results.results.length
					) }
				>
					{ __(
						'New users get the WordPress email to set their password; the link is valid for 7 days.',
						'cliedesk'
					) }
				</Banner>
				<div className="overflow-x-auto rounded-lg border border-line">
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ __( 'Invitation results', 'cliedesk' ) }
						</caption>
						<thead className="border-b border-line text-fg-muted">
							<tr>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									{ __( 'Email', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									{ __( 'Result', 'cliedesk' ) }
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-line">
							{ results.results.map( ( r ) => (
								<tr key={ `${ r.row }-${ r.email }` }>
									<th
										scope="row"
										className="px-3 py-2 text-start font-normal"
									>
										<bdi>{ r.email }</bdi>
									</th>
									<td className="px-3 py-2">
										<span className="flex flex-col gap-0.5">
											<Badge
												tone={
													r.status === 'error'
														? 'danger'
														: 'success'
												}
											>
												{ inviteStatusLabel(
													r.status
												) }
											</Badge>
											{ r.error && (
												<span className="text-danger">
													{ r.error }
												</span>
											) }
										</span>
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
				<div className="flex justify-end gap-2 border-t border-line pt-3">
					<Button
						onPress={ () => {
							setResults( null );
							setText( '' );
							setFileName( null );
						} }
					>
						{ __( 'Invite more people', 'cliedesk' ) }
					</Button>
					<Button variant="primary" onPress={ onDone }>
						{ __( 'Done', 'cliedesk' ) }
					</Button>
				</div>
			</div>
		);
	}

	return (
		<form
			noValidate
			className="flex flex-col gap-4"
			onSubmit={ ( e ) => {
				e.preventDefault();
				if ( ! valid.length ) {
					return;
				}
				send.mutate(
					valid.map( ( p ) => ( {
						email: p.email,
						...( p.name ? { name: p.name } : {} ),
						role: p.role,
						...( p.teams.length ? { teams: p.teams } : {} ),
					} ) )
				);
			} }
		>
			<TextField
				id="cd-invite-emails"
				label={ __( 'Email addresses or CSV', 'cliedesk' ) }
				description={ __(
					'One address per line, or CSV with the columns email, name, role, teams. Separate several teams with semicolons.',
					'cliedesk'
				) }
				multiline
				rows={ 6 }
				value={ text }
				onChange={ ( v ) => {
					setText( v );
					setFileName( null );
				} }
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus
			/>
			<div className="flex flex-col gap-1">
				<label htmlFor={ fileId } className="text-sm font-medium">
					{ __( 'Or upload a CSV file', 'cliedesk' ) }
				</label>
				<input
					id={ fileId }
					type="file"
					accept=".csv,text/csv"
					onChange={ onFile }
					aria-invalid={ fileError ? true : undefined }
					aria-describedby={
						fileError ? `${ fileId }-error` : undefined
					}
					className="text-sm text-fg file:me-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-fg"
				/>
				{ fileName && (
					<p className="text-sm text-fg-muted">
						{ sprintf(
							/* translators: %s: file name. */
							__( 'Loaded %s', 'cliedesk' ),
							fileName
						) }
					</p>
				) }
				{ fileError && (
					<p
						id={ `${ fileId }-error` }
						role="alert"
						className="text-sm text-danger"
					>
						{ fileError }
					</p>
				) }
			</div>
			<Select
				label={ __( 'Role for rows without one', 'cliedesk' ) }
				value={ role }
				onChange={ setRole }
				options={ roles.map( ( r ) => ( {
					id: r.key,
					label: r.name,
				} ) ) }
			/>
			{ teams.length > 0 && (
				<fieldset className="flex flex-col gap-1">
					<legend className="pb-1 text-sm font-medium">
						{ __( 'Teams for rows without any', 'cliedesk' ) }
					</legend>
					<div className="flex flex-wrap gap-x-4 gap-y-1">
						{ teams.map( ( t ) => (
							<Checkbox
								key={ t.id }
								isSelected={ defaultTeams.includes( t.id ) }
								onChange={ ( on ) =>
									setDefaultTeams( ( old ) =>
										on
											? [ ...old, t.id ]
											: old.filter( ( x ) => x !== t.id )
									)
								}
							>
								<bdi>{ t.name }</bdi>
							</Checkbox>
						) ) }
					</div>
				</fieldset>
			) }

			{ parsed.length > 0 && (
				<section
					aria-labelledby="cd-invite-preview"
					className="flex flex-col gap-2"
				>
					<h3 id="cd-invite-preview" className="font-semibold">
						{ __( 'Preview', 'cliedesk' ) }
					</h3>
					<p className="text-sm text-fg-muted" aria-live="polite">
						{ skipped
							? sprintf(
									/* translators: 1: rows ready, 2: rows with problems. */
									__(
										'%1$d ready to invite, %2$d with problems (they will be skipped).',
										'cliedesk'
									),
									valid.length,
									skipped
								)
							: sprintf(
									/* translators: %d: number of people. */
									_n(
										'%d person ready to invite.',
										'%d people ready to invite.',
										valid.length,
										'cliedesk'
									),
									valid.length
								) }
					</p>
					<div className="max-h-72 overflow-auto rounded-lg border border-line">
						<table className="w-full text-start text-sm">
							<caption className="sr-only">
								{ __( 'People to invite', 'cliedesk' ) }
							</caption>
							<thead className="sticky top-0 border-b border-line bg-raised text-fg-muted">
								<tr>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Row', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Email', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Name', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Role', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="px-3 py-2 text-start font-medium"
									>
										{ __( 'Teams', 'cliedesk' ) }
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-line">
								{ parsed
									.slice( 0, MAX_INVITE_ROWS + 50 )
									.map( ( p ) => (
										<tr
											key={ p.line }
											className={ cx(
												p.problems.length > 0 &&
													'bg-danger-subtle'
											) }
										>
											<td className="px-3 py-2">
												{ p.line }
											</td>
											<th
												scope="row"
												className="px-3 py-2 text-start font-normal"
											>
												<span className="flex flex-col">
													<bdi>
														{ p.email || '—' }
													</bdi>
													{ p.problems.map( ( m ) => (
														<span
															key={ m }
															className="text-danger"
														>
															{ m }
														</span>
													) ) }
												</span>
											</th>
											<td className="px-3 py-2">
												<bdi>{ p.name }</bdi>
											</td>
											<td className="px-3 py-2">
												{ roles.find(
													( r ) => r.key === p.role
												)?.name ?? '' }
											</td>
											<td className="px-3 py-2">
												<bdi>
													{ teamNames(
														p.teams,
														teams
													) }
												</bdi>
											</td>
										</tr>
									) ) }
							</tbody>
						</table>
					</div>
				</section>
			) }
			{ send.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ serverMessage( send.error ) }
				/>
			) }
			<div className="flex justify-end gap-2 border-t border-line pt-3">
				<Button onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
				<Button
					type="submit"
					variant="primary"
					isLoading={ send.isPending }
					isDisabled={ ! valid.length }
				>
					{ valid.length
						? sprintf(
								/* translators: %d: number of people. */
								_n(
									'Invite %d person',
									'Invite %d people',
									valid.length,
									'cliedesk'
								),
								valid.length
							)
						: __( 'Invite', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

/**
 * Invite dialog.
 *
 * @param props Props.
 */
export function InviteDialog( {
	isOpen,
	onOpenChange,
	roles,
	teams,
}: InviteDialogProps ) {
	return (
		<Modal
			isOpen={ isOpen }
			onOpenChange={ onOpenChange }
			title={ __( 'Invite people', 'cliedesk' ) }
			size="lg"
			isDismissable={ false }
		>
			<InviteForm
				roles={ roles }
				teams={ teams }
				onDone={ () => onOpenChange( false ) }
			/>
		</Modal>
	);
}
