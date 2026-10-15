/**
 * Settings → Workspace → Languages (BRD-29/35), for people with cliedesk_manage_settings.
 *
 * - GET languages → {items: [{code, tag, name, isDefault}], source}. The default language is always first and
 *   always active.
 * - PUT languages {codes} saves the other languages (400 with `fields['codes.N']` for a bad code, shown on that
 *   row). When `source` is not `cliedesk` (WPML, Polylang, TranslatePress), the list is read-only and a save answers
 *   409: "Managed by your multilingual plugin".
 * - GET languages/coverage → {items: [{code, missing: {saved_replies: n, …}}]}: a table of shared content still
 *   missing each language. With cliedesk_manage_team_replies each row offers "Add starter replies"
 *   (POST saved-replies/starters/install {language}, MAC-15).
 * - GET languages/available → {items: [{code, name}]}: the searchable picker of languages to add. Typing a code stays
 *   possible as a fallback (for example when the list cannot be loaded).
 */
import {
	api,
	can,
	isApiError,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Banner, Button, LoadingRegion, TextField } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
	ActionError,
	Muted,
	Pill,
	QueryFailed,
	actionMessage,
} from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

interface Language {
	code: string;
	tag: string;
	name: string;
	isDefault: boolean;
}

interface LanguageList {
	items: Language[];
	source: string;
}

interface Coverage {
	code: string;
	missing: Record< string, number >;
}

const languageKeys = {
	list: [ 'languages' ] as const,
	coverage: [ 'languages', 'coverage' ] as const,
	available: [ 'languages', 'available' ] as const,
};

export interface AvailableLanguage {
	code: string;
	name: string;
}

const availableQuery = () =>
	queryOptions( {
		queryKey: languageKeys.available,
		queryFn: async ( { signal } ): Promise< AvailableLanguage[] > => {
			const d = (
				await api.get< { items?: AvailableLanguage[] } >(
					'languages/available',
					{ signal }
				)
			).data;
			return Array.isArray( d?.items )
				? d.items.filter(
						( l ) =>
							l &&
							typeof l.code === 'string' &&
							typeof l.name === 'string'
					)
				: [];
		},
		staleTime: Infinity,
		retry: false,
	} );

const MAX_MATCHES = 8;

/**
 * Languages matching a search (name or code), leaving out those already chosen.
 *
 * @param all   Available languages.
 * @param q     Search.
 * @param taken Codes already on the list.
 */
export function matchLanguages(
	all: AvailableLanguage[],
	q: string,
	taken: string[]
): AvailableLanguage[] {
	const s = q.trim().toLowerCase().replace( '-', '_' );
	if ( ! s ) {
		return [];
	}
	const free = all.filter( ( l ) => ! taken.includes( l.code ) );
	const starts = free.filter(
		( l ) =>
			l.name.toLowerCase().startsWith( s ) ||
			l.code.toLowerCase().startsWith( s )
	);
	const contains = free.filter(
		( l ) => ! starts.includes( l ) && l.name.toLowerCase().includes( s )
	);
	return [ ...starts, ...contains ].slice( 0, MAX_MATCHES );
}

const languagesQuery = () =>
	queryOptions( {
		queryKey: languageKeys.list,
		queryFn: async ( { signal } ): Promise< LanguageList > => {
			const d = (
				await api.get< Partial< LanguageList > >( 'languages', {
					signal,
				} )
			).data;
			return {
				items: Array.isArray( d?.items ) ? d.items : [],
				source: typeof d?.source === 'string' ? d.source : 'cliedesk',
			};
		},
	} );

const coverageQuery = () =>
	queryOptions( {
		queryKey: languageKeys.coverage,
		queryFn: async ( { signal } ): Promise< Coverage[] > => {
			const d = (
				await api.get< { items?: Coverage[] } >( 'languages/coverage', {
					signal,
				} )
			).data;
			return Array.isArray( d?.items ) ? d.items : [];
		},
	} );

