/**
 * Small inbox pieces Pro's list and header fills reuse (FPS-06: the SLA badge). Passed to fills as the `kit` fill prop,
 * so Pro needs no extra @cliedesk/app exports.
 */
import { parseUtc } from '../workspace/api';
import { Pill, shortDuration } from './components';
import { fullTime } from './labels';

export const inboxKit = { Pill, fullTime, parseUtc, shortDuration };

export type InboxKit = typeof inboxKit;
