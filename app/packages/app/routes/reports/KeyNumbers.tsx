/**
 * Reports → the key numbers of the overview (RPT-02): every metric of the catalog with its formula as a tooltip.
 * Pro's fill of `reports.overview` renders the same cards (through the reports kit) with the period before, the
 * target status and numbers that open their conversations (`renderValue`, `renderExtra`).
 */
import { Tooltip } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatMetric, type MetricUnit } from './format';

export interface Metric {
	label: string;
	unit: MetricUnit;
	formula: string;
}

export type Values = Record< string, number | null >;

export function KeyNumbers( {
	metrics,
	values,
	renderValue,
	renderExtra,
}: {
	metrics: Record< string, Metric >;
	values: Values;
	/** The number of a card (default: its text). */
	renderValue?: ( key: string, m: Metric, text: string ) => ReactNode;
	/** More lines under the number. */
	renderExtra?: ( key: string, m: Metric ) => ReactNode;
} ) {
	return (
		<ul
			aria-label={ __( 'Key numbers', 'cliedesk' ) }
			className="grid grid-cols-2 gap-3 md:grid-cols-4"
		>
			{ Object.entries( metrics ).map( ( [ key, m ] ) => {
				const text = formatMetric( m.unit, values[ key ] ?? null );
				return (
					<li
						key={ key }
						className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4"
					>
						<span className="flex items-center gap-1 text-sm text-fg-muted">
							{ m.label }
							<Tooltip content={ m.formula }>
								<button
									type="button"
									className="text-fg-muted"
									aria-label={ sprintf(
										/* translators: %s: metric name. */
										__( 'How %s is counted', 'cliedesk' ),
										m.label
									) }
								>
									<Info size={ 14 } aria-hidden />
								</button>
							</Tooltip>
						</span>
						<span className="sr-only">{ m.formula }</span>
						{ renderValue ? (
							renderValue( key, m, text )
						) : (
							<span className="text-2xl font-semibold tabular-nums">
								{ text }
							</span>
						) }
						{ renderExtra?.( key, m ) }
					</li>
				);
			} ) }
		</ul>
	);
}
