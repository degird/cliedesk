/**
 * `/automation/replies/$replyId` (`new` to create): the saved reply editor (MAC-01, MAC-02, MAC-07, MAC-08,
 * MAC-12, MAC-16).
 *
 * - Details: name, shortcut (`!` added by the server), folder (`a::b` nests), status, scope (personal; team and
 *   shared only with cliedesk_manage_team_replies / cliedesk_manage_shared_replies, SavedReplies::can_edit), the
 *   teams of a team reply and, with several products, the products it is limited to.
 * - Reply text per language (variants: language, email subject, text). The text is plain text like the composer
 *   (inbox/html textToHtml / htmlToText); tokens from GET saved-replies/tokens can be inserted.
 * - An internal note, the macro actions (StepsEditor) and where it can be used (modes, channels, types, queues).
 * - Saves send the whole reply (POST, or PATCH with If-Match); server field errors show on the fields. History
 *   (GET …/versions) with restore (POST …/restore), copy and delete (with the references to confirm).
 * - MAC-12: `?conversation=ID&message=ID` (from "Save as saved reply" on a sent reply) pre-fills the text of that
 *   message and the conversation's status, priority, tags and fields as actions (GET conversations/{id}/macro-steps).
 */
import {
	api,
	getBoot,
	isApiError,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	ConfirmDestructive,
	LoadingRegion,
	RadioGroup,
	Select,
	TextField,
} from '@cliedesk/ui';
import {
	Link,
	useNavigate,
	useParams,
	useSearch,
} from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import {
	messagesQuery,
	queuePickerQuery,
	teamsLookupQuery,
	typesQuery,
} from '../../inbox/api';
import { Muted, Pill, QueryFailed } from '../../inbox/components';
import { VersionDiff } from './VersionDiff';
import { htmlToText } from '../../inbox/html';
import {
	channelLabel,
	CHANNEL_KEYS,
	fullTime,
	relativeTime,
} from '../../inbox/labels';
import {
	LANGUAGE,
	MODES,
	SCOPES,
	canEditReply,
	canUseScope,
	copyScope,
	emptyForm,
	formOf,
	modeLabel,
	replyKeys,
	replyPayload,
	replyQuery,
	scopeLabel,
	statusLabel,
	STATUSES,
	tokensQuery,
	validateReply,
	versionsQuery,
	type MacroStep,
	type Reference,
	type ReplyForm,
	type ReplyMode,
	type ReplyScope,
	type ReplyStatus,
	type SavedReply,
	type VariantForm,
} from '../../macros/api';
import { StepsEditor } from '../../macros/StepsEditor';
import { useMultiProduct } from '../../multiProduct';
import { isConflict, versionTag } from '../../workspace/api';
import {
	ConflictBanner,
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	type SummaryItem,
} from '../../workspace/forms';
import { ReplyFilesSection } from './ReplyFilesSection';

const LIST = '/automation/replies';

interface LanguageOption {
	code: string;
	name: string;
}

const languageOptionsQuery = () =>
	queryOptions( {
		queryKey: [ 'languages', 'saved-replies' ] as const,
		queryFn: async ( { signal } ): Promise< LanguageOption[] > => {
			const items = (
				await api.get< { items?: LanguageOption[] } >( 'languages', {
					signal,
				} )
			).data?.items;
			return Array.isArray( items )
				? items.filter(
						( l ) =>
							typeof l?.code === 'string' &&
							LANGUAGE.test( l.code )
					)
				: [];
		},
		staleTime: 5 * 60 * 1000,
		retry: false,
	} );

const macroStepsQuery = ( conversationId: number ) =>
	queryOptions( {
		queryKey: [ 'conversation', conversationId, 'macro-steps' ] as const,
		queryFn: async ( { signal } ) => {
			const steps = (
				await api.get< { steps: MacroStep[] } >(
					`conversations/${ conversationId }/macro-steps`,
					{ signal }
				)
			).data?.steps;
			return Array.isArray( steps ) ? steps : [];
		},
		retry: false,
	} );

/**
 * DOM id of a form field by its error key (`variants.0.html` → the text of the first version).
 *
 * @param key Error key.
 */
