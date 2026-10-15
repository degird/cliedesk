/**
 * System email text (CNV-21): the first line of a system email per language, with typed tokens ({number},
 * {subject}, {status}, {name}); a text using another token is refused. For "Status changed", the statuses the
 * customer hears about (email.status_notice_off).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, IconButton, Modal, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { statusesQuery } from '../../inbox/api';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

export interface SystemEmailTexts {
	key: string;
	label: string;
	on: boolean;
	offProducts: number[];
	offLanguages: string[];
	texts?: Record< string, string >;
	tokens?: string[];
	sample?: string;
}

interface Line {
	language: string;
	text: string;
}

/**
 * Statuses the customer is told about.
 */
function StatusChoices() {
	const qc = useQueryClient();
	const statuses = useQuery( statusesQuery() );
	const settings = useQuery( settingsQuery( 'email' ) );
	const off = ( settings.data?.values?.status_notice_off?.value ??
		[] ) as string[];
	const save = useMutation( {
		mutationFn: ( next: string[] ) =>
			api.patch( 'settings/email', {
				body: { values: { status_notice_off: next } },
				ifMatch: settings.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			announceResult( __( 'Statuses saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'email' ] } );
		},
	} );
	return (
		<fieldset className="flex flex-col gap-1">
			<legend className="mb-1 font-medium">
				{ __(
					'Tell the customer when the status becomes',
					'cliedesk'
				) }
			</legend>
			<ActionError error={ save.error } />
			{ ( statuses.data ?? [] )
				.filter( ( s ) => s.active )
				.map( ( s ) => (
					<Checkbox
						key={ s.key }
						isSelected={ ! off.includes( s.key ) }
						onChange={ ( on ) =>
							save.mutate(
								on
									? off.filter( ( k ) => k !== s.key )
									: [ ...off, s.key ]
							)
						}
					>
						{ sprintf(
							/* translators: 1: status, 2: what the customer sees. */
							__( '%1$s (customer sees "%2$s")', 'cliedesk' ),
							s.label,
							s.customerLabel ?? s.label
						) }
					</Checkbox>
				) ) }
		</fieldset>
	);
}

/**
 * PRO-25: status emails due during the customer's night wait for the morning (their time zone).
 */
function QuietHoursChoice() {
	const qc = useQueryClient();
	const settings = useQuery( settingsQuery( 'email' ) );
	const v = settings.data?.values;
	const [ draft, setDraft ] = useState< Record< string, string > >( {} );
	const on = Boolean( v?.quiet_hours?.value ?? true );
	const time = ( k: 'quiet_start' | 'quiet_end' ) =>
		draft[ k ] ?? String( v?.[ k ]?.value ?? '' );
	const save = useMutation( {
		mutationFn: ( values: Record< string, unknown > ) =>
			api.patch( 'settings/email', {
				body: { values },
				ifMatch: settings.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Quiet hours saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings', 'email' ] } );
		},
	} );
	return (
		<div className="flex flex-col gap-2">
			<ActionError error={ save.error } />
			<Checkbox
				isSelected={ on }
				onChange={ ( next ) => save.mutate( { quiet_hours: next } ) }
			>
				{ __(
					"Wait for the customer's morning (quiet hours in their time zone)",
					'cliedesk'
				) }
			</Checkbox>
			{ on && (
				<div className="flex items-end gap-2">
					<TextField
						label={ __( 'From', 'cliedesk' ) }
						type="time"
						value={ time( 'quiet_start' ) }
						onChange={ ( t ) =>
							setDraft( { ...draft, quiet_start: t } )
						}
					/>
					<TextField
						label={ __( 'To', 'cliedesk' ) }
						type="time"
						value={ time( 'quiet_end' ) }
						onChange={ ( t ) =>
							setDraft( { ...draft, quiet_end: t } )
						}
					/>
					<Button
						size="sm"
						isDisabled={ ! Object.keys( draft ).length }
						isLoading={ save.isPending }
						onPress={ () => save.mutate( draft ) }
					>
						{ __( 'Save quiet hours', 'cliedesk' ) }
					</Button>
				</div>
			) }
		</div>
	);
}

/**
 * "Edit text…" button and dialog.
 *
 * @param props      Props.
 * @param props.item System email.
 */
export function SystemEmailText( { item }: { item: SystemEmailTexts } ) {
	const qc = useQueryClient();
	const [ open, setOpen ] = useState( false );
	const initial = (): Line[] => {
		const t = item.texts ?? {};
		return [
			{ language: 'default', text: t.default ?? '' },
			...Object.entries( t )
				.filter( ( [ l ] ) => l !== 'default' )
				.map( ( [ language, text ] ) => ( { language, text } ) ),
		];
	};
	const [ lines, setLines ] = useState< Line[] >( initial );
	const tokens = item.tokens ?? [];
	const save = useMutation( {
		mutationFn: () =>
			api.put( `email/system-emails/${ item.key }`, {
				body: {
					on: item.on,
					offProducts: item.offProducts,
					offLanguages: item.offLanguages,
					texts: lines
						.map( ( l ) => ( {
							language: l.language.trim().toLowerCase(),
							text: l.text.trim(),
						} ) )
						.filter(
							( l ) =>
								l.text &&
								/^(default|[a-z]{2,3})$/.test( l.language )
						),
				},
			} ),
		onSuccess: () => {
			setOpen( false );
			announceResult( __( 'Text saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'email', 'system-emails' ],
			} );
		},
	} );
	const set = ( i: number, patch: Partial< Line > ) =>
		setLines(
			lines.map( ( l, n ) => ( n === i ? { ...l, ...patch } : l ) )
		);
	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				onPress={ () => {
					setLines( initial() );
					setOpen( true );
				} }
			>
				{ __( 'Edit text…', 'cliedesk' ) }
			</Button>
			{ open && (
				<Modal
					isOpen
					onOpenChange={ ( o ) => ! o && setOpen( false ) }
					title={ item.label }
					size="md"
					footer={
						<>
							<Button onPress={ () => setOpen( false ) }>
								{ __( 'Cancel', 'cliedesk' ) }
							</Button>
							<Button
								variant="primary"
								isLoading={ save.isPending }
								onPress={ () => save.mutate() }
							>
								{ __( 'Save', 'cliedesk' ) }
							</Button>
						</>
					}
				>
					<div className="flex flex-col gap-4">
						<Muted>
							{ sprintf(
								/* translators: %s: tokens such as {number}. */
								__(
									'The first line of the email. Tokens: %s. Empty: the built-in text.',
									'cliedesk'
								),
								tokens.map( ( t ) => `{${ t }}` ).join( ', ' )
							) }
						</Muted>
						<ActionError error={ save.error } />
						{ lines.map( ( l, i ) => (
							<div key={ i } className="flex items-end gap-2">
								{ l.language === 'default' ? null : (
									<TextField
										className="w-24"
										label={ __( 'Language', 'cliedesk' ) }
										maxLength={ 3 }
										value={ l.language }
										onChange={ ( v ) =>
											set( i, { language: v } )
										}
									/>
								) }
								<TextField
									className="flex-1"
									label={
										l.language === 'default'
											? __(
													'Text (all languages)',
													'cliedesk'
												)
											: sprintf(
													/* translators: %s: language code. */
													__(
														'Text (%s)',
														'cliedesk'
													),
													l.language || '…'
												)
									}
									placeholder={ item.sample }
									maxLength={ 1000 }
									value={ l.text }
									onChange={ ( v ) => set( i, { text: v } ) }
								/>
								{ l.language !== 'default' && (
									<IconButton
										label={ __(
											'Remove this language',
											'cliedesk'
										) }
										icon={ <X size={ 14 } /> }
										onPress={ () =>
											setLines(
												lines.filter(
													( _, n ) => n !== i
												)
											)
										}
									/>
								) }
							</div>
						) ) }
						<Button
							size="sm"
							onPress={ () =>
								setLines( [
									...lines,
									{ language: '', text: '' },
								] )
							}
						>
							{ __( 'Add a language', 'cliedesk' ) }
						</Button>
						{ item.key === 'status_changed' && <StatusChoices /> }
						{ item.key === 'status_changed' && (
							<QuietHoursChoice />
						) }
					</div>
				</Modal>
			) }
		</>
	);
}
