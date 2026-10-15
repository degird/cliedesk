import { __ } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { cx } from '../cx';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { StatusIcon, type Tone } from './StatusIcon';

export interface ToastInput {
	tone?: Tone;
	title: string;
	description?: string;
	action?: { label: string; onAction: () => void };
	/** Milliseconds; errors persist unless set. Default 6000. */
	timeout?: number | null;
}

export interface ToastItem extends ToastInput {
	id: number;
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set< () => void >();
const emit = () => listeners.forEach( ( l ) => l() );

/**
 * Show a toast (max 3 stacked; the oldest is dropped).
 *
 * @param input Toast.
 * @return Id (for dismissToast).
 */
export function toast( input: ToastInput ): number {
	const id = ++seq;
	items = [ ...items, { ...input, id } ].slice( -3 );
	emit();
	return id;
}

/**
 * Dismiss a toast.
 *
 * @param id Id.
 */
export function dismissToast( id: number ): void {
	items = items.filter( ( t ) => t.id !== id );
	emit();
}

const subscribe = ( l: () => void ) => {
	listeners.add( l );
	return () => {
		listeners.delete( l );
	};
};

function ToastView( { item }: { item: ToastItem } ) {
	const tone = item.tone ?? 'info';
	const defaultTimeout = tone === 'danger' ? null : 6000;
	const timeout = item.timeout === undefined ? defaultTimeout : item.timeout;
	useEffect( () => {
		if ( ! timeout ) {
			return undefined;
		}
		const t = window.setTimeout( () => dismissToast( item.id ), timeout );
		return () => window.clearTimeout( t );
	}, [ item.id, timeout ] );
	return (
		<div
			role={ tone === 'danger' ? 'alert' : 'status' }
			className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-raised p-3 text-fg shadow-2"
		>
			<StatusIcon tone={ tone } />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<p className="font-semibold">{ item.title }</p>
				{ item.description && (
					<p className="text-sm text-fg-muted">
						{ item.description }
					</p>
				) }
				{ item.action && (
					<Button
						variant="link"
						className="self-start"
						onPress={ () => {
							item.action?.onAction();
							dismissToast( item.id );
						} }
					>
						{ item.action.label }
					</Button>
				) }
			</div>
			<IconButton
				size="sm"
				label={ __( 'Dismiss', 'cliedesk' ) }
				icon={ <X size={ 14 } /> }
				onPress={ () => dismissToast( item.id ) }
			/>
		</div>
	);
}

/** Toast region: bottom-start (bottom-end in RTL through logical inset), landmark for F6 cycling. */
export function ToastRegion() {
	const list = useSyncExternalStore(
		subscribe,
		() => items,
		() => items
	);
	return (
		<section
			aria-label={ __( 'Notifications', 'cliedesk' ) }
			className={ cx(
				'pointer-events-none fixed bottom-4 start-4 z-[1300] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2'
			) }
		>
			{ list.map( ( t ) => (
				<ToastView key={ t.id } item={ t } />
			) ) }
		</section>
	);
}
