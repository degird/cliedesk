/**
 * ADM-04: every disabled control explains why. One wording for the three reasons a control can be off (the
 * person's role, a plugin that is not active, or a Pro feature) and a button that shows it. The reason is visible
 * next to the button and linked to it with aria-describedby, so screen readers announce it too. Fields (Select,
 * TextField) show the reason as their description instead (`description={ whyDisabled( … ) }`), which React Aria
 * links the same way. Tiny on purpose: only lazy screens import it.
 */
import { can, getBoot } from '@cliedesk/data';
import { Button, type ButtonProps } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useId } from 'react';

export interface Needs {
	/** Capability, or a list of which any one is enough. */
	cap?: string | string[];
	/** A plugin the control depends on: its name and whether it is active. */
	plugin?: { name: string; active: boolean };
	/** Needs licensed Cliedesk Pro. */
	pro?: boolean;
}

/** The reason for a control the person's role does not allow. */
export const needsRole = () =>
	__( 'Your role does not allow this. Ask an administrator.', 'cliedesk' );

/**
 * Why a control is disabled, or undefined when nothing is missing.
 *
 * @param needs What the control needs.
 */
export function whyDisabled( needs: Needs ): string | undefined {
	if ( needs.cap !== undefined ) {
		const caps = Array.isArray( needs.cap ) ? needs.cap : [ needs.cap ];
		if ( ! caps.some( ( c ) => can( c ) ) ) {
			return needsRole();
		}
	}
	if ( needs.plugin && ! needs.plugin.active ) {
		return sprintf(
			/* translators: %s: plugin name, e.g. WooCommerce. */
			__(
				'Needs %s. Install and activate the plugin first.',
				'cliedesk'
			),
			needs.plugin.name
		);
	}
	if ( needs.pro ) {
		const state = getBoot().pro?.state;
		if ( state !== 'licensed' && state !== 'expired' ) {
			return __( 'Available in Cliedesk Pro.', 'cliedesk' );
		}
	}
	return undefined;
}

export interface ReasonButtonProps extends ButtonProps {
	/** Why the button is disabled (from `whyDisabled()`); undefined keeps it as it is. */
	reason?: string;
}

/**
 * Button that is disabled while there is a reason, and shows it.
 *
 * @param props Props.
 */
export function ReasonButton( {
	reason,
	isDisabled,
	...rest
}: ReasonButtonProps ) {
	const id = useId();
	if ( ! reason ) {
		return <Button { ...rest } isDisabled={ isDisabled } />;
	}
	return (
		<span className="inline-flex flex-col items-start gap-1">
			<Button { ...rest } isDisabled aria-describedby={ id } />
			<span id={ id } className="text-xs text-fg-muted">
				{ reason }
			</span>
		</span>
	);
}
