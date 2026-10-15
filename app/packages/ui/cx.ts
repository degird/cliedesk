/**
 * Join class names (falsy values are skipped).
 *
 * @param parts Class names.
 */
export function cx(
	...parts: Array< string | false | null | undefined >
): string {
	return parts.filter( Boolean ).join( ' ' );
}

/** Focus ring for elements styled through React Aria's data-focus-visible. */
export const focusRing =
	'outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus';
