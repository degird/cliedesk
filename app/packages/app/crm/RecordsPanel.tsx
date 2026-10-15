/**
 * "Records" panel (CRM-44/45) on the conversation side panel and the contact and organization pages: records from
 * registered sources (orders, subscriptions…) linked to this conversation, contact or organization, read live.
 *
 * - Each record shows its title, subtitle, status, amount, date, the source's schema fields and a link to it (http(s)
 *   only). A record its source cannot read right now shows its stored label and "Can't load right now".
 * - "Link a record": choose a source, see the requester's records as suggestions, or search, then link.
 * - Unlink removes the link at once, with Undo in the notice.
 * - Hidden when no record source is registered (or none is visible to the person). Loaded lazily.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	IconButton,
	LoadingRegion,
	Modal,
	Select,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ExternalLink, Link2, Search, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ActionError, Muted, PanelSection, Pill } from '../inbox/components';
import { announceResult } from '../workspace/forms';
import { Section } from './components';
import {
	canLinkRecords,
	fieldText,
	formatAmount,
	formatRecordDate,
	linkRecord,
	recordFindQuery,
	recordKeys,
	recordLinksQuery,
	recordSourcesQuery,
	safeUrl,
	type ExternalRecord,
	type RecordEntity,
	type RecordLink,
	type RecordSource,
} from './records';

function ExternalAnchor( {
	href,
	children,
}: {
	href: string;
	children: ReactNode;
} ) {
	return (
		<a
			href={ href }
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1 text-sm text-accent-fg underline-offset-2 hover:underline"
		>
			{ children }
			<ExternalLink aria-hidden="true" size={ 12 } />
			<span className="sr-only">
				{ __( '(opens in a new tab)', 'cliedesk' ) }
			</span>
		</a>
	);
}

function RecordFacts( {
	record,
	source,
}: {
	record: ExternalRecord;
	source: RecordSource | undefined;
} ) {
	const schema = Object.entries( source?.schema ?? {} ).filter(
		( [ key ] ) =>
			record.fields &&
			Object.prototype.hasOwnProperty.call( record.fields, key )
	);
	const facts: Array< { label: string; value: ReactNode } > = [];
	if ( typeof record.amount === 'number' ) {
		facts.push( {
			label: __( 'Amount', 'cliedesk' ),
			value: formatAmount( record.amount, record.currency ),
		} );
	}
	if ( record.date ) {
		facts.push( {
			label: __( 'Date', 'cliedesk' ),
			value: formatRecordDate( record.date ),
		} );
	}
	for ( const [ key, def ] of schema ) {
		const raw = record.fields[ key ];
		const url = def.type === 'url' ? safeUrl( raw ) : null;
		facts.push( {
			label: def.label || key,
			value: url ? (
				<ExternalAnchor href={ url }>
					<bdi>{ String( raw ) }</bdi>
				</ExternalAnchor>
			) : (
				<bdi>{ fieldText( def.type, raw ) }</bdi>
			),
		} );
	}
	if ( ! facts.length ) {
		return null;
	}
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
			{ facts.map( ( f, i ) => (
				<div key={ i } className="contents">
					<dt className="text-fg-muted">{ f.label }</dt>
					<dd className="min-w-0 break-words">{ f.value }</dd>
				</div>
			) ) }
		</dl>
	);
}

function LinkedRecord( {
	link,
	source,
	canEdit,
	onUnlink,
}: {
	link: RecordLink;
	source: RecordSource | undefined;
	canEdit: boolean;
	onUnlink: () => void;
} ) {
	const r = link.available ? link.record : null;
	const title = r?.title || link.label || link.recordId;
	const url = safeUrl( r?.url );
	return (
		<li className="flex flex-col gap-1 rounded-md border border-line p-3">
			<div className="flex items-start gap-2">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<p className="flex flex-wrap items-center gap-1 font-medium">
						<bdi className="min-w-0 break-words">{ title }</bdi>
						{ r?.status && <Pill>{ r.status }</Pill> }
						{ ! r && (
							<Pill tone="warning">
								{ __( 'Can’t load right now', 'cliedesk' ) }
							</Pill>
						) }
					</p>
					<p className="text-sm text-fg-muted">
						{ r?.subtitle
							? sprintf(
									/* translators: 1: record source (e.g. Order), 2: record subtitle. */
									__( '%1$s · %2$s', 'cliedesk' ),
									link.sourceLabel,
									r.subtitle
								)
							: link.sourceLabel }
					</p>
				</div>
				{ canEdit && (
					<IconButton
						size="sm"
						label={ sprintf(
							/* translators: %s: record title. */
							__( 'Unlink %s', 'cliedesk' ),
							title
						) }
						icon={ <X size={ 14 } /> }
						onPress={ onUnlink }
					/>
				) }
			</div>
			{ r && <RecordFacts record={ r } source={ source } /> }
			{ url && (
				<ExternalAnchor href={ url }>
					{ sprintf(
						/* translators: %s: record source (e.g. Order). */
						__( 'Open in %s', 'cliedesk' ),
						link.sourceLabel
					) }
				</ExternalAnchor>
			) }
		</li>
	);
}