/**
 * Name of the plugin that manages languages.
 *
 * @param source Source key.
 */
function pluginName( source: string ): string {
	switch ( source ) {
		case 'wpml':
			return 'WPML';
		case 'polylang':
			return 'Polylang';
		case 'translatepress':
			return 'TranslatePress';
		default:
			return source;
	}
}

/**
 * Label of a content surface in the coverage report.
 *
 * @param key Surface key.
 */
function surfaceLabel( key: string ): string {
	switch ( key ) {
		case 'saved_replies':
			return __( 'Saved replies', 'cliedesk' );
		case 'articles':
			return __( 'Help center articles', 'cliedesk' );
		case 'email_templates':
			return __( 'Email templates', 'cliedesk' );
		case 'widget_texts':
			return __( 'Chat widget texts', 'cliedesk' );
		default: {
			const words = key.replace( /[_-]+/g, ' ' ).trim();
			return words.charAt( 0 ).toUpperCase() + words.slice( 1 );
		}
	}
}

/**
 * Language name for a code the server has not named yet (in the page language), or the code.
 *
 * @param code Code such as pt_BR.
 */
function displayName( code: string ): string {
	try {
		const lang = document.documentElement.lang || undefined;
		return (
			new Intl.DisplayNames( lang ? [ lang ] : undefined, {
				type: 'language',
			} ).of( code.replace( '_', '-' ) ) ?? code
		);
	} catch {
		return code;
	}
}

