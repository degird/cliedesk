/**
 * Home → who receives announcements (ADM-03): per administrator, security and service announcements on or off.
 *
 * - GET admin/announcements → {items: [{userId, name, security, service}]}; PUT admin/announcements {userId, kind}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Checkbox } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';

interface Recipient {
	userId: number;
	name: string;
	security: boolean;
	service: boolean;
}

const KEY = [ 'admin', 'announcements' ];

export function AnnouncementRecipients() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Recipient[] } >(
					'admin/announcements',
					{
						signal,
					}
				)
			).data?.items ?? [],
		retry: false,
	} );
	const set = useMutation( {
		mutationFn: ( body: Partial< Recipient > & { userId: number } ) =>
			api.put( 'admin/announcements', { body } ),
		onSuccess: () => void qc.invalidateQueries( { queryKey: KEY } ),
	} );
	if ( ! Array.isArray( q.data ) || q.data.length === 0 ) {
		return null;
	}
	return (
		<fieldset className="flex flex-col gap-1">
			<legend className="font-medium">
				{ __( 'Who receives announcements', 'cliedesk' ) }
			</legend>
			{ q.data.map( ( r ) => (
				<div
					key={ r.userId }
					className="flex flex-wrap items-center gap-3"
				>
					<span className="min-w-32">{ r.name }</span>
					<Checkbox
						isSelected={ r.security }
						onChange={ ( on ) =>
							set.mutate( { userId: r.userId, security: on } )
						}
						aria-label={ sprintf(
							/* translators: %s: person. */
							__( 'Security announcements for %s', 'cliedesk' ),
							r.name
						) }
					>
						{ __( 'Security', 'cliedesk' ) }
					</Checkbox>
					<Checkbox
						isSelected={ r.service }
						onChange={ ( on ) =>
							set.mutate( { userId: r.userId, service: on } )
						}
						aria-label={ sprintf(
							/* translators: %s: person. */
							__( 'Service announcements for %s', 'cliedesk' ),
							r.name
						) }
					>
						{ __( 'Service', 'cliedesk' ) }
					</Checkbox>
				</div>
			) ) }
		</fieldset>
	);
}
