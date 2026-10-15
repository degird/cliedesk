/**
 * Team page: default keyboard shortcuts for the team's members (INB-07). Members' own remaps win; the team map
 * applies to members who have not changed a key, including new members. An admin remaps keys for themselves in the
 * shortcut sheet ("?"), then copies them here ("Use my shortcuts"). Saved with PATCH teams/{id} {shortcutMap}
 * (If-Match: the team's version), for people with cliedesk_manage_settings.
 */
import { api, can, useMutation, useQueryClient } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ActionError, Muted } from '../inbox/components';
import { getPrefs } from '../prefs';
import { getShortcuts, keyLabel, mapKey } from '../shortcuts';
import { versionTag } from '../workspace/api';
import { announceResult } from '../workspace/forms';
import { normaliseTeam, teamsKeys, type TeamDetail } from './api';

/**
 * Readable name of a stored map key (the shortcut's label when its screen registered it, else the key).
 *
 * @param key Map key, e.g. `list_next`.
 */
export function shortcutName( key: string ): string {
	return (
		getShortcuts().find( ( d ) => mapKey( d.id ) === key )?.label ??
		key.replace( /[_.]/g, ' ' )
	);
}

/**
 * Section.
 *
 * @param props      Props.
 * @param props.team Team.
 */
export function TeamShortcuts( { team }: { team: TeamDetail } ) {
	const qc = useQueryClient();
	const map = team.shortcutMap ?? {};
	const mine = getPrefs().shortcuts.map ?? {};
	const save = useMutation( {
		mutationFn: ( next: Record< string, string > ) => {
			const current =
				qc.getQueryData< TeamDetail >( teamsKeys.detail( team.id ) ) ??
				team;
			return api.patch< TeamDetail >( `teams/${ team.id }`, {
				body: { shortcutMap: next },
				ifMatch: versionTag( current.version ),
			} );
		},
		onSuccess: ( r, next ) => {
			qc.setQueryData(
				teamsKeys.detail( team.id ),
				normaliseTeam( r.data )
			);
			announceResult(
				Object.keys( next ).length
					? __( 'Team shortcuts saved.', 'cliedesk' )
					: __( 'Team shortcuts cleared.', 'cliedesk' )
			);
		},
	} );
	if ( ! can( 'cliedesk_manage_settings' ) ) {
		return null;
	}
	const entries = Object.entries( map );
	const mineCount = Object.keys( mine ).length;
	return (
		<section
			aria-labelledby="cd-team-shortcuts"
			className="flex flex-col gap-3 border-t border-line pt-6"
		>
			<h2 id="cd-team-shortcuts" className="text-base font-semibold">
				{ __( 'Keyboard shortcuts', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Default keys for the members of this team, including new members. Keys a member changed for themselves stay theirs. To set them, change your own keys in the shortcut sheet (press ?), then use them here.',
					'cliedesk'
				) }
			</p>
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
			{ entries.length ? (
				<ul className="flex flex-col gap-1 text-sm">
					{ entries.map( ( [ key, keys ] ) => (
						<li key={ key } className="flex flex-wrap gap-2">
							<span>{ shortcutName( key ) }</span>
							<kbd className="rounded border border-line px-1 font-mono">
								{ keyLabel( keys ).join( ' ' ) }
							</kbd>
						</li>
					) ) }
				</ul>
			) : (
				<Muted>
					{ __(
						'No team defaults: members use the standard keys.',
						'cliedesk'
					) }
				</Muted>
			) }
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					isDisabled={ ! mineCount }
					isLoading={
						save.isPending &&
						save.variables !== undefined &&
						Object.keys( save.variables ).length > 0
					}
					onPress={ () => save.mutate( { ...mine } ) }
				>
					{ mineCount
						? sprintf(
								/* translators: %d: number of changed shortcuts. */
								__( 'Use my shortcuts (%d)', 'cliedesk' ),
								mineCount
							)
						: __( 'Use my shortcuts', 'cliedesk' ) }
				</Button>
				{ entries.length > 0 && (
					<Button
						size="sm"
						variant="ghost"
						onPress={ () => save.mutate( {} ) }
					>
						{ __( 'Clear team shortcuts', 'cliedesk' ) }
					</Button>
				) }
			</div>
		</section>
	);
}
