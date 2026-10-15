/**
 * Saved reply version diff (MAC-16): what changed between two version snapshots, field by field, with a line diff
 * of each language's text.
 */
import { __ } from '@wordpress/i18n';
import { htmlToText } from '../inbox/html';

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

/** Longest texts compared line by line (beyond it, whole-text replace). */
const MAX_LINES = 400;

/**
 * Line diff (longest common subsequence).
 *
 * @param before Old text.
 * @param after  New text.
 */
export function diffLines( before: string, after: string ): DiffLine[] {
	const a = before === '' ? [] : before.split( '\n' );
	const b = after === '' ? [] : after.split( '\n' );
	if ( a.length > MAX_LINES || b.length > MAX_LINES ) {
		return [
			...a.map( ( text ) => ( { kind: 'del' as const, text } ) ),
			...b.map( ( text ) => ( { kind: 'add' as const, text } ) ),
		];
	}
	// lcs[i][j]: common length of a[i…] and b[j…].
	const lcs = Array.from( { length: a.length + 1 }, () =>
		new Array< number >( b.length + 1 ).fill( 0 )
	);
	for ( let i = a.length - 1; i >= 0; i-- ) {
		for ( let j = b.length - 1; j >= 0; j-- ) {
			lcs[ i ]![ j ] =
				a[ i ] === b[ j ]
					? lcs[ i + 1 ]![ j + 1 ]! + 1
					: Math.max( lcs[ i + 1 ]![ j ]!, lcs[ i ]![ j + 1 ]! );
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while ( i < a.length && j < b.length ) {
		if ( a[ i ] === b[ j ] ) {
			out.push( { kind: 'same', text: a[ i ]! } );
			i++;
			j++;
		} else if ( lcs[ i + 1 ]![ j ]! >= lcs[ i ]![ j + 1 ]! ) {
			out.push( { kind: 'del', text: a[ i ]! } );
			i++;
		} else {
			out.push( { kind: 'add', text: b[ j ]! } );
			j++;
		}
	}
	for ( ; i < a.length; i++ ) {
		out.push( { kind: 'del', text: a[ i ]! } );
	}
	for ( ; j < b.length; j++ ) {
		out.push( { kind: 'add', text: b[ j ]! } );
	}
	return out;
}

export type Snapshot = Record< string, unknown >;

export interface FieldChange {
	label: string;
	before: string;
	after: string;
}

export interface VariantChange {
	language: string;
	subject: { before: string; after: string } | null;
	lines: DiffLine[];
}

const str = ( v: unknown ): string => {
	if ( null === v || undefined === v ) {
		return '';
	}
	if ( 'object' === typeof v ) {
		const json = JSON.stringify( v );
		return '{}' === json || '[]' === json ? '' : json;
	}
	return String( v );
};

/**
 * Changed fields other than the texts.
 *
 * @param before Older snapshot.
 * @param after  Newer snapshot.
 */
export function fieldChanges(
	before: Snapshot,
	after: Snapshot
): FieldChange[] {
	const fields: Array< [ string, string, ( v: unknown ) => string ] > = [
		[ 'name', __( 'Name', 'cliedesk' ), str ],
		[ 'shortcut', __( 'Shortcut', 'cliedesk' ), str ],
		[ 'category', __( 'Folder', 'cliedesk' ), str ],
		[ 'status', __( 'Status', 'cliedesk' ), str ],
		[ 'scope', __( 'Who can use it', 'cliedesk' ), str ],
		[ 'defaultLanguage', __( 'Default language', 'cliedesk' ), str ],
		[
			'noteHtml',
			__( 'Internal note', 'cliedesk' ),
			( v ) => htmlToText( str( v ) ),
		],
		[ 'steps', __( 'Actions', 'cliedesk' ), str ],
		[ 'availability', __( 'Availability', 'cliedesk' ), str ],
		[ 'teamIds', __( 'Teams', 'cliedesk' ), str ],
		[ 'productIds', __( 'Products', 'cliedesk' ), str ],
	];
	return fields
		.map( ( [ key, label, show ] ) => ( {
			label,
			before: show( before[ key ] ),
			after: show( after[ key ] ),
		} ) )
		.filter( ( c ) => c.before !== c.after );
}

type RawVariant = { language?: unknown; subject?: unknown; html?: unknown };

const variants = ( s: Snapshot ): Map< string, RawVariant > =>
	new Map(
		( Array.isArray( s.variants ) ? s.variants : [] ).map(
			( v: RawVariant ) => [ str( v.language ), v ]
		)
	);

/**
 * Changed language texts (added, removed or edited languages).
 *
 * @param before Older snapshot.
 * @param after  Newer snapshot.
 */
export function variantChanges(
	before: Snapshot,
	after: Snapshot
): VariantChange[] {
	const a = variants( before );
	const b = variants( after );
	const languages = [ ...new Set( [ ...a.keys(), ...b.keys() ] ) ].sort();
	const out: VariantChange[] = [];
	for ( const language of languages ) {
		const x = a.get( language );
		const y = b.get( language );
		const textA = htmlToText( str( x?.html ) );
		const textB = htmlToText( str( y?.html ) );
		const subA = str( x?.subject );
		const subB = str( y?.subject );
		if ( textA === textB && subA === subB && !! x === !! y ) {
			continue;
		}
		out.push( {
			language,
			subject: subA === subB ? null : { before: subA, after: subB },
			lines: diffLines( textA, textB ),
		} );
	}
	return out;
}
