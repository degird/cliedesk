/**
 * Settings → Email → System emails (AUT-71): the emails Cliedesk sends to customers by itself (not rules), each with
 * a switch, products and languages where it is off, and a preview in the brand layout.
 */
import {
	api,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	Checkbox,
	Modal,
	Select,
	Switch,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';
import { SystemEmailText } from './SystemEmailText';

interface SystemEmail {
	key: string;
	label: string;
	description: string;
	on: boolean;
	offProducts: number[];
	offLanguages: string[];
	texts?: Record< string, string >;
	tokens?: string[];
	sample?: string;
}

const KEY = [ 'email', 'system-emails' ] as const;

function Row( { item }: { item: SystemEmail } ) {
	const qc = useQueryClient();
	const products = getBoot().products;
	const [ languages, setLanguages ] = useState(
		item.offLanguages.join( ', ' )
	);
	const [ preview, setPreview ] = useState< string | null >( null );
	// PRO-24: preview per brand (product) and language.
	const [ product, setProduct ] = useState( products[ 0 ]?.id ?? 0 );
	const [ language, setLanguage ] = useState( '' );
	const save = useMutation( {
		mutationFn: ( patch: Partial< SystemEmail > ) =>
			api.put( `email/system-emails/${ item.key }`, {
				body: {
					on: patch.on ?? item.on,
					offProducts: patch.offProducts ?? item.offProducts,
					offLanguages:
						patch.offLanguages ??
						languages
							.split( /[,\s]+/ )
							.map( ( l ) => l.trim().toLowerCase() )
							.filter( ( l ) => /^[a-z]{2,3}$/.test( l ) ),
				},
			} ),
		onSuccess: () => {
			announceResult( __( 'System email saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const show = useMutation( {
		mutationFn: async ( at?: { productId: number; language: string } ) =>
			(
				await api.get< { subject: string; html: string } >(
					`email/system-emails/${ item.key }/preview`,
					{
						query: {
							productId: at?.productId ?? product,
							...( ( at?.language ?? language )
								? { language: at?.language ?? language }
								: {} ),
						},
					}
				)
			).data,
		onSuccess: ( d ) => setPreview( d?.html ?? '' ),
	} );
	return (
		<li className="flex flex-col gap-2 py-3">
			<div className="flex flex-wrap items-center gap-3">
				<Switch
					isSelected={ item.on }
					onChange={ ( on ) => save.mutate( { on } ) }
				>
					{ item.label }
				</Switch>
				<Button
					size="sm"
					variant="ghost"
					isLoading={ show.isPending }
					onPress={ () => show.mutate( undefined ) }
				>
					{ __( 'Preview', 'cliedesk' ) }
				</Button>
				<SystemEmailText item={ item } />
			</div>
			<Muted>{ item.description }</Muted>
			<ActionError error={ save.error ?? show.error } />
			{ item.on && (
				<div className="flex flex-wrap items-end gap-3">
					{ products.length > 1 &&
						products.map( ( p ) => (
							<Checkbox
								key={ p.id }
								isSelected={ item.offProducts.includes( p.id ) }
								onChange={ ( off ) =>
									save.mutate( {
										offProducts: off
											? [ ...item.offProducts, p.id ]
											: item.offProducts.filter(
													( x ) => x !== p.id
												),
									} )
								}
							>
								{ sprintf(
									/* translators: %s: product name. */
									__( 'Off for %s', 'cliedesk' ),
									p.name
								) }
							</Checkbox>
						) ) }
					<TextField
						label={ __( 'Off for languages', 'cliedesk' ) }
						description={ __(
							'Language codes, e.g. de, fr. Empty: all languages.',
							'cliedesk'
						) }
						value={ languages }
						onChange={ setLanguages }
						maxLength={ 200 }
					/>
					<Button size="sm" onPress={ () => save.mutate( {} ) }>
						{ __( 'Save languages', 'cliedesk' ) }
					</Button>
				</div>
			) }
			{ preview !== null && (
				<Modal
					isOpen
					onOpenChange={ ( o ) => ! o && setPreview( null ) }
					title={ item.label }
				>
					<div className="mb-2 flex flex-wrap items-end gap-2">
						{ products.length > 1 && (
							<Select
								label={ __( 'Brand of product', 'cliedesk' ) }
								value={ String( product ) }
								options={ products.map( ( p ) => ( {
									id: String( p.id ),
									label: p.name,
								} ) ) }
								onChange={ ( v ) => {
									setProduct( Number( v ) );
									show.mutate( {
										productId: Number( v ),
										language,
									} );
								} }
							/>
						) }
						<TextField
							label={ __( 'Language (e.g. de)', 'cliedesk' ) }
							maxLength={ 8 }
							value={ language }
							onChange={ ( v ) =>
								setLanguage(
									v.trim().replace( /[^A-Za-z_-]/g, '' )
								)
							}
						/>
						<Button
							size="sm"
							onPress={ () =>
								show.mutate( { productId: product, language } )
							}
						>
							{ __( 'Show', 'cliedesk' ) }
						</Button>
					</div>
					<iframe
						title={ __( 'Email preview', 'cliedesk' ) }
						sandbox=""
						srcDoc={ preview }
						className="h-96 w-full rounded border border-line bg-white"
					/>
				</Modal>
			) }
		</li>
	);
}

export function SystemEmails() {
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: SystemEmail[] } >(
					'email/system-emails',
					{ signal }
				)
			).data?.items ?? [],
	} );
	return (
		<section
			aria-labelledby="cd-email-system"
			className="flex flex-col gap-2"
		>
			<h2 id="cd-email-system" className="text-lg font-semibold">
				{ __( 'System emails', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Emails Cliedesk sends to customers by itself. They do not depend on rules; turn each one off where you do not want it.',
					'cliedesk'
				) }
			</Muted>
			<ul className="flex flex-col divide-y divide-line">
				{ ( q.data ?? [] ).map( ( item ) => (
					<Row key={ item.key } item={ item } />
				) ) }
			</ul>
		</section>
	);
}
