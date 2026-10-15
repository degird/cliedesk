/**
 * Advanced search panel (INB-31): the same conditions as views (INB-19) on top of the search words. Applying sends
 * them as `filters` with the search condition (GET inbox); "Save as view" stores both.
 */
import { getBoot, useQuery } from '@cliedesk/data';
import { Button, LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import {
	fieldsQuery,
	queuePickerQuery,
	statusesQuery,
	tagsQuery,
	teamsLookupQuery,
	typesQuery,
	vocabularyQuery,
} from '../../inbox/api';
import { useAgents } from '../../inbox/components';
import {
	fromJson,
	newGroup,
	setVocabulary,
	toObject,
	validateTree,
	type GroupNode,
} from '../../inbox/conditions';
import { ConditionBuilder } from './ConditionBuilder';

/**
 * Panel.
 *
 * @param props         Props.
 * @param props.applied Conditions now applied (object), or null.
 * @param props.onApply Apply conditions (null: clear).
 */
export default function SearchFilters( {
	applied,
	onApply,
}: {
	applied: unknown;
	onApply: ( conditions: unknown ) => void;
} ) {
	const vocabulary = useQuery( vocabularyQuery() );
	if ( vocabulary.isPending ) {
		return (
			<LoadingRegion
				label={ __( 'Loading the conditions…', 'cliedesk' ) }
			/>
		);
	}
	setVocabulary(
		vocabulary.data?.conditions.filter( ( c ) => ! c.rulesOnly ) ?? null
	);
	return <Form applied={ applied } onApply={ onApply } />;
}

function Form( {
	applied,
	onApply,
}: {
	applied: unknown;
	onApply: ( conditions: unknown ) => void;
} ) {
	const [ root, setRoot ] = useState< GroupNode >( () =>
		applied ? fromJson( applied ) : newGroup( 'all' )
	);
	const [ errors, setErrors ] = useState< Record< string, string > >( {} );
	const statuses = useQuery( statusesQuery() );
	const tags = useQuery( tagsQuery() );
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const teams = useQuery( teamsLookupQuery() );
	const types = useQuery( typesQuery() );
	const queues = useQuery( queuePickerQuery() );
	const { agents } = useAgents();
	const apply = () => {
		const next: Record< string, string > = {};
		validateTree( root, next );
		setErrors( next );
		if ( ! Object.keys( next ).length ) {
			onApply( root.children.length ? toObject( root ) : null );
		}
	};
	return (
		<div className="flex flex-col gap-3">
			<ConditionBuilder
				root={ root }
				lookups={ {
					statuses: statuses.data ?? [],
					tags: tags.data ?? [],
					agents,
					fields: fields.data ?? [],
					meId: getBoot().user?.id ?? null,
					types: types.data ?? [],
					queues: queues.data ?? [],
					teams: teams.data ?? [],
					products: getBoot().products,
				} }
				errors={ errors }
				onChange={ setRoot }
			/>
			<div className="flex flex-wrap gap-2">
				<Button variant="primary" size="sm" onPress={ apply }>
					{ __( 'Apply filters', 'cliedesk' ) }
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onPress={ () => {
						setRoot( newGroup( 'all' ) );
						setErrors( {} );
						onApply( null );
					} }
				>
					{ __( 'Clear filters', 'cliedesk' ) }
				</Button>
			</div>
		</div>
	);
}
