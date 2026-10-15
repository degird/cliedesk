/**
 * Settings → Security → Personal data in messages (SEC-24, Free part). One rule per class (redact, mask or ignore),
 * custom patterns, and "Redact older messages" (bulk job). GET / PUT security/pii; POST security/pii/redact-existing.
 * Card numbers are always redacted (only the last 4 digits are stored). AI detection of other personal data is Pro.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	ConfirmDestructive,
	ProPill,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { whyDisabled } from '../../components/DisabledReason';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

export interface PiiClass {
	key: string;
	label: string;
	builtIn: boolean;
	action: string;
}

export interface PiiPattern {
	key: string;
	label: string;
	pattern: string;
}

export interface PiiConfig {
	classes: PiiClass[];
	patterns: PiiPattern[];
}

const KEY = [ 'security', 'pii' ] as const;

const ACTIONS = () => [
	{
		id: 'redact',
		label: __( 'Redact: remove before storing', 'cliedesk' ),
	},
	{ id: 'mask', label: __( 'Mask: store, show masked', 'cliedesk' ) },
	{ id: 'ignore', label: __( 'Ignore', 'cliedesk' ) },
];

/**
 * Key for a new custom pattern from its name.
 *
 * @param label Name.
 */
export function patternKey( label: string ): string {
	const key = label
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '_' )
		.replace( /^[^a-z]+|_+$/g, '' )
		.slice( 0, 40 );
	return key.length >= 2 ? key : `custom_${ key }`.slice( 0, 40 );
}

/**
 * The request body for PUT security/pii.
 *
 * @param actions  Class key => action.
 * @param patterns Custom patterns.
 */
export function piiBody(
	actions: Record< string, string >,
	patterns: PiiPattern[]
): { rules: string; patterns: string } {
	const keys = new Set( [
		'card',
		'iban',
		'ssn',
		...patterns.map( ( p ) => p.key ),
	] );
	return {
		rules: JSON.stringify(
			Object.fromEntries(
				Object.entries( actions ).filter( ( [ k ] ) => keys.has( k ) )
			)
		),
		patterns: JSON.stringify(
			patterns.map( ( p ) => ( {
				key: p.key,
				label: p.label.trim(),
				pattern: p.pattern,
			} ) )
		),
	};
}

