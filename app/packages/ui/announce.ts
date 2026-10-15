/**
 * Screen-reader announcements through two visually hidden live regions created once (plan.frontend-ux.md §8.4),
 * so announcements never depend on component lifetimes.
 */
let regions: { polite: HTMLElement; assertive: HTMLElement } | null = null;

function region( politeness: 'polite' | 'assertive' ): HTMLElement {
	const el = document.createElement( 'div' );
	el.setAttribute( 'aria-live', politeness );
	el.setAttribute( 'aria-atomic', 'true' );
	el.setAttribute( 'role', politeness === 'assertive' ? 'alert' : 'status' );
	el.className = 'sr-only';
	el.dataset.cdAnnouncer = politeness;
	document.body.appendChild( el );
	return el;
}

/**
 * Announce a message.
 *
 * @param text       Text.
 * @param politeness polite (default) or assertive.
 */
export function announce(
	text: string,
	politeness: 'polite' | 'assertive' = 'polite'
): void {
	if ( typeof document === 'undefined' ) {
		return;
	}
	if ( ! regions || ! regions.polite.isConnected ) {
		regions = {
			polite: region( 'polite' ),
			assertive: region( 'assertive' ),
		};
	}
	const el = regions[ politeness ];
	el.textContent = '';
	// A new text node after a tick is announced even when the text repeats.
	window.setTimeout( () => {
		el.textContent = text;
	}, 50 );
}
