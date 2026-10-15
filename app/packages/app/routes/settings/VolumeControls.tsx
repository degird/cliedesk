/**
 * Settings → Widget → Who can start conversations (CHN-15): everyone, signed-in customers or nobody (help only), a
 * help search before the message button, and one open conversation per contact (new messages join it).
 * CHN-32: help mode on WooCommerce checkout and thank-you pages. PRT-28: hours an open chat is reopened.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, Select, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

export function VolumeControls() {
	const qc = useQueryClient();
	const widget = useQuery( settingsQuery( 'widget' ) );
	const convs = useQuery( settingsQuery( 'conversations' ) );
	const [ draft, setDraft ] = useState< Record< string, unknown > >( {} );
	const value = ( key: string, from: typeof widget ) =>
		key in draft ? draft[ key ] : from.data?.values?.[ key ]?.value;
	const who = String( value( 'new_conversations', widget ) ?? 'all' );
	const search = Boolean( value( 'search_before_contact', widget ) );
	const checkoutHelp =
		String( value( 'checkout_mode', widget ) ?? 'help' ) === 'help';
	const one = Boolean( value( 'one_open', convs ) );
	const resume = String( value( 'resume_hours', widget ) ?? 24 );
	const days = String( value( 'one_open_days', convs ) ?? 30 );
	const save = useMutation( {
		mutationFn: async () => {
			await api.patch( 'settings/widget', {
				body: {
					values: {
						new_conversations: who,
						search_before_contact: search,
						checkout_mode: checkoutHelp ? 'help' : 'normal',
						resume_hours: Math.min(
							720,
							Math.max( 0, Number( resume ) || 0 )
						),
					},
				},
				ifMatch: widget.data?.etag ?? undefined,
			} );
			await api.patch( 'settings/conversations', {
				body: {
					values: {
						one_open: one,
						one_open_days: Math.min(
							365,
							Math.max( 1, Number( days ) || 30 )
						),
					},
				},
				ifMatch: convs.data?.etag ?? undefined,
			} );
		},
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings' ] } );
		},
	} );
	const set = ( key: string, v: unknown ) =>
		setDraft( { ...draft, [ key ]: v } );
	return (
		<section
			aria-labelledby="cd-widget-volume"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-widget-volume" className="font-semibold">
				{ __( 'Who can start conversations', 'cliedesk' ) }
			</h2>
			<ActionError error={ save.error } />
			<Select
				label={ __( 'New conversations in the widget', 'cliedesk' ) }
				value={ who }
				onChange={ ( v ) => set( 'new_conversations', v ) }
				options={ [
					{ id: 'all', label: __( 'Everyone', 'cliedesk' ) },
					{
						id: 'users',
						label: __( 'Signed-in customers only', 'cliedesk' ),
					},
					{
						id: 'none',
						label: __( 'Nobody (help only)', 'cliedesk' ),
					},
				] }
			/>
			<Checkbox
				isSelected={ search }
				onChange={ ( on ) => set( 'search_before_contact', on ) }
			>
				{ __(
					'Search the help center before the message button appears',
					'cliedesk'
				) }
			</Checkbox>
			<Checkbox
				isSelected={ checkoutHelp }
				onChange={ ( on ) =>
					set( 'checkout_mode', on ? 'help' : 'normal' )
				}
			>
				{ __(
					'Help only on checkout and order received pages (no Home cards)',
					'cliedesk'
				) }
			</Checkbox>
			<Checkbox
				isSelected={ one }
				onChange={ ( on ) => set( 'one_open', on ) }
			>
				{ __(
					'One open conversation per customer: new messages join it',
					'cliedesk'
				) }
			</Checkbox>
			{ one && (
				<TextField
					label={ __(
						'Only if it was active in the last (days)',
						'cliedesk'
					) }
					inputMode="numeric"
					maxLength={ 3 }
					value={ days }
					onChange={ ( v ) => set( 'one_open_days', v ) }
				/>
			) }
			<TextField
				label={ __(
					'Reopen an open chat if it was active in the last (hours, 0: always open on home)',
					'cliedesk'
				) }
				inputMode="numeric"
				maxLength={ 3 }
				value={ resume }
				onChange={ ( v ) => set( 'resume_hours', v ) }
			/>
			<Button
				className="self-start"
				variant="primary"
				isDisabled={ ! Object.keys( draft ).length }
				isLoading={ save.isPending }
				onPress={ () => save.mutate() }
			>
				{ __( 'Save', 'cliedesk' ) }
			</Button>
		</section>
	);
}
