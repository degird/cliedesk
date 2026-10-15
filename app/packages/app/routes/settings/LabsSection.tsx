/**
 * Settings → Developer → Labs (ADM-12): experimental features, switched on or off for this site.
 *
 * - GET labs → {items: [{key, label, description, on}]}; PUT labs/{key} {on}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { LoadingRegion, Switch } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Lab {
	key: string;
	label: string;
	description: string;
	on: boolean;
}

export default function LabsSection() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'labs' ],
		queryFn: async ( { signal } ) =>
			( await api.get< { items: Lab[] } >( 'labs', { signal } ) ).data
				?.items ?? [],
	} );
	const set = useMutation( {
		mutationFn: ( v: { key: string; on: boolean } ) =>
			api.put( `labs/${ v.key }`, { body: { on: v.on } } ),
		onSuccess: () => {
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'labs' ] } );
		},
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	const items = q.data ?? [];
	return (
		<div className="flex flex-col gap-3">
			<Muted>
				{ __(
					'Experimental features may change or go away. Turn them off at any time.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ set.error } />
			{ items.length === 0 && (
				<Muted>{ __( 'No experiments right now.', 'cliedesk' ) }</Muted>
			) }
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ items.map( ( l ) => (
					<li
						key={ l.key }
						className="flex items-start justify-between gap-4 p-3"
					>
						<span className="flex flex-col">
							<span className="font-medium">{ l.label }</span>
							<span className="text-sm text-fg-muted">
								{ l.description }
							</span>
						</span>
						<Switch
							isSelected={ l.on }
							isDisabled={ set.isPending }
							onChange={ ( on ) =>
								set.mutate( { key: l.key, on } )
							}
						>
							<span className="sr-only">{ l.label }</span>
						</Switch>
					</li>
				) ) }
			</ul>
		</div>
	);
}
