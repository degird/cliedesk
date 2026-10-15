import { can, getBoot, hasModule } from '@cliedesk/data';
import { __ } from '@wordpress/i18n';
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useSlotFills, type SlotFill } from '../slots';
import { PRO_ADMIN_CAP, ProBadge, proBadgeContent } from './ProBadge';

class FillBoundary extends Component<
	{ id: string; children: ReactNode },
	{ failed: boolean }
> {
	override state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	override componentDidCatch( error: Error, info: ErrorInfo ) {
		// eslint-disable-next-line no-console
		console.error(
			`[cliedesk] slot fill "${ this.props.id }" failed`,
			error,
			info.componentStack
		);
	}

	override render() {
		if ( this.state.failed ) {
			// Nothing for agents; admins see a chip (§4.11).
			return can( PRO_ADMIN_CAP ) ? (
				<span className="inline-flex items-center rounded-full border border-danger-line bg-danger-subtle px-2 text-xs text-danger">
					{ __( 'Extension error', 'cliedesk' ) }
				</span>
			) : null;
		}
		return this.props.children;
	}
}

/**
 * Visible fills for a slot (module active, capability held).
 *
 * @param name Slot name.
 */
export function useVisibleFills( name: string ): SlotFill[] {
	return useSlotFills( name ).filter(
		( f ) => hasModule( f.module ) && can( f.capability )
	);
}

/**
 * Whether a slot has visible fills (to hide empty containers).
 *
 * @param name Slot name.
 */
export function useSlotHasFills( name: string ): boolean {
	return useVisibleFills( name ).length > 0;
}

export interface SlotProps {
	name: string;
	/** Props passed to every fill. */
	fillProps?: Record< string, unknown >;
	/** Rendered after the Pro badge when there is no fill. */
	fallback?: ReactNode;
	className?: string;
}

/**
 * Extension point (plan.frontend-ux.md §4.2, §11). Renders every registered fill (each in its own Suspense and
 * error boundary). With no fill it renders the PRO badge of the manifest entry for this slot, then `fallback`.
 * Owner decision O14: the badge cannot be hidden — there is no prop for it; it disappears only when licensed Pro
 * fills the slot (or the server stops sending the manifest because Pro is licensed).
 *
 * @param props Props.
 */
export function Slot( { name, fillProps, fallback, className }: SlotProps ) {
	const list = useVisibleFills( name );
	if ( list.length ) {
		return (
			<div className={ className } data-cd-slot={ name }>
				{ list.map( ( fill ) => {
					const C = fill.component;
					return (
						<FillBoundary key={ fill.id } id={ fill.id }>
							<Suspense fallback={ null }>
								<C { ...( fillProps ?? {} ) } />
							</Suspense>
						</FillBoundary>
					);
				} ) }
			</div>
		);
	}
	const boot = getBoot();
	const found = boot.pro.manifest.find( ( e ) => e.slot === name );
	// No badge once Pro is licensed (or expired: Pro keeps working), whatever the manifest says.
	const entry = found && proBadgeContent( boot.pro, false ) ? found : null;
	if ( ! entry && ! fallback ) {
		return null;
	}
	return (
		<div className={ className } data-cd-slot={ name }>
			{ entry && <ProBadge entry={ entry } /> }
			{ fallback }
		</div>
	);
}
