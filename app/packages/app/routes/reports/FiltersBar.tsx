/**
 * Reports → filters shared by every tab (RPT-04, RPT-09): channel, team, queue and agent, on top of the period and the
 * person's scope. The report Actions apply them exactly like the conversation list.
 */
import { useQuery } from '@cliedesk/data';
import { Select } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { queuePickerQuery, teamsLookupQuery } from '../../inbox/api';
import { useAgents } from '../../inbox/components';
import { channelLabel } from '../../inbox/labels';

export interface ReportScopeFilters {
	channel?: string;
	teamId?: number;
	queueId?: number;
	agentId?: number;
}

const CHANNELS = [ 'email', 'widget', 'form', 'portal', 'api' ];

export function FiltersBar( {
	value,
	onChange,
}: {
	value: ReportScopeFilters;
	onChange: ( v: ReportScopeFilters ) => void;
} ) {
	const teams = useQuery( teamsLookupQuery() );
	const queues = useQuery( queuePickerQuery() );
	const { agents } = useAgents();
	const any = { id: '', label: __( 'All', 'cliedesk' ) };
	const num = ( v: string ) => ( v ? Number( v ) : undefined );
	return (
		<div className="flex flex-wrap items-end gap-3">
			<Select
				label={ __( 'Channel', 'cliedesk' ) }
				value={ value.channel ?? '' }
				onChange={ ( v ) =>
					onChange( { ...value, channel: v || undefined } )
				}
				options={ [
					any,
					...CHANNELS.map( ( c ) => ( {
						id: c,
						label: channelLabel( c ),
					} ) ),
				] }
			/>
			<Select
				label={ __( 'Team', 'cliedesk' ) }
				value={ String( value.teamId ?? '' ) }
				onChange={ ( v ) => onChange( { ...value, teamId: num( v ) } ) }
				options={ [
					any,
					...( teams.data ?? [] ).map( ( t ) => ( {
						id: String( t.id ),
						label: t.name,
					} ) ),
				] }
			/>
			<Select
				label={ __( 'Queue', 'cliedesk' ) }
				value={ String( value.queueId ?? '' ) }
				onChange={ ( v ) =>
					onChange( { ...value, queueId: num( v ) } )
				}
				options={ [
					any,
					...( queues.data ?? [] ).map( ( q ) => ( {
						id: String( q.id ),
						label: q.name,
					} ) ),
				] }
			/>
			<Select
				label={ __( 'Agent', 'cliedesk' ) }
				value={ String( value.agentId ?? '' ) }
				onChange={ ( v ) =>
					onChange( { ...value, agentId: num( v ) } )
				}
				options={ [
					any,
					...agents.map( ( a ) => ( {
						id: String( a.userId ),
						label: a.name,
					} ) ),
				] }
			/>
		</div>
	);
}