export function fieldIdOf( key: string ): string {
	const k = key
		.replace( /\.html$/, '.text' )
		.replace( /^noteHtml$/, 'note' )
		.replace( /^steps\.(\d+)\..*$/, 'steps.$1' );
	const known =
		/^(name|shortcut|category|scope|status|note|teamIds|defaultLanguage|productIds)$/.test(
			k
		) || /^(variants\.\d+\.(language|subject|text)|steps\.\d+)$/.test( k );
	return `cd-reply-${ ( known ? k : 'name' ).replace( /\./g, '-' ) }`;
}

function CheckList< T extends string | number >( {
	id,
	legend,
	description,
	options,
	value,
	onChange,
	isDisabled,
	error,
}: {
	id: string;
	legend: string;
	description?: string;
	options: Array< { id: T; label: string } >;
	value: T[];
	onChange: ( v: T[] ) => void;
	isDisabled?: boolean;
	error?: string;
} ) {
	return (
		<fieldset id={ id } className="flex flex-col gap-1">
			<legend className="pb-1 text-sm font-medium">{ legend }</legend>
			{ description && <Muted>{ description }</Muted> }
			{ options.length ? (
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					{ options.map( ( o ) => (
						<Checkbox
							key={ String( o.id ) }
							isDisabled={ isDisabled }
							isSelected={ value.includes( o.id ) }
							onChange={ ( on ) =>
								onChange(
									on
										? [ ...value, o.id ]
										: value.filter( ( x ) => x !== o.id )
								)
							}
						>
							<bdi>{ o.label }</bdi>
						</Checkbox>
					) ) }
				</div>
			) : (
				<Muted>
					{ __( 'Nothing to choose from yet.', 'cliedesk' ) }
				</Muted>
			) }
			{ error && (
				<p role="alert" className="text-sm text-danger">
					{ error }
				</p>
			) }
		</fieldset>
	);
}

function Section( {
	id,
	title,
	description,
	children,
}: {
	id: string;
	title: string;
	description?: string;
	children: ReactNode;
} ) {
	return (
		<section
			aria-labelledby={ id }
			className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
		>
			<div className="flex flex-col gap-1">
				<h2 id={ id } className="text-lg font-semibold">
					{ title }
				</h2>
				{ description && <Muted>{ description }</Muted> }
			</div>
			{ children }
		</section>
	);
}

function VariantEditor( {
	index,
	variant,
	languages,
	tokens,
	errors,
	isDisabled,
	canRemove,
	onChange,
	onRemove,
}: {
	index: number;
	variant: VariantForm;
	languages: LanguageOption[];
	tokens: string[];
	errors: Record< string, string >;
	isDisabled: boolean;
	canRemove: boolean;
	onChange: ( patch: Partial< VariantForm > ) => void;
	onRemove: () => void;
} ) {
	const name = languageName( variant.language, languages );
	const prefix = `variants.${ index }`;
	return (
		<fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
			<legend className="px-1 text-sm font-semibold">
				{ sprintf(
					/* translators: %s: language name, or "Any language". */
					__( 'Reply text: %s', 'cliedesk' ),
					name
				) }
			</legend>
			<div className="grid gap-3 sm:grid-cols-2">
				<Select
					id={ `cd-reply-variants-${ index }-language` }
					label={ __( 'Language', 'cliedesk' ) }
					value={ variant.language || 'any' }
					isDisabled={ isDisabled }
					errorMessage={ errors[ `${ prefix }.language` ] ?? null }
					options={ [
						{ id: 'any', label: __( 'Any language', 'cliedesk' ) },
						...languages.map( ( l ) => ( {
							id: l.code,
							label: l.name,
						} ) ),
						...( variant.language &&
						! languages.some( ( l ) => l.code === variant.language )
							? [
									{
										id: variant.language,
										label: variant.language,
									},
								]
							: [] ),
					] }
					onChange={ ( v ) =>
						onChange( { language: v === 'any' ? '' : v } )
					}
				/>
				<TextField
					id={ `cd-reply-variants-${ index }-subject` }
					label={ __( 'Email subject', 'cliedesk' ) }
					description={ __(
						'Optional. Used for new email conversations.',
						'cliedesk'
					) }
					maxLength={ 191 }
					isDisabled={ isDisabled }
					value={ variant.subject }
					errorMessage={ errors[ `${ prefix }.subject` ] ?? null }
					onChange={ ( subject ) => onChange( { subject } ) }
				/>
			</div>
			<TextField
				id={ `cd-reply-variants-${ index }-text` }
				label={ __( 'Text', 'cliedesk' ) }
				description={ __(
					'Plain text. A blank line starts a new paragraph. Tokens such as {customer.first_name | "there"} are filled in when the reply is used.',
					'cliedesk'
				) }
				multiline
				rows={ 8 }
				isDisabled={ isDisabled }
				value={ variant.text }
				errorMessage={ errors[ `${ prefix }.text` ] ?? null }
				onChange={ ( text ) => onChange( { text } ) }
			/>
			{ ! isDisabled && (
				<div className="flex flex-wrap items-end gap-3">
					{ tokens.length > 0 && (
						<Select
							className="min-w-56"
							label={ __( 'Insert a token', 'cliedesk' ) }
							value={ null }
							options={ tokens.map( ( t ) => ( {
								id: t,
								label: `{${ t }}`,
							} ) ) }
							onChange={ ( t ) => {
								const sep =
									variant.text && ! /\s$/.test( variant.text )
										? ' '
										: '';
								onChange( {
									text: `${ variant.text }${ sep }{${ t }}`,
								} );
								announceResult(
									sprintf(
										/* translators: %s: token, e.g. {customer.first_name}. */
										__(
											'%s added to the text.',
											'cliedesk'
										),
										`{${ t }}`
									)
								);
							} }
						/>
					) }
					{ canRemove && (
						<Button
							variant="ghost"
							iconStart={
								<Trash2 aria-hidden="true" size={ 14 } />
							}
							onPress={ onRemove }
						>
							{ sprintf(
								/* translators: %s: language name, or "Any language". */
								__( 'Remove the %s version', 'cliedesk' ),
								name
							) }
						</Button>
					) }
				</div>
			) }
		</fieldset>
	);
}

