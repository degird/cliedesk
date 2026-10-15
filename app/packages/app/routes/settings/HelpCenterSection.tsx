/**
 * Settings → Workspace → Help center: its web address, the author line on articles (KB-11) and what the address of
 * an archived article does (KB-07), search synonyms (KB-14) and the home layout (KB-16). Articles themselves are written in the WordPress block editor.
 * Cliedesk Pro fills the slots `knowledge.access` (who can open the help center, KB-18/19) and
 * `knowledge.import_files` (article import from files, KB-10); `knowledge.importers` is for other help desks.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	LoadingRegion,
	Select,
	Slot,
	Switch,
	TextField,
} from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult, apiFieldErrors } from '../../workspace/forms';
import { CategoryLimits } from './CategoryLimits';
import { HelpCenterLook } from './HelpCenterLook';
import { SiteKnowledge } from './SiteKnowledge';
import { WebKnowledge } from './WebKnowledge';
import { FileKnowledge } from './FileKnowledge';
import { FailedSearches } from './FailedSearches';
import { SuggestionSettings } from './Suggestions';

export default function HelpCenterSection() {
	const q = useQuery( settingsQuery( 'knowledge' ) );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const v = ( k: string, d: unknown ) => q.data?.values?.[ k ]?.value ?? d;
	return (
		<div className="flex flex-col gap-4">
			<HelpCenterForm
				key={ String( q.data.etag ) }
				slug={ String( v( 'base_slug', 'help' ) ) }
				author={ !! v( 'show_author', false ) }
				comments={ !! v( 'comments', false ) }
				unpublished={ String( v( 'unpublished', '410' ) ) }
				synonyms={ String( v( 'synonyms', '' ) ) }
				layout={ String( v( 'home_layout', 'categories' ) ) }
				redirects={ String( v( 'redirects', '' ) ) }
				etag={ q.data.etag ?? undefined }
			/>
			<HelpCenterLook />
			<Slot name="knowledge.access" />
			<CategoryLimits />
			<Slot name="knowledge.import_files" />
			<Slot name="knowledge.importers" />
			<SiteKnowledge />
			<FileKnowledge />
			<WebKnowledge />
			<SuggestionSettings />
			<FailedSearches />
		</div>
	);
}

function HelpCenterForm( props: {
	slug: string;
	author: boolean;
	comments: boolean;
	unpublished: string;
	synonyms: string;
	layout: string;
	redirects: string;
	etag: string | undefined;
} ) {
	const qc = useQueryClient();
	const [ slug, setSlug ] = useState( props.slug );
	const [ author, setAuthor ] = useState( props.author );
	const [ comments, setComments ] = useState( props.comments );
	const [ unpublished, setUnpublished ] = useState( props.unpublished );
	const [ synonyms, setSynonyms ] = useState( props.synonyms );
	const [ layout, setLayout ] = useState( props.layout );
	const [ redirects, setRedirects ] = useState( props.redirects );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/knowledge', {
				body: {
					values: {
						base_slug: slug.trim(),
						show_author: author,
						comments,
						unpublished,
						synonyms,
						home_layout: layout,
						redirects,
					},
				},
				ifMatch: props.etag,
			} ),
		onSuccess: () => {
			announceResult( __( 'Help center settings saved.', 'cliedesk' ) );
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
			<p className="text-sm text-fg-muted">
				{ __(
					'Write and organise articles in WordPress under Cliedesk → Help articles.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ save.error } />
			<TextField
				label={ __( 'Web address', 'cliedesk' ) }
				description={ __(
					'For example help for example.com/help/. Old addresses keep working. Add search to any page with the Help search block or [cliedesk_help_search].',
					'cliedesk'
				) }
				value={ slug }
				onChange={ setSlug }
				maxLength={ 40 }
				errorMessage={ fields.base_slug ?? null }
			/>
			<Switch isSelected={ author } onChange={ setAuthor }>
				{ __(
					'Show the author and last update on articles',
					'cliedesk'
				) }
			</Switch>
			<Switch isSelected={ comments } onChange={ setComments }>
				{ __(
					'Let visitors comment on articles and get emails when an article changes',
					'cliedesk'
				) }
			</Switch>
			<Select
				label={ __( 'Address of an archived article', 'cliedesk' ) }
				value={ unpublished }
				onChange={ setUnpublished }
				options={ [
					{
						id: '410',
						label: __( 'Say it is gone (410)', 'cliedesk' ),
					},
					{
						id: 'redirect',
						label: __(
							'Send visitors to the help center home',
							'cliedesk'
						),
					},
				] }
			/>
			<Select
				label={ __( 'Help center home', 'cliedesk' ) }
				value={ layout }
				onChange={ setLayout }
				options={ [
					{
						id: 'categories',
						label: __(
							'Categories first, then popular articles',
							'cliedesk'
						),
					},
					{
						id: 'popular',
						label: __(
							'Popular articles first, then categories',
							'cliedesk'
						),
					},
				] }
			/>
			<TextField
				label={ __( 'Search synonyms', 'cliedesk' ) }
				description={ __(
					'One group per line, e.g. parcel = package, delivery. Searching one word finds the others.',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				maxLength={ 5000 }
				value={ synonyms }
				onChange={ setSynonyms }
			/>
			<TextField
				label={ __( 'Redirects', 'cliedesk' ) }
				description={ __(
					'One per line: the old address, a space, then the new address on this site, e.g. /faq/returns /help/returns/. Changed article addresses redirect by themselves.',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				maxLength={ 50000 }
				value={ redirects }
				onChange={ setRedirects }
				errorMessage={ fields.redirects ?? null }
			/>
			<div>
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save help center', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}