function LinkDialog( {
	entity,
	entityId,
	contactId,
	sources,
	linked,
	onClose,
}: {
	entity: RecordEntity;
	entityId: number;
	contactId: number | null;
	sources: RecordSource[];
	linked: RecordLink[];
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ source, setSource ] = useState( sources[ 0 ]?.key ?? '' );
	const [ input, setInput ] = useState( '' );
	const [ q, setQ ] = useState( '' );
	const current = sources.find( ( s ) => s.key === source );
	const searching = q !== '' || contactId === null;
	const found = useQuery( {
		...recordFindQuery( source, contactId, q ),
		enabled: source !== '' && ( contactId !== null || q !== '' ),
	} );
	const link = useMutation( {
		mutationFn: ( r: ExternalRecord ) =>
			linkRecord( entity, entityId, r.source || source, r.id ),
		onSuccess: ( l ) => {
			qc.setQueryData(
				recordKeys.links( entity, entityId ),
				( list: RecordLink[] | undefined ) => [
					...( list ?? [] ).filter( ( x ) => x.id !== l?.id ),
					...( l ? [ l ] : [] ),
				]
			);
			void qc.invalidateQueries( {
				queryKey: recordKeys.links( entity, entityId ),
			} );
			announceResult( __( 'Record linked.', 'cliedesk' ) );
			onClose();
		},
	} );
	const isLinked = ( r: ExternalRecord ) =>
		linked.some(
			( l ) => l.source === ( r.source || source ) && l.recordId === r.id
		);
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		setQ( input.trim() );
	};
	const results = found.data ?? [];
	const heading: string = searching
		? __( 'Search results', 'cliedesk' )
		: __( 'Suggested for this customer', 'cliedesk' );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Link a record', 'cliedesk' ) }
			footer={
				<Button onPress={ onClose }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			}
		>
			<div className="flex flex-col gap-4">
				{ sources.length > 1 && (
					<Select
						label={ __( 'Source', 'cliedesk' ) }
						value={ source }
						onChange={ ( s ) => {
							setSource( s );
							link.reset();
						} }
						options={ sources.map( ( s ) => ( {
							id: s.key,
							label: s.plural || s.label,
						} ) ) }
					/>
				) }
				<form
					role="search"
					noValidate
					onSubmit={ submit }
					className="flex items-end gap-2"
				>
					<TextField
						className="min-w-0 flex-1"
						label={ sprintf(
							/* translators: %s: record source, plural (e.g. Orders). */
							__( 'Search %s', 'cliedesk' ),
							current?.plural || current?.label || ''
						) }
						inputMode="search"
						maxLength={ 191 }
						value={ input }
						onChange={ setInput }
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
					/>
					<Button
						type="submit"
						iconStart={ <Search aria-hidden="true" size={ 14 } /> }
					>
						{ __( 'Search', 'cliedesk' ) }
					</Button>
				</form>
				<ActionError
					error={ link.error }
					onDismiss={ () => link.reset() }
				/>
				<section
					aria-labelledby="cd-record-results"
					className="flex flex-col gap-2"
				>
					<h3
						id="cd-record-results"
						className="text-sm font-semibold"
					>
						{ heading }
					</h3>
					{ ! found.isFetching && contactId === null && q === '' && (
						<Muted>
							{ __( 'Search to find a record.', 'cliedesk' ) }
						</Muted>
					) }
					{ found.isFetching && (
						<LoadingRegion
							label={ __( 'Loading records…', 'cliedesk' ) }
						/>
					) }
					{ found.isError && <ActionError error={ found.error } /> }
					<div role="status" className="text-sm text-fg-muted">
						{ found.isSuccess &&
						! found.isFetching &&
						! results.length
							? __( 'No records found.', 'cliedesk' )
							: '' }
					</div>
					{ results.length > 0 && ! found.isFetching && (
						<ul className="flex flex-col gap-1">
							{ results.map( ( r ) => {
								const done = isLinked( r );
								return (
									<li
										key={ `${ r.source }:${ r.id }` }
										className="flex items-center gap-2 rounded-md border border-line p-2"
									>
										<div className="flex min-w-0 flex-1 flex-col">
											<span className="font-medium break-words">
												<bdi>{ r.title }</bdi>
											</span>
											<span className="text-sm text-fg-muted">
												{ [
													r.subtitle,
													r.status,
													typeof r.amount === 'number'
														? formatAmount(
																r.amount,
																r.currency
															)
														: null,
													r.date
														? formatRecordDate(
																r.date
															)
														: null,
												]
													.filter( Boolean )
													.join( ' · ' ) }
											</span>
										</div>
										{ done ? (
											<Pill tone="success">
												{ __( 'Linked', 'cliedesk' ) }
											</Pill>
										) : (
											<Button
												size="sm"
												aria-label={ sprintf(
													/* translators: %s: record title. */
													__( 'Link %s', 'cliedesk' ),
													r.title
												) }
												isLoading={
													link.isPending &&
													link.variables?.id === r.id
												}
												onPress={ () =>
													link.mutate( r )
												}
											>
												{ __( 'Link', 'cliedesk' ) }
											</Button>
										) }
									</li>
								);
							} ) }
						</ul>
					) }
				</section>
			</div>
		</Modal>
	);
}