function languageName( code: string, languages: LanguageOption[] ): string {
	if ( ! code ) {
		return __( 'Any language', 'cliedesk' );
	}
	return languages.find( ( l ) => l.code === code )?.name ?? code;
}

function History( {
	reply,
	isDisabled,
}: {
	reply: SavedReply;
	isDisabled: boolean;
} ) {
	const qc = useQueryClient();
	const versions = useQuery( versionsQuery( reply.id ) );
	const [ comparing, setComparing ] = useState< number | null >( null );
	const restore = useMutation( {
		mutationFn: ( version: number ) =>
			api.post< SavedReply >( `saved-replies/${ reply.id }/restore`, {
				body: { version },
			} ),
		onSuccess: ( r, version ) => {
			qc.setQueryData( replyKeys.detail( reply.id ), r.data );
			void qc.invalidateQueries( { queryKey: replyKeys.all } );
			announceResult(
				sprintf(
					/* translators: %d: version number. */
					__( 'Version %d restored.', 'cliedesk' ),
					version
				)
			);
		},
	} );
	const items = versions.data ?? [];
	const latest = Math.max( 0, ...items.map( ( v ) => v.version ) );
	let body;
	if ( versions.isPending ) {
		body = <LoadingRegion label={ __( 'Loading history…', 'cliedesk' ) } />;
	} else if ( versions.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the history', 'cliedesk' ) }
				error={ versions.error }
				onRetry={ () => void versions.refetch() }
			/>
		);
	} else if ( ! items.length ) {
		body = <Muted>{ __( 'No earlier versions.', 'cliedesk' ) }</Muted>;
	} else {
		body = (
			<ol className="flex flex-col divide-y divide-line">
				{ items.map( ( v ) => (
					<li
						key={ v.version }
						className="flex flex-wrap items-center gap-3 py-2"
					>
						<span className="font-medium">
							{ sprintf(
								/* translators: %d: version number. */
								__( 'Version %d', 'cliedesk' ),
								v.version
							) }
						</span>
						{ v.version === latest && (
							<Pill tone="accent">
								{ __( 'Current', 'cliedesk' ) }
							</Pill>
						) }
						<time
							dateTime={ v.created_at }
							title={ fullTime( v.created_at ) }
							className="text-sm text-fg-muted"
						>
							{ relativeTime( v.created_at ) }
						</time>
						{ v.diff_summary && (
							<span className="text-sm text-fg-muted">
								{ v.diff_summary }
							</span>
						) }
						{ v.version > 1 && (
							<Button
								size="sm"
								variant="ghost"
								className="ms-auto"
								onPress={ () => setComparing( v.version ) }
							>
								{ sprintf(
									/* translators: %d: version number. */
									__( 'Changes in version %d', 'cliedesk' ),
									v.version
								) }
							</Button>
						) }
						{ v.version !== latest && ! isDisabled && (
							<Button
								size="sm"
								className={
									v.version > 1 ? undefined : 'ms-auto'
								}
								isLoading={
									restore.isPending &&
									restore.variables === v.version
								}
								onPress={ () => restore.mutate( v.version ) }
							>
								{ sprintf(
									/* translators: %d: version number. */
									__( 'Restore version %d', 'cliedesk' ),
									v.version
								) }
							</Button>
						) }
					</li>
				) ) }
			</ol>
		);
	}
	return (
		<Section
			id="cd-reply-history"
			title={ __( 'History', 'cliedesk' ) }
			description={ __(
				'Every save is kept. Restoring a version saves it as the newest one.',
				'cliedesk'
			) }
		>
			{ restore.error ? (
				<Banner
					tone="danger"
					role="alert"
					title={ __(
						'Could not restore this version.',
						'cliedesk'
					) }
				/>
			) : null }
			{ body }
			{ comparing && (
				<VersionDiff
					replyId={ reply.id }
					version={ comparing }
					onClose={ () => setComparing( null ) }
				/>
			) }
		</Section>
	);
}

