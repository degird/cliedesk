/**
 * Free's report pieces that Pro's report fills receive as the `kit` fill prop (FPS-08), so Pro needs no extra exports
 * from the app package: the split table, the key number cards, the number format, agent status names and the
 * screen-reader announcement.
 */
import { statusLabel } from '../../components/StatusMenu';
import { announceResult } from '../../workspace/forms';
import { Breakdown, sortRows } from './Breakdown';
import { formatMetric } from './format';
import { KeyNumbers } from './KeyNumbers';

export const reportsKit = {
	Breakdown,
	KeyNumbers,
	formatMetric,
	sortRows,
	statusLabel,
	announceResult,
};

export type ReportsKit = typeof reportsKit;
