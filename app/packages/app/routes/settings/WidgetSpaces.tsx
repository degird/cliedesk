/**
 * Settings → Widget → Spaces and Home cards (CHN-08): which spaces the widget has (Home, Messages, Help), which one
 * opens first, and the Home cards in order (start a conversation, article search, link, text), each for everyone,
 * guests or signed-in visitors. There is no limit on cards.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	IconButton,
	ProPill,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

type Space = 'home' | 'messages' | 'help';

export interface HomeCard {
	type: 'start' | 'search' | 'link' | 'text';
	title: string;
	text: string;
	url: string;
	audience: 'all' | 'guests' | 'users';
}

const SPACES: Space[] = [ 'home', 'messages', 'help' ];

/** CHN-13: a page-mode rule. */
export interface PageMode {
	pattern: string;
	mode: 'search' | 'form';
	type: string;
}

function spaceName( s: Space ): string {
	return {
		home: __( 'Home', 'cliedesk' ),
		messages: __( 'Messages', 'cliedesk' ),
		help: __( 'Help', 'cliedesk' ),
	}[ s ];
}

/**
 * Move an item of a list.
 *
 * @param list List.
 * @param from Index.
 * @param by   -1 up, 1 down.
 */
export function moved< T >( list: T[], from: number, by: number ): T[] {
	const to = from + by;
	if ( to < 0 || to >= list.length ) {
		return list;
	}
	const next = [ ...list ];
	const [ item ] = next.splice( from, 1 );
	next.splice( to, 0, item as T );
	return next;
}

