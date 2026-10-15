/**
 * `/setup`: the setup assistant (ADM-01, classic form): workspace, product, business hours and channels, pre-filled
 * from WordPress and the WooCommerce store. Each step is saved on "Save and continue"; the assistant resumes at the
 * next open step.
 *
 * - GET setup → {done, next, percent, prefill}; POST setup {step, values (JSON)} → the same.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	LoadingRegion,
	Select,
	TextField,
} from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ActionError, Muted } from '../inbox/components';
import { announceResult } from '../workspace/forms';

type Step = 'workspace' | 'product' | 'hours' | 'channels';

interface Setup {
	done: Step[];
	next: Step | null;
	percent: number;
	prefill: {
		name: string;
		timezone: string;
		language: string;
		supportEmail: string;
		address: string;
		productId: number | null;
		productName: string;
		woo: boolean;
		/** ADM-01: the shop's refund policy text (WooCommerce). */
		refundPolicy?: string;
		widget: boolean;
	};
}

const STEPS: Step[] = [ 'workspace', 'product', 'hours', 'channels' ];

function stepName( s: Step ): string {
	return {
		workspace: __( 'Workspace', 'cliedesk' ),
		product: __( 'Product', 'cliedesk' ),
		hours: __( 'Business hours', 'cliedesk' ),
		channels: __( 'Channels', 'cliedesk' ),
	}[ s ];
}

function dayName( d: string ): string {
	return (
		(
			{
				mon: __( 'Mon', 'cliedesk' ),
				tue: __( 'Tue', 'cliedesk' ),
				wed: __( 'Wed', 'cliedesk' ),
				thu: __( 'Thu', 'cliedesk' ),
				fri: __( 'Fri', 'cliedesk' ),
				sat: __( 'Sat', 'cliedesk' ),
				sun: __( 'Sun', 'cliedesk' ),
			} as Record< string, string >
		 )[ d ] ?? d
	);
}