function DeleteReply( { reply }: { reply: SavedReply } ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ open, setOpen ] = useState( false );
	const [ refs, setRefs ] = useState< Reference[] >( reply.references ?? [] );
	const del = useMutation( {
		mutationFn: () =>
			api.del( `saved-replies/${ reply.id }`, {
				body: refs.length ? { confirm: true } : {},
			} ),
		onSuccess: () => {
			qc.removeQueries( { queryKey: replyKeys.detail( reply.id ) } );
			void qc.invalidateQueries( { queryKey: replyKeys.all } );
			announceResult(
				sprintf(
					/* translators: %s: saved reply name. */
					__( '“%s” deleted.', 'cliedesk' ),
					reply.name
				)
			);
			void navigate( { to: LIST } as never );
		},
		onError: ( e ) => {
			const found = isApiError( e )
				? ( e.details as { references?: Reference[] } | null )
						?.references
				: undefined;
			if ( Array.isArray( found ) ) {
				setRefs( found );
			}
		},
	} );
	return (
		<>
			<Button
				variant="danger"
				className="self-start"
				onPress={ () => setOpen( true ) }
			>
				{ __( 'Delete', 'cliedesk' ) }
			</Button>
			<ConfirmDestructive
				isOpen={ open }
				onOpenChange={ setOpen }
				title={ sprintf(
					/* translators: %s: saved reply name. */
					__( 'Delete “%s”?', 'cliedesk' ),
					reply.name
				) }
				description={
					refs.length
						? __(
								'It is used in these places, which will no longer find it:',
								'cliedesk'
							)
						: __(
								'It is removed for everyone. Archive it instead to keep its history.',
								'cliedesk'
							)
				}
				confirmLabel={ __( 'Delete saved reply', 'cliedesk' ) }
				isLoading={ del.isPending }
				onConfirm={ () => del.mutate() }
			>
				{ refs.length > 0 && (
					<ul className="list-disc ps-5">
						{ refs.map( ( r ) => (
							<li key={ `${ r.type }:${ r.id }` }>
								<bdi>{ r.name }</bdi>
							</li>
						) ) }
					</ul>
				) }
				{ del.error &&
				! (
					isApiError( del.error ) &&
					del.error.code === 'cliedesk_saved_reply_in_use'
				) ? (
					<p role="alert" className="text-sm text-danger">
						{ del.error instanceof Error ? del.error.message : '' }
					</p>
				) : null }
			</ConfirmDestructive>
		</>
	);
}

