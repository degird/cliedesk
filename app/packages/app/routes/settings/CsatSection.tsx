/**
 * Settings → Satisfaction (CSX-01, CSX-03, CSX-04, CSX-06, CSX-10): CSAT on or off, the scale and question, the
 * reasons asked after a low rating, when the survey goes out, how often a customer may be asked, how long they can
 * answer or change it, and whether agents see individual ratings. Cliedesk Pro adds its options (per-reply ratings, the
 * question per language) in the `csat.settings` slot.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	LoadingRegion,
	Select,
	Slot,
	Switch,
	TextField,
} from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

export const SCALES = [ 'emoji5', 'stars5', 'numbers5', 'faces3', 'thumbs' ];

const scaleLabel = ( s: string ): string =>
	( {
		emoji5: __( '5 faces (😞 to 😀)', 'cliedesk' ),
		stars5: __( '5 stars', 'cliedesk' ),
		numbers5: __( 'Numbers 1 to 5', 'cliedesk' ),
		faces3: __( '3 faces (🙁 😐 🙂)', 'cliedesk' ),
		thumbs: __( 'Thumbs up or down', 'cliedesk' ),
	} )[ s ] ?? s;

interface Values {
	enabled: boolean;
	scale: string;
	question: string;
	reasons: string[];
	chat_delay_seconds: number;
	email_delay_minutes: number;
	cooldown_days: number;
	window_days: number;
	lock: boolean;
	hide_from_agents: boolean;
}

const DEFAULTS: Values = {
	enabled: true,
	scale: 'emoji5',
	question: '',
	reasons: [],
	chat_delay_seconds: 10,
	email_delay_minutes: 120,
	cooldown_days: 7,
	window_days: 14,
	lock: false,
	hide_from_agents: false,
};

/**
 * Number from a text field (digits only).
 *
 * @param x Text.
 */
const digits = ( x: string ): number => Number( x.replace( /\D/g, '' ) || 0 );

export default function CsatSection() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'csat' ) );
	const [ draft, setDraft ] = useState< Partial< Values > >( {} );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/csat', {
				body: { values: draft },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Satisfaction settings saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'csat' ] } );
		},
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const stored = < K extends keyof Values >( k: K ): Values[ K ] =>
		( q.data.values?.[ k ]?.value as Values[ K ] | undefined ) ??
		DEFAULTS[ k ];
	const v = < K extends keyof Values >( k: K ): Values[ K ] =>
		( draft[ k ] as Values[ K ] | undefined ) ?? stored( k );
	const set = < K extends keyof Values >( k: K, x: Values[ K ] ) =>
		setDraft( ( d ) => ( { ...d, [ k ]: x } ) );
	return (
		<form
			className="flex max-w-2xl flex-col gap-4"
			onSubmit={ ( e ) => {
				e.preventDefault();
				save.mutate();
			} }
		>
			<p className="text-sm text-fg-muted">
				{ __(
					'After a conversation is resolved, customers get one short survey: by email, in the chat widget and in the portal.',
					'cliedesk'
				) }
			</p>
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
			<Switch
				isSelected={ v( 'enabled' ) }
				onChange={ ( x ) => set( 'enabled', x ) }
			>
				{ __(
					'Ask customers to rate resolved conversations',
					'cliedesk'
				) }
			</Switch>
			<Select
				label={ __( 'Rating scale', 'cliedesk' ) }
				value={ v( 'scale' ) }
				onChange={ ( x ) => set( 'scale', x ) }
				options={ SCALES.map( ( s ) => ( {
					id: s,
					label: scaleLabel( s ),
				} ) ) }
			/>
			<TextField
				label={ __( 'Question', 'cliedesk' ) }
				description={ __(
					'Empty: “How would you rate the support you received?”',
					'cliedesk'
				) }
				value={ v( 'question' ) }
				maxLength={ 200 }
				onChange={ ( x ) => set( 'question', x ) }
			/>
			<TextField
				label={ __(
					'Reasons after a low rating (one per line)',
					'cliedesk'
				) }
				description={ __(
					'Empty: too slow, not solved, not friendly, the policy, something else.',
					'cliedesk'
				) }
				multiline
				value={ v( 'reasons' ).join( '\n' ) }
				onChange={ ( x ) =>
					set(
						'reasons',
						x
							.split( '\n' )
							.map( ( r ) => r.trim() )
							.filter( Boolean )
							.slice( 0, 10 )
					)
				}
			/>
			<div className="flex flex-wrap gap-3">
				<TextField
					label={ __( 'Chat: send after (seconds)', 'cliedesk' ) }
					inputMode="numeric"
					value={ String( v( 'chat_delay_seconds' ) ) }
					onChange={ ( x ) =>
						set( 'chat_delay_seconds', digits( x ) )
					}
				/>
				<TextField
					label={ __( 'Email: send after (minutes)', 'cliedesk' ) }
					inputMode="numeric"
					value={ String( v( 'email_delay_minutes' ) ) }
					onChange={ ( x ) =>
						set( 'email_delay_minutes', digits( x ) )
					}
				/>
			</div>
			<div className="flex flex-wrap gap-3">
				<TextField
					label={ __(
						'Ask the same customer at most every (days)',
						'cliedesk'
					) }
					inputMode="numeric"
					value={ String( v( 'cooldown_days' ) ) }
					onChange={ ( x ) => set( 'cooldown_days', digits( x ) ) }
				/>
				<TextField
					label={ __(
						'Customers can answer for (days)',
						'cliedesk'
					) }
					inputMode="numeric"
					value={ String( v( 'window_days' ) ) }
					onChange={ ( x ) => set( 'window_days', digits( x ) ) }
				/>
			</div>
			<Switch
				isSelected={ v( 'lock' ) }
				onChange={ ( x ) => set( 'lock', x ) }
			>
				{ __(
					'Customers cannot change their rating after the first answer',
					'cliedesk'
				) }
			</Switch>
			<Switch
				isSelected={ v( 'hide_from_agents' ) }
				onChange={ ( x ) => set( 'hide_from_agents', x ) }
			>
				{ __(
					'Hide individual ratings and comments from agents (supervisors and admins still see them)',
					'cliedesk'
				) }
			</Switch>
			<div>
				<Button
					type="submit"
					variant="primary"
					isDisabled={ ! Object.keys( draft ).length }
					isLoading={ save.isPending }
				>
					{ __( 'Save satisfaction settings', 'cliedesk' ) }
				</Button>
			</div>
			<Slot name="csat.settings" />
		</form>
	);
}
