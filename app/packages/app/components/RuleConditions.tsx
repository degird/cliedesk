/**
 * Condition editor for rules (AUT-23): queues, SLA policies and other rules use the view condition builder with the
 * server vocabulary minus the "me" conditions, plus the live "Matches N conversations now" count.
 */
import { getBoot, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import {
	fieldsQuery,
	queuePickerQuery,
	statusesQuery,
	tagsQuery,
	teamsLookupQuery,
	typesQuery,
	vocabularyQuery,
} from '../inbox/api';
import { useAgents } from '../inbox/components';
import {
	setVocabulary,
	toJson,
	toObject,
	type GroupNode,
} from '../inbox/conditions';
import { ConditionBuilder } from '../routes/inbox/ConditionBuilder';
import { ConditionPreview } from './ConditionPreview';

/** Conditions about "me" make no sense for rules. */
export const PERSONAL = [ 'follower', 'participant', 'created_by', 'search' ];

/**
 * Stored conditions: '' when there are none.
 *
 * @param root Root group.
 */
export function conditionsJson( root: GroupNode ): string {
	return root.children.length ? toJson( root ) : '';
}

export function RuleConditions( {
	root,
	onChange,
	channels = [],
}: {
	root: GroupNode;
	onChange: ( g: GroupNode ) => void;
	/** The rule's channels (empty: all); channel-only conditions of other channels are hidden (AUT-32). */
	channels?: string[];
} ) {
	const vocabulary = useQuery( vocabularyQuery() );
	const statuses = useQuery( statusesQuery() );
	const tags = useQuery( tagsQuery() );
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const teams = useQuery( teamsLookupQuery() );
	const types = useQuery( typesQuery() );
	const queues = useQuery( queuePickerQuery() );
	const { agents } = useAgents();
	if ( vocabulary.isPending ) {
		return <LoadingRegion />;
	}
	setVocabulary(
		( vocabulary.data?.conditions ?? [] ).filter(
			( c ) =>
				! PERSONAL.includes( c.field ) &&
				( ! c.channel ||
					channels.length === 0 ||
					channels.includes( c.channel ) )
		)
	);
	return (
		<>
			<ConditionBuilder
				root={ root }
				lookups={ {
					statuses: statuses.data ?? [],
					tags: tags.data ?? [],
					agents,
					fields: fields.data ?? [],
					meId: null,
					types: types.data ?? [],
					queues: queues.data ?? [],
					teams: teams.data ?? [],
					products: getBoot().products,
				} }
				errors={ {} }
				onChange={ onChange }
			/>
			{ root.children.length > 0 && (
				<ConditionPreview json={ JSON.stringify( toObject( root ) ) } />
			) }
		</>
	);
}
