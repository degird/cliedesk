/**
 * Inbox sidebar → "Add from a template" (INB-21): ready views added in one click as my own editable view.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { IconButton, Menu, MenuItem, toast } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { LayoutTemplate } from 'lucide-react';
import { inboxKeys } from '../../inbox/api';

interface Template {
	key: string;
	name: string;
	description: string;
}

export function ViewTemplatesMenu() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'view-templates' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Template[] } >( 'view-templates', {
					signal,
				} )
			).data?.items ?? [],
		staleTime: Infinity,
	} );
	const add = useMutation( {
		mutationFn: ( t: Template ) =>
			api.post( `view-templates/${ t.key }`, { body: {} } ),
		onSuccess: ( _r, t ) => {
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %s: view name. */
					__( 'View "%s" added.', 'cliedesk' ),
					t.name
				),
			} );
			void qc.invalidateQueries( { queryKey: inboxKeys.views } );
		},
	} );
	if ( ! can( 'cliedesk_create_views' ) || ! q.data?.length ) {
		return null;
	}
	return (
		<Menu
			aria-label={ __( 'View templates', 'cliedesk' ) }
			trigger={
				<IconButton
					size="sm"
					label={ __( 'Add a view from a template', 'cliedesk' ) }
					icon={ <LayoutTemplate size={ 14 } /> }
				/>
			}
		>
			{ q.data.map( ( t ) => (
				<MenuItem
					key={ t.key }
					id={ t.key }
					onAction={ () => add.mutate( t ) }
				>
					{ t.name }
				</MenuItem>
			) ) }
		</Menu>
	);
}
