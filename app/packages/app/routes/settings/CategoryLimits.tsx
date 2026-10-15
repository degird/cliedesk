/**
 * Settings → Help center → Who edits which categories (KB-57): limit a role that writes articles to some help
 * categories (sub-categories included). No category ticked: the role is not limited.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Overview {
	roles: { key: string; name: string; categories: number[] }[];
	categories: { id: number; name: string }[];
}

const KEY = [ 'knowledge', 'category-limits' ] as const;

export function CategoryLimits() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< Overview >( 'knowledge/category-limits', {
					signal,
				} )
			).data,
	} );
	const [ limits, setLimits ] = useState< Record< string, number[] > >( {} );
	useEffect( () => {
		if ( q.data ) {
			setLimits(
				Object.fromEntries(
					q.data.roles.map( ( r ) => [ r.key, r.categories ] )
				)
			);
		}
	}, [ q.data ] );
	const save = useMutation( {
		mutationFn: () =>
			api.put< Overview >( 'knowledge/category-limits', {
				body: {
					limits: Object.entries( limits ).map(
						( [ role, categories ] ) => ( { role, categories } )
					),
				},
			} ),
		onSuccess: () => {
			announceResult( __( 'Category limits saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	if (
		! q.data ||
		q.data.roles.length === 0 ||
		q.data.categories.length === 0
	) {
		return null;
	}
	const toggle = ( role: string, id: number, on: boolean ) =>
		setLimits( ( prev ) => {
			const list = ( prev[ role ] ?? [] ).filter( ( x ) => x !== id );
			return { ...prev, [ role ]: on ? [ ...list, id ] : list };
		} );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<form
			noValidate
			onSubmit={ onSubmit }
			className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
		>
			<h2 className="text-base font-semibold">
				{ __( 'Who edits which categories', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Tick categories to limit a role to them (sub-categories included). No category ticked: the role can work in all of them.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ save.error } />
			{ q.data.roles.map( ( role ) => (
				<fieldset key={ role.key } className="flex flex-col gap-1">
					<legend className="text-sm font-medium">
						{ role.name }
					</legend>
					<div className="flex flex-wrap gap-x-4 gap-y-1">
						{ q.data.categories.map( ( c ) => (
							<Checkbox
								key={ c.id }
								isSelected={ (
									limits[ role.key ] ?? []
								).includes( c.id ) }
								onChange={ ( on ) =>
									toggle( role.key, c.id, on )
								}
							>
								{ c.name }
							</Checkbox>
						) ) }
					</div>
				</fieldset>
			) ) }
			<div>
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save category limits', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}
