/**
 * Timeline lines for routing reasons a module adds (Pro, FPS-07: entry conditions, sticky, offers, re-routing). Kept
 * apart from `routedLabel.ts` so the registry adds almost nothing to the start-up bundle.
 */

/** One line for a `conversation.routed` event; `name` gives an agent's name from an id. */
export type RoutedReason = (
	data: Record< string, unknown >,
	name: ( id: unknown ) => string
) => string;

const reasons = new Map< string, RoutedReason >();

/**
 * Describe a routing reason on the timeline.
 *
 * @param reason   Reason key of the event.
 * @param describe One-line description.
 */
export function registerRoutedReason(
	reason: string,
	describe: RoutedReason
): void {
	reasons.set( reason, describe );
}

/**
 * The description of a module's reason, if one is registered.
 *
 * @param reason Reason key.
 */
export function routedReason( reason: string ): RoutedReason | undefined {
	return reasons.get( reason );
}
