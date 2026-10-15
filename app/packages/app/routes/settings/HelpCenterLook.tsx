/**
 * Settings → Help center → Look (KB-35): title, logo, accent colour, columns, card style and colours, without code.
 * Empty values follow the theme; the accent is adjusted on the site so text stays readable (WCAG AA).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Select, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

export function HelpCenterLook() {
	const q = useQuery( settingsQuery( 'knowledge' ) );
	if ( ! q.data ) {
		return null;
	}
	const v = ( k: string, d: unknown ) => q.data?.values?.[ k ]?.value ?? d;
	return (
		<LookForm
			key={ String( q.data.etag ) }
			hero={ String( v( 'brand_hero', '' ) ) }
			logo={ String( v( 'brand_logo', '' ) ) }
			accent={ String( v( 'brand_accent', '' ) ) }
			columns={ String( v( 'brand_columns', 0 ) ) }
			cards={ String( v( 'brand_cards', 'outline' ) ) }
			scheme={ String( v( 'brand_scheme', 'theme' ) ) }
			etag={ q.data.etag ?? undefined }
		/>
	);
}

function LookForm( props: {
	hero: string;
	logo: string;
	accent: string;
	columns: string;
	cards: string;
	scheme: string;
	etag: string | undefined;
} ) {
	const qc = useQueryClient();
	const [ hero, setHero ] = useState( props.hero );
	const [ logo, setLogo ] = useState( props.logo );
	const [ accent, setAccent ] = useState( props.accent );
	const [ columns, setColumns ] = useState( props.columns );
	const [ cards, setCards ] = useState( props.cards );
	const [ scheme, setScheme ] = useState( props.scheme );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/knowledge', {
				body: {
					values: {
						brand_hero: hero.trim(),
						brand_logo: logo.trim(),
						brand_accent: accent.trim().toLowerCase(),
						brand_columns: Number( columns ),
						brand_cards: cards,
						brand_scheme: scheme,
					},
				},
				ifMatch: props.etag,
			} ),
		onSuccess: () => {
			announceResult( __( 'Help center look saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'knowledge' ],
			} );
		},
	} );
	const fields = apiFieldErrors( save.error );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<form
			noValidate
			onSubmit={ onSubmit }
			className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
		>
			<h2 className="text-base font-semibold">
				{ __( 'Look', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Leave a field empty to follow your theme. Colours are adjusted on the site so text stays easy to read.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ save.error } />
			<div className="grid gap-3 sm:grid-cols-2">
				<TextField
					label={ __( 'Title', 'cliedesk' ) }
					description={ __( 'Empty: How can we help?', 'cliedesk' ) }
					maxLength={ 120 }
					value={ hero }
					onChange={ setHero }
					errorMessage={ fields.brand_hero ?? null }
				/>
				<TextField
					label={ __( 'Logo address', 'cliedesk' ) }
					description={ __(
						'An image from your media library, e.g. https://…/logo.png',
						'cliedesk'
					) }
					maxLength={ 500 }
					value={ logo }
					onChange={ setLogo }
					errorMessage={ fields.brand_logo ?? null }
				/>
				<TextField
					label={ __( 'Accent colour', 'cliedesk' ) }
					description={ __(
						'For links and the search button, e.g. #2563eb',
						'cliedesk'
					) }
					maxLength={ 7 }
					value={ accent }
					onChange={ setAccent }
					errorMessage={ fields.brand_accent ?? null }
				/>
				<Select
					label={ __( 'Colours', 'cliedesk' ) }
					value={ scheme }
					onChange={ setScheme }
					options={ [
						{
							id: 'theme',
							label: __( 'Like the theme', 'cliedesk' ),
						},
						{ id: 'light', label: __( 'Light', 'cliedesk' ) },
						{ id: 'dark', label: __( 'Dark', 'cliedesk' ) },
						{
							id: 'auto',
							label: __(
								'Light or dark, like the visitor’s device',
								'cliedesk'
							),
						},
					] }
				/>
				<Select
					label={ __( 'Category columns', 'cliedesk' ) }
					value={ columns }
					onChange={ setColumns }
					options={ [
						{ id: '0', label: __( 'Automatic', 'cliedesk' ) },
						{ id: '1', label: '1' },
						{ id: '2', label: '2' },
						{ id: '3', label: '3' },
					] }
				/>
				<Select
					label={ __( 'Category cards', 'cliedesk' ) }
					value={ cards }
					onChange={ setCards }
					options={ [
						{ id: 'outline', label: __( 'Outlined', 'cliedesk' ) },
						{ id: 'filled', label: __( 'Filled', 'cliedesk' ) },
						{ id: 'plain', label: __( 'Plain', 'cliedesk' ) },
					] }
				/>
			</div>
			<div>
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save look', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}
