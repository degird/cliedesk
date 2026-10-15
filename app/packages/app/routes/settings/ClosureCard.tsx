/**
 * Settings → Business hours → Closure (SLA-26): one switch for a planned closure. From the first closed day until
 * the reopening day, all business hours count as closed, SLA timers pause, the chat widget shows the closure message
 * (and takes messages, or none), and automatic messages can use {closure.message} and {closure.reopens}.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, LoadingRegion, Select, Switch, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { Badge } from '../../team/components';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

interface ClosureValue {
	enabled: boolean;
	from: string;
	until: string;
	message: string;
	widget: 'message' | 'hide';
}

interface ClosureState {
	closure: ClosureValue | null;
	active: boolean;
}

const KEY = [ 'closure' ] as const;

export function ClosureCard() {
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< ClosureState >( 'closure', { signal } ) ).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	return (
		<ClosureForm
			key={ JSON.stringify( q.data.closure ) }
			state={ q.data }
		/>
	);
}

function ClosureForm( { state }: { state: ClosureState } ) {
	const qc = useQueryClient();
	const c = state.closure;
	const [ enabled, setEnabled ] = useState( c?.enabled ?? false );
	const [ from, setFrom ] = useState( c?.from ?? '' );
	const [ until, setUntil ] = useState( c?.until ?? '' );
	const [ message, setMessage ] = useState( c?.message ?? '' );
	const [ widget, setWidget ] = useState< string >( c?.widget ?? 'message' );
	const save = useMutation( {
		mutationFn: () =>
			api.put< ClosureState >( 'closure', {
				body: { enabled, from, until, message, widget },
			} ),
		onSuccess: ( r ) => {
			qc.setQueryData( KEY, r.data );
			announceResult( __( 'Closure saved.', 'cliedesk' ) );
		},
	} );
	const errors = apiFieldErrors( save.error );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<form
			noValidate
			onSubmit={ onSubmit }
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-base font-semibold">
					{ __( 'Closure', 'cliedesk' ) }
				</h2>
				{ state.active && (
					<Badge tone="warning">
						{ __( 'Closed now', 'cliedesk' ) }
					</Badge>
				) }
			</div>
			<p className="text-sm text-fg-muted">
				{ __(
					'For holidays or other planned closures. All business hours count as closed, SLA timers pause, and customers see your message and when you reopen. It ends by itself on the reopening day.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ save.error } />
			<Switch isSelected={ enabled } onChange={ setEnabled }>
				{ __( 'Closure mode on', 'cliedesk' ) }
			</Switch>
			<div className="flex flex-wrap gap-3">
				<TextField
					label={ __( 'First closed day', 'cliedesk' ) }
					type="date"
					value={ from }
					onChange={ setFrom }
					isRequired
					errorMessage={ errors.from ?? null }
				/>
				<TextField
					label={ __( 'Reopening day', 'cliedesk' ) }
					type="date"
					value={ until }
					onChange={ setUntil }
					isRequired
					errorMessage={ errors.until ?? null }
				/>
			</div>
			<TextField
				label={ __( 'Message for customers', 'cliedesk' ) }
				description={ __(
					'Shown in the chat widget. Automatic messages can use {closure.message} and {closure.reopens}.',
					'cliedesk'
				) }
				multiline
				rows={ 2 }
				maxLength={ 1000 }
				value={ message }
				onChange={ setMessage }
			/>
			<Select
				label={ __( 'Chat widget during the closure', 'cliedesk' ) }
				value={ widget }
				onChange={ setWidget }
				options={ [
					{
						id: 'message',
						label: __(
							'Show the message and take messages',
							'cliedesk'
						),
					},
					{
						id: 'hide',
						label: __(
							'Show the message only (no new chats)',
							'cliedesk'
						),
					},
				] }
			/>
			<div>
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save closure', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}
