/**
 * Settings → Team & roles → Statuses: the place of Pro's custom statuses and automatic presence screen (the fill of
 * the `settings.statuses` slot, FPS-07). Free has the five standard statuses only; the section is listed only while
 * the slot has a fill, and Settings → Teams shows the PRO badge. Free's status icons and labels are the `kit` fill
 * prop.
 */
import { Slot } from '@cliedesk/ui';
import { statusKit } from '../../components/StatusMenu';

export default function StatusesHost() {
	return <Slot name="settings.statuses" fillProps={ { kit: statusKit } } />;
}
