/**
 * Settings → Side panel layouts → Context rules (INB-67): per conversation type, topic or channel, which side panel
 * card comes first (and which are hidden) and which saved replies are recommended. The first matching rule wins.
 *
 * - GET panel-context-rules → {items}; PUT panel-context-rules {items: JSON list} replaces them.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Select, TextField, useSlotHasFills } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { typesQuery } from '../../inbox/api';
import { ActionError, Muted } from '../../inbox/components';
import { channelLabel } from '../../inbox/labels';
import { PANEL_SECTIONS, panelSectionLabel } from '../../inbox/panel';
import { announceResult } from '../../workspace/forms';

export interface ContextRule {
	name: string;
	when: {
		typeId: number | null;
		topic: string | null;
		channel: string | null;
		productId?: number | null;
		brandId?: number | null;
	};
	cards: { order: string[]; collapsed: string[]; hidden: string[] };
	macros: number[];
	knowledge?: { categoryId: number | null; query: string };
}

const ANY = 'any';
const CHANNELS = [ 'email', 'widget', 'form', 'portal', 'phone' ];
const KEY = [ 'panel-context-rules' ] as const;

const empty = (): ContextRule => ( {
	name: '',
	when: { typeId: null, topic: null, channel: null },
	cards: { order: [], collapsed: [], hidden: [] },
	macros: [],
} );

function RuleRow( {
	rule,
	index,
	onChange,
	onRemove,
}: {
	rule: ContextRule;
	index: number;
	onChange: ( r: ContextRule ) => void;
	onRemove: () => void;
} ) {
	const types = useQuery( typesQuery() ).data ?? [];
	// "Approvals" is a Pro section (TEAM-26).
	const approvals = useSlotHasFills( 'conversation.approvals' );
	const [ macroText, setMacroText ] = useState( rule.macros.join( ', ' ) );
	const set = ( when: Partial< ContextRule[ 'when' ] > ) =>
		onChange( { ...rule, when: { ...rule.when, ...when } } );
	return (
		<li className="flex flex-col gap-2 py-3">
			<div className="flex flex-wrap items-end gap-2">
				<TextField
					label={ sprintf(
						/* translators: %d: rule position. */
						__( 'Rule %d name', 'cliedesk' ),
						index + 1
					) }
					maxLength={ 120 }
					value={ rule.name }
					onChange={ ( name ) => onChange( { ...rule, name } ) }
				/>
				<Select
					label={ __( 'Type', 'cliedesk' ) }
					value={
						rule.when.typeId ? String( rule.when.typeId ) : ANY
					}
					onChange={ ( v ) =>
						set( { typeId: v === ANY ? null : Number( v ) } )
					}
					options={ [
						{ id: ANY, label: __( 'Any type', 'cliedesk' ) },
						...types.map( ( t ) => ( {
							id: String( t.id ),
							label: t.name,
						} ) ),
					] }
				/>
				<Select
					label={ __( 'Channel', 'cliedesk' ) }
					value={ rule.when.channel ?? ANY }
					onChange={ ( v ) =>
						set( { channel: v === ANY ? null : String( v ) } )
					}
					options={ [
						{ id: ANY, label: __( 'Any channel', 'cliedesk' ) },
						...CHANNELS.map( ( c ) => ( {
							id: c,
							label: channelLabel( c ),
						} ) ),
					] }
				/>
				<TextField
					label={ __( 'Topic', 'cliedesk' ) }
					maxLength={ 120 }
					value={ rule.when.topic ?? '' }
					onChange={ ( topic ) => set( { topic: topic || null } ) }
				/>
			</div>
			<div className="flex flex-wrap items-end gap-2">
				<Select
					label={ __( 'Card first', 'cliedesk' ) }
					value={ rule.cards.order[ 0 ] ?? ANY }
					onChange={ ( v ) =>
						onChange( {
							...rule,
							cards: {
								...rule.cards,
								order: v === ANY ? [] : [ String( v ) ],
							},
						} )
					}
					options={ [
						{ id: ANY, label: __( 'Keep the layout', 'cliedesk' ) },
						...PANEL_SECTIONS.filter(
							( s ) => approvals || s !== 'approvals'
						).map( ( s ) => ( {
							id: s,
							label: panelSectionLabel( s ),
						} ) ),
					] }
				/>
				<TextField
					label={ __(
						'Recommended saved replies (ids)',
						'cliedesk'
					) }
					description={ __(
						'Shown first in the saved reply picker. Separate with commas.',
						'cliedesk'
					) }
					value={ macroText }
					onChange={ ( v ) => {
						setMacroText( v );
						onChange( {
							...rule,
							macros: v
								.split( ',' )
								.map( ( x ) => Number( x.trim() ) )
								.filter(
									( n ) => Number.isInteger( n ) && n > 0
								),
						} );
					} }
				/>
				<Button variant="danger" onPress={ onRemove }>
					{ __( 'Remove', 'cliedesk' ) }
				</Button>
			</div>
		</li>
	);
}

export function ContextRulesCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: ContextRule[] } >(
					'panel-context-rules',
					{ signal }
				)
			).data?.items ?? [],
	} );
	const [ rules, setRules ] = useState< ContextRule[] | null >( null );
	useEffect( () => {
		if ( q.data && rules === null ) {
			setRules( q.data );
		}
	}, [ q.data, rules ] );
	const save = useMutation( {
		mutationFn: () =>
			api.put( 'panel-context-rules', {
				body: { items: JSON.stringify( rules ?? [] ) },
			} ),
		onSuccess: () => {
			announceResult( __( 'Context rules saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
			void qc.invalidateQueries( { queryKey: [ 'panel-context' ] } );
		},
	} );
	const list = rules ?? [];
	return (
		<section
			aria-labelledby="cd-context-rules"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-context-rules" className="font-semibold">
				{ __( 'Context rules', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Show the cards and saved replies that fit a conversation, for example: type Billing → Orders first. The first matching rule wins; a person’s own panel layout comes before it.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ save.error } />
			{ list.length === 0 && ! q.isPending && (
				<Muted>{ __( 'No context rules yet.', 'cliedesk' ) }</Muted>
			) }
			<ol className="flex flex-col divide-y divide-line">
				{ list.map( ( r, i ) => (
					<RuleRow
						key={ i }
						rule={ r }
						index={ i }
						onChange={ ( next ) =>
							setRules(
								list.map( ( x, j ) => ( j === i ? next : x ) )
							)
						}
						onRemove={ () =>
							setRules( list.filter( ( _, j ) => j !== i ) )
						}
					/>
				) ) }
			</ol>
			<div className="flex gap-2">
				<Button onPress={ () => setRules( [ ...list, empty() ] ) }>
					{ __( 'Add rule', 'cliedesk' ) }
				</Button>
				<Button
					variant="primary"
					isLoading={ save.isPending }
					isDisabled={ rules === null }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save rules', 'cliedesk' ) }
				</Button>
			</div>
		</section>
	);
}
