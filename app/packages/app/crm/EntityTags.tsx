/**
 * Tags of a contact or organization (CRM-01, CRM-30): remove, add an existing tag, create one (POST tags/apply
 * {entity, entityId, add, remove, create}). Needs cliedesk_edit_contacts to change; creating also
 * cliedesk_create_tags.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, IconButton, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { tagsQuery, type TagRef } from '../inbox/api';
import { ActionError, Muted } from '../inbox/components';
import { announceResult } from '../workspace/forms';

/**
 * Tag editor.
 *
 * @param props          Props.
 * @param props.entity   Entity kind.
 * @param props.entityId Entity id.
 * @param props.tags     Current tags.
 * @param props.onTags   The tags after a change.
 * @param props.children Extra note under the list.
 */
export function EntityTags( {
	entity,
	entityId,
	tags,
	onTags,
	children,
}: {
	entity: 'contact' | 'organization';
	entityId: number;
	tags: TagRef[];
	onTags: ( tags: TagRef[] ) => void;
	children?: ReactNode;
} ) {
	const qc = useQueryClient();
	const canEdit = can( 'cliedesk_edit_contacts' );
	const all = useQuery( { ...tagsQuery(), enabled: canEdit } );
	const [ name, setName ] = useState( '' );
	const apply = useMutation( {
		mutationFn: ( body: {
			add?: number[];
			remove?: number[];
			create?: string[];
		} ) =>
			api.post< { tags: TagRef[] } >( 'tags/apply', {
				body: { entity, entityId, ...body },
			} ),
		onSuccess: ( r, body ) => {
			if ( Array.isArray( r.data?.tags ) ) {
				onTags( r.data.tags );
			}
			if ( body.create?.length ) {
				void qc.invalidateQueries( { queryKey: [ 'tags' ] } );
			}
			announceResult( __( 'Tags updated.', 'cliedesk' ) );
		},
	} );
	const available = ( Array.isArray( all.data ) ? all.data : [] ).filter(
		( t ) => ! tags.some( ( x ) => x.id === t.id )
	);
	const create = ( e: FormEvent ) => {
		e.preventDefault();
		if ( name.trim() ) {
			apply.mutate(
				{ create: [ name.trim() ] },
				{ onSuccess: () => setName( '' ) }
			);
		}
	};
	return (
		<div className="flex flex-col gap-3">
			<ActionError
				error={ apply.error }
				onDismiss={ () => apply.reset() }
			/>
			{ tags.length > 0 && (
				<ul className="flex flex-wrap gap-1">
					{ tags.map( ( t ) => (
						<li
							key={ t.id }
							className="inline-flex items-center gap-0.5 rounded-full border border-line ps-2 text-sm"
						>
							<bdi>{ t.name }</bdi>
							{ canEdit && (
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: tag name. */
										__( 'Remove tag %s', 'cliedesk' ),
										t.name
									) }
									icon={ <X size={ 12 } /> }
									onPress={ () =>
										apply.mutate( { remove: [ t.id ] } )
									}
								/>
							) }
						</li>
					) ) }
				</ul>
			) }
			{ ! tags.length && <Muted>{ __( 'No tags.', 'cliedesk' ) }</Muted> }
			{ children }
			{ canEdit && available.length > 0 && (
				<Select
					label={ __( 'Add a tag', 'cliedesk' ) }
					value={ null }
					options={ available.map( ( t ) => ( {
						id: String( t.id ),
						label: t.name,
					} ) ) }
					onChange={ ( id ) =>
						apply.mutate( { add: [ Number( id ) ] } )
					}
				/>
			) }
			{ canEdit && can( 'cliedesk_create_tags' ) && (
				<form
					noValidate
					onSubmit={ create }
					className="flex items-end gap-2"
				>
					<TextField
						className="flex-1"
						label={ __( 'New tag', 'cliedesk' ) }
						value={ name }
						maxLength={ 64 }
						onChange={ setName }
					/>
					<Button type="submit" isDisabled={ ! name.trim() }>
						{ __( 'Create', 'cliedesk' ) }
					</Button>
				</form>
			) }
		</div>
	);
}
