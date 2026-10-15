/**
 * Invite input parsing (TEAM-02), done in the browser so the admin sees a preview before anything is sent:
 * a pasted list of email addresses, or CSV (pasted or uploaded) with the columns email, name, role, teams.
 */
import { __, sprintf } from '@wordpress/i18n';

/** Most rows one invite request accepts (server limit). */
export const MAX_INVITE_ROWS = 500;

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/**
 * Parse CSV text (RFC 4180: quoted fields, doubled quotes, CRLF or LF). Blank lines are dropped.
 *
 * @param text CSV text.
 */
export function parseCsv( text: string ): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	const src = text.replace( /^\uFEFF/, '' );
	for ( let i = 0; i < src.length; i++ ) {
		const ch = src[ i ];
		if ( quoted ) {
			if ( ch === '"' ) {
				if ( src[ i + 1 ] === '"' ) {
					field += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if ( ch === '"' && field.trim() === '' ) {
			field = '';
			quoted = true;
		} else if ( ch === ',' ) {
			row.push( field );
			field = '';
		} else if ( ch === '\n' || ch === '\r' ) {
			if ( ch === '\r' && src[ i + 1 ] === '\n' ) {
				i++;
			}
			row.push( field );
			rows.push( row );
			row = [];
			field = '';
		} else {
			field += ch;
		}
	}
	row.push( field );
	rows.push( row );
	return rows
		.map( ( r ) => r.map( ( c ) => c.trim() ) )
		.filter( ( r ) => r.some( ( c ) => c !== '' ) );
}

export interface InviteContext {
	roles: Array< { key: string; name: string } >;
	teams: Array< { id: number; name: string } >;
	/** Role for rows without one. */
	defaultRole: string;
	/** Teams for rows without any. */
	defaultTeams: number[];
}

export interface ParsedInvite {
	/** 1-based line (row) number in the input, for messages. */
	line: number;
	email: string;
	name: string;
	role: string;
	teams: number[];
	problems: string[];
}

type Column = 'email' | 'name' | 'role' | 'teams';

const HEADERS: Record< string, Column > = {
	email: 'email',
	'e-mail': 'email',
	'email address': 'email',
	name: 'name',
	'display name': 'name',
	role: 'role',
	teams: 'teams',
	team: 'teams',
};

function resolveRole( value: string, ctx: InviteContext ): string | null {
	const v = value.trim().toLowerCase();
	if ( ! v ) {
		return ctx.defaultRole;
	}
	const r = ctx.roles.find(
		( x ) => x.key.toLowerCase() === v || x.name.toLowerCase() === v
	);
	return r ? r.key : null;
}

function resolveTeams(
	value: string,
	ctx: InviteContext
): { ids: number[]; unknown: string[] } {
	const parts = value
		.split( /[;|]|,/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	if ( ! parts.length ) {
		return { ids: [ ...ctx.defaultTeams ], unknown: [] };
	}
	const ids: number[] = [];
	const unknown: string[] = [];
	for ( const p of parts ) {
		const t = ctx.teams.find(
			( x ) =>
				String( x.id ) === p || x.name.toLowerCase() === p.toLowerCase()
		);
		if ( t ) {
			if ( ! ids.includes( t.id ) ) {
				ids.push( t.id );
			}
		} else {
			unknown.push( p );
		}
	}
	return { ids, unknown };
}

/**
 * Turn pasted text or CSV into invite rows with the problems of each row. Accepted inputs:
 * - email addresses separated by new lines, commas, semicolons or spaces;
 * - CSV with a header row naming the columns email, name, role, teams (any order);
 * - CSV without a header, in the order email, name, role, teams.
 * Roles match by key or name, teams by id or name (several teams separated by semicolons).
 *
 * @param text Input.
 * @param ctx  Roles, teams and defaults.
 */
export function parseInvites(
	text: string,
	ctx: InviteContext
): ParsedInvite[] {
	const rows = parseCsv( text );
	if ( ! rows.length ) {
		return [];
	}
	const header = ( rows[ 0 ] ?? [] ).map(
		( c ) => HEADERS[ c.toLowerCase() ] ?? null
	);
	const hasHeader = header.includes( 'email' );
	const plain =
		! hasHeader &&
		rows.every( ( r ) =>
			r.every( ( c ) => c === '' || c.includes( '@' ) )
		);
	const out: ParsedInvite[] = [];
	const add = (
		line: number,
		cells: Partial< Record< Column, string > >
	) => {
		const problems: string[] = [];
		const email = ( cells.email ?? '' ).trim().toLowerCase();
		if ( ! EMAIL.test( email ) ) {
			problems.push(
				email
					? __( 'This is not a valid email address.', 'cliedesk' )
					: __( 'The email address is missing.', 'cliedesk' )
			);
		} else if ( out.some( ( o ) => o.email === email ) ) {
			problems.push( __( 'This address is listed twice.', 'cliedesk' ) );
		}
		const role = resolveRole( cells.role ?? '', ctx );
		if ( ! role ) {
			problems.push(
				sprintf(
					/* translators: %s: role name as written in the file. */
					__( 'Unknown role “%s”.', 'cliedesk' ),
					cells.role ?? ''
				)
			);
		}
		const teams = resolveTeams( cells.teams ?? '', ctx );
		for ( const u of teams.unknown ) {
			problems.push(
				sprintf(
					/* translators: %s: team name as written in the file. */
					__( 'Unknown team “%s”.', 'cliedesk' ),
					u
				)
			);
		}
		out.push( {
			line,
			email,
			name: ( cells.name ?? '' ).trim(),
			role: role ?? '',
			teams: teams.ids,
			problems,
		} );
	};

	if ( plain ) {
		let line = 0;
		for ( const r of rows ) {
			for ( const cell of r ) {
				for ( const email of cell
					.split( /[\s;]+/ )
					.filter( Boolean ) ) {
					add( ++line, { email } );
				}
			}
		}
	} else {
		const columns: Array< Column | null > = hasHeader
			? header
			: [ 'email', 'name', 'role', 'teams' ];
		rows.slice( hasHeader ? 1 : 0 ).forEach( ( r, i ) => {
			const cells: Partial< Record< Column, string > > = {};
			r.forEach( ( c, j ) => {
				const col = columns[ j ];
				if ( col ) {
					cells[ col ] = cells[ col ]
						? `${ cells[ col ] };${ c }`
						: c;
				} else if ( ! hasHeader && j >= 3 ) {
					// Unquoted extra teams after the fourth column.
					cells.teams = cells.teams ? `${ cells.teams };${ c }` : c;
				}
			} );
			add( i + 1, cells );
		} );
	}
	if ( out.length > MAX_INVITE_ROWS ) {
		for ( const o of out.slice( MAX_INVITE_ROWS ) ) {
			o.problems.push(
				sprintf(
					/* translators: %d: maximum number of people per invite. */
					__( 'Invite at most %d people at a time.', 'cliedesk' ),
					MAX_INVITE_ROWS
				)
			);
		}
	}
	return out;
}
