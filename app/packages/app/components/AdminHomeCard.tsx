/**
 * Home → Setup (ADM-03): setup progress with the next steps, features not used yet and the last configuration
 * changes, for people who manage settings.
 *
 * - GET admin-home → {setupPercent, steps: [{key, label, done, path}], unused: [{key, label, path}],
 *   changes: [{what, version, author, changed, at}]}.
 */
import { api, useQuery } from '@cliedesk/data';
import { Skeleton } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { AnnouncementRecipients } from './AnnouncementRecipients';

interface AdminHome {
	setupPercent: number;
	steps: Array< { key: string; label: string; done: boolean; path: string } >;
	unused: Array< { key: string; label: string; path: string } >;
	changes: Array< {
		what: string;
		version: number;
		author: string | null;
		changed: string;
		at: string;
	} >;
}

export default function AdminHomeCard() {
	const q = useQuery( {
		queryKey: [ 'admin-home' ],
		queryFn: async ( { signal } ) =>
			( await api.get< AdminHome >( 'admin-home', { signal } ) ).data,
		staleTime: 60_000,
	} );
	const d = q.data;
	if ( ! d || ! Array.isArray( d.steps ) ) {
		return q.isPending ? <Skeleton lines={ 3 } /> : null;
	}
	const open = d.steps.filter( ( s ) => ! s.done );
	return (
		<div className="flex flex-col gap-3 text-sm">
			<div className="flex flex-col gap-1">
				<span className="font-medium">
					{ sprintf(
						/* translators: %d: percent. */
						__( 'Setup %d%% done', 'cliedesk' ),
						d.setupPercent
					) }
				</span>
				<progress
					className="h-2 w-full"
					max={ 100 }
					value={ d.setupPercent }
					aria-label={ __( 'Setup progress', 'cliedesk' ) }
				/>
			</div>
			{ open.length > 0 && (
				<Link
					to={ '/setup' as never }
					className="font-medium underline"
				>
					{ __( 'Open the setup assistant', 'cliedesk' ) }
				</Link>
			) }
			{ open.length > 0 && (
				<ul className="flex flex-col gap-1">
					{ open.slice( 0, 4 ).map( ( s ) => (
						<li key={ s.key }>
							<Link to={ s.path as never } className="underline">
								{ s.label }
							</Link>
						</li>
					) ) }
				</ul>
			) }
			{ d.unused.length > 0 && (
				<div className="flex flex-col gap-1">
					<span className="font-medium">
						{ __( 'Not used yet', 'cliedesk' ) }
					</span>
					<ul className="flex flex-wrap gap-x-3 gap-y-1">
						{ d.unused.map( ( u ) => (
							<li key={ u.key }>
								<Link
									to={ u.path as never }
									className="underline"
								>
									{ u.label }
								</Link>
							</li>
						) ) }
					</ul>
				</div>
			) }
			{ d.changes.length > 0 && (
				<div className="flex flex-col gap-1">
					<span className="font-medium">
						{ __( 'Recent changes', 'cliedesk' ) }
					</span>
					<ul className="flex flex-col gap-0.5 text-fg-muted">
						{ d.changes.map( ( c ) => (
							<li key={ `${ c.what }-${ c.version }` }>
								{ [ c.at.slice( 0, 16 ), c.what, c.author ]
									.filter( Boolean )
									.join( ' · ' ) }
							</li>
						) ) }
					</ul>
				</div>
			) }
			<AnnouncementRecipients />
		</div>
	);
}
