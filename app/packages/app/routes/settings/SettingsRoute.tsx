import { LoadingRegion } from '@cliedesk/ui';
import { Navigate, useParams } from '@tanstack/react-router';
import {
	lazy,
	Suspense,
	type ComponentType,
	type LazyExoticComponent,
} from 'react';
import { PageHeader } from '../../components/PageHeader';
import { visibleSettingsAreas } from '../../components/SettingsNav';
import type { SettingsSection } from '../../registry';
import { NotFound } from '../NotFound';
import { sectionDescription } from './descriptions';
import { sectionDocs } from './docs';
import { __ } from '@wordpress/i18n';

const lazies = new Map< string, LazyExoticComponent< ComponentType > >();

function sectionComponent( s: SettingsSection ) {
	const key = `${ s.area }/${ s.id }`;
	let C = lazies.get( key );
	if ( ! C ) {
		C = lazy( s.component );
		lazies.set( key, C );
	}
	return C;
}

/**
 * Find a visible section. `section` undefined → the area's first section.
 *
 * @param area    Area.
 * @param section Section id.
 */
export function findSection(
	area: string,
	section?: string
): SettingsSection | null {
	const group = visibleSettingsAreas().find( ( a ) => a.area === area );
	if ( ! group ) {
		return null;
	}
	return (
		( section
			? group.sections.find( ( s ) => s.id === section )
			: group.sections[ 0 ] ) ?? null
	);
}

/**
 * `/settings/$area[/$section]`: renders a registered settings section (§5.6) with its title and description.
 */
export default function SettingsRoute() {
	const params = useParams( { strict: false } ) as {
		area?: string;
		section?: string;
	};
	const s = params.area ? findSection( params.area, params.section ) : null;
	if ( ! s ) {
		// ADM-02: an old address (the section moved to another area) goes to its new place.
		const moved = visibleSettingsAreas()
			.flatMap( ( a ) => a.sections )
			.find( ( x ) => x.id === params.section );
		return moved ? (
			<Navigate
				to={ `/settings/${ moved.area }/${ moved.id }` }
				replace
			/>
		) : (
			<NotFound />
		);
	}
	const C = sectionComponent( s );
	return (
		<div
			className={ `mx-auto flex flex-col ${
				s.wide ? 'max-w-6xl' : 'max-w-3xl'
			}` }
		>
			<PageHeader
				title={ s.label }
				description={ s.description ?? sectionDescription( s.id ) }
				actions={
					<a
						href={ sectionDocs( s ) }
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm text-accent-fg underline"
					>
						{ __( 'Documentation', 'cliedesk' ) }
						<span className="sr-only">
							{ __( '(opens in a new tab)', 'cliedesk' ) }
						</span>
					</a>
				}
			/>
			<Suspense fallback={ <LoadingRegion /> }>
				<C />
			</Suspense>
		</div>
	);
}

/** `/settings`: go to the first section the user may open. */
export function SettingsIndex() {
	const first = visibleSettingsAreas()[ 0 ]?.sections[ 0 ];
	if ( ! first ) {
		return <NotFound />;
	}
	return (
		<Navigate to={ `/settings/${ first.area }/${ first.id }` } replace />
	);
}
