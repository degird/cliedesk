/**
 * Query options for the M0 core screens (keys per plan.frontend-ux.md §4.3).
 */
import { api, queryOptions } from '@cliedesk/data';

export type HealthStatus = 'ok' | 'info' | 'warning' | 'critical';

export interface HealthCheck {
	id: string;
	status: HealthStatus;
	label: string;
	message: string;
	/** URL or a text hint. */
	fix?: string | { label?: string; url?: string };
}

export interface SettingSchema {
	id?: string;
	type?: string;
	default?: unknown;
	min?: number | null;
	max?: number | null;
	choices?: unknown[];
	risk?: string;
}

export interface SettingValue {
	value: unknown;
	source: string;
	default: unknown;
	schema?: SettingSchema;
}

export type SettingsModule = Record< string, SettingValue >;

export const healthQuery = () =>
	queryOptions( {
		queryKey: [ 'health' ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { checks: HealthCheck[] } >( 'health', {
					signal,
				} )
			).data,
	} );

export const settingsQuery = ( module: string ) =>
	queryOptions( {
		queryKey: [ 'settings', module ] as const,
		queryFn: async ( { signal } ) => {
			const r = await api.get< SettingsModule >( `settings/${ module }`, {
				signal,
			} );
			return { values: r.data, etag: r.etag };
		},
	} );

/**
 * Summary counts of health statuses.
 *
 * @param checks Checks.
 */
export function summarise(
	checks: HealthCheck[]
): Record< HealthStatus, number > {
	const out: Record< HealthStatus, number > = {
		ok: 0,
		info: 0,
		warning: 0,
		critical: 0,
	};
	for ( const c of checks ) {
		out[ c.status in out ? c.status : 'info' ]++;
	}
	return out;
}
