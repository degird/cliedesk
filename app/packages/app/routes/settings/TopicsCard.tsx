/**
 * Settings → Custom fields → Topics (TRI-05, TRI-26): add the topics of a preset (WooCommerce store, plugin or SaaS
 * vendor, membership or courses, services) and edit the keyword lists that set Topic, Intent and Urgency when a
 * customer writes them.
 *
 * - GET triage/presets → {items: [{key, label, groups: [{key, label, topics}]}], detected}.
 * - POST triage/presets {preset} → {added}.
 * - GET/PATCH settings/triage → keywords: {field: {option: "word, word"}}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';
import { TopicCuration } from './TopicCuration';

type Lists = Record< string, Record< string, string | string[] > >;

interface Preset {
	key: string;
	label: string;
	groups: { key: string; label: string; topics: number }[];
}

/**
 * Keyword lists as lines: `topic.billing = invoice, refund`.
 *
 * @param lists Lists.
 */
export function listsToText( lists: Lists ): string {
	return Object.entries( lists )
		.flatMap( ( [ field, options ] ) =>
			Object.entries( options ).map(
				( [ option, words ] ) =>
					`${ field }.${ option } = ${
						Array.isArray( words ) ? words.join( ', ' ) : words
					}`
			)
		)
		.join( '\n' );
}

/**
 * Lines back to lists; lines without `field.option = words` are skipped.
 *
 * @param text Text.
 */
export function textToLists( text: string ): Lists {
	const out: Lists = {};
	for ( const line of text.split( '\n' ) ) {
		const m = /^\s*([a-z0-9_]+)\.([a-z0-9_-]+)\s*=\s*(.+)$/i.exec( line );
		const [ , field, option, words ] = m ?? [];
		if ( field && option && words ) {
			out[ field ] = { ...out[ field ], [ option ]: words.trim() };
		}
	}
	return out;
}

/**
 * TRI-24: download the taxonomy as JSON, or import one from another site (adds and updates by key).
 */
function Transfer() {
	const qc = useQueryClient();
	const exp = useMutation( {
		mutationFn: () => api.get< unknown >( 'triage/export' ),
		onSuccess: ( r ) => {
			const url = URL.createObjectURL(
				new Blob( [ JSON.stringify( r.data, null, 2 ) ], {
					type: 'application/json',
				} )
			);
			const a = document.createElement( 'a' );
			a.href = url;
			a.download = 'cliedesk-taxonomy.json';
			document.body.appendChild( a );
			a.click();
			a.remove();
			window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
		},
	} );
	const imp = useMutation( {
		mutationFn: async ( file: File ) =>
			api.post< { fields: number; options: number } >( 'triage/import', {
				body: { document: await file.text() },
			} ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: 1: fields created, 2: options added. */
					__(
						'Imported: %1$d fields, %2$d topics and options.',
						'cliedesk'
					),
					r.data.fields,
					r.data.options
				)
			);
			void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
			void qc.invalidateQueries( { queryKey: [ 'settings' ] } );
		},
	} );
	return (
		<div className="flex flex-wrap items-center gap-3">
			<ActionError error={ exp.error ?? imp.error } />
			<Button isLoading={ exp.isPending } onPress={ () => exp.mutate() }>
				{ __( 'Export topics', 'cliedesk' ) }
			</Button>
			<label htmlFor="cd-taxonomy-import" className="text-sm">
				{ __( 'Import topics (JSON)', 'cliedesk' ) }
			</label>
			<input
				id="cd-taxonomy-import"
				type="file"
				accept=".json,application/json"
				className="mt-1 block text-sm"
				onChange={ ( e ) => {
					const file = e.target.files?.[ 0 ];
					if ( file ) {
						imp.mutate( file );
					}
				} }
			/>
		</div>
	);
}

export function TopicsCard() {
	const qc = useQueryClient();
	const presets = useQuery( {
		queryKey: [ 'triage', 'presets' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Preset[]; detected: string } >(
					'triage/presets',
					{ signal }
				)
			).data,
	} );
	const settings = useQuery( settingsQuery( 'triage' ) );
	const [ preset, setPreset ] = useState< string | null >( null );
	const [ draft, setDraft ] = useState< string | null >( null );
	const chosen = preset ?? presets.data?.detected ?? 'services';
	const apply = useMutation( {
		mutationFn: () =>
			api.post< { added: number } >( 'triage/presets', {
				body: { preset: chosen },
			} ),
		onSuccess: ( r ) => {
			announceResult(
				sprintf(
					/* translators: %d: number of topics. */
					__( '%d topics added.', 'cliedesk' ),
					r.data.added
				)
			);
			void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
		},
	} );
	const text =
		draft ??
		listsToText(
			( settings.data?.values?.keywords?.value ?? {} ) as Lists
		);
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/triage', {
				body: { values: { keywords: textToLists( text ) } },
				ifMatch: settings.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( null );
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings' ] } );
		},
	} );
	const current = presets.data?.items?.find( ( p ) => p.key === chosen );
	return (
		<section
			aria-labelledby="cd-topics"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-topics" className="font-semibold">
				{ __( 'Topics', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Topics are grouped (Order → Where is my order). Edit them in the Topic field below. A preset adds its topics and keeps yours.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ apply.error ?? save.error } />
			<div className="flex flex-wrap items-end gap-3">
				<Select
					label={ __( 'Preset', 'cliedesk' ) }
					value={ chosen }
					onChange={ ( k ) => setPreset( k ) }
					options={ ( presets.data?.items ?? [] ).map( ( p ) => ( {
						id: p.key,
						label: p.label,
					} ) ) }
				/>
				<Button
					isLoading={ apply.isPending }
					isDisabled={ ! current }
					onPress={ () => apply.mutate() }
				>
					{ __( 'Add these topics', 'cliedesk' ) }
				</Button>
			</div>
			{ current && (
				<p className="text-sm text-fg-muted">
					{ current.groups
						.map( ( g ) => `${ g.label } (${ g.topics })` )
						.join( ' · ' ) }
				</p>
			) }
			<TopicCuration />
			<Transfer />
			<TextField
				label={ __( 'Keyword lists', 'cliedesk' ) }
				description={ __(
					'One per line: field.option = words. Example: topic.invoice = invoice, receipt. Whole words; up to 3 topics, the first found is the primary. Values an agent set stay.',
					'cliedesk'
				) }
				multiline
				rows={ 5 }
				maxLength={ 20000 }
				value={ text }
				onChange={ setDraft }
			/>
			<Button
				className="self-start"
				variant="primary"
				isDisabled={ draft === null }
				isLoading={ save.isPending }
				onPress={ () => save.mutate() }
			>
				{ __( 'Save', 'cliedesk' ) }
			</Button>
		</section>
	);
}
