/**
 * Globals set by the PHP shell (plan.frontend-ux.md §3.11) and by the three bundles.
 */
export {};

declare global {
	interface Window {
		cliedeskBoot?: unknown;
		cliedesk?: {
			data?: unknown;
			ui?: unknown;
			app?: { mounted?: boolean; [ key: string ]: unknown };
		};
	}
}
