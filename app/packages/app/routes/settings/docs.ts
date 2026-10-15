/**
 * ADM-04: every settings screen links to its documentation. A section can name its own page (`docs`); otherwise the
 * page follows the settings address, so add-on and Pro sections get a link too.
 */
import type { SettingsSection } from '../../registry';

export const DOCS_BASE = 'https://cliedesk.com/docs/';

/**
 * The documentation page of a settings section.
 *
 * @param s Section.
 */
export function sectionDocs(
	s: Pick< SettingsSection, 'area' | 'id' | 'docs' >
): string {
	if ( s.docs ) {
		return /^https:\/\//.test( s.docs )
			? s.docs
			: DOCS_BASE + s.docs.replace( /^\/+/, '' );
	}
	return `${ DOCS_BASE }settings/${ encodeURIComponent( s.area ) }/${ encodeURIComponent( s.id ) }/`;
}
