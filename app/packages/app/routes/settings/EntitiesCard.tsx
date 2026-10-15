/**
 * Settings → Custom fields → Entities (TRI-10): values found in messages (order numbers, licence keys, product
 * names) fill conversation fields. A pattern (regular expression; the first group is the value) or a list of values
 * (optionally with up to 2 typos); update on the first message, every message, or never overwrite.
 *
 * - GET triage/entities → {items: [{key, label, type, pattern, values, field, mode, fuzzy}]}.
 * - PUT triage/entities {items} replaces the list (400 with `items.N.pattern` for a bad pattern).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, Select, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { fieldsQuery } from '../../inbox/api';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

export interface EntityDef {
	key?: string;
	label: string;
	type: 'regex' | 'list';
	pattern: string;
	values: string[];
	field: string;
	mode: 'first' | 'every' | 'keep';
	fuzzy: boolean;
}

const BLANK: EntityDef = {
	label: '',
	type: 'regex',
	pattern: '',
	values: [],
	field: '',
	mode: 'keep',
	fuzzy: false,
};

export function EntitiesCard() {
	const qc = useQueryClient();
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const q = useQuery( {
		queryKey: [ 'triage', 'entities' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items?: EntityDef[] } >( 'triage/entities', {
					signal,
				} )
			).data?.items ?? [],
	} );
	const [ draft, setDraft ] = useState< EntityDef[] | null >( null );
	const items = draft ?? q.data ?? [];
	const change = ( i: number, patch: Partial< EntityDef > ) =>
		setDraft(
			items.map( ( e, j ) => ( j === i ? { ...e, ...patch } : e ) )
		);
	const save = useMutation( {
		mutationFn: () => api.put( 'triage/entities', { body: { items } } ),
		onSuccess: () => {
			setDraft( null );
			announceResult( __( 'Entities saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'triage', 'entities' ] } );
		},
	} );
	const targets = ( fields.data ?? [] )
		.filter( ( f ) => [ 'text', 'record_ref' ].includes( f.type ) )
		.map( ( f ) => ( { id: f.key, label: f.label } ) );
	return (
		<section
			aria-labelledby="cd-entities"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-entities" className="font-semibold">
				{ __( 'Entities', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Values found in the subject or a customer message fill a field: a pattern such as #(\\d{4,8}) for order numbers, or a list of names.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ save.error } />
			{ items.map( ( e, i ) => (
				<fieldset
					key={ e.key ?? `new-${ i }` }
					className="flex flex-wrap items-end gap-3 rounded-md border border-line p-3"
				>
					<legend className="sr-only">
						{ e.label || __( 'New entity', 'cliedesk' ) }
					</legend>
					<TextField
						label={ __( 'Name', 'cliedesk' ) }
						maxLength={ 80 }
						value={ e.label }
						onChange={ ( v ) => change( i, { label: v } ) }
					/>
					<Select
						label={ __( 'Find by', 'cliedesk' ) }
						value={ e.type }
						onChange={ ( v ) =>
							change( i, { type: v as EntityDef[ 'type' ] } )
						}
						options={ [
							{ id: 'regex', label: __( 'Pattern', 'cliedesk' ) },
							{ id: 'list', label: __( 'List', 'cliedesk' ) },
						] }
					/>
					{ e.type === 'regex' ? (
						<TextField
							label={ __( 'Pattern', 'cliedesk' ) }
							maxLength={ 300 }
							value={ e.pattern }
							onChange={ ( v ) => change( i, { pattern: v } ) }
						/>
					) : (
						<TextField
							label={ __(
								'Values (comma separated)',
								'cliedesk'
							) }
							maxLength={ 20000 }
							value={ e.values.join( ', ' ) }
							onChange={ ( v ) =>
								change( i, {
									values: v
										.split( ',' )
										.map( ( s ) => s.trim() )
										.filter( Boolean ),
								} )
							}
						/>
					) }
					<Select
						label={ __( 'Fill field', 'cliedesk' ) }
						value={ e.field }
						onChange={ ( v ) => change( i, { field: v } ) }
						options={ targets }
					/>
					<Select
						label={ __( 'Update', 'cliedesk' ) }
						value={ e.mode }
						onChange={ ( v ) =>
							change( i, { mode: v as EntityDef[ 'mode' ] } )
						}
						options={ [
							{
								id: 'keep',
								label: __( 'Never overwrite', 'cliedesk' ),
							},
							{
								id: 'first',
								label: __( 'First message only', 'cliedesk' ),
							},
							{
								id: 'every',
								label: __( 'Every message', 'cliedesk' ),
							},
						] }
					/>
					{ e.type === 'list' && (
						<Checkbox
							isSelected={ e.fuzzy }
							onChange={ ( v ) => change( i, { fuzzy: v } ) }
						>
							{ __( 'Allow typos', 'cliedesk' ) }
						</Checkbox>
					) }
					<Button
						size="sm"
						variant="danger"
						onPress={ () =>
							setDraft( items.filter( ( _, j ) => j !== i ) )
						}
					>
						{ __( 'Remove', 'cliedesk' ) }
					</Button>
				</fieldset>
			) ) }
			<div className="flex gap-2">
				<Button
					isDisabled={ items.length >= 30 }
					onPress={ () => setDraft( [ ...items, { ...BLANK } ] ) }
				>
					{ __( 'Add entity', 'cliedesk' ) }
				</Button>
				<Button
					variant="primary"
					isDisabled={ draft === null }
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save', 'cliedesk' ) }
				</Button>
			</div>
		</section>
	);
}