function LanguageEditor( {
	list,
	managed,
	onManaged,
}: {
	list: LanguageList;
	managed: boolean;
	onManaged: () => void;
} ) {
	const qc = useQueryClient();
	const def = list.items.find( ( l ) => l.isDefault ) ?? null;
	const [ codes, setCodes ] = useState< string[] >( () =>
		list.items.filter( ( l ) => ! l.isDefault ).map( ( l ) => l.code )
	);
	const [ adding, setAdding ] = useState( '' );
	const [ addError, setAddError ] = useState< string | null >( null );
	const [ search, setSearch ] = useState( '' );
	const available = useQuery( { ...availableQuery(), enabled: ! managed } );
	const [ dirty, setDirty ] = useState( false );
	const save = useMutation( {
		mutationFn: ( next: string[] ) =>
			api.put< { items: Language[] } >( 'languages', {
				body: { codes: next },
			} ),
		onSuccess: ( r ) => {
			setDirty( false );
			qc.setQueryData< LanguageList >( languageKeys.list, ( old ) => ( {
				source: old?.source ?? 'cliedesk',
				items: Array.isArray( r.data?.items )
					? r.data.items
					: ( old?.items ?? [] ),
			} ) );
			void qc.invalidateQueries( { queryKey: languageKeys.coverage } );
			announceResult( __( 'Languages saved.', 'cliedesk' ) );
		},
		onError: ( e ) => {
			if ( isApiError( e ) && e.status === 409 ) {
				onManaged();
			}
		},
	} );
	const fields =
		isApiError( save.error ) && save.error.status === 400
			? save.error.fields
			: {};
	const rowError = ( i: number ) => fields[ `codes.${ i }` ] ?? null;
	const otherErrors =
		save.error &&
		! Object.keys( fields ).some( ( k ) => k.startsWith( 'codes' ) );
	const named = new Map( [
		...( available.data ?? [] ).map( ( l ) => [ l.code, l.name ] as const ),
		...list.items.map( ( l ) => [ l.code, l.name ] as const ),
	] );

	const addCode = ( code: string, name: string ) => {
		setCodes( ( c ) => [ ...c, code ] );
		setDirty( true );
		announceResult(
			sprintf(
				/* translators: %s: language name. */
				__( '%s added. Save to apply.', 'cliedesk' ),
				name
			)
		);
	};
	const taken = [ ...( def ? [ def.code ] : [] ), ...codes ];
	const matches = matchLanguages( available.data ?? [], search, taken );
	const add = ( e: FormEvent ) => {
		e.preventDefault();
		const code = adding.trim();
		if ( ! /^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$/.test( code ) ) {
			setAddError(
				__(
					'Use a language code such as de, pt_BR or fr-CA.',
					'cliedesk'
				)
			);
			return;
		}
		if ( code === def?.code || codes.includes( code ) ) {
			setAddError(
				__( 'This language is already on the list.', 'cliedesk' )
			);
			return;
		}
		setAddError( null );
		setAdding( '' );
		addCode(
			code,
			( available.data ?? [] ).find( ( l ) => l.code === code )?.name ??
				displayName( code )
		);
	};

	return (
		<section
			aria-labelledby="cd-languages-active"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-languages-active" className="font-semibold">
				{ __( 'Active languages', 'cliedesk' ) }
			</h2>
			{ managed && (
				<Banner
					tone="info"
					title={ __(
						'Managed by your multilingual plugin',
						'cliedesk'
					) }
				>
					{ list.source !== 'cliedesk'
						? sprintf(
								/* translators: %s: plugin name such as WPML. */
								__(
									'%s decides which languages are active. Change them there.',
									'cliedesk'
								),
								pluginName( list.source )
							)
						: __(
								'Change the active languages in your multilingual plugin.',
								'cliedesk'
							) }
				</Banner>
			) }
			{ otherErrors && save.error ? (
				<ActionError
					error={ save.error }
					onDismiss={ () => save.reset() }
				/>
			) : null }
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ def && (
					<li className="flex flex-wrap items-center gap-2 px-3 py-2">
						<span className="font-medium">
							<bdi>{ def.name }</bdi>
						</span>
						<span className="font-mono text-sm text-fg-muted">
							{ def.code }
						</span>
						<Pill tone="accent">
							{ __( 'Default', 'cliedesk' ) }
						</Pill>
					</li>
				) }
				{ codes.map( ( code, i ) => {
					const name = named.get( code ) ?? displayName( code );
					const err = rowError( i );
					return (
						<li
							key={ code }
							className="flex flex-col gap-1 px-3 py-2"
						>
							<span className="flex flex-wrap items-center gap-2">
								<span className="font-medium">
									<bdi>{ name }</bdi>
								</span>
								<span className="font-mono text-sm text-fg-muted">
									{ code }
								</span>
								{ ! managed && (
									<Button
										size="sm"
										variant="ghost"
										className="ms-auto"
										aria-label={ sprintf(
											/* translators: %s: language name. */
											__( 'Remove %s', 'cliedesk' ),
											name
										) }
										onPress={ () => {
											setCodes( ( c ) =>
												c.filter( ( x ) => x !== code )
											);
											setDirty( true );
											save.reset();
										} }
									>
										{ __( 'Remove', 'cliedesk' ) }
									</Button>
								) }
							</span>
							{ err && (
								<p role="alert" className="text-sm text-danger">
									{ err }
								</p>
							) }
						</li>
					);
				} ) }
			</ul>
			{ ! managed && (
				<>
					{ ( available.data ?? [] ).length > 0 && (
						<div
							role="search"
							aria-label={ __( 'Find a language', 'cliedesk' ) }
							className="flex max-w-md flex-col gap-2"
						>
							<TextField
								label={ __( 'Find a language', 'cliedesk' ) }
								description={ __(
									'Type a language name or code, then pick it from the results.',
									'cliedesk'
								) }
								inputMode="search"
								value={ search }
								onChange={ setSearch }
							/>
							<p role="status" className="sr-only">
								{ search.trim()
									? sprintf(
											/* translators: %d: number of languages found. */
											_n(
												'%d language found.',
												'%d languages found.',
												matches.length,
												'cliedesk'
											),
											matches.length
										)
									: '' }
							</p>
							{ search.trim() !== '' &&
								( matches.length ? (
									<ul
										aria-label={ __(
											'Matching languages',
											'cliedesk'
										) }
										className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface"
									>
										{ matches.map( ( l ) => (
											<li
												key={ l.code }
												className="flex items-center gap-2 px-3 py-1.5"
											>
												<span className="min-w-0 flex-1">
													<bdi>{ l.name }</bdi>{ ' ' }
													<span className="font-mono text-sm text-fg-muted">
														{ l.code }
													</span>
												</span>
												<Button
													size="sm"
													aria-label={ sprintf(
														/* translators: %s: language name. */
														__(
															'Add %s',
															'cliedesk'
														),
														l.name
													) }
													onPress={ () => {
														addCode(
															l.code,
															l.name
														);
														setSearch( '' );
													} }
												>
													{ __( 'Add', 'cliedesk' ) }
												</Button>
											</li>
										) ) }
									</ul>
								) : (
									<Muted>
										{ __(
											'No language matches. You can still type its code below.',
											'cliedesk'
										) }
									</Muted>
								) ) }
						</div>
					) }
					<form
						noValidate
						onSubmit={ add }
						aria-label={ __( 'Add a language', 'cliedesk' ) }
						className="flex flex-wrap items-start gap-2"
					>
						<TextField
							className="min-w-48"
							label={ __( 'Language code', 'cliedesk' ) }
							description={ __(
								'For example de, pt_BR or fr-CA.',
								'cliedesk'
							) }
							value={ adding }
							onChange={ ( v ) => {
								setAdding( v );
								setAddError( null );
							} }
							maxLength={ 20 }
							errorMessage={ addError }
						/>
						<Button
							type="submit"
							className="mt-6"
							iconStart={
								<Plus aria-hidden="true" size={ 16 } />
							}
						>
							{ __( 'Add', 'cliedesk' ) }
						</Button>
					</form>
					<div className="flex items-center gap-3">
						<Button
							variant="primary"
							isLoading={ save.isPending }
							isDisabled={ ! dirty }
							onPress={ () => save.mutate( codes ) }
						>
							{ __( 'Save languages', 'cliedesk' ) }
						</Button>
						{ dirty && (
							<p className="text-sm text-fg-muted">
								{ __(
									'You have unsaved changes.',
									'cliedesk'
								) }
							</p>
						) }
					</div>
				</>
			) }
		</section>
	);
}

