/**
 * Email address field with chips (CC, BCC, forward recipients, INB-47). Enter, comma, semicolon, space or leaving
 * the field turns the typed text into chips; pasted lists are split. Addresses are checked here (the server checks
 * again and names a bad one as `field.N`, shown on that chip). Backspace in the empty field removes the last chip.
 * Typing two or more letters suggests matching contacts (name and email); choosing one adds its address.
 */
import { api, useQuery } from '@cliedesk/data';
import { IconButton, TextField, UnstyledButton, cx } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { isEmail, splitEmails } from './compose';

export interface EmailChipsProps {
	id: string;
	label: string;
	description?: string;
	values: string[];
	onChange: ( values: string[] ) => void;
	/** Server errors per address (index in `values`). */
	errors?: Record< number, string >;
	/** Error of the whole field (e.g. "Add at least one address"). */
	error?: string | null;
	isRequired?: boolean;
	max?: number;
}

/**
 * Address chips.
 *
 * @param props Props.
 */
export function EmailChips( {
	id,
	label,
	description,
	values,
	onChange,
	errors = {},
	error = null,
	isRequired,
	max = 50,
}: EmailChipsProps ) {
	const [ text, setText ] = useState( '' );
	const [ typed, setTyped ] = useState< string | null >( null );
	// Contact suggestions for what is being typed (debounced).
	const [ term, setTerm ] = useState( '' );
	useEffect( () => {
		const t = window.setTimeout( () => setTerm( text.trim() ), 250 );
		return () => window.clearTimeout( t );
	}, [ text ] );
	const suggest = useQuery( {
		queryKey: [ 'contacts', 'suggest', term ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					items: Array< {
						id: number;
						displayName: string;
						email: string | null;
					} >;
				} >( 'contacts', {
					query: { q: term, state: 'active', limit: 5 },
					signal,
				} )
			).data?.items ?? [],
		enabled: term.length >= 2 && ! /[\s,;]/.test( term ),
		staleTime: 30_000,
	} );
	const suggestions = ( suggest.data ?? [] ).filter(
		( c ) => c.email && ! values.includes( c.email.toLowerCase() )
	);

	const commit = ( raw: string ): boolean => {
		const parts = splitEmails( raw );
		if ( ! parts.length ) {
			setText( '' );
			return true;
		}
		const bad = parts.filter( ( p ) => ! isEmail( p ) );
		const next = [ ...values ];
		for ( const p of parts.filter( isEmail ) ) {
			const v = p.toLowerCase();
			if ( ! next.includes( v ) && next.length < max ) {
				next.push( v );
			}
		}
		if ( next.length !== values.length ) {
			onChange( next );
		}
		if ( bad.length ) {
			setText( bad.join( ', ' ) );
			setTyped(
				sprintf(
					/* translators: %s: what was typed. */
					__( '“%s” is not a valid email address.', 'cliedesk' ),
					bad[ 0 ] ?? raw
				)
			);
			return false;
		}
		setText( '' );
		setTyped( null );
		return true;
	};

	const onKeyDown = ( e: KeyboardEvent ) => {
		if ( [ 'Enter', ',', ';' ].includes( e.key ) && text.trim() ) {
			e.preventDefault();
			commit( text );
		} else if ( e.key === 'Backspace' && text === '' && values.length ) {
			onChange( values.slice( 0, -1 ) );
		}
	};

	const listId = `${ id }-chips`;
	return (
		<div className="flex flex-col gap-1">
			<TextField
				id={ id }
				label={ label }
				description={
					description ??
					__(
						'Separate addresses with a comma or press Enter after each.',
						'cliedesk'
					)
				}
				inputMode="email"
				isRequired={ isRequired }
				value={ text }
				aria-describedby={ values.length ? listId : undefined }
				onChange={ ( v ) => {
					setTyped( null );
					if ( /[\s,;]/.test( v ) && splitEmails( v ).length > 1 ) {
						commit( v );
					} else if ( /[\s,;]$/.test( v ) ) {
						commit( v );
					} else {
						setText( v );
					}
				} }
				onKeyDown={ onKeyDown }
				onBlur={ () => text.trim() && commit( text ) }
				errorMessage={ typed ?? error }
			/>
			{ text.trim().length >= 2 && suggestions.length > 0 && (
				<ul
					aria-label={ sprintf(
						/* translators: %s: field label, e.g. Cc. */
						__( 'Suggested contacts for %s', 'cliedesk' ),
						label
					) }
					className="flex flex-col rounded-md border border-line bg-surface"
				>
					{ suggestions.map( ( c ) => (
						<li key={ c.id }>
							<UnstyledButton
								className="w-full px-2 py-1 text-start text-sm outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus data-[hovered]:bg-sunken"
								onPress={ () => {
									const email = (
										c.email ?? ''
									).toLowerCase();
									if ( email && values.length < max ) {
										onChange( [ ...values, email ] );
									}
									setText( '' );
									setTyped( null );
								} }
							>
								<bdi>{ c.displayName || c.email }</bdi>{ ' ' }
								<span className="text-fg-muted">
									{ c.email }
								</span>
							</UnstyledButton>
						</li>
					) ) }
				</ul>
			) }
			{ values.length > 0 && (
				<ul
					id={ listId }
					aria-label={ sprintf(
						/* translators: %s: field label, e.g. Cc. */
						__( '%s addresses', 'cliedesk' ),
						label
					) }
					className="flex flex-wrap gap-1"
				>
					{ values.map( ( v, i ) => {
						const err = errors[ i ];
						return (
							<li
								key={ v }
								className={ cx(
									'inline-flex max-w-full items-center gap-0.5 rounded-full border ps-2 text-sm',
									err
										? 'border-danger-line bg-danger-subtle'
										: 'border-line bg-sunken'
								) }
							>
								<bdi className="min-w-0 truncate">{ v }</bdi>
								{ err && (
									<span className="text-danger">
										{ sprintf(
											/* translators: %s: error message. */
											__( '(%s)', 'cliedesk' ),
											err
										) }
									</span>
								) }
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: email address. */
										__( 'Remove %s', 'cliedesk' ),
										v
									) }
									icon={ <X size={ 12 } /> }
									onPress={ () =>
										onChange(
											values.filter( ( x ) => x !== v )
										)
									}
								/>
							</li>
						);
					} ) }
				</ul>
			) }
		</div>
	);
}
