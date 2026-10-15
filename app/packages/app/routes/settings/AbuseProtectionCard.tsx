/**
 * Settings → Security → Spam and bot protection (SEC-19, CHN-30): protection level, message limit and the bot check
 * provider (Turnstile or hCaptcha). The secret key is write-only: it goes to the vault and is never shown again.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Banner, Button, LoadingRegion, Select, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

type Level = 'off' | 'normal' | 'strict' | 'under_attack';
type Provider = 'none' | 'turnstile' | 'hcaptcha';

export function levelLabel( l: Level ): string {
	return {
		off: __( 'Off', 'cliedesk' ),
		normal: __( 'Normal: message limits', 'cliedesk' ),
		strict: __(
			'Strict: half the limits, bot check before guests start a chat',
			'cliedesk'
		),
		under_attack: __( 'Under attack: bot check for everyone', 'cliedesk' ),
	}[ l ];
}

export function AbuseProtectionCard() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'security' ) );
	const secret = useQuery( {
		queryKey: [ 'security', 'captcha-secret' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { set: boolean } >( 'security/captcha-secret', {
					signal,
				} )
			).data,
	} );
	const [ draft, setDraft ] = useState< Record< string, string > >( {} );
	const [ newSecret, setNewSecret ] = useState( '' );
	const save = useMutation( {
		mutationFn: async () => {
			const values: Record< string, unknown > = { ...draft };
			if ( values.messages_per_minute !== undefined ) {
				values.messages_per_minute = Number(
					values.messages_per_minute
				);
			}
			if ( Object.keys( values ).length ) {
				await api.patch( 'settings/security', {
					body: { values },
					ifMatch: q.data?.etag ?? undefined,
				} );
			}
			if ( newSecret.trim() ) {
				await api.put( 'security/captcha-secret', {
					body: { secret: newSecret.trim() },
				} );
			}
		},
		onSuccess: () => {
			setDraft( {} );
			setNewSecret( '' );
			announceResult(
				__( 'Spam and bot protection saved.', 'cliedesk' )
			);
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'security' ],
			} );
			void qc.invalidateQueries( { queryKey: [ 'security' ] } );
		},
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const get = ( k: string, d: string ) =>
		draft[ k ] ?? String( q.data?.values?.[ k ]?.value ?? d );
	const level = get( 'protection', 'normal' ) as Level;
	const provider = get( 'captcha', 'none' ) as Provider;
	const ready =
		provider !== 'none' &&
		get( 'captcha_site_key', '' ).trim() !== '' &&
		( secret.data?.set || newSecret.trim() !== '' );
	const set = ( k: string, v: string ) =>
		setDraft( ( d ) => ( { ...d, [ k ]: v } ) );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<section
			aria-labelledby="cd-security-abuse"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-security-abuse" className="text-lg font-semibold">
				{ __( 'Spam and bot protection', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'For the chat widget, forms and the customer portal.',
					'cliedesk'
				) }
			</p>
			<form
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ActionError
					error={ save.error }
					onDismiss={ () => save.reset() }
				/>
				<Select
					label={ __( 'Protection level', 'cliedesk' ) }
					value={ level }
					options={ (
						[ 'off', 'normal', 'strict', 'under_attack' ] as Level[]
					 ).map( ( l ) => ( { id: l, label: levelLabel( l ) } ) ) }
					onChange={ ( x ) => set( 'protection', String( x ) ) }
				/>
				<TextField
					label={ __( 'Messages per minute', 'cliedesk' ) }
					description={ __(
						'From one IP address or one contact. Strict and Under attack allow half.',
						'cliedesk'
					) }
					inputMode="numeric"
					value={ get( 'messages_per_minute', '20' ) }
					onChange={ ( x ) =>
						set( 'messages_per_minute', x.replace( /\D/g, '' ) )
					}
				/>
				<Select
					label={ __( 'Bot check', 'cliedesk' ) }
					value={ provider }
					options={ [
						{ id: 'none', label: __( 'None', 'cliedesk' ) },
						{ id: 'turnstile', label: 'Cloudflare Turnstile' },
						{ id: 'hcaptcha', label: 'hCaptcha' },
					] }
					onChange={ ( x ) => set( 'captcha', String( x ) ) }
				/>
				{ provider !== 'none' && (
					<>
						<TextField
							label={ __( 'Site key', 'cliedesk' ) }
							value={ get( 'captcha_site_key', '' ) }
							onChange={ ( x ) => set( 'captcha_site_key', x ) }
						/>
						<TextField
							type="password"
							autoComplete="off"
							label={ __( 'Secret key', 'cliedesk' ) }
							description={
								secret.data?.set
									? __(
											'A secret key is saved. Type a new one to replace it.',
											'cliedesk'
										)
									: __(
											'Stored encrypted; it is never shown again.',
											'cliedesk'
										)
							}
							value={ newSecret }
							onChange={ setNewSecret }
						/>
					</>
				) }
				{ ( level === 'strict' || level === 'under_attack' ) &&
					! ready && (
						<Banner
							tone="warning"
							title={
								level === 'under_attack'
									? __(
											'Without a bot check, guests can only leave a message while under attack.',
											'cliedesk'
										)
									: __(
											'Set up a bot check, or Strict only halves the message limits.',
											'cliedesk'
										)
							}
						/>
					) }
				<div>
					<Button
						type="submit"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save spam and bot protection', 'cliedesk' ) }
					</Button>
				</div>
			</form>
		</section>
	);
}
