/**
 * Settings → Side panel layouts → Link buttons (DEV-21): "open URL" buttons in the conversation or contact side
 * panel, made without code. The URL may hold tokens such as {contact.email}; a button can be limited to roles.
 *
 * - GET link-buttons → {items: [{key, label, url, places, roles}], tokens: string[]}.
 * - PUT link-buttons {items: [{key?, label, url, places, roles}]} replaces the list.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { rolesQuery } from '../../team/api';
import { announceResult } from '../../workspace/forms';

export interface LinkButton {
	key?: string;
	label: string;
	url: string;
	places: Array< 'conversation' | 'contact' >;
	roles: string[];
}

const PLACES = [ 'conversation', 'contact' ] as const;

function Editor( {
	item,
	tokens,
	onSave,
	onCancel,
	isSaving,
}: {
	item: LinkButton;
	tokens: string[];
	onSave: ( i: LinkButton ) => void;
	onCancel: () => void;
	isSaving: boolean;
} ) {
	const roles = useQuery( rolesQuery() );
	const [ next, setNext ] = useState( item );
	const toggle = < K extends 'places' | 'roles' >(
		key: K,
		value: string,
		on: boolean
	) =>
		setNext( ( n ) => ( {
			...n,
			[ key ]: on
				? [ ...n[ key ], value ]
				: ( n[ key ] as string[] ).filter( ( v ) => v !== value ),
		} ) );
	return (
		<div className="flex flex-col gap-3 rounded-md border border-line p-3">
			<TextField
				label={ __( 'Label', 'cliedesk' ) }
				maxLength={ 60 }
				value={ next.label }
				onChange={ ( label ) =>
					setNext( ( n ) => ( { ...n, label } ) )
				}
			/>
			<TextField
				label={ __( 'Web address', 'cliedesk' ) }
				description={
					__( 'You can use:', 'cliedesk' ) +
					' ' +
					tokens.map( ( t ) => `{${ t }}` ).join( ' ' )
				}
				type="url"
				maxLength={ 2000 }
				value={ next.url }
				onChange={ ( url ) => setNext( ( n ) => ( { ...n, url } ) ) }
			/>
			<fieldset className="flex flex-wrap gap-x-4 gap-y-1">
				<legend className="pb-1 text-sm font-medium">
					{ __( 'Show on', 'cliedesk' ) }
				</legend>
				{ PLACES.map( ( p ) => (
					<Checkbox
						key={ p }
						isSelected={ next.places.includes( p ) }
						onChange={ ( on ) => toggle( 'places', p, on ) }
					>
						{ p === 'conversation'
							? __( 'Conversations', 'cliedesk' )
							: __( 'Contacts', 'cliedesk' ) }
					</Checkbox>
				) ) }
			</fieldset>
			<fieldset className="flex flex-wrap gap-x-4 gap-y-1">
				<legend className="pb-1 text-sm font-medium">
					{ __(
						'Only for these roles (none: everyone)',
						'cliedesk'
					) }
				</legend>
				{ ( roles.data?.roles ?? [] ).map( ( r ) => (
					<Checkbox
						key={ r.key }
						isSelected={ next.roles.includes( r.key ) }
						onChange={ ( on ) => toggle( 'roles', r.key, on ) }
					>
						{ r.name }
					</Checkbox>
				) ) }
			</fieldset>
			<div className="flex gap-2">
				<Button
					variant="primary"
					isLoading={ isSaving }
					isDisabled={
						! next.label.trim() ||
						! next.url.trim() ||
						! next.places.length
					}
					onPress={ () => onSave( next ) }
				>
					{ __( 'Save button', 'cliedesk' ) }
				</Button>
				<Button onPress={ onCancel }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}

export function LinkButtonsCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'link-buttons' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items?: LinkButton[]; tokens?: string[] } >(
					'link-buttons',
					{ signal }
				)
			).data ?? {},
	} );
	const items = q.data?.items ?? [];
	const tokens = q.data?.tokens ?? [];
	const [ editing, setEditing ] = useState< number | 'new' | null >( null );
	const save = useMutation( {
		mutationFn: ( next: LinkButton[] ) =>
			api.put( 'link-buttons', { body: { items: next } } ),
		onSuccess: () => {
			setEditing( null );
			announceResult( __( 'Link buttons saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'link-buttons' ] } );
		},
	} );
	const blank: LinkButton = {
		label: '',
		url: 'https://',
		places: [ 'conversation' ],
		roles: [],
	};
	return (
		<section
			aria-labelledby="cd-link-buttons"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-link-buttons" className="font-semibold">
				{ __( 'Link buttons', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Buttons in the side panel that open a web page about the customer, such as their account in another tool. Each use is in the audit log.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ save.error } />
			<ul className="flex flex-col gap-2">
				{ items.map( ( item, i ) =>
					editing === i ? (
						<li key={ item.key ?? i }>
							<Editor
								item={ item }
								tokens={ tokens }
								isSaving={ save.isPending }
								onCancel={ () => setEditing( null ) }
								onSave={ ( next ) =>
									save.mutate(
										items.map( ( x, j ) =>
											j === i ? next : x
										)
									)
								}
							/>
						</li>
					) : (
						<li
							key={ item.key ?? i }
							className="flex items-center justify-between gap-2"
						>
							<span>{ item.label }</span>
							<span className="flex gap-2">
								<Button
									size="sm"
									onPress={ () => setEditing( i ) }
								>
									{ __( 'Edit', 'cliedesk' ) }
								</Button>
								<Button
									size="sm"
									variant="danger"
									isDisabled={ save.isPending }
									onPress={ () =>
										save.mutate(
											items.filter( ( _, j ) => j !== i )
										)
									}
								>
									{ __( 'Remove', 'cliedesk' ) }
								</Button>
							</span>
						</li>
					)
				) }
			</ul>
			{ editing === 'new' ? (
				<Editor
					item={ blank }
					tokens={ tokens }
					isSaving={ save.isPending }
					onCancel={ () => setEditing( null ) }
					onSave={ ( next ) => save.mutate( [ ...items, next ] ) }
				/>
			) : (
				<Button
					className="self-start"
					isDisabled={ items.length >= 30 }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add link button', 'cliedesk' ) }
				</Button>
			) }
		</section>
	);
}
