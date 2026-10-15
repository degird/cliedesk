/**
 * Settings → Custom fields → Guidance notes (TRI-15): an internal note added once to conversations that match a
 * condition (VIP, a risk signal, a known incident), with a link to the policy or saved reply to use.
 *
 * - GET triage/guidance → {items: [{key, name, conditions, note, link}]}.
 * - PUT triage/guidance {items: [{key?, name, conditions (JSON), note, link}]} replaces the list.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import {
	RuleConditions,
	conditionsJson,
} from '../../components/RuleConditions';
import { ActionError, Muted } from '../../inbox/components';
import { fromJson, type GroupNode } from '../../inbox/conditions';
import { announceResult } from '../../workspace/forms';

export interface GuidanceItem {
	key?: string;
	name: string;
	conditions: unknown;
	note: string;
	link: string;
}

/**
 * The list as the API takes it (conditions as JSON).
 *
 * @param items Items.
 */
export function guidanceBody( items: GuidanceItem[] ) {
	return items.map( ( i ) => ( {
		...( i.key ? { key: i.key } : {} ),
		name: i.name,
		note: i.note,
		link: i.link,
		conditions:
			typeof i.conditions === 'string'
				? i.conditions
				: JSON.stringify( i.conditions ?? {} ),
	} ) );
}

function Editor( {
	item,
	onSave,
	onCancel,
	isSaving,
}: {
	item: GuidanceItem;
	onSave: ( i: GuidanceItem ) => void;
	onCancel: () => void;
	isSaving: boolean;
} ) {
	const [ name, setName ] = useState( item.name );
	const [ note, setNote ] = useState( item.note );
	const [ link, setLink ] = useState( item.link );
	const [ root, setRoot ] = useState< GroupNode >( () =>
		fromJson( item.conditions ?? {} )
	);
	return (
		<div className="flex flex-col gap-3 rounded-md border border-line p-3">
			<TextField
				label={ __( 'Name', 'cliedesk' ) }
				maxLength={ 80 }
				value={ name }
				onChange={ setName }
			/>
			<RuleConditions root={ root } onChange={ setRoot } />
			<TextField
				label={ __( 'Note', 'cliedesk' ) }
				description={ __(
					'Why it matters and what to do.',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				maxLength={ 2000 }
				value={ note }
				onChange={ setNote }
			/>
			<TextField
				label={ __( 'Link (optional)', 'cliedesk' ) }
				type="url"
				maxLength={ 500 }
				value={ link }
				onChange={ setLink }
			/>
			<div className="flex gap-2">
				<Button
					variant="primary"
					isLoading={ isSaving }
					isDisabled={
						! name.trim() || ! note.trim() || ! root.children.length
					}
					onPress={ () =>
						onSave( {
							key: item.key,
							name,
							note,
							link,
							conditions: conditionsJson( root ),
						} )
					}
				>
					{ __( 'Save', 'cliedesk' ) }
				</Button>
				<Button onPress={ onCancel }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}

export function GuidanceCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'triage', 'guidance' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items?: GuidanceItem[] } >(
					'triage/guidance',
					{ signal }
				)
			).data?.items ?? [],
	} );
	const items = q.data ?? [];
	const [ editing, setEditing ] = useState< number | 'new' | null >( null );
	const save = useMutation( {
		mutationFn: ( next: GuidanceItem[] ) =>
			api.put( 'triage/guidance', {
				body: { items: guidanceBody( next ) },
			} ),
		onSuccess: () => {
			setEditing( null );
			announceResult( __( 'Guidance saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'triage', 'guidance' ] } );
		},
	} );
	const blank: GuidanceItem = {
		name: '',
		note: '',
		link: '',
		conditions: {},
	};
	return (
		<section
			aria-labelledby="cd-guidance"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-guidance" className="font-semibold">
				{ __( 'Guidance notes', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'A matching conversation gets the note once, as an internal note, when it arrives or when its fields change.',
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
							<span>{ item.name }</span>
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
					isSaving={ save.isPending }
					onCancel={ () => setEditing( null ) }
					onSave={ ( next ) => save.mutate( [ ...items, next ] ) }
				/>
			) : (
				<Button
					className="self-start"
					isDisabled={ items.length >= 50 }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add guidance', 'cliedesk' ) }
				</Button>
			) }
		</section>
	);
}
