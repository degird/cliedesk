/**
 * CRM settings exposed in the boot payload (kept tiny: core.ts imports it into the start-up bundle).
 */
import { getBoot } from '@cliedesk/data';

/**
 * Whether organizations are turned on (exposed setting contacts.organizations; on unless set to false).
 */
export function organizationsEnabled(): boolean {
	return getBoot().settings?.[ 'contacts.organizations' ] !== false;
}
