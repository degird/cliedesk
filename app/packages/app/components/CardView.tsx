/**
 * A card (DEV-20): title and badge, then text, key-value fields, a list, an image, buttons and a form. Link buttons
 * open their page; action buttons and forms run the plugin's registered action for this conversation or contact
 * (POST cards/run) and show the outcome.
 */
import { api, useMutation } from '@cliedesk/data';
import { Button, Checkbox, Select, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../inbox/components';
import { announceResult } from '../workspace/forms';

type Scalar = string | number | boolean;

export interface CardBlock {
	type: 'text' | 'fields' | 'list' | 'image' | 'buttons' | 'form';
	text?: string;
	items?: unknown[];
	url?: string;
	alt?: string;
	action?: string;
	submit?: string;
	inputs?: {
		name: string;
		label: string;
		type: 'text' | 'number' | 'select' | 'bool';
		required: boolean;
		options: string[];
	}[];
}

export interface Card {
	title?: string;
	badge?: { text: string; tone: string };
	blocks: CardBlock[];
}

export interface CardSubject {
	entity: 'conversation' | 'contact';
	entityId: number;
}

const TONE: Record< string, string > = {
	success: 'bg-success/15 text-success',
	warning: 'bg-warning/15 text-warning',
	danger: 'bg-danger/15 text-danger',
	info: 'bg-accent/15 text-accent-fg',
	neutral: 'bg-line text-fg-muted',
};

function Form( {
	block,
	run,
	busy,
}: {
	block: CardBlock;
	run: ( action: string, input: Record< string, Scalar > ) => void;
	busy: boolean;
} ) {
	const [ values, setValues ] = useState< Record< string, Scalar > >( {} );
	const inputs = block.inputs ?? [];
	const missing = inputs.some(
		( i ) =>
			i.required &&
			i.type !== 'bool' &&
			! String( values[ i.name ] ?? '' ).trim()
	);
	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={ ( e ) => {
				e.preventDefault();
				if ( block.action && ! missing ) {
					run( block.action, values );
				}
			} }
		>
			{ inputs.map( ( i ) => {
				const set = ( v: Scalar ) =>
					setValues( ( cur ) => ( { ...cur, [ i.name ]: v } ) );
				if ( i.type === 'bool' ) {
					return (
						<Checkbox
							key={ i.name }
							isSelected={ Boolean( values[ i.name ] ) }
							onChange={ set }
						>
							{ i.label }
						</Checkbox>
					);
				}
				if ( i.type === 'select' ) {
					return (
						<Select
							key={ i.name }
							label={ i.label }
							value={ String( values[ i.name ] ?? '' ) }
							onChange={ set }
							options={ i.options.map( ( o ) => ( {
								id: o,
								label: o,
							} ) ) }
						/>
					);
				}
				return (
					<TextField
						key={ i.name }
						label={ i.label }
						isRequired={ i.required }
						inputMode={
							i.type === 'number' ? 'decimal' : undefined
						}
						value={ String( values[ i.name ] ?? '' ) }
						onChange={ ( v ) =>
							set(
								i.type === 'number' &&
									v !== '' &&
									! isNaN( Number( v ) )
									? Number( v )
									: v
							)
						}
					/>
				);
			} ) }
			<Button
				type="submit"
				size="sm"
				isLoading={ busy }
				isDisabled={ missing }
			>
				{ block.submit || __( 'Send', 'cliedesk' ) }
			</Button>
		</form>
	);
}

export function CardView( {
	card,
	subject,
}: {
	card: Card;
	subject: CardSubject;
} ) {
	const run = useMutation( {
		mutationFn: ( {
			action,
			input,
		}: {
			action: string;
			input: Record< string, Scalar >;
		} ) =>
			api.post( 'cards/run', {
				body: { ...subject, action, input: JSON.stringify( input ) },
			} ),
		onSuccess: () => announceResult( __( 'Done.', 'cliedesk' ) ),
	} );
	const go = ( action: string, input: Record< string, Scalar > ) =>
		run.mutate( { action, input } );
	return (
		<div className="flex flex-col gap-2 text-sm">
			{ ( card.title || card.badge ) && (
				<div className="flex items-center gap-2">
					{ card.title && (
						<span className="font-medium">{ card.title }</span>
					) }
					{ card.badge && (
						<span
							className={ `rounded-full px-2 text-xs ${ TONE[ card.badge.tone ] ?? TONE.neutral }` }
						>
							{ card.badge.text }
						</span>
					) }
				</div>
			) }
			{ card.blocks.map( ( b, i ) => {
				switch ( b.type ) {
					case 'text':
						return (
							<p key={ i } className="whitespace-pre-line">
								{ b.text }
							</p>
						);
					case 'fields':
						return (
							<dl
								key={ i }
								className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"
							>
								{ (
									b.items as {
										label: string;
										value: string;
									}[]
								 ).map( ( f ) => (
									<div key={ f.label } className="contents">
										<dt className="text-fg-muted">
											{ f.label }
										</dt>
										<dd>{ f.value }</dd>
									</div>
								) ) }
							</dl>
						);
					case 'list':
						return (
							<ul key={ i } className="list-disc ps-5">
								{ ( b.items as string[] ).map( ( t, j ) => (
									<li key={ j }>{ t }</li>
								) ) }
							</ul>
						);
					case 'image':
						return (
							<img
								key={ i }
								src={ b.url }
								alt={ b.alt ?? '' }
								className="max-h-40 rounded"
								loading="lazy"
							/>
						);
					case 'buttons':
						return (
							<div key={ i } className="flex flex-wrap gap-2">
								{ (
									b.items as {
										label: string;
										url?: string;
										action?: string;
										input?: Record< string, Scalar >;
									}[]
								 ).map( ( btn ) =>
									btn.url ? (
										<a
											key={ btn.label }
											href={ btn.url }
											target="_blank"
											rel="noopener noreferrer"
											className="underline"
										>
											{ btn.label }
										</a>
									) : (
										<Button
											key={ btn.label }
											size="sm"
											isDisabled={ run.isPending }
											onPress={ () =>
												go(
													btn.action ?? '',
													btn.input ?? {}
												)
											}
										>
											{ btn.label }
										</Button>
									)
								) }
							</div>
						);
					case 'form':
						return (
							<Form
								key={ i }
								block={ b }
								run={ go }
								busy={ run.isPending }
							/>
						);
				}
				return null;
			} ) }
			<ActionError error={ run.error } />
		</div>
	);
}
