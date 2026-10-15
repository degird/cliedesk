/**
 * Role levels (TEAM-15/16): views and saved replies none / use / personal / team / global; tags none / use /
 * create / global. Each level is a capability and includes every lower one (same ladders as `Roles::levels()`).
 */
import { __ } from '@wordpress/i18n';

export type LevelObject = 'views' | 'replies' | 'tags';

export interface RoleLevels {
	views: string;
	replies: string;
	tags: string;
}

export const LEVEL_OBJECTS: LevelObject[] = [ 'views', 'replies', 'tags' ];

/** Level → capability, lowest first ("none" holds none of them). */
export const LEVEL_LADDERS: Record<
	LevelObject,
	Array< { level: string; cap: string } >
> = {
	views: [
		{ level: 'use', cap: 'cliedesk_use_views' },
		{ level: 'personal', cap: 'cliedesk_create_views' },
		{ level: 'team', cap: 'cliedesk_manage_team_views' },
		{ level: 'global', cap: 'cliedesk_manage_shared_views' },
	],
	replies: [
		{ level: 'use', cap: 'cliedesk_use_saved_replies' },
		{ level: 'personal', cap: 'cliedesk_create_saved_replies' },
		{ level: 'team', cap: 'cliedesk_manage_team_replies' },
		{ level: 'global', cap: 'cliedesk_manage_shared_replies' },
	],
	tags: [
		{ level: 'use', cap: 'cliedesk_apply_tags' },
		{ level: 'create', cap: 'cliedesk_create_tags' },
		{ level: 'global', cap: 'cliedesk_manage_tags' },
	],
};

/**
 * Level names of an object, lowest first.
 *
 * @param object Object.
 */
export function levelsOf( object: LevelObject ): string[] {
	return [ 'none', ...LEVEL_LADDERS[ object ].map( ( s ) => s.level ) ];
}

/**
 * Current level: the highest step whose capability is held (as the server computes it).
 *
 * @param caps   Capabilities.
 * @param object Object.
 */
export function levelFromCaps(
	caps: Iterable< string >,
	object: LevelObject
): string {
	const held = new Set( caps );
	let level = 'none';
	for ( const step of LEVEL_LADDERS[ object ] ) {
		if ( held.has( step.cap ) ) {
			level = step.level;
		}
	}
	return level;
}

/**
 * All three levels of a capability set.
 *
 * @param caps Capabilities.
 */
export function levelsFromCaps( caps: Iterable< string > ): RoleLevels {
	const list = [ ...caps ];
	return {
		views: levelFromCaps( list, 'views' ),
		replies: levelFromCaps( list, 'replies' ),
		tags: levelFromCaps( list, 'tags' ),
	};
}

/**
 * Capabilities a level sets (its step and every lower one) and clears (every higher one).
 *
 * @param object Object.
 * @param level  Level.
 */
export function levelCaps(
	object: LevelObject,
	level: string
): { set: string[]; clear: string[] } {
	const ladder = LEVEL_LADDERS[ object ];
	const index = ladder.findIndex( ( s ) => s.level === level );
	return {
		set: ladder.slice( 0, index + 1 ).map( ( s ) => s.cap ),
		clear: ladder.slice( index + 1 ).map( ( s ) => s.cap ),
	};
}

/**
 * A capability set with an object's level applied.
 *
 * @param caps   Capabilities.
 * @param object Object.
 * @param level  Level.
 */
export function applyLevel(
	caps: Set< string >,
	object: LevelObject,
	level: string
): Set< string > {
	const next = new Set( caps );
	const { set, clear } = levelCaps( object, level );
	set.forEach( ( c ) => next.add( c ) );
	clear.forEach( ( c ) => next.delete( c ) );
	return next;
}

/**
 * Object label.
 *
 * @param object Object.
 */
export function levelObjectLabel( object: LevelObject ): string {
	switch ( object ) {
		case 'views':
			return __( 'Views', 'cliedesk' );
		case 'replies':
			return __( 'Saved replies', 'cliedesk' );
		default:
			return __( 'Tags', 'cliedesk' );
	}
}

/**
 * Level label.
 *
 * @param object Object.
 * @param level  Level.
 */
export function levelLabel( object: LevelObject, level: string ): string {
	switch ( level ) {
		case 'none':
			return __( 'None', 'cliedesk' );
		case 'use':
			return object === 'tags'
				? __( 'Apply existing tags', 'cliedesk' )
				: __( 'Use', 'cliedesk' );
		case 'personal':
			return __( 'Use and create their own', 'cliedesk' );
		case 'team':
			return __( 'Manage their team’s', 'cliedesk' );
		case 'create':
			return __( 'Apply and create', 'cliedesk' );
		case 'global':
			return object === 'tags'
				? __( 'Manage all tags', 'cliedesk' )
				: __( 'Manage everyone’s', 'cliedesk' );
		default:
			return level;
	}
}
