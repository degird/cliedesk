/**
 * Settings → Portal (PRT-02, PRT-04, PRT-15): the portal's own address (/support, PRD Q27) and which page shows the
 * customer portal instead (magic links open there), how
 * long magic links work, and secure-link mode (emails carry only a link, never the message). PRT-01: the address of
 * the Support tab in WooCommerce My Account. PRT-05: who may use the portal, and whether guests sign in with an
 * email code or (WooCommerce) email + order number (PRT-04). PRT-12: the file size limit. PRT-14: the reopen window.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	LoadingRegion,
	Select,
	Switch,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

interface Page {
	id: number;
	title: string;
	hasPortal: boolean;
}

/** GET portal/route: the address in use, the wanted one and why it was taken. */
interface Route {
	want: string;
	slug: string;
	url: string;
	address: string;
	reasons: Record< string, Record< string, string > >;
}

type Values = {
	route_slug: string;
	layout: string;
	page_id: number;
	link_days: number;
	secure_links: boolean;
	account_tab: string;
	access: string;
	search_first: boolean;
	reopen_days: number;
	guest_codes: boolean;
	order_codes: boolean;
	file_max_mb: number;
};

export default function PortalSection() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'portal' ) );
	const pages = useQuery( {
		queryKey: [ 'portal', 'pages' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Page[] >( 'portal/pages', { signal } ) ).data ??
			[],
	} );
	const route = useQuery( {
		queryKey: [ 'portal', 'route' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Route >( 'portal/route', { signal } ) ).data ??
			null,
	} );
	const [ draft, setDraft ] = useState< Partial< Values > >( {} );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/portal', {
				body: { values: draft },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Portal settings saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'portal' ] } );
			void qc.invalidateQueries( { queryKey: [ 'portal', 'route' ] } );
		},
	} );
	if ( ! q.data || ! pages.data || route.isPending ) {
		return <LoadingRegion />;
	}
	const stored = ( k: keyof Values ) => q.data.values?.[ k ]?.value;
	const v: Values = {
		route_slug:
			draft.route_slug ?? String( stored( 'route_slug' ) ?? 'support' ),
		layout: draft.layout ?? String( stored( 'layout' ) ?? 'app' ),
		page_id: draft.page_id ?? Number( stored( 'page_id' ) ?? 0 ),
		link_days: draft.link_days ?? Number( stored( 'link_days' ) ?? 30 ),
		secure_links:
			draft.secure_links ?? Boolean( stored( 'secure_links' ) ?? false ),
		access: draft.access ?? String( stored( 'access' ) ?? 'anonymous' ),
		search_first:
			draft.search_first ?? Boolean( stored( 'search_first' ) ?? false ),
		account_tab:
			draft.account_tab ?? String( stored( 'account_tab' ) ?? 'support' ),
		reopen_days:
			draft.reopen_days ?? Number( stored( 'reopen_days' ) ?? 30 ),
		guest_codes:
			draft.guest_codes ?? Boolean( stored( 'guest_codes' ) ?? true ),
		order_codes:
			draft.order_codes ?? Boolean( stored( 'order_codes' ) ?? true ),
		file_max_mb:
			draft.file_max_mb ?? Number( stored( 'file_max_mb' ) ?? 10 ),
	};
	const page = pages.data.find( ( p ) => p.id === v.page_id );
	const where = route.data;
	const taken =
		where && where.want && where.slug !== where.want
			? Object.values( where.reasons[ where.want ] ?? {} ).join( ' ' )
			: '';
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
					'Customers see their requests, read replies, answer and send new requests in the portal. Signed-in customers see all their requests; guests sign in with a code or open the link in our emails.',
					'cliedesk'
				) }
			</p>
			{ where?.address && (
				<p className="text-sm">
					{ __( 'Your portal is at', 'cliedesk' ) }{ ' ' }
					<a href={ where.address } target="_blank" rel="noreferrer">
						{ where.address }
					</a>
				</p>
			) }
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
			<TextField
				label={ __( 'Portal address', 'cliedesk' ) }
				description={ __(
					'The portal works at this address without a page, for example support for example.com/support/. Leave empty to show the portal only on a page you choose below.',
					'cliedesk'
				) }
				maxLength={ 40 }
				value={ v.route_slug }
				onChange={ ( x ) =>
					set(
						'route_slug',
						x.toLowerCase().replace( /[^a-z0-9-]/g, '' )
					)
				}
			/>
			{ taken && where && (
				<Banner
					tone="warning"
					title={
						where.slug
							? sprintf(
									/* translators: 1: wanted address, 2: address in use. */
									__(
										'/%1$s/ is taken, so the portal uses /%2$s/.',
										'cliedesk'
									),
									where.want,
									where.slug
								)
							: sprintf(
									/* translators: %s: wanted address. */
									__(
										'/%s/ is taken and no other address was free. Choose another address.',
										'cliedesk'
									),
									where.want
								)
					}
				>
					{ taken }
				</Banner>
			) }
			{ /* PRT-29: the portal address as a full-screen app, or inside the theme. */ }
			<Select
				label={ __( 'Portal look', 'cliedesk' ) }
				value={ v.layout }
				isDisabled={ ! v.route_slug }
				options={ [
					{
						id: 'app',
						label: __(
							'Full screen, like the helpdesk (light and dark)',
							'cliedesk'
						),
					},
					{
						id: 'theme',
						label: __(
							'Inside your theme’s header and footer',
							'cliedesk'
						),
					},
				] }
				description={ __(
					'How the portal address looks. A portal page with the block always uses your theme.',
					'cliedesk'
				) }
				onChange={ ( x ) => set( 'layout', String( x ) ) }
			/>
			<Select
				label={ __( 'Portal page (optional)', 'cliedesk' ) }
				description={ __(
					'To show the portal inside one of your pages instead, add the “Support portal” block (or [cliedesk_portal]) to it and choose it here. Emails then link to that page.',
					'cliedesk'
				) }
				value={ String( v.page_id ) }
				options={ [
					{ id: '0', label: __( 'None', 'cliedesk' ) },
					...pages.data.map( ( p ) => ( {
						id: String( p.id ),
						label: p.hasPortal
							? sprintf(
									/* translators: %s: page title. */
									__( '%s (has the portal)', 'cliedesk' ),
									p.title
								)
							: p.title,
					} ) ),
				] }
				onChange={ ( x ) => set( 'page_id', Number( x ) ) }
			/>
			{ page && ! page.hasPortal && (
				<Banner
					tone="warning"
					title={ __(
						'This page has no portal yet. Add the “Support portal” block to it.',
						'cliedesk'
					) }
				/>
			) }
			<Select
				label={ __( 'Who can use the portal', 'cliedesk' ) }
				value={ v.access }
				options={ [
					{
						id: 'anonymous',
						label: __(
							'Anyone (guests can send new requests)',
							'cliedesk'
						),
					},
					{
						id: 'links',
						label: __(
							'Signed-in customers, and guests with an email link',
							'cliedesk'
						),
					},
					{
						id: 'users',
						label: __( 'Signed-in customers only', 'cliedesk' ),
					},
				] }
				description={ __(
					'Sign-in uses your WordPress login, so social login, single sign-on and two-factor plugins work here too.',
					'cliedesk'
				) }
				onChange={ ( x ) => set( 'access', String( x ) ) }
			/>
			<Switch
				isSelected={ v.guest_codes }
				isDisabled={ v.access === 'users' }
				onChange={ ( x ) => set( 'guest_codes', x ) }
			>
				{ __(
					'Guests can sign in with a code sent to their email address',
					'cliedesk'
				) }
			</Switch>
			<Switch
				isSelected={ v.order_codes }
				isDisabled={ v.access === 'users' }
				onChange={ ( x ) => set( 'order_codes', x ) }
			>
				{ __(
					'With WooCommerce, guests can verify with their email address and an order number',
					'cliedesk'
				) }
			</Switch>
			<TextField
				label={ __(
					'A reply opens a closed request again for (days)',
					'cliedesk'
				) }
				description={ __(
					'After that, customers start a follow-up request linked to it. 0: always.',
					'cliedesk'
				) }
				inputMode="numeric"
				value={ String( v.reopen_days ) }
				onChange={ ( x ) =>
					set( 'reopen_days', Number( x.replace( /\D/g, '' ) || 0 ) )
				}
			/>
			<TextField
				label={ __(
					'Largest file customers can attach (MB)',
					'cliedesk'
				) }
				inputMode="numeric"
				value={ String( v.file_max_mb ) }
				onChange={ ( x ) =>
					set( 'file_max_mb', Number( x.replace( /\D/g, '' ) || 1 ) )
				}
			/>
			<TextField
				label={ __( 'Magic links work for (days)', 'cliedesk' ) }
				inputMode="numeric"
				value={ String( v.link_days ) }
				onChange={ ( x ) =>
					set( 'link_days', Number( x.replace( /\D/g, '' ) || 0 ) )
				}
			/>
			<Switch
				isSelected={ v.search_first }
				onChange={ ( x ) => set( 'search_first', x ) }
			>
				{ __(
					'Customers search the help articles before they can send a new request',
					'cliedesk'
				) }
			</Switch>
			<Switch
				isSelected={ v.secure_links }
				onChange={ ( x ) => set( 'secure_links', x ) }
			>
				{ __(
					'Secure links: emails contain only a link to the portal, not the message',
					'cliedesk'
				) }
			</Switch>
			<TextField
				label={ __( 'My Account tab address', 'cliedesk' ) }
				description={ __(
					'With WooCommerce, customers find their requests under My Account at this address (for example my-account/support/). Leave empty for no tab.',
					'cliedesk'
				) }
				maxLength={ 40 }
				value={ v.account_tab }
				onChange={ ( x ) =>
					set(
						'account_tab',
						x.toLowerCase().replace( /[^a-z0-9-]/g, '' )
					)
				}
			/>
			<div>
				<Button
					type="submit"
					variant="primary"
					isDisabled={ ! Object.keys( draft ).length }
					isLoading={ save.isPending }
				>
					{ __( 'Save portal settings', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}