export function PiiRulesCard() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< PiiConfig >( 'security/pii', { signal } ) ).data,
	} );
	const [ actions, setActions ] = useState< Record< string, string > | null >(
		null
	);
	const [ patterns, setPatterns ] = useState< PiiPattern[] | null >( null );
	const [ confirm, setConfirm ] = useState( false );
	const current: Record< string, string > =
		actions ??
		Object.fromEntries(
			( q.data?.classes ?? [] ).map( ( c ) => [ c.key, c.action ] )
		);
	const list = patterns ?? q.data?.patterns ?? [];
	const dirty = actions !== null || patterns !== null;

	const save = useMutation( {
		mutationFn: () =>
			api.put< PiiConfig >( 'security/pii', {
				// A new pattern redacts until its rule is changed.
				body: piiBody(
					{
						...Object.fromEntries(
							list.map( ( p ) => [ p.key, 'redact' ] )
						),
						...current,
					},
					list
				),
			} ),
		onSuccess: ( r ) => {
			qc.setQueryData( KEY, r.data );
			setActions( null );
			setPatterns( null );
			announceResult( __( 'Personal data rules saved.', 'cliedesk' ) );
		},
	} );
	const redact = useMutation( {
		mutationFn: () => api.post( 'security/pii/redact-existing' ),
		onSuccess: () => {
			setConfirm( false );
			announceResult(
				__(
					'Older messages, subjects and text files are being redacted in the background.',
					'cliedesk'
				)
			);
		},
	} );
	const errors = apiFieldErrors( save.error );
	const setPattern = ( i: number, patch: Partial< PiiPattern > ) =>
		setPatterns(
			list.map( ( p, j ) => ( j === i ? { ...p, ...patch } : p ) )
		);
	const classes = [
		...( q.data?.classes ?? [] ).filter( ( c ) => c.builtIn ),
		...list.map( ( p ) => ( {
			key: p.key,
			label: p.label || p.key,
			builtIn: false,
			action: current[ p.key ] ?? 'redact',
		} ) ),
	];

	return (
		<section
			aria-labelledby="cd-security-pii"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-security-pii" className="text-lg font-semibold">
				{ __( 'Personal data in messages', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'Found in messages, subjects, form fields and text files (txt, csv, …) in every channel. Redact removes it before it is stored, for good; mask stores it but shows it masked.',
					'cliedesk'
				) }
			</Muted>
			<ActionError error={ q.error ?? save.error ?? redact.error } />
			{ q.data && (
				<>
					<ul className="flex flex-col gap-3">
						{ classes.map( ( c ) => (
							<li key={ c.key }>
								<Select
									label={ c.label }
									value={ current[ c.key ] ?? c.action }
									options={ ACTIONS() }
									isDisabled={ c.key === 'card' }
									description={
										c.key === 'card'
											? __(
													'Always redacted: only the last 4 digits are stored, so card data never sits in your database.',
													'cliedesk'
												)
											: undefined
									}
									errorMessage={
										errors[ `rules.${ c.key }` ]
									}
									onChange={ ( v ) =>
										setActions( {
											...current,
											[ c.key ]: v,
										} )
									}
								/>
							</li>
						) ) }
					</ul>
					<h3 className="font-semibold">
						{ __( 'Your own patterns', 'cliedesk' ) }
					</h3>
					<Muted>
						{ __(
							'For example a patient or customer number: name “Patient ref”, pattern PAT-\\d{6}. Regular expressions as in PHP, without delimiters.',
							'cliedesk'
						) }
					</Muted>
					{ list.map( ( p, i ) => (
						<div
							key={ i }
							className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
						>
							<TextField
								label={ __( 'Name', 'cliedesk' ) }
								maxLength={ 60 }
								value={ p.label }
								errorMessage={
									errors[ `patterns.${ i }.label` ] ??
									errors[ `patterns.${ i }.key` ]
								}
								onChange={ ( v ) =>
									setPattern( i, {
										label: v,
										key: q.data?.patterns.some(
											( s ) => s.key === p.key
										)
											? p.key
											: patternKey( v ),
									} )
								}
							/>
							<TextField
								label={ __( 'Pattern', 'cliedesk' ) }
								maxLength={ 500 }
								value={ p.pattern }
								errorMessage={
									errors[ `patterns.${ i }.pattern` ]
								}
								onChange={ ( v ) =>
									setPattern( i, { pattern: v } )
								}
							/>
							<Button
								variant="ghost"
								onPress={ () =>
									setPatterns(
										list.filter( ( _, j ) => j !== i )
									)
								}
							>
								{ __( 'Remove', 'cliedesk' ) }
							</Button>
						</div>
					) ) }
					<div className="flex flex-wrap gap-2">
						<Button
							onPress={ () =>
								setPatterns( [
									...list,
									{ key: '', label: '', pattern: '' },
								] )
							}
						>
							{ __( 'Add pattern', 'cliedesk' ) }
						</Button>
						<Button
							variant="primary"
							isDisabled={ ! dirty }
							isLoading={ save.isPending }
							onPress={ () => save.mutate() }
						>
							{ __( 'Save rules', 'cliedesk' ) }
						</Button>
						<Button
							variant="danger"
							isDisabled={ dirty }
							onPress={ () => setConfirm( true ) }
						>
							{ __( 'Redact older messages…', 'cliedesk' ) }
						</Button>
					</div>
					{ whyDisabled( { pro: true } ) && (
						<p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
							<span className="font-medium text-fg">
								{ __(
									'AI detection of other personal data',
									'cliedesk'
								) }
							</span>
							<ProPill />
							<span>{ whyDisabled( { pro: true } ) }</span>
						</p>
					) }
				</>
			) }
			<ConfirmDestructive
				isOpen={ confirm }
				onOpenChange={ setConfirm }
				title={ __( 'Redact older messages?', 'cliedesk' ) }
				description={ __(
					'Every stored message, subject and text file is checked against the redact rules. What matches is removed for good.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Redact older messages', 'cliedesk' ) }
				isLoading={ redact.isPending }
				onConfirm={ () => redact.mutate() }
			/>
		</section>
	);
}
