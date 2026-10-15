/**
 * Settings → Automation → SLA policies: the place of Pro's SLA policies screen (the fill of the
 * `settings.sla` slot). Free has no SLA policies; the section is listed only while the slot has a fill, and Settings →
 * Business hours shows the PRO badge. Free's condition editor and the target helpers are the `kit` fill prop, so Pro
 * needs no extra @cliedesk/app exports; only this lazy settings chunk imports them.
 */
import { Slot } from '@cliedesk/ui';
import {
	RuleConditions,
	conditionsJson,
} from '../../components/RuleConditions';
import { statusesQuery } from '../../inbox/api';
import { fromJson } from '../../inbox/conditions';
import { priorityLabel } from '../../inbox/labels';
import { PRIORITIES, formatDuration, parseDuration } from './durations';

export const rulesKit = {
	PRIORITIES,
	RuleConditions,
	conditionsJson,
	formatDuration,
	fromJson,
	parseDuration,
	priorityLabel,
	statusesQuery,
};

export type RulesKit = typeof rulesKit;

export default function SlaPoliciesHost() {
	return <Slot name="settings.sla" fillProps={ { kit: rulesKit } } />;
}