export function WidgetSpaces() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'widget' ) );
	const stored = ( key: string ) => q.data?.values?.[ key ]?.value;
	const [ spaces, setSpaces ] = useState< Space[] | null >( null );
	const [ first, setFirst ] = useState< Space | null >( null );
	const [ cards, setCards ] = useState< HomeCard[] | null >( null );
	const [ modes, setModes ] = useState< PageMode[] | null >( null );
	const s = spaces ?? ( ( stored( 'spaces' ) as Space[] ) || [ 'home' ] );
	const d = first ?? ( ( stored( 'default_space' ) as Space ) || 'home' );
	const c = cards ?? ( ( stored( 'home_cards' ) as HomeCard[] ) || [] );
	const m = modes ?? ( ( stored( 'page_modes' ) as PageMode[] ) || [] );
	const editMode = ( i: number, patch: Partial< PageMode > ) =>
		setModes( m.map( ( x, n ) => ( n === i ? { ...x, ...patch } : x ) ) );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/widget', {
				body: {
					values: {
						spaces: s,
						default_space: s.includes( d ) ? d : 'home',
						home_cards: c,
						page_modes: m,
					},
				},
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setSpaces( null );
			setFirst( null );
			setCards( null );
			setModes( null );
			announceResult( __( 'Spaces and cards saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'widget' ] } );
		},
	} );
	const edit = ( i: number, patch: Partial< HomeCard > ) =>
		setCards( c.map( ( x, n ) => ( n === i ? { ...x, ...patch } : x ) ) );
	return (
		<section
			aria-labelledby="cd-widget-spaces"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-widget-spaces" className="font-semibold">
				{ __( 'Spaces and Home cards', 'cliedesk' ) }
			</h2>
			<ActionError error={ save.error } />
			<fieldset className="flex flex-wrap gap-4">
				<legend className="mb-1 text-sm font-medium">
					{ __( 'Spaces', 'cliedesk' ) }
				</legend>
				{ SPACES.map( ( sp ) => (
					<Checkbox
						key={ sp }
						isSelected={ s.includes( sp ) }
						isDisabled={ sp === 'home' }
						onChange={ ( on ) =>
							setSpaces(
								on
									? SPACES.filter(
											( x ) => x === sp || s.includes( x )
										)
									: s.filter( ( x ) => x !== sp )
							)
						}
					>
						{ spaceName( sp ) }
					</Checkbox>
				) ) }
			</fieldset>
			<Select
				label={ __( 'Opens on', 'cliedesk' ) }
				value={ d }
				onChange={ ( v ) => setFirst( v as Space ) }
				options={ s.map( ( sp ) => ( {
					id: sp,
					label: spaceName( sp ),
				} ) ) }
			/>
			<h3 className="text-sm font-medium">
				{ __( 'Home cards', 'cliedesk' ) }
			</h3>
			{ ! c.length && (
				<Muted>
					{ __(
						'No cards: Home shows the greeting and the visitor’s conversations.',
						'cliedesk'
					) }
				</Muted>
			) }
			<ol className="flex flex-col gap-3">
				{ c.map( ( card, i ) => (
					<li
						key={ i }
						className="flex flex-wrap items-end gap-2 rounded-md border border-line p-3"
					>
						<Select
							label={ __( 'Card', 'cliedesk' ) }
							value={ card.type }
							onChange={ ( v ) =>
								edit( i, { type: v as HomeCard[ 'type' ] } )
							}
							options={ [
								{
									id: 'start',
									label: __(
										'Start a conversation',
										'cliedesk'
									),
								},
								{
									id: 'search',
									label: __( 'Article search', 'cliedesk' ),
								},
								{ id: 'link', label: __( 'Link', 'cliedesk' ) },
								{ id: 'text', label: __( 'Text', 'cliedesk' ) },
							] }
						/>
						<TextField
							label={ __( 'Title', 'cliedesk' ) }
							maxLength={ 120 }
							value={ card.title }
							onChange={ ( v ) => edit( i, { title: v } ) }
						/>
						{ card.type !== 'search' && (
							<TextField
								label={ __( 'Text', 'cliedesk' ) }
								maxLength={ 500 }
								value={ card.text }
								onChange={ ( v ) => edit( i, { text: v } ) }
							/>
						) }
						{ card.type === 'link' && (
							<TextField
								label={ __( 'Address', 'cliedesk' ) }
								type="url"
								maxLength={ 500 }
								value={ card.url }
								onChange={ ( v ) => edit( i, { url: v } ) }
							/>
						) }
						<Select
							label={ __( 'Shown to', 'cliedesk' ) }
							value={ card.audience }
							onChange={ ( v ) =>
								edit( i, {
									audience: v as HomeCard[ 'audience' ],
								} )
							}
							options={ [
								{
									id: 'all',
									label: __( 'Everyone', 'cliedesk' ),
								},
								{
									id: 'guests',
									label: __( 'Guests', 'cliedesk' ),
								},
								{
									id: 'users',
									label: __(
										'Signed-in visitors',
										'cliedesk'
									),
								},
							] }
						/>
						<IconButton
							label={ sprintf(
								/* translators: %d: card position. */
								__( 'Move card %d up', 'cliedesk' ),
								i + 1
							) }
							icon={ <ArrowUp size={ 14 } /> }
							onPress={ () => setCards( moved( c, i, -1 ) ) }
						/>
						<IconButton
							label={ sprintf(
								/* translators: %d: card position. */
								__( 'Move card %d down', 'cliedesk' ),
								i + 1
							) }
							icon={ <ArrowDown size={ 14 } /> }
							onPress={ () => setCards( moved( c, i, 1 ) ) }
						/>
						<IconButton
							label={ sprintf(
								/* translators: %d: card position. */
								__( 'Remove card %d', 'cliedesk' ),
								i + 1
							) }
							icon={ <X size={ 14 } /> }
							onPress={ () =>
								setCards( c.filter( ( _, n ) => n !== i ) )
							}
						/>
					</li>
				) ) }
			</ol>
			<h3 className="text-sm font-medium">
				{ __( 'Mode per page', 'cliedesk' ) }
			</h3>
			<Muted>
				{ __(
					'Pages whose address contains the text (or matches it, with * as a wildcard) open the widget on an article search or on a request form.',
					'cliedesk'
				) }{ ' ' }
				{ __(
					'Ask first (AI) and call first come with Pro.',
					'cliedesk'
				) }{ ' ' }
				<ProPill />
			</Muted>
			<ol className="flex flex-col gap-2">
				{ m.map( ( rule, i ) => (
					<li key={ i } className="flex flex-wrap items-end gap-2">
						<TextField
							label={ __( 'Page address contains', 'cliedesk' ) }
							maxLength={ 300 }
							value={ rule.pattern }
							onChange={ ( v ) => editMode( i, { pattern: v } ) }
						/>
						<Select
							label={ __( 'Opens on', 'cliedesk' ) }
							value={ rule.mode }
							onChange={ ( v ) =>
								editMode( i, { mode: v as PageMode[ 'mode' ] } )
							}
							options={ [
								{
									id: 'search',
									label: __( 'Search first', 'cliedesk' ),
								},
								{
									id: 'form',
									label: __( 'Form first', 'cliedesk' ),
								},
							] }
						/>
						{ rule.mode === 'form' && (
							<TextField
								label={ __( 'Form (type key)', 'cliedesk' ) }
								maxLength={ 64 }
								value={ rule.type }
								onChange={ ( v ) => editMode( i, { type: v } ) }
							/>
						) }
						<IconButton
							label={ sprintf(
								/* translators: %d: rule position. */
								__( 'Remove page rule %d', 'cliedesk' ),
								i + 1
							) }
							icon={ <X size={ 14 } /> }
							onPress={ () =>
								setModes( m.filter( ( _, n ) => n !== i ) )
							}
						/>
					</li>
				) ) }
			</ol>
			<div className="flex gap-2">
				<Button
					onPress={ () =>
						setModes( [
							...m,
							{ pattern: '', mode: 'search', type: 'request' },
						] )
					}
				>
					{ __( 'Add a page rule', 'cliedesk' ) }
				</Button>
				<Button
					onPress={ () =>
						setCards( [
							...c,
							{
								type: 'start',
								title: '',
								text: '',
								url: '',
								audience: 'all',
							},
						] )
					}
				>
					{ __( 'Add a card', 'cliedesk' ) }
				</Button>
				<Button
					variant="primary"
					isDisabled={ ! spaces && ! first && ! cards && ! modes }
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save spaces and cards', 'cliedesk' ) }
				</Button>
			</div>
		</section>
	);
}
