/**
 * Settings → Developer → Add-on settings (DEV-18): one form per section that plugins added with
 * `cliedesk_register_settings_section()`, built from the field schema.
 *
 * - GET extension-settings → {items: [{module, title, description, fields}]}.
 * - GET settings/{module} → {key: {value}}; PATCH settings/{module} {values}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, LoadingRegion, Select, Switch, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Field {
	key: string;
	label: string;
	help: string;
	type: 'bool' | 'int' | 'string' | 'enum';
	min: number | null;
	max: number | null;
	choices: string[];
}

interface Section {
	module: string;
	title: string;
	description: string;
	fields: Field[];
}

function SectionForm( { section }: { section: Section } ) {
	const qc = useQueryClient();
	const key = [ 'settings', section.module ];
	const q = useQuery( {
		queryKey: key,
		queryFn: async ( { signal } ) =>
			(
				await api.get< Record< string, { value: unknown } > >(
					`settings/${ section.module }`,
					{ signal }
				)
			).data ?? {},
	} );
	const [ draft, setDraft ] = useState< Record< string, unknown > >( {} );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( `settings/${ section.module }`, {
				body: { values: draft },
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: key } );
		},
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const value = ( k: string ) =>
		k in draft ? draft[ k ] : q.data?.[ k ]?.value;
	const set = ( k: string, v: unknown ) =>
		setDraft( ( d ) => ( { ...d, [ k ]: v } ) );
	return (
		<form
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
			onSubmit={ ( e ) => {
				e.preventDefault();
				save.mutate();
			} }
		>
			<h3 className="font-semibold">{ section.title }</h3>
			{ section.description && <Muted>{ section.description }</Muted> }
			<ActionError error={ save.error } />
			{ section.fields.map( ( f ) => {
				if ( f.type === 'bool' ) {
					return (
						<Switch
							key={ f.key }
							isSelected={ Boolean( value( f.key ) ) }
							onChange={ ( on ) => set( f.key, on ) }
						>
							{ f.label }
						</Switch>
					);
				}
				if ( f.type === 'enum' ) {
					return (
						<Select
							key={ f.key }
							label={ f.label }
							description={ f.help || undefined }
							value={ String( value( f.key ) ?? '' ) }
							onChange={ ( v ) => set( f.key, v ) }
							options={ f.choices.map( ( c ) => ( {
								id: c,
								label: c,
							} ) ) }
						/>
					);
				}
				return (
					<TextField
						key={ f.key }
						label={ f.label }
						description={ f.help || undefined }
						type={ f.type === 'int' ? 'number' : undefined }
						value={ String( value( f.key ) ?? '' ) }
						onChange={ ( v ) =>
							set( f.key, f.type === 'int' ? Number( v ) : v )
						}
					/>
				);
			} ) }
			<Button
				type="submit"
				variant="primary"
				className="self-start"
				isDisabled={ Object.keys( draft ).length === 0 }
				isLoading={ save.isPending }
			>
				{ __( 'Save', 'cliedesk' ) }
			</Button>
		</form>
	);
}

export default function AddonSettingsSection() {
	const q = useQuery( {
		queryKey: [ 'extension-settings' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Section[] } >( 'extension-settings', {
					signal,
				} )
			).data?.items ?? [],
	} );
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	const items = q.data ?? [];
	return (
		<div className="flex flex-col gap-4">
			{ items.length === 0 && (
				<Muted>
					{ __(
						'No add-on has settings here yet. Add-ons can add them with cliedesk_register_settings_section().',
						'cliedesk'
					) }
				</Muted>
			) }
			{ items.map( ( s ) => (
				<SectionForm key={ s.module } section={ s } />
			) ) }
		</div>
	);
}