/**
 * "Add starter replies" for one language (MAC-15): POST saved-replies/starters/install {language} adds a version in
 * that language to each starter reply that has none (the WordPress translation when installed), never overwriting.
 *
 * @param props      Props.
 * @param props.code Language code.
 * @param props.name Language name.
 */
function InstallStarters( { code, name }: { code: string; name: string } ) {
	const qc = useQueryClient();
	const install = useMutation( {
		mutationFn: () =>
			api.post< { added: number } >( 'saved-replies/starters/install', {
				body: { language: code },
			} ),
		onSuccess: ( r ) => {
			const added = Number( r.data?.added ?? 0 );
			announceResult(
				added
					? sprintf(
							/* translators: 1: number of replies, 2: language name. */
							_n(
								'Added %1$d starter reply in %2$s.',
								'Added %1$d starter replies in %2$s.',
								added,
								'cliedesk'
							),
							added,
							name
						)
					: sprintf(
							/* translators: %s: language name. */
							__(
								'The starter replies are already in %s.',
								'cliedesk'
							),
							name
						)
			);
			void qc.invalidateQueries( { queryKey: languageKeys.coverage } );
		},
	} );
	return (
		<span className="inline-flex flex-col items-end gap-1">
			<Button
				size="sm"
				isLoading={ install.isPending }
				onPress={ () => install.mutate() }
				aria-label={ sprintf(
					/* translators: %s: language name. */
					__( 'Add starter replies in %s', 'cliedesk' ),
					name
				) }
			>
				{ __( 'Add starter replies', 'cliedesk' ) }
			</Button>
			{ install.isError && (
				<span role="alert" className="text-xs text-danger">
					{ actionMessage( install.error ) }
				</span>
			) }
		</span>
	);
}

