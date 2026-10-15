import { getBoot } from '@cliedesk/data';
import { Outlet } from '@tanstack/react-router';
import { isRTL } from '@wordpress/i18n';

/** Bare layout (sign-in, setup, `_reauth`): no navigation. */
export function BareLayout() {
	return (
		<main
			id="cliedesk-main"
			tabIndex={ -1 }
			dir={ isRTL() || getBoot().i18n.rtl ? 'rtl' : 'ltr' }
			className="flex min-h-screen items-center justify-center bg-canvas p-6 text-fg outline-none"
		>
			<Outlet />
		</main>
	);
}
