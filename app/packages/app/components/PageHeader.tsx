import { getBoot } from '@cliedesk/data';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, type ReactNode } from 'react';

export interface PageHeaderProps {
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
	/** 2 inside a pane next to another screen (the screen keeps the h1 and the document title). */
	level?: 1 | 2;
	/** Shown right after the title, e.g. an edit button. */
	titleAddon?: ReactNode;
	/** Smaller title and no bottom space (work screens such as a conversation). */
	dense?: boolean;
}

/**
 * Page heading: the one h1 per screen (focus target on route change, §8.3) and document.title.
 *
 * @param props Props.
 */
export function PageHeader( {
	title,
	description,
	actions,
	level = 1,
	titleAddon,
	dense = false,
}: PageHeaderProps ) {
	useEffect( () => {
		if ( level !== 1 ) {
			return;
		}
		const ws = getBoot().workspace.name;
		// translators: 1: page title, 2: workspace name.
		const full = sprintf( __( '%1$s · %2$s', 'cliedesk' ), title, ws );
		document.title = ws ? full : title;
	}, [ title, level ] );
	const Heading = level === 1 ? 'h1' : 'h2';
	let size = level === 1 ? 'text-2xl' : 'text-xl';
	if ( dense ) {
		size = 'text-lg';
	}
	const heading = (
		<Heading
			tabIndex={ -1 }
			className={ `${ size } min-w-0 font-semibold text-fg outline-none` }
		>
			{ title }
		</Heading>
	);
	return (
		<header
			className={
				dense
					? 'flex flex-wrap items-start justify-between gap-x-3 gap-y-2'
					: 'flex flex-wrap items-start justify-between gap-3 pb-6'
			}
		>
			<div className="flex min-w-0 flex-col gap-1">
				{ titleAddon ? (
					<div className="flex min-w-0 items-center gap-1">
						{ heading }
						{ titleAddon }
					</div>
				) : (
					heading
				) }
				{ description && (
					<p
						className={
							dense ? 'text-sm text-fg-muted' : 'text-fg-muted'
						}
					>
						{ description }
					</p>
				) }
			</div>
			{ actions && (
				<div className="flex flex-wrap items-center gap-2">
					{ actions }
				</div>
			) }
		</header>
	);
}
