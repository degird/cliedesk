/**
 * Paths of the team screens (below the app base).
 */
export const PEOPLE_PATH = '/settings/team/people';
export const ROLES_PATH = '/settings/team/roles';
export const TEAMS_PATH = '/settings/team/teams';
export const PROFILE_PATH = '/settings/team/profile';

/**
 * Person page.
 *
 * @param id User id.
 */
export const personPath = ( id: number ): string => `${ PEOPLE_PATH }/${ id }`;

/**
 * Role editor.
 *
 * @param key Role key.
 */
export const rolePath = ( key: string ): string => `${ ROLES_PATH }/${ key }`;

/**
 * Team page.
 *
 * @param id Team id.
 */
export const teamPath = ( id: number ): string => `${ TEAMS_PATH }/${ id }`;
