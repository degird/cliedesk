/**
 * Product → Detection & IDs (BRD-05 data): rules and external ids that assign conversations to this product.
 * Saving replaces the product's mappings; server errors come back per row ("mappings.2.value").
 */
import { Button, Select, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import {
	MAPPING_KINDS,
	MATCHABLE_KINDS,
	MATCH_TYPES,
	type MappingKind,
	type MatchType,
	type ProductInput,
} from '../api';
import {
	ErrorSummary,
	apiFieldErrors,
	focusField,
	type SummaryItem,
} from '../forms';
import { mappingKindLabel, matchTypeLabel } from '../labels';
import { SaveBar, useProductPatch, type ProductTabProps } from './shared';

export const MAX_MAPPINGS = 200;

interface Row {
	key: number;
	kind: MappingKind;
	matchType: MatchType;
	value: string;
	priority: string;
}

type RowField = 'kind' | 'matchType' | 'value' | 'priority';
type RowErrors = Partial< Record< RowField | 'row', string > >;

export const rowFieldId = ( key: number, f: RowField ) =>
	`cd-mapping-${ key }-${ f }`;

/**
 * Per-row errors from `error.fields` keys such as "mappings.2.value" (index = position in the sent list).
 *
 * @param fields Field errors.
 * @param count  Number of rows sent.
 */
export function rowErrors(
	fields: Record< string, string >,
	count: number
): RowErrors[] {
	const out: RowErrors[] = Array.from( { length: count }, () => ( {} ) );
	for ( const [ k, msg ] of Object.entries( fields ) ) {
		const m = /^mappings(?:\.|\[)(\d+)\]?(?:\.(\w+))?$/.exec( k );
		if ( ! m ) {
			continue;
		}
		const row = out[ Number( m[ 1 ] ) ];
		if ( ! row ) {
			continue;
		}
		const f = m[ 2 ];
		if (
			f === 'kind' ||
			f === 'matchType' ||
			f === 'value' ||
			f === 'priority'
		) {
			row[ f ] = msg;
		} else {
			row.row = msg;
		}
	}
	return out;
}

function validateRow( r: Row ): RowErrors {
	const out: RowErrors = {};
	if ( r.value.trim() === '' ) {
		out.value = __( 'Enter a value.', 'cliedesk' );
	} else if ( r.value.length > 255 ) {
		out.value = sprintf(
			/* translators: %d: maximum number of characters. */
			__( 'Enter up to %d characters.', 'cliedesk' ),
			255
		);
	}
	const p = r.priority.trim();
	if ( ! /^-?\d+$/.test( p ) || Number( p ) < -1000 || Number( p ) > 1000 ) {
		out.priority = __(
			'Enter a whole number from -1000 to 1000.',
			'cliedesk'
		);
	}
	return out;
}

function valueHint( kind: MappingKind ): string {
	switch ( kind ) {
		case 'domain':
			return __( 'Such as example.com or *.example.com.', 'cliedesk' );
		case 'url_rule':
			return __( 'Such as https://example.com/product-a/*.', 'cliedesk' );
		case 'email':
			return __( 'Such as support@example.com.', 'cliedesk' );
		default:
			return __( 'The ID as shown in the other system.', 'cliedesk' );
	}
}

/**
 * Mappings tab.
 *
 * @param props Props.
 */
export function MappingsTab( {
	product,
	etag,
	onSaved,
	onReload,
	canManage,
}: ProductTabProps ) {
	const seq = useRef( 0 );
	const [ rows, setRows ] = useState< Row[] >( () =>
		product.mappings.map( ( m ) => ( {
			key: ++seq.current,
			kind: m.kind,
			matchType: m.matchType ?? 'exact',
			value: m.value,
			priority: String( m.priority ?? 0 ),
		} ) )
	);
	const [ errors, setErrors ] = useState< Map< number, RowErrors > >(
		() => new Map()
	);
	const [ general, setGeneral ] = useState< string | null >( null );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const sent = useRef< Row[] >( [] );

	const toSummary = ( errs: Map< number, RowErrors > ): SummaryItem[] => {
		const items: SummaryItem[] = [];
		rows.forEach( ( r, i ) => {
			const e = errs.get( r.key );
			if ( ! e ) {
				return;
			}
			for ( const f of [
				'kind',
				'matchType',
				'value',
				'priority',
				'row',
			] as const ) {
				const msg = e[ f ];
				if ( msg ) {
					items.push( {
						fieldId: rowFieldId( r.key, f === 'row' ? 'value' : f ),
						message: sprintf(
							/* translators: 1: rule number, 2: error message. */
							__( 'Rule %1$d: %2$s', 'cliedesk' ),
							i + 1,
							msg
						),
					} );
				}
			}
		} );
		return items;
	};

	const save = useProductPatch( product, etag, onSaved, ( e ) => {
		const fields = apiFieldErrors( e );
		const perRow = rowErrors( fields, sent.current.length );
		const next = new Map< number, RowErrors >();
		perRow.forEach( ( re, i ) => {
			const r = sent.current[ i ];
			if ( r && Object.keys( re ).length ) {
				next.set( r.key, re );
			}
		} );
		setErrors( next );
		setGeneral( fields.mappings ?? null );
		const items = toSummary( next );
		if ( fields.mappings ) {
			items.unshift( {
				fieldId: 'cd-mapping-add',
				message: fields.mappings,
			} );
		}
		setSummary( items );
	} );

	const update = ( key: number, patch: Partial< Row > ) => {
		setRows( ( rs ) =>
			rs.map( ( r ) => ( r.key === key ? { ...r, ...patch } : r ) )
		);
		setErrors( ( m ) => {
			if ( ! m.has( key ) ) {
				return m;
			}
			const n = new Map( m );
			const fields = Object.keys( patch ) as RowField[];
			const re = { ...n.get( key ) };
			for ( const f of fields ) {
				delete re[ f ];
			}
			delete re.row;
			n.set( key, re );
			return n;
		} );
	};

	const add = () => {
		const key = ++seq.current;
		setRows( ( rs ) => [
			...rs,
			{
				key,
				kind: 'domain',
				matchType: 'exact',
				value: '',
				priority: '0',
			},
		] );
		window.requestAnimationFrame( () =>
			focusField( rowFieldId( key, 'kind' ) )
		);
	};

	const remove = ( index: number ) => {
		const r = rows[ index ];
		if ( ! r ) {
			return;
		}
		setRows( ( rs ) => rs.filter( ( x ) => x.key !== r.key ) );
		// Focus moves to the next row, else the previous one, else "Add rule" (§8.3).
		const next = rows[ index + 1 ] ?? rows[ index - 1 ];
		window.requestAnimationFrame( () =>
			focusField(
				next ? rowFieldId( next.key, 'kind' ) : 'cd-mapping-add'
			)
		);
	};

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		const next = new Map< number, RowErrors >();
		for ( const r of rows ) {
			const re = validateRow( r );
			if ( Object.keys( re ).length ) {
				next.set( r.key, re );
			}
		}
		setErrors( next );
		setGeneral( null );
		const items = toSummary( next );
		setSummary( items );
		if ( items.length ) {
			return;
		}
		sent.current = rows;
		const body: ProductInput = {
			mappings: rows.map( ( r ) => ( {
				kind: r.kind,
				matchType: MATCHABLE_KINDS.has( r.kind )
					? r.matchType
					: 'exact',
				value: r.value.trim(),
				priority: Number( r.priority.trim() ),
			} ) ),
		};
		save.mutate( body );
	};

	const disabled = ! canManage;
	const kindOptions = MAPPING_KINDS.map( ( k ) => ( {
		id: k,
		label: mappingKindLabel( k ),
	} ) );
	const matchOptions = MATCH_TYPES.map( ( m ) => ( {
		id: m,
		label: matchTypeLabel( m ),
	} ) );

	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-5">
			<ErrorSummary items={ summary } />
			<p className="text-fg-muted">
				{ __(
					'New conversations are assigned to this product when they match one of these rules. Higher priority wins when rules of several products match.',
					'cliedesk'
				) }
			</p>
			{ rows.length === 0 && (
				<p className="rounded-lg border border-dashed border-line p-4 text-fg-muted">
					{ __( 'No detection rules or IDs yet.', 'cliedesk' ) }
				</p>
			) }
			<ol className="flex flex-col gap-3">
				{ rows.map( ( r, i ) => {
					const e = errors.get( r.key ) ?? {};
					const label = sprintf(
						/* translators: %d: rule number. */
						__( 'Rule %d', 'cliedesk' ),
						i + 1
					);
					return (
						<li key={ r.key }>
							<fieldset
								className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2"
								aria-describedby={
									e.row
										? `cd-mapping-${ r.key }-row`
										: undefined
								}
							>
								<legend className="px-1 font-semibold">
									{ label }
								</legend>
								<div id={ rowFieldId( r.key, 'kind' ) }>
									<Select
										label={ __( 'Type', 'cliedesk' ) }
										options={ kindOptions }
										value={ r.kind }
										onChange={ ( x ) =>
											update( r.key, {
												kind: x as MappingKind,
											} )
										}
										errorMessage={ e.kind }
										isDisabled={ disabled }
									/>
								</div>
								{ MATCHABLE_KINDS.has( r.kind ) ? (
									<div
										id={ rowFieldId( r.key, 'matchType' ) }
									>
										<Select
											label={ __( 'Match', 'cliedesk' ) }
											options={ matchOptions }
											value={ r.matchType }
											onChange={ ( x ) =>
												update( r.key, {
													matchType: x as MatchType,
												} )
											}
											errorMessage={ e.matchType }
											isDisabled={ disabled }
										/>
									</div>
								) : (
									<div aria-hidden="true" />
								) }
								<TextField
									id={ rowFieldId( r.key, 'value' ) }
									label={ __( 'Value', 'cliedesk' ) }
									description={ valueHint( r.kind ) }
									value={ r.value }
									onChange={ ( x ) =>
										update( r.key, { value: x } )
									}
									errorMessage={ e.value }
									isRequired
									isDisabled={ disabled }
									spellCheck="false"
								/>
								<TextField
									id={ rowFieldId( r.key, 'priority' ) }
									label={ __( 'Priority', 'cliedesk' ) }
									inputMode="numeric"
									value={ r.priority }
									onChange={ ( x ) =>
										update( r.key, { priority: x } )
									}
									errorMessage={ e.priority }
									isDisabled={ disabled }
								/>
								{ e.row && (
									<p
										id={ `cd-mapping-${ r.key }-row` }
										className="text-sm text-danger sm:col-span-2"
									>
										{ e.row }
									</p>
								) }
								<div className="sm:col-span-2">
									<Button
										size="sm"
										variant="ghost"
										iconStart={
											<Trash2
												aria-hidden="true"
												size={ 14 }
											/>
										}
										isDisabled={ disabled }
										onPress={ () => remove( i ) }
									>
										{ sprintf(
											/* translators: %s: rule label, e.g. "Rule 2". */
											__( 'Remove %s', 'cliedesk' ),
											label
										) }
									</Button>
								</div>
							</fieldset>
						</li>
					);
				} ) }
			</ol>
			{ general && (
				<p className="text-sm text-danger" role="alert">
					{ general }
				</p>
			) }
			<div>
				<Button
					id="cd-mapping-add"
					iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
					isDisabled={ disabled || rows.length >= MAX_MAPPINGS }
					onPress={ add }
				>
					{ __( 'Add rule', 'cliedesk' ) }
				</Button>
			</div>
			<SaveBar
				error={ save.error }
				pending={ save.isPending }
				onReload={ onReload }
				disabled={ disabled }
			/>
		</form>
	);
}