function ReplyEditor( {
	reply,
	initial,
	prefilledFrom,
}: {
	reply: SavedReply | null;
	initial: ReplyForm;
	/** Conversation number or id the text came from (MAC-12). */
	prefilledFrom?: number | null;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const multi = useMultiProduct();
	const [ form, setForm ] = useState< ReplyForm >( initial );
	const [ client, setClient ] = useState< Record< string, string > >( {} );
	const ro = reply ? ! canEditReply( reply ) : false;
	const languages = useQuery( languageOptionsQuery() ).data ?? [];
	const tokens = useQuery( { ...tokensQuery(), enabled: ! ro } ).data ?? [];
	const teams = useQuery( {
		...teamsLookupQuery(),
		enabled: form.scope === 'team',
	} );
	const types = useQuery( typesQuery() ).data ?? [];
	const queues = useQuery( queuePickerQuery() ).data ?? [];
	const set = ( patch: Partial< ReplyForm > ) =>
		setForm( ( f ) => ( { ...f, ...patch } ) );
	const setVariant = ( i: number, patch: Partial< VariantForm > ) =>
		setForm( ( f ) => ( {
			...f,
			variants: f.variants.map( ( v, j ) =>
				j === i ? { ...v, ...patch } : v
			),
		} ) );

	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			reply
				? api.patch< SavedReply >( `saved-replies/${ reply.id }`, {
						body,
						ifMatch: versionTag( reply.version ),
					} )
				: api.post< SavedReply >( 'saved-replies', { body } ),
		onSuccess: ( r ) => {
			qc.setQueryData( replyKeys.detail( r.data.id ), r.data );
			void qc.invalidateQueries( { queryKey: replyKeys.all } );
			announceResult(
				sprintf(
					/* translators: %s: saved reply name. */
					__( 'Saved reply “%s” saved.', 'cliedesk' ),
					r.data.name
				)
			);
			if ( ! reply ) {
				void navigate( {
					to: '/automation/replies/$replyId',
					params: { replyId: String( r.data.id ) },
					replace: true,
				} as never );
			}
		},
	} );
	const server = apiFieldErrors( save.error );
	const errors = { ...server, ...client };
	const [ shown, setShown ] = useState< SummaryItem[] >( [] );

	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const found = validateReply( form );
		setClient( found );
		setShown(
			Object.entries( found ).map( ( [ key, message ] ) => ( {
				fieldId: fieldIdOf( key ),
				message,
			} ) )
		);
		if ( Object.keys( found ).length ) {
			return;
		}
		save.mutate( replyPayload( form ), {
			onError: ( err ) =>
				setShown(
					Object.entries( apiFieldErrors( err ) ).map(
						( [ key, message ] ) => ( {
							fieldId: fieldIdOf( key ),
							message,
						} )
					)
				),
		} );
	};

	const scopeOptions = SCOPES.map( ( s ) => {
		const allowed = canUseScope( s ) || s === reply?.scope;
		return {
			id: s,
			label: scopeLabel( s ),
			isDisabled: ! allowed,
			description: {
				personal: __( 'Only you see it.', 'cliedesk' ),
				team: __( 'The teams you choose see it.', 'cliedesk' ),
				shared: __( 'Everyone sees it.', 'cliedesk' ),
			}[ s ],
		};
	} );
	const products = getBoot().products ?? [];
	const used = new Set( form.variants.map( ( v ) => v.language ) );
	const nextLanguage = languages.find( ( l ) => ! used.has( l.code ) )?.code;
	const title = reply ? reply.name : __( 'New saved reply', 'cliedesk' );

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={ title }
				description={
					reply
						? sprintf(
								/* translators: 1: scope (Personal, Team or Shared), 2: number of times used. */
								_n(
									'%1$s saved reply · used %2$d time',
									'%1$s saved reply · used %2$d times',
									reply.useCount,
									'cliedesk'
								),
								scopeLabel( reply.scope ),
								reply.useCount
							)
						: __(
								'Text you send often, in every language you support, with actions that run when it is sent.',
								'cliedesk'
							)
				}
				actions={
					<Link
						to={ LIST }
						className="text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
					>
						{ __( 'Back to saved replies', 'cliedesk' ) }
					</Link>
				}
			/>
			{ ro && (
				<Banner
					tone="info"
					title={ __(
						'You can use this saved reply but not change it.',
						'cliedesk'
					) }
				/>
			) }
			{ prefilledFrom ? (
				<Banner
					tone="info"
					title={ sprintf(
						/* translators: %d: conversation number. */
						__(
							'Filled in from conversation #%d: the reply text and the conversation’s status, priority, tags and fields as actions. Remove what you do not need.',
							'cliedesk'
						),
						prefilledFrom
					) }
				/>
			) : null }
			<form
				id="cd-reply-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ErrorSummary items={ shown } />
				{ isConflict( save.error ) && (
					<ConflictBanner
						message={ __(
							'Someone else changed this saved reply. Reload to see their changes.',
							'cliedesk'
						) }
						onReload={ () => {
							save.reset();
							void qc.invalidateQueries( {
								queryKey: replyKeys.all,
							} );
						} }
					/>
				) }
				<SaveError error={ save.error } />
				<Section
					id="cd-reply-details"
					title={ __( 'Details', 'cliedesk' ) }
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<TextField
							id="cd-reply-name"
							label={ __( 'Name', 'cliedesk' ) }
							isRequired
							maxLength={ 191 }
							isDisabled={ ro }
							value={ form.name }
							errorMessage={ errors.name ?? null }
							onChange={ ( name ) => set( { name } ) }
						/>
						<TextField
							id="cd-reply-shortcut"
							label={ __( 'Shortcut', 'cliedesk' ) }
							description={ __(
								'Optional. Type ! and the shortcut in the composer, e.g. refund.',
								'cliedesk'
							) }
							maxLength={ 64 }
							isDisabled={ ro }
							value={ form.shortcut }
							errorMessage={ errors.shortcut ?? null }
							onChange={ ( shortcut ) =>
								set( { shortcut: shortcut.toLowerCase() } )
							}
						/>
						<TextField
							id="cd-reply-category"
							label={ __( 'Folder', 'cliedesk' ) }
							description={ __(
								'Optional. Use :: for a folder inside a folder, e.g. Billing::Refunds.',
								'cliedesk'
							) }
							maxLength={ 191 }
							isDisabled={ ro }
							value={ form.category }
							errorMessage={ errors.category ?? null }
							onChange={ ( category ) => set( { category } ) }
						/>
						<Select
							id="cd-reply-status"
							label={ __( 'Status', 'cliedesk' ) }
							description={ __(
								'Only active replies can be picked in conversations.',
								'cliedesk'
							) }
							value={ form.status }
							isDisabled={ ro }
							errorMessage={ errors.status ?? null }
							options={ STATUSES.map( ( s ) => ( {
								id: s,
								label: statusLabel( s ),
							} ) ) }
							onChange={ ( v ) =>
								set( { status: v as ReplyStatus } )
							}
						/>
					</div>
					<RadioGroup
						id="cd-reply-scope"
						label={ __( 'Who can use it', 'cliedesk' ) }
						value={ form.scope }
						isDisabled={ ro }
						options={ scopeOptions }
						errorMessage={ errors.scope ?? null }
						onChange={ ( v ) => set( { scope: v as ReplyScope } ) }
					/>
					{ form.scope === 'team' && (
						<CheckList
							id="cd-reply-teamIds"
							legend={ __( 'Teams', 'cliedesk' ) }
							options={ ( teams.data ?? [] ).map( ( t ) => ( {
								id: t.id,
								label: t.name,
							} ) ) }
							value={ form.teamIds }
							isDisabled={ ro }
							error={ errors.teamIds }
							onChange={ ( teamIds ) => set( { teamIds } ) }
						/>
					) }
					{ multi && products.length > 0 && (
						<CheckList
							id="cd-reply-productIds"
							legend={ __( 'Products', 'cliedesk' ) }
							description={ __(
								'Leave all unticked to use it for every product.',
								'cliedesk'
							) }
							options={ products.map( ( p ) => ( {
								id: p.id,
								label: p.name,
							} ) ) }
							value={ form.productIds }
							isDisabled={ ro }
							error={ errors.productIds }
							onChange={ ( productIds ) => set( { productIds } ) }
						/>
					) }
				</Section>

				<Section
					id="cd-reply-text"
					title={ __( 'Reply text', 'cliedesk' ) }
					description={ __(
						'One version per language. A conversation gets the version in its language, else the default language.',
						'cliedesk'
					) }
				>
					{ form.variants.map( ( v, i ) => (
						<VariantEditor
							key={ i }
							index={ i }
							variant={ v }
							languages={ languages }
							tokens={ tokens }
							errors={ errors }
							isDisabled={ ro }
							canRemove={ form.variants.length > 1 }
							onChange={ ( patch ) => setVariant( i, patch ) }
							onRemove={ () =>
								set( {
									variants: form.variants.filter(
										( _x, j ) => j !== i
									),
								} )
							}
						/>
					) ) }
					<div className="flex flex-wrap items-end gap-3">
						{ form.variants.length > 1 && (
							<Select
								id="cd-reply-defaultLanguage"
								label={ __( 'Default language', 'cliedesk' ) }
								value={ form.defaultLanguage || 'any' }
								isDisabled={ ro }
								options={ form.variants.map( ( v ) => ( {
									id: v.language || 'any',
									label: languageName(
										v.language,
										languages
									),
								} ) ) }
								onChange={ ( v ) =>
									set( {
										defaultLanguage: v === 'any' ? '' : v,
									} )
								}
							/>
						) }
						{ ! ro && nextLanguage && form.variants.length < 50 && (
							<Button
								iconStart={
									<Plus aria-hidden="true" size={ 16 } />
								}
								onPress={ () =>
									set( {
										variants: [
											...form.variants,
											{
												language: nextLanguage,
												subject: '',
												text: '',
											},
										],
									} )
								}
							>
								{ __( 'Add a language', 'cliedesk' ) }
							</Button>
						) }
					</div>
				</Section>

				<Section
					id="cd-reply-note-heading"
					title={ __( 'Internal note', 'cliedesk' ) }
				>
					<TextField
						id="cd-reply-note"
						label={ __( 'Note text', 'cliedesk' ) }
						description={ __(
							'Optional. Added as an internal note when the reply is used. Customers never see it.',
							'cliedesk'
						) }
						multiline
						rows={ 4 }
						isDisabled={ ro }
						value={ form.note }
						errorMessage={ errors.note ?? null }
						onChange={ ( note ) => set( { note } ) }
					/>
				</Section>

				<Section
					id="cd-reply-actions"
					title={ __( 'Actions', 'cliedesk' ) }
					description={ __(
						'They run in this order when the reply is sent or the note is added, never when it is only inserted.',
						'cliedesk'
					) }
				>
					<StepsEditor
						steps={ form.steps }
						errors={ errors }
						isDisabled={ ro }
						onChange={ ( steps ) => set( { steps } ) }
					/>
				</Section>

				<Section
					id="cd-reply-availability"
					title={ __( 'Where it can be used', 'cliedesk' ) }
					description={ __(
						'Leave a group unticked to allow everything in it.',
						'cliedesk'
					) }
				>
					<CheckList< ReplyMode >
						id="cd-reply-modes"
						legend={ __( 'Composer modes', 'cliedesk' ) }
						options={ MODES.map( ( m ) => ( {
							id: m,
							label: modeLabel( m ),
						} ) ) }
						value={ form.modes }
						isDisabled={ ro }
						onChange={ ( modes ) => set( { modes } ) }
					/>
					<CheckList< string >
						id="cd-reply-channels"
						legend={ __( 'Channels', 'cliedesk' ) }
						options={ CHANNEL_KEYS.map( ( c ) => ( {
							id: c,
							label: channelLabel( c ),
						} ) ) }
						value={ form.channels }
						isDisabled={ ro }
						onChange={ ( channels ) => set( { channels } ) }
					/>
					<CheckList< number >
						id="cd-reply-typeIds"
						legend={ __( 'Conversation types', 'cliedesk' ) }
						options={ types.map( ( t ) => ( {
							id: t.id,
							label: t.name,
						} ) ) }
						value={ form.typeIds }
						isDisabled={ ro }
						onChange={ ( typeIds ) => set( { typeIds } ) }
					/>
					<CheckList< number >
						id="cd-reply-queueIds"
						legend={ __( 'Queues', 'cliedesk' ) }
						options={ queues.map( ( q ) => ( {
							id: q.id,
							label: q.name,
						} ) ) }
						value={ form.queueIds }
						isDisabled={ ro }
						onChange={ ( queueIds ) => set( { queueIds } ) }
					/>
				</Section>

				{ ! ro && (
					<div className="flex flex-wrap gap-2">
						<Button
							type="submit"
							variant="primary"
							isLoading={ save.isPending }
						>
							{ reply
								? __( 'Save changes', 'cliedesk' )
								: __( 'Create saved reply', 'cliedesk' ) }
						</Button>
					</div>
				) }
			</form>
			{ reply && <History reply={ reply } isDisabled={ ro } /> }
			{ reply && ! ro && (
				<Section
					id="cd-reply-delete"
					title={ __( 'Delete', 'cliedesk' ) }
					description={ __(
						'Deleting cannot be undone. Places that use it are listed first.',
						'cliedesk'
					) }
				>
					<DeleteReply reply={ reply } />
				</Section>
			) }
			{ reply && copyScope( reply.scope ) && (
				<CopyReply reply={ reply } />
			) }
		</div>
	);
}

