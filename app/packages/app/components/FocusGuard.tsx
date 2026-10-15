/**
 * Focus mode (INB-28): while I have a live conversation and focus mode is on, the main navigation is hidden and a
 * banner leads back to that conversation until it is resolved or transferred. Loaded on its own (lazy chunk).
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Switch } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect } from 'react';

export interface FocusState {
	on: boolean;
	forced: boolean;
	active: number | null;
}

export const FOCUS_KEY = [ 'me', 'focus' ] as const;

export function useFocus() {
	return useQuery( {
		queryKey: FOCUS_KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< FocusState >( 'me/focus', { signal } ) ).data,
		refetchInterval: 15_000,
		enabled: can( 'cliedesk_view_conversations' ),
	} );
}

/** Banner and hidden navigation while focused. */
export default function FocusGuard() {
	const q = useFocus();
	const active = q.data?.on ? q.data.active : null;
	useEffect( () => {
		const root = document.documentElement;
		if ( active ) {
			root.dataset.cdFocus = '1';
		} else {
			delete root.dataset.cdFocus;
		}
		return () => {
			delete root.dataset.cdFocus;
		};
	}, [ active ] );
	if ( ! active ) {
		return null;
	}
	return (
		<div
			role="status"
			className="flex flex-wrap items-center gap-2 border-b border-info-line bg-info-subtle px-4 py-2 text-sm"
		>
			<span>
				{ __(
					'Focus mode: finish this chat before other work.',
					'cliedesk'
				) }
			</span>
			<Link
				to="/c/$number"
				params={ { number: String( active ) } }
				className="font-medium text-accent-fg underline"
			>
				{ sprintf(
					/* translators: %d: conversation number. */
					__( 'Open #%d', 'cliedesk' ),
					active
				) }
			</Link>
		</div>
	);
}

/** My profile → focus mode switch. */
export function FocusSwitch() {
	const qc = useQueryClient();
	const q = useFocus();
	const set = useMutation( {
		mutationFn: ( on: boolean ) =>
			api.put< FocusState >( 'me/focus', { body: { on } } ),
		onSuccess: () => void qc.invalidateQueries( { queryKey: FOCUS_KEY } ),
	} );
	if ( ! q.data ) {
		return null;
	}
	return (
		<Switch
			isSelected={ q.data.on }
			isDisabled={ q.data.forced }
			onChange={ ( on ) => set.mutate( on ) }
		>
			{ q.data.forced
				? __(
						'Focus mode (set for your role): one live chat at a time',
						'cliedesk'
					)
				: __( 'Focus mode: one live chat at a time', 'cliedesk' ) }
		</Switch>
	);
}
