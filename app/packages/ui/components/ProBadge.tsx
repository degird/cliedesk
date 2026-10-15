import {
	can,
	getBoot,
	type BootPayload,
	type ProManifestEntry,
} from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import { ExternalLink } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components/Button';
import { Heading } from 'react-aria-components/Dialog';
import { cx, focusRing } from '../cx';
import { Popover } from './Popover';

/** Capability treated as "administrator" for licence calls to action (UI only). */
export const PRO_ADMIN_CAP = 'cliedesk_manage_settings';

export interface ProBadgeContent {
	/** Pill text: PRO, or UPDATE for an incompatible Pro. */
	pill: string;
	/** Call to action, or null (other staff: ask your administrator). */
	cta: { label: string; href: string | null } | null;
	/** Text for staff without admin rights. */
	note: string | null;
}

/**
 * What the badge and popover say for a licence state (plan.frontend-ux.md §11.4). Returns null when no badge
 * is shown at all (Pro licensed or expired: Pro keeps working).
 *
 * @param pro     `boot.pro`.
 * @param isAdmin User may act on the licence.
 */
export function proBadgeContent(
	pro: BootPayload[ 'pro' ],
	isAdmin: boolean
): ProBadgeContent | null {
	if ( pro.state === 'licensed' || pro.state === 'expired' ) {
		return null;
	}
	const links = pro.links ?? {};
	const ask = __(
		'Available in Cliedesk Pro. Ask your administrator.',
		'cliedesk'
	);
	switch ( pro.state ) {
		case 'pro_inactive':
			return {
				pill: __( 'PRO', 'cliedesk' ),
				cta: isAdmin
					? {
							label: __( 'Activate the Pro plugin', 'cliedesk' ),
							href: links.plugins ?? null,
						}
					: null,
				note: isAdmin ? null : ask,
			};
		case 'unlicensed':
			return {
				pill: __( 'PRO', 'cliedesk' ),
				cta: isAdmin
					? {
							label: __( 'Activate your licence', 'cliedesk' ),
							href: links.activateLicence ?? null,
						}
					: null,
				note: isAdmin ? null : ask,
			};
		case 'revoked':
			return {
				pill: __( 'PRO', 'cliedesk' ),
				cta: isAdmin
					? {
							label: __( 'Check licence', 'cliedesk' ),
							href: links.activateLicence ?? null,
						}
					: null,
				note: isAdmin ? null : ask,
			};
		case 'incompatible':
			return {
				pill: __( 'UPDATE', 'cliedesk' ),
				cta: isAdmin
					? {
							label: __( 'Update Cliedesk', 'cliedesk' ),
							href: links.plugins ?? null,
						}
					: null,
				note: isAdmin
					? null
					: __(
							'This feature needs an update of Cliedesk. Ask your administrator.',
							'cliedesk'
						),
			};
		case 'free_only':
		default:
			return {
				pill: __( 'PRO', 'cliedesk' ),
				cta: isAdmin
					? {
							label: __( 'Upgrade to Pro', 'cliedesk' ),
							href: links.upgrade ?? null,
						}
					: null,
				note: isAdmin ? null : ask,
			};
	}
}

/**
 * The PRO pill (text, so never colour only).
 *
 * @param props      Props.
 * @param props.text Pill text.
 */
export function ProPill( { text }: { text?: string } ) {
	return (
		<span className="inline-flex items-center rounded-full bg-pro px-1.5 text-xs font-semibold tracking-wide text-pro-fg">
			{ text ?? __( 'PRO', 'cliedesk' ) }
		</span>
	);
}

export interface ProBadgeProps {
	entry: ProManifestEntry;
	className?: string;
}

/**
 * Pro badge for a manifest entry: one button opening an info popover (§11.3). Owner decision O14: there is
 * deliberately no prop, setting or filter to hide it; it disappears only when licensed Pro fills the slot.
 *
 * @param props Props.
 */
export function ProBadge( { entry, className }: ProBadgeProps ) {
	const boot = getBoot();
	const content = proBadgeContent( boot.pro, can( PRO_ADMIN_CAP ) );
	if ( ! content ) {
		return null;
	}
	const variant = entry.variant ?? 'row';
	const name = sprintf(
		/* translators: %s: feature name. */
		__( '%s, Pro feature. Show details', 'cliedesk' ),
		entry.label
	);
	const learnMore = entry.docs ?? boot.pro.links?.learnMore ?? null;

	const trigger = (
		<AriaButton
			aria-label={ name }
			data-cd-pro-badge={ entry.id }
			className={ cx(
				'text-start text-fg transition-colors data-[hovered]:bg-sunken',
				focusRing,
				variant === 'row' &&
					'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5',
				variant === 'chip' &&
					'inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-sm',
				variant === 'card' &&
					'flex w-full flex-col items-start gap-2 rounded-lg border border-line bg-surface p-4 shadow-1',
				className
			) }
		>
			{ variant === 'card' ? (
				<>
					<span className="flex items-center gap-2 font-semibold">
						{ entry.label } <ProPill text={ content.pill } />
					</span>
					<span className="text-sm text-fg-muted">
						{ entry.description }
					</span>
				</>
			) : (
				<>
					<span>{ entry.label }</span>
					<ProPill text={ content.pill } />
				</>
			) }
		</AriaButton>
	);

	return (
		<Popover trigger={ trigger } label={ entry.label }>
			<div className="flex flex-col gap-2">
				<Heading
					slot="title"
					className="flex items-center gap-2 text-lg font-semibold"
				>
					{ entry.label } <ProPill text={ content.pill } />
				</Heading>
				<p className="text-fg-muted">{ entry.description }</p>
				{ entry.example && (
					<p className="text-sm text-fg-muted">
						{
							/* translators: %s: example of the feature in use. */ sprintf(
								__( 'Example: %s', 'cliedesk' ),
								entry.example
							)
						}
					</p>
				) }
				{ content.note && (
					<p className="text-sm text-fg">{ content.note }</p>
				) }
				<div className="mt-1 flex flex-wrap items-center gap-3">
					{ content.cta && content.cta.href && (
						<a
							href={ content.cta.href }
							className="inline-flex h-(--cd-control-h) items-center rounded-md bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
						>
							{ content.cta.label }
						</a>
					) }
					{ content.cta && ! content.cta.href && (
						<span className="text-sm text-fg-muted">
							{ content.cta.label }
						</span>
					) }
					{ learnMore && (
						<a
							href={ learnMore }
							target="_blank"
							rel="noreferrer noopener"
							className="inline-flex items-center gap-1 text-accent-fg underline-offset-2 hover:underline"
						>
							{ __( 'Learn more', 'cliedesk' ) }
							<ExternalLink aria-hidden="true" size={ 14 } />
							<span className="sr-only">
								{ __( '(opens in a new tab)', 'cliedesk' ) }
							</span>
						</a>
					) }
				</div>
			</div>
		</Popover>
	);
}
