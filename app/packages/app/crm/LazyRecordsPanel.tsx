/**
 * The records panel (CRM-44/45), loaded on demand so the screens that show it stay small.
 */
import { Suspense, lazy, type ComponentProps } from 'react';

const Panel = lazy(
	() => import( /* webpackChunkName: "records" */ './RecordsPanel' )
);

/**
 * Records panel (lazy).
 *
 * @param props Props of RecordsPanel.
 */
export function LazyRecordsPanel( props: ComponentProps< typeof Panel > ) {
	return (
		<Suspense fallback={ null }>
			<Panel { ...props } />
		</Suspense>
	);
}
