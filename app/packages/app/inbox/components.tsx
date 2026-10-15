/**
 * Small shared pieces of the inbox, conversation and contact screens: badges, avatars, query and action errors,
 * agent names.
 */
import { isApiError, useQuery } from '@cliedesk/data';
import { ErrorState, cx } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { ChevronDown } from 'lucide-react';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { describeError } from '../components/RouteError';
import { agentLookupQuery, agentName, type Priority } from './api';
import { priorityLabel } from './labels';

export type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

const TONES: Record< Tone, string > = {
	neutral: 'border-line text-fg-muted',
	accent: 'border-accent text-accent-fg',
	warning: 'border-warning-line bg-warning-subtle text-fg',
	danger: 'border-danger-line bg-danger-subtle text-fg',
	success: 'border-success-line bg-success-subtle text-fg',
};

/**
 * Text badge (never colour only).
 *
 * @param props           Props.
 * @param props.tone      Tone.
 * @param props.children  Text.
 * @param props.className Extra classes.
 */
export function Pill( {
	tone = 'neutral',
	children,
	className,
}: {
	tone?: Tone;
	children: ReactNode;
	className?: string;
} ) {
	return (
		<span
			className={ cx(
				'inline-flex items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap',
				TONES[ tone ],
				className
			) }
		>
			{ children }
		</span>
	);
}

const PRIORITY_TONE: Record< string, Tone > = {
	urgent: 'danger',
	high: 'warning',
	normal: 'neutral',
	low: 'neutral',
};

/**
 * Priority badge ("No priority" shows nothing).
 *
 * @param props          Props.
 * @param props.priority Priority.
 */
export function PriorityBadge( { priority }: { priority: Priority } ) {
	if ( priority === 'none' ) {
		return null;
	}
	return (
		<Pill tone={ PRIORITY_TONE[ priority ] ?? 'neutral' }>
			{ priorityLabel( priority ) }
		</Pill>
	);
}

const CATEGORY_TONE: Record< string, Tone > = {
	new: 'accent',
	open: 'accent',
	waiting: 'neutral',
	resolved: 'success',
	closed: 'neutral',
};

/**
 * Status badge.
 *
 * @param props          Props.
 * @param props.label    Label.
 * @param props.category Status category.
 */
export function StatusBadge( {
	label,
	category,
}: {
	label: string;
	category: string;
} ) {
	return (
		<Pill tone={ CATEGORY_TONE[ category ] ?? 'neutral' }>{ label }</Pill>
	);
}

/**
 * Initials of a name.
 *
 * @param name Name.
 */
export function initials( name: string ): string {
	const parts = name.trim().split( /\s+/ ).filter( Boolean );
	const first = Array.from( parts[ 0 ] ?? '?' )[ 0 ] ?? '?';
	const last =
		parts.length > 1
			? Array.from( parts[ parts.length - 1 ] ?? '' )[ 0 ]
			: '';
	return ( first + ( last ?? '' ) ).toUpperCase();
}

/**
 * Avatar image or initials (decorative: the name is always next to it).
 *
 * @param props      Props.
 * @param props.name Name.
 * @param props.src  Image URL.
 * @param props.size Size in px.
 */
export function Avatar( {
	name,
	src,
	size = 40,
}: {
	name: string;
	src?: string | null;
	size?: number;
} ) {
	return src ? (
		<img
			src={ src }
			alt=""
			width={ size }
			height={ size }
			className="shrink-0 rounded-full bg-sunken object-cover"
		/>
	) : (
		<span
			aria-hidden="true"
			style={ { width: size, height: size } }
			className="flex shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent-fg"
		>
			{ initials( name ) }
		</span>
	);
}

/**
 * Error state of a failed query, with Retry.
 *
 * @param props              Props.
 * @param props.title        Title.
 * @param props.error        Error.
 * @param props.onRetry      Retry.
 * @param props.headingLevel Heading level.
 */
export function QueryFailed( {
	title,
	error,
	onRetry,
	headingLevel = 2,
}: {
	title: string;
	error: unknown;
	onRetry: () => void;
	headingLevel?: 1 | 2 | 3;
} ) {
	return (
		<ErrorState
			headingLevel={ headingLevel }
			title={ title }
			message={ describeError( error ) }
			code={ isApiError( error ) ? error.code : null }
			requestId={ isApiError( error ) ? error.requestId : null }
			onRetry={ onRetry }
		/>
	);
}

export { ActionError, actionMessage } from '../components/ActionError';

/**
 * Agent names (GET agents, when allowed) and a lookup function.
 */
export function useAgents() {
	const q = useQuery( agentLookupQuery() );
	const agents = q.data;
	const nameFor = useCallback(
		( id: number ) => agentName( id, agents ),
		[ agents ]
	);
	return { agents: agents ?? [], nameFor };
}

/** Collapse state of the side panel slot a section renders in (INB-66). */
export const PanelSlot = createContext< {
	collapsed: boolean;
	onToggle: () => void;
} | null >( null );

/**
 * "Section" box used in side panels. Inside a PanelSlot it can be collapsed.
 *
 * @param props          Props.
 * @param props.id       Heading id.
 * @param props.title    Heading.
 * @param props.actions  Header actions.
 * @param props.children Content.
 */
export function PanelSection( {
	id,
	title,
	actions,
	children,
}: {
	id: string;
	title: string;
	actions?: ReactNode;
	children: ReactNode;
} ) {
	const slot = useContext( PanelSlot );
	const collapsed = !! slot?.collapsed;
	return (
		<section
			aria-labelledby={ id }
			className="flex flex-col gap-2 border-b border-line py-4 last:border-b-0"
		>
			<div className="flex items-center justify-between gap-2">
				<h2 id={ id } className="text-sm font-semibold text-fg">
					{ title }
				</h2>
				<div className="flex items-center gap-2">
					{ ! collapsed && actions }
					{ slot && (
						<button
							type="button"
							aria-expanded={ ! collapsed }
							aria-label={ title }
							onClick={ slot.onToggle }
							className="rounded px-1 text-fg-muted outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
						>
							<ChevronDown
								aria-hidden="true"
								size={ 16 }
								className={
									collapsed
										? '-rotate-90 rtl:rotate-90'
										: undefined
								}
							/>
						</button>
					) }
				</div>
			</div>
			{ ! collapsed && children }
		</section>
	);
}

/**
 * Small muted text.
 *
 * @param props          Props.
 * @param props.children Text.
 */
export function Muted( { children }: { children: ReactNode } ) {
	return <p className="text-sm text-fg-muted">{ children }</p>;
}

export const noAccess = () =>
	__( 'You do not have permission to do this.', 'cliedesk' );

/**
 * Short duration: "45m", "2h 10m", "3d 4h".
 *
 * @param secs Seconds (absolute value is used).
 */
export function shortDuration( secs: number ): string {
	const s = Math.abs( Math.round( secs ) );
	const d = Math.floor( s / 86400 );
	const h = Math.floor( ( s % 86400 ) / 3600 );
	if ( d ) {
		return h ? `${ d }d ${ h }h` : `${ d }d`;
	}
	const m = Math.floor( ( s % 3600 ) / 60 );
	if ( h ) {
		return m ? `${ h }h ${ m }m` : `${ h }h`;
	}
	return `${ Math.max( 1, m ) }m`;
}