function CopyReply( { reply }: { reply: SavedReply } ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ scope, setScope ] = useState< ReplyScope >(
		copyScope( reply.scope ) ?? 'personal'
	);
	const copy = useMutation( {
		mutationFn: () =>
			api.post< SavedReply >( `saved-replies/${ reply.id }/duplicate`, {
				body: { scope },
			} ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: replyKeys.all } );
			announceResult(
				sprintf(
					/* translators: %s: saved reply name. */
					__( 'Copied as “%s”.', 'cliedesk' ),
					r.data.name
				)
			);
			void navigate( {
				to: '/automation/replies/$replyId',
				params: { replyId: String( r.data.id ) },
			} as never );
		},
	} );
	return (
		<Section
			id="cd-reply-copy"
			title={ __( 'Copy', 'cliedesk' ) }
			description={ __(
				'Make a copy, for example a personal version of a shared reply. The shortcut is not copied.',
				'cliedesk'
			) }
		>
			<div className="flex flex-wrap items-end gap-3">
				<Select
					label={ __( 'Copy as', 'cliedesk' ) }
					value={ scope }
					options={ SCOPES.filter( canUseScope ).map( ( s ) => ( {
						id: s,
						label: scopeLabel( s ),
					} ) ) }
					onChange={ ( v ) => setScope( v as ReplyScope ) }
				/>
				<Button
					isLoading={ copy.isPending }
					onPress={ () => copy.mutate() }
				>
					{ __( 'Make a copy', 'cliedesk' ) }
				</Button>
			</div>
			{ copy.error ? (
				<p role="alert" className="text-sm text-danger">
					{ copy.error instanceof Error ? copy.error.message : '' }
				</p>
			) : null }
		</Section>
	);
}