/**
 * Records panel.
 *
 * @param props           Props.
 * @param props.entity    Entity.
 * @param props.entityId  Entity id.
 * @param props.contactId Customer whose records to suggest (conversation requester, the contact itself).
 * @param props.variant   Side panel section or page card.
 */
export default function RecordsPanel( {
	entity,
	entityId,
	contactId = null,
	variant = 'side',
}: {
	entity: RecordEntity;
	entityId: number;
	contactId?: number | null;
	variant?: 'side' | 'page';
} ) {
	const qc = useQueryClient();
	const sources = useQuery( recordSourcesQuery() );
	const hasSources = ( sources.data ?? [] ).length > 0;
	const links = useQuery( {
		...recordLinksQuery( entity, entityId ),
		enabled: hasSources,
	} );
	const [ linking, setLinking ] = useState( false );
	const relink = useMutation( {
		mutationFn: ( l: RecordLink ) =>
			linkRecord( entity, entityId, l.source, l.recordId ),
		onSettled: () =>
			void qc.invalidateQueries( {
				queryKey: recordKeys.links( entity, entityId ),
			} ),
	} );
	const unlink = useMutation( {
		mutationFn: ( l: RecordLink ) => api.del( `record-links/${ l.id }` ),
		onMutate: ( l ) => {
			qc.setQueryData(
				recordKeys.links( entity, entityId ),
				( list: RecordLink[] | undefined ) =>
					( list ?? [] ).filter( ( x ) => x.id !== l.id )
			);
		},
		onSuccess: ( _r, l ) => {
			const title = l.record?.title || l.label || l.recordId;
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %s: record title. */
					__( '%s unlinked.', 'cliedesk' ),
					title
				),
				action: {
					label: __( 'Undo', 'cliedesk' ),
					onAction: () => relink.mutate( l ),
				},
			} );
		},
		onError: () =>
			void qc.invalidateQueries( {
				queryKey: recordKeys.links( entity, entityId ),
			} ),
	} );
	if ( ! hasSources ) {
		return null;
	}
	const canEdit = canLinkRecords( entity );
	const list = links.data ?? [];
	const title = __( 'Records', 'cliedesk' );
	const id = `cd-records-${ entity }`;
	const action = canEdit ? (
		<Button
			size="sm"
			variant={ variant === 'side' ? 'ghost' : 'secondary' }
			iconStart={ <Link2 aria-hidden="true" size={ 14 } /> }
			onPress={ () => setLinking( true ) }
		>
			{ __( 'Link a record', 'cliedesk' ) }
		</Button>
	) : null;
	const body = (
		<div className="flex flex-col gap-2">
			<ActionError
				error={ unlink.error ?? relink.error }
				onDismiss={ () => {
					unlink.reset();
					relink.reset();
				} }
			/>
			{ links.isPending && (
				<Muted>{ __( 'Loading records…', 'cliedesk' ) }</Muted>
			) }
			{ links.isError && (
				<ActionError
					error={ links.error }
					title={ __( 'Could not load the records', 'cliedesk' ) }
				/>
			) }
			{ links.isSuccess && ! list.length && (
				<Muted>{ __( 'No linked records.', 'cliedesk' ) }</Muted>
			) }
			{ list.length > 0 && (
				<ul className="flex flex-col gap-2">
					{ list.map( ( l ) => (
						<LinkedRecord
							key={ l.id }
							link={ l }
							source={ sources.data?.find(
								( s ) => s.key === l.source
							) }
							canEdit={ canEdit }
							onUnlink={ () => unlink.mutate( l ) }
						/>
					) ) }
				</ul>
			) }
			{ linking && (
				<LinkDialog
					entity={ entity }
					entityId={ entityId }
					contactId={ contactId }
					sources={ sources.data ?? [] }
					linked={ list }
					onClose={ () => setLinking( false ) }
				/>
			) }
		</div>
	);
	return variant === 'side' ? (
		<PanelSection id={ id } title={ title } actions={ action }>
			{ body }
		</PanelSection>
	) : (
		<Section id={ id } title={ title } actions={ action }>
			{ body }
		</Section>
	);
}