export default function SetupRoute() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'setup' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Setup >( 'setup', { signal } ) ).data as Setup,
	} );
	const [ step, setStep ] = useState< Step | null >( null );
	const [ v, setV ] = useState< Record< string, unknown > >( {} );
	useEffect( () => {
		if ( q.data && step === null ) {
			setStep( q.data.next ?? 'workspace' );
			setV( {
				...q.data.prefill,
				mode: 'office',
				from: '09:00',
				to: '17:00',
				days: [ 'mon', 'tue', 'wed', 'thu', 'fri' ],
			} );
		}
	}, [ q.data, step ] );
	const save = useMutation( {
		mutationFn: async () =>
			(
				await api.post< Setup >( 'setup', {
					body: { step, values: JSON.stringify( v ) },
				} )
			).data as Setup,
		onSuccess: ( data ) => {
			announceResult( __( 'Saved.', 'cliedesk' ) );
			qc.setQueryData( [ 'setup' ], data );
			setStep( data.next );
		},
	} );
	if ( ! q.data || ( ! step && q.data.next ) ) {
		return <LoadingRegion />;
	}
	const text = ( key: string, label: string, type?: 'email' ) => (
		<TextField
			label={ label }
			type={ type }
			value={ String( v[ key ] ?? '' ) }
			onChange={ ( x ) => setV( ( o ) => ( { ...o, [ key ]: x } ) ) }
		/>
	);
	const days = ( v.days as string[] ) ?? [];
	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-5">
			<PageHeader
				title={ __( 'Set up Cliedesk', 'cliedesk' ) }
				description={ sprintf(
					/* translators: %d: percent done. */
					__(
						'%d%% done. You can stop and come back later.',
						'cliedesk'
					),
					q.data.percent
				) }
			/>
			<ol className="flex flex-wrap gap-2 text-sm">
				{ STEPS.map( ( s ) => (
					<li key={ s }>
						<Button
							size="sm"
							variant={ s === step ? 'primary' : 'secondary' }
							onPress={ () => setStep( s ) }
						>
							{ ( q.data.done.includes( s ) ? '✓ ' : '' ) +
								stepName( s ) }
						</Button>
					</li>
				) ) }
			</ol>
			{ step === null ? (
				<div className="flex flex-col gap-2">
					<p>{ __( 'All steps are done.', 'cliedesk' ) }</p>
					<Link to={ '/' as never } className="underline">
						{ __( 'Go to Home', 'cliedesk' ) }
					</Link>
				</div>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={ ( e ) => {
						e.preventDefault();
						save.mutate();
					} }
				>
					<ActionError error={ save.error } />
					{ step === 'workspace' && (
						<>
							{ text(
								'name',
								__( 'Workspace name', 'cliedesk' )
							) }
							{ text(
								'supportEmail',
								__( 'Support email address', 'cliedesk' ),
								'email'
							) }
							{ text(
								'timezone',
								__( 'Time zone', 'cliedesk' )
							) }
							{ text( 'address', __( 'Address', 'cliedesk' ) ) }
						</>
					) }
					{ step === 'product' && (
						<>
							<Muted>
								{ __(
									'Name the product or shop your customers ask about. You can add more products later.',
									'cliedesk'
								) }
							</Muted>
							{ text(
								'productName',
								__( 'Product name', 'cliedesk' )
							) }
							{ q.data?.prefill.woo && (
								<TextField
									label={ __( 'Refund policy', 'cliedesk' ) }
									description={ __(
										'From your shop’s Refund and Returns page. It becomes a saved reply your team can send.',
										'cliedesk'
									) }
									multiline
									value={ String( v.refundPolicy ?? '' ) }
									onChange={ ( x ) =>
										setV( ( o ) => ( {
											...o,
											refundPolicy: x,
										} ) )
									}
								/>
							) }
						</>
					) }
					{ step === 'hours' && (
						<>
							<Select
								label={ __(
									'When does your team answer?',
									'cliedesk'
								) }
								value={ String( v.mode ) }
								onChange={ ( mode ) =>
									setV( ( o ) => ( { ...o, mode } ) )
								}
								options={ [
									{
										id: 'office',
										label: __( 'Office hours', 'cliedesk' ),
									},
									{
										id: 'always',
										label: __(
											'Always (24/7)',
											'cliedesk'
										),
									},
								] }
							/>
							{ v.mode === 'office' && (
								<>
									{ text( 'from', __( 'From', 'cliedesk' ) ) }
									{ text( 'to', __( 'To', 'cliedesk' ) ) }
									<fieldset className="flex flex-wrap gap-3">
										<legend className="pb-1 text-sm font-medium">
											{ __( 'Days', 'cliedesk' ) }
										</legend>
										{ [
											'mon',
											'tue',
											'wed',
											'thu',
											'fri',
											'sat',
											'sun',
										].map( ( d ) => (
											<Checkbox
												key={ d }
												isSelected={ days.includes(
													d
												) }
												onChange={ ( on ) =>
													setV( ( o ) => ( {
														...o,
														days: on
															? [ ...days, d ]
															: days.filter(
																	( x ) =>
																		x !== d
																),
													} ) )
												}
											>
												{ dayName( d ) }
											</Checkbox>
										) ) }
									</fieldset>
								</>
							) }
						</>
					) }
					{ step === 'channels' && (
						<>
							<Checkbox
								isSelected={ Boolean( v.widget ) }
								onChange={ ( widget ) =>
									setV( ( o ) => ( { ...o, widget } ) )
								}
							>
								{ __(
									'Show the chat widget on this website',
									'cliedesk'
								) }
							</Checkbox>
							<Muted>
								{ __(
									'Replies to customers go by email from your sender address; customers answer in the portal. Check sending in Settings → Channels → Email.',
									'cliedesk'
								) }
							</Muted>
						</>
					) }
					<Button
						type="submit"
						variant="primary"
						className="self-start"
						isLoading={ save.isPending }
					>
						{ __( 'Save and continue', 'cliedesk' ) }
					</Button>
				</form>
			) }
		</div>
	);
}
