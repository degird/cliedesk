/**
 * Settings → Custom fields → Topics → Curate (TRI-23): rename, move, merge, split, archive or restore a topic. A
 * merge moves every conversation's value to the other topic (report totals stay continuous); every change is listed
 * and rolls back.
 *
 * - POST fields/{id}/options/curate {action, optionKey, label | parentKey | intoKey | labels}.
 * - GET fields/{id}/options/history → {items: [{id, action, option, before, target, values, createdAt, revertedAt}]}.
 * - POST fields/{id}/options/history/{changeId}/revert.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { fieldsQuery } from '../../inbox/api';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

type Action = 'rename' | 'move' | 'merge' | 'split' | 'archive';

interface Change {
	id: number;
	action: string;
	option: string;
	before: string;
	target: string | null;
	values: number | null;
	revertedAt: string | null;
}

/**
 * One line of history.
 *
 * @param c Change.
 */
export function changeText( c: Change ): string {
	switch ( c.action ) {
		case 'rename':
			return sprintf(
				/* translators: 1: old name, 2: new name. */
				__( 'Renamed %1$s to %2$s', 'cliedesk' ),
				c.before,
				c.option
			);
		case 'merge':
			return sprintf(
				/* translators: 1: topic, 2: other topic, 3: number of values. */
				__( 'Merged %1$s into %2$s (%3$d values)', 'cliedesk' ),
				c.option,
				c.target ?? '',
				c.values ?? 0
			);
		case 'move':
			return sprintf(
				/* translators: 1: topic, 2: group or "top level". */
				__( 'Moved %1$s to %2$s', 'cliedesk' ),
				c.option,
				c.target ?? __( 'top level', 'cliedesk' )
			);
		case 'split':
			/* translators: %s: topic. */
			return sprintf( __( 'Split %s', 'cliedesk' ), c.option );
		case 'restore':
			/* translators: %s: topic. */
			return sprintf( __( 'Restored %s', 'cliedesk' ), c.option );
		default:
			/* translators: %s: topic. */
			return sprintf( __( 'Archived %s', 'cliedesk' ), c.option );
	}
}

export function TopicCuration() {
	const qc = useQueryClient();
	const fields = useQuery( fieldsQuery( 'conversation' ) );
	const topic = fields.data?.find( ( f ) => f.key === 'topic' );
	const history = useQuery( {
		queryKey: [ 'triage', 'curation', topic?.id ],
		enabled: !! topic,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Change[] } >(
					`fields/${ topic?.id }/options/history`,
					{ signal }
				)
			).data?.items ?? [],
	} );
	const [ action, setAction ] = useState< Action >( 'merge' );
	const [ option, setOption ] = useState( '' );
	const [ other, setOther ] = useState( '' );
	const [ text, setText ] = useState( '' );
	const refresh = () => {
		void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
		void qc.invalidateQueries( { queryKey: [ 'triage', 'curation' ] } );
	};
	const run = useMutation( {
		mutationFn: () =>
			api.post( `fields/${ topic?.id }/options/curate`, {
				body: {
					action,
					optionKey: option,
					...( action === 'rename' ? { label: text } : {} ),
					...( action === 'move' ? { parentKey: other } : {} ),
					...( action === 'merge' ? { intoKey: other } : {} ),
					...( action === 'split'
						? { labels: text.split( ',' ).map( ( s ) => s.trim() ) }
						: {} ),
				},
			} ),
		onSuccess: () => {
			setOption( '' );
			setOther( '' );
			setText( '' );
			announceResult( __( 'Topics changed.', 'cliedesk' ) );
			refresh();
		},
	} );
	const revert = useMutation( {
		mutationFn: ( id: number ) =>
			api.post( `fields/${ topic?.id }/options/history/${ id }/revert` ),
		onSuccess: () => {
			announceResult( __( 'Change rolled back.', 'cliedesk' ) );
			refresh();
		},
	} );
	if ( ! topic ) {
		return null;
	}
	const list = ( topic.options ?? [] )
		.filter( ( o ) => ! o.archived )
		.map( ( o ) => ( { id: o.key, label: o.path } ) );
	return (
		<div className="flex flex-col gap-3">
			<h3 className="text-sm font-semibold">
				{ __( 'Curate topics', 'cliedesk' ) }
			</h3>
			<ActionError error={ run.error ?? revert.error } />
			<div className="flex flex-wrap items-end gap-3">
				<Select
					label={ __( 'Change', 'cliedesk' ) }
					value={ action }
					onChange={ ( a ) => setAction( a as Action ) }
					options={ [
						{ id: 'merge', label: __( 'Merge into', 'cliedesk' ) },
						{ id: 'rename', label: __( 'Rename', 'cliedesk' ) },
						{ id: 'move', label: __( 'Move under', 'cliedesk' ) },
						{ id: 'split', label: __( 'Split into', 'cliedesk' ) },
						{ id: 'archive', label: __( 'Archive', 'cliedesk' ) },
					] }
				/>
				<Select
					label={ __( 'Topic', 'cliedesk' ) }
					value={ option }
					onChange={ setOption }
					options={ list }
				/>
				{ ( action === 'merge' || action === 'move' ) && (
					<Select
						label={
							action === 'merge'
								? __( 'Into', 'cliedesk' )
								: __( 'Group', 'cliedesk' )
						}
						value={ other }
						onChange={ setOther }
						options={ [
							...( action === 'move'
								? [
										{
											id: '',
											label: __(
												'Top level',
												'cliedesk'
											),
										},
									]
								: [] ),
							...list.filter( ( o ) => o.id !== option ),
						] }
					/>
				) }
				{ ( action === 'rename' || action === 'split' ) && (
					<TextField
						label={
							action === 'rename'
								? __( 'New name', 'cliedesk' )
								: __(
										'New topics (comma separated)',
										'cliedesk'
									)
						}
						maxLength={ 500 }
						value={ text }
						onChange={ setText }
					/>
				) }
				<Button
					isLoading={ run.isPending }
					isDisabled={
						! option ||
						( action === 'merge' && ! other ) ||
						( ( action === 'rename' || action === 'split' ) &&
							! text.trim() )
					}
					onPress={ () => run.mutate() }
				>
					{ __( 'Apply', 'cliedesk' ) }
				</Button>
			</div>
			{ ( history.data ?? [] ).length > 0 && (
				<ul className="flex flex-col gap-1 text-sm">
					{ ( history.data ?? [] ).map( ( c ) => (
						<li
							key={ c.id }
							className="flex items-center justify-between gap-2"
						>
							<span>{ changeText( c ) }</span>
							{ c.revertedAt ? (
								<span className="text-fg-muted">
									{ __( 'Rolled back', 'cliedesk' ) }
								</span>
							) : (
								<Button
									size="sm"
									isDisabled={ revert.isPending }
									onPress={ () => revert.mutate( c.id ) }
								>
									{ __( 'Roll back', 'cliedesk' ) }
								</Button>
							) }
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}