function CoverageTable( {
	names,
	defaultCode,
}: {
	names: Map< string, string >;
	defaultCode: string | null;
} ) {
	const q = useQuery( coverageQuery() );
	const starters = can( 'cliedesk_manage_team_replies' );
	const surfaces = [
		...new Set(
			( q.data ?? [] ).flatMap( ( c ) => Object.keys( c.missing ?? {} ) )
		),
	];
	return (
		<section
			aria-labelledby="cd-languages-coverage"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-languages-coverage" className="font-semibold">
				{ __( 'Missing translations', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'How many shared items have no version in each language. Customers then get the version in the default language.',
					'cliedesk'
				) }
			</p>
			{ q.isPending && <LoadingRegion /> }
			{ q.isError && (
				<QueryFailed
					headingLevel={ 3 }
					title={ __(
						'Could not load the missing translations',
						'cliedesk'
					) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			) }
			{ q.isSuccess && ! q.data.length && (
				<Muted>{ __( 'Nothing to report.', 'cliedesk' ) }</Muted>
			) }
			{ q.isSuccess && q.data.length > 0 && (
				<div className="overflow-x-auto rounded-lg border border-line bg-surface">
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ __(
								'Missing translations by language',
								'cliedesk'
							) }
						</caption>
						<thead className="border-b border-line text-fg-muted">
							<tr>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									{ __( 'Language', 'cliedesk' ) }
								</th>
								{ surfaces.map( ( s ) => (
									<th
										key={ s }
										scope="col"
										className="px-3 py-2 text-end font-medium"
									>
										{ surfaceLabel( s ) }
									</th>
								) ) }
								{ starters && (
									<th
										scope="col"
										className="px-3 py-2 text-end font-medium"
									>
										<span className="sr-only">
											{ __(
												'Starter replies',
												'cliedesk'
											) }
										</span>
									</th>
								) }
							</tr>
						</thead>
						<tbody>
							{ q.data.map( ( c ) => (
								<tr
									key={ c.code }
									className="border-b border-line last:border-b-0"
								>
									<th
										scope="row"
										className="px-3 py-2 text-start font-medium"
									>
										<bdi>
											{ names.get( c.code ) ??
												displayName( c.code ) }
										</bdi>
									</th>
									{ surfaces.map( ( s ) => {
										const n = Number(
											c.missing?.[ s ] ?? 0
										);
										return (
											<td
												key={ s }
												className={ `cd-tabular px-3 py-2 text-end ${
													n > 0
														? 'text-warning'
														: 'text-fg-muted'
												}` }
											>
												{ n }
											</td>
										);
									} ) }
									{ starters && (
										<td className="px-3 py-2 text-end">
											{ c.code !== defaultCode && (
												<InstallStarters
													code={ c.code }
													name={
														names.get( c.code ) ??
														displayName( c.code )
													}
												/>
											) }
										</td>
									) }
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
			) }
		</section>
	);
}

/**
 * Section.
 */
export default function LanguagesSection() {
	const q = useQuery( languagesQuery() );
	const [ forcedManaged, setForcedManaged ] = useState( false );
	if ( q.isPending ) {
		return (
			<LoadingRegion label={ __( 'Loading languages…', 'cliedesk' ) } />
		);
	}
	if ( q.isError ) {
		return (
			<QueryFailed
				title={ __( 'Could not load the languages', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	const managed = forcedManaged || q.data.source !== 'cliedesk';
	const names = new Map( q.data.items.map( ( l ) => [ l.code, l.name ] ) );
	return (
		<div className="flex flex-col gap-8">
			<LanguageEditor
				key={
					q.data.items.map( ( l ) => l.code ).join( ',' ) +
					q.data.source
				}
				list={ q.data }
				managed={ managed }
				onManaged={ () => {
					setForcedManaged( true );
					void q.refetch();
				} }
			/>
			<CoverageTable
				names={ names }
				defaultCode={
					q.data.items.find( ( l ) => l.isDefault )?.code ?? null
				}
			/>
		</div>
	);
}