function ExistingReply( { id }: { id: number } ) {
	const q = useQuery( replyQuery( id ) );
	if ( q.isPending ) {
		return (
			<LoadingRegion label={ __( 'Loading saved reply…', 'cliedesk' ) } />
		);
	}
	if ( q.isError || ! q.data ) {
		return (
			<QueryFailed
				headingLevel={ 1 }
				title={
					isApiError( q.error ) && q.error.status === 404
						? __( 'This saved reply does not exist', 'cliedesk' )
						: __( 'Could not load the saved reply', 'cliedesk' )
				}
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	return (
		<>
			<ReplyEditor
				key={ `${ q.data.id }:${ q.data.version }` }
				reply={ q.data }
				initial={ formOf( q.data, htmlToText ) }
			/>
			{ /* MAC-01: files sent with the reply. */ }
			<ReplyFilesSection
				replyId={ q.data.id }
				editable={ canEditReply( q.data ) }
			/>
		</>
	);
}

function NewReply( {
	conversation,
	number,
	message,
}: {
	conversation: number;
	/** Conversation number, for the "filled in from" note. */
	number: number;
	message: number;
} ) {
	const from = conversation > 0 && message > 0;
	const messages = useQuery( {
		...messagesQuery( conversation ),
		enabled: from,
	} );
	const steps = useQuery( {
		...macroStepsQuery( conversation ),
		enabled: from,
	} );
	if ( from && ( messages.isPending || steps.isPending ) ) {
		return (
			<LoadingRegion label={ __( 'Loading the reply…', 'cliedesk' ) } />
		);
	}
	const initial = emptyForm();
	const source = messages.data?.find( ( m ) => m.id === message );
	if ( source ) {
		initial.variants = [
			{
				language: '',
				subject: '',
				text: source.html ? htmlToText( source.html ) : source.text,
			},
		];
		initial.steps = steps.data ?? [];
	}
	return (
		<ReplyEditor
			reply={ null }
			initial={ initial }
			prefilledFrom={ source ? number || conversation : null }
		/>
	);
}

/**
 * Saved reply editor screen.
 */
export default function SavedReplyRoute() {
	const params = useParams( { strict: false } ) as { replyId?: string };
	const search = useSearch( { strict: false } ) as {
		conversation?: unknown;
		number?: unknown;
		message?: unknown;
	};
	if ( params.replyId === 'new' ) {
		return (
			<NewReply
				conversation={ Number( search.conversation ) || 0 }
				number={ Number( search.number ) || 0 }
				message={ Number( search.message ) || 0 }
			/>
		);
	}
	const id = Number( params.replyId );
	return <ExistingReply id={ Number.isInteger( id ) && id > 0 ? id : 0 } />;
}
