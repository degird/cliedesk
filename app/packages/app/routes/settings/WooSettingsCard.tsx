/**
 * WooCommerce settings (Settings → System → Integrations, shown while WooCommerce is on):
 * - COM-04 (Pro, `woo.email_replies`): replies to WooCommerce emails land in the order's conversation;
 * - PRO-22: after how many days an unshipped order counts as delayed;
 * - COM-08: quick links with tokens, e.g. https://track.example.com/?q={order.number} (http/https only);
 * - COM-06: order meta keys shown as order fields; a hidden key is for rules only.
 *
 * GET commerce/settings → {delayDays, links, orderMeta, linkTokens}; PUT commerce/settings.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, LoadingRegion, Slot, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import {
	SaveError,
	announceResult,
	apiFieldErrors,
} from '../../workspace/forms';

export interface WooSettings {
	delayDays: number;
	links: { label: string; url: string }[];
	orderMeta: { key: string; label: string; hidden: boolean }[];
	linkTokens?: string[];
}

const KEY = [ 'commerce', 'settings' ];

/**
 * Client check of a quick-link template (the server checks again).
 *
 * @param url Template.
 */
export function templateError( url: string ): string | null {
	return /^https?:\/\/[^\s<>"{}]+$/i.test( url.replace( /\{[^{}]*\}/g, 'x' ) )
		? null
		: __(
				'Use an address that starts with https:// or http://.',
				'cliedesk'
			);
}

/**
 * The card.
 */
export default function WooSettingsCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< WooSettings >( 'commerce/settings', { signal } ) )
				.data as WooSettings,
	} );
	const [ v, setV ] = useState< WooSettings | null >( null );
	useEffect( () => {
		if ( q.data ) {
			setV( q.data );
		}
	}, [ q.data ] );
	const save = useMutation( {
		mutationFn: ( body: WooSettings ) =>
			api.put< WooSettings >( 'commerce/settings', {
				body: {
					delayDays: body.delayDays,
					links: body.links,
					orderMeta: body.orderMeta,
				},
			} ),
		onSuccess: ( r ) => {
			qc.setQueryData( KEY, r.data );
			void qc.invalidateQueries( { queryKey: [ 'record-sources' ] } );
			announceResult( __( 'WooCommerce settings saved.', 'cliedesk' ) );
		},
	} );
	if ( ! v ) {
		return <LoadingRegion />;
	}
	const errors = apiFieldErrors( save.error );
	const upd = ( patch: Partial< WooSettings > ) =>
		setV( ( o ) => ( o ? { ...o, ...patch } : o ) );
	return (
		<section
			aria-labelledby="cd-woo-settings"
			className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
		>
			<h2 id="cd-woo-settings" className="font-semibold">
				{ __( 'WooCommerce', 'cliedesk' ) }
			</h2>
			<SaveError error={ save.error } />
			<Slot name="woo.email_replies" />
			<TextField
				label={ __( 'An order is delayed after (days)', 'cliedesk' ) }
				inputMode="numeric"
				value={ String( v.delayDays ) }
				onChange={ ( x ) =>
					upd( { delayDays: Number( x.replace( /\D/g, '' ) ) || 1 } )
				}
			/>
			<fieldset className="flex flex-col gap-2">
				<legend className="font-medium">
					{ __( 'Order quick links', 'cliedesk' ) }
				</legend>
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: %s: token list. */
						__( 'Tokens: %s', 'cliedesk' ),
						( q.data?.linkTokens ?? [] )
							.map( ( t ) => `{${ t }}` )
							.join( ' ' )
					) }
				</p>
				{ v.links.map( ( l, i ) => (
					<div key={ i } className="flex flex-wrap items-end gap-2">
						<TextField
							label={ __( 'Name', 'cliedesk' ) }
							value={ l.label }
							maxLength={ 60 }
							errorMessage={ errors[ `links.${ i }.label` ] }
							onChange={ ( x ) =>
								upd( {
									links: v.links.map( ( o, j ) =>
										j === i ? { ...o, label: x } : o
									),
								} )
							}
						/>
						<TextField
							className="min-w-72 flex-1"
							label={ __( 'Address', 'cliedesk' ) }
							value={ l.url }
							maxLength={ 500 }
							errorMessage={
								errors[ `links.${ i }.url` ] ??
								( l.url ? templateError( l.url ) : null )
							}
							onChange={ ( x ) =>
								upd( {
									links: v.links.map( ( o, j ) =>
										j === i ? { ...o, url: x } : o
									),
								} )
							}
						/>
						<Button
							variant="ghost"
							onPress={ () =>
								upd( {
									links: v.links.filter(
										( _, j ) => j !== i
									),
								} )
							}
						>
							{ __( 'Remove', 'cliedesk' ) }
						</Button>
					</div>
				) ) }
				{ v.links.length < 10 && (
					<Button
						variant="secondary"
						onPress={ () =>
							upd( {
								links: [
									...v.links,
									{ label: '', url: 'https://' },
								],
							} )
						}
					>
						{ __( 'Add a link', 'cliedesk' ) }
					</Button>
				) }
			</fieldset>
			<fieldset className="flex flex-col gap-2">
				<legend className="font-medium">
					{ __( 'Order meta as fields', 'cliedesk' ) }
				</legend>
				{ v.orderMeta.map( ( m, i ) => (
					<div key={ i } className="flex flex-wrap items-end gap-2">
						<TextField
							label={ __( 'Meta key', 'cliedesk' ) }
							value={ m.key }
							maxLength={ 64 }
							errorMessage={ errors[ `orderMeta.${ i }.key` ] }
							onChange={ ( x ) =>
								upd( {
									orderMeta: v.orderMeta.map( ( o, j ) =>
										j === i ? { ...o, key: x } : o
									),
								} )
							}
						/>
						<TextField
							label={ __( 'Label', 'cliedesk' ) }
							value={ m.label }
							maxLength={ 60 }
							onChange={ ( x ) =>
								upd( {
									orderMeta: v.orderMeta.map( ( o, j ) =>
										j === i ? { ...o, label: x } : o
									),
								} )
							}
						/>
						<Checkbox
							isSelected={ m.hidden }
							onChange={ ( on ) =>
								upd( {
									orderMeta: v.orderMeta.map( ( o, j ) =>
										j === i ? { ...o, hidden: on } : o
									),
								} )
							}
						>
							{ __( 'Hidden (rules only)', 'cliedesk' ) }
						</Checkbox>
						<Button
							variant="ghost"
							onPress={ () =>
								upd( {
									orderMeta: v.orderMeta.filter(
										( _, j ) => j !== i
									),
								} )
							}
						>
							{ __( 'Remove', 'cliedesk' ) }
						</Button>
					</div>
				) ) }
				{ v.orderMeta.length < 30 && (
					<Button
						variant="secondary"
						onPress={ () =>
							upd( {
								orderMeta: [
									...v.orderMeta,
									{ key: '', label: '', hidden: false },
								],
							} )
						}
					>
						{ __( 'Add a meta key', 'cliedesk' ) }
					</Button>
				) }
			</fieldset>
			<div>
				<Button
					variant="primary"
					isLoading={ save.isPending }
					onPress={ () => save.mutate( v ) }
				>
					{ __( 'Save', 'cliedesk' ) }
				</Button>
			</div>
		</section>
	);
}
