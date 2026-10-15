/**
 * Saved reply picker (GET saved-replies?mode=bulk&status=active&q=): search and choose up to 10 saved replies.
 * Used by the inbox bulk bar's "Apply saved reply" (op macro). The composer has no saved-reply picker yet, so this
 * is the first one in the app.
 */
import { api, queryOptions, useQuery } from '@cliedesk/data';
import { Checkbox, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { Muted } from './components';

export const MAX_SAVED_REPLIES = 10;

export interface SavedReplyRef {
	id: number;
	name: string;
	shortcut: string | null;
	category: string | null;
}

export const savedRepliesQuery = ( q: string ) =>
	queryOptions( {
		queryKey: [ 'saved-replies', 'picker', q ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: SavedReplyRef[] } >( 'saved-replies', {
					query: {
						mode: 'bulk',
						status: 'active',
						q: q.trim() || undefined,
						limit: 50,
					},
					signal,
				} )
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

/**
 * Picker.
 *
 * @param props          Props.
 * @param props.value    Chosen ids (in order).
 * @param props.onChange Change.
 * @param props.error    Error.
 */
export function SavedReplyPicker( {
	value,
	onChange,
	error,
}: {
	value: number[];
	onChange: ( ids: number[] ) => void;
	error?: string | null;
} ) {
	const [ q, setQ ] = useState( '' );
	const list = useQuery( savedRepliesQuery( q ) );
	const items = list.data ?? [];
	const full = value.length >= MAX_SAVED_REPLIES;
	return (
		<div className="flex flex-col gap-2">
			<TextField
				label={ __( 'Search saved replies', 'cliedesk' ) }
				inputMode="search"
				value={ q }
				onChange={ setQ }
			/>
			<fieldset className="flex flex-col gap-1">
				<legend className="pb-1 text-sm font-medium">
					{ sprintf(
						/* translators: %d: maximum number of saved replies. */
						__( 'Saved replies (up to %d)', 'cliedesk' ),
						MAX_SAVED_REPLIES
					) }
				</legend>
				{ list.isPending && (
					<Muted>{ __( 'Loading…', 'cliedesk' ) }</Muted>
				) }
				{ list.isSuccess && ! items.length && (
					<Muted>
						{ __( 'No saved replies found.', 'cliedesk' ) }
					</Muted>
				) }
				{ items.map( ( r ) => (
					<Checkbox
						key={ r.id }
						isSelected={ value.includes( r.id ) }
						isDisabled={ full && ! value.includes( r.id ) }
						onChange={ ( on ) =>
							onChange(
								on
									? [ ...value, r.id ]
									: value.filter( ( x ) => x !== r.id )
							)
						}
					>
						{ r.category
							? `${ r.category } / ${ r.name }`
							: r.name }
					</Checkbox>
				) ) }
				{ error && (
					<p role="alert" className="text-sm text-danger">
						{ error }
					</p>
				) }
			</fieldset>
		</div>
	);
}
