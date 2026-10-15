/**
 * Shared CRM pieces: the page card (`Section`) and search pickers for contacts and organizations
 * (a search form and the results as a radio group: one tab stop, arrow keys move, labels are plain text).
 */
import { useQuery } from '@cliedesk/data';
import { Button, RadioGroup, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Search } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { fetchContactsPage } from '../inbox/api';
import { Muted } from '../inbox/components';
import { fetchOrgsPage } from './api';

/**
 * Card with a level-2 heading, used by the contact and organization pages.
 *
 * @param props          Props.
 * @param props.id       Heading id.
 * @param props.title    Heading.
 * @param props.actions  Header actions.
 * @param props.children Content.
 */
export function Section( {
	id,
	title,
	actions,
	children,
}: {
	id: string;
	title: string;
	actions?: ReactNode;
	children: ReactNode;
} ) {
	return (
		<section
			aria-labelledby={ id }
			className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id={ id } className="text-lg font-semibold">
					{ title }
				</h2>
				{ actions }
			</div>
			{ children }
		</section>
	);
}

export interface PickedItem {
	id: number;
	label: string;
}

interface PickerOption {
	id: number;
	label: string;
	description?: string;
}

function SearchPicker( {
	searchLabel,
	resultsLabel,
	description,
	queryKey,
	search,
	searchEmpty,
	exclude = [],
	value,
	onChange,
}: {
	searchLabel: string;
	resultsLabel: string;
	description?: string;
	queryKey: string;
	search: ( q: string, signal?: AbortSignal ) => Promise< PickerOption[] >;
	/** List results before anything is typed. */
	searchEmpty: boolean;
	exclude?: number[];
	value: PickedItem | null;
	onChange: ( item: PickedItem ) => void;
} ) {
	const [ input, setInput ] = useState( '' );
	const [ q, setQ ] = useState< string | null >( searchEmpty ? '' : null );
	const results = useQuery( {
		queryKey: [ 'crm-picker', queryKey, q ] as const,
		queryFn: ( { signal } ) => search( q ?? '', signal ),
		enabled: q !== null,
		staleTime: 30 * 1000,
	} );
	const options = ( results.data ?? [] ).filter(
		( o ) => ! exclude.includes( o.id )
	);
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		e.stopPropagation();
		setQ( input.trim() );
	};
	return (
		<div className="flex flex-col gap-3">
			<form
				role="search"
				noValidate
				onSubmit={ submit }
				className="flex items-end gap-2"
			>
				<TextField
					className="flex-1"
					label={ searchLabel }
					description={ description }
					inputMode="search"
					value={ input }
					onChange={ setInput }
				/>
				<Button
					type="submit"
					iconStart={ <Search aria-hidden="true" size={ 14 } /> }
				>
					{ __( 'Search', 'cliedesk' ) }
				</Button>
			</form>
			{ results.isFetching && (
				<Muted>{ __( 'Searching…', 'cliedesk' ) }</Muted>
			) }
			{ results.isError && (
				<Muted>
					{ __( 'Could not search. Try again.', 'cliedesk' ) }
				</Muted>
			) }
			{ results.isSuccess && ! results.isFetching && ! options.length && (
				<Muted>{ __( 'No matches.', 'cliedesk' ) }</Muted>
			) }
			{ options.length > 0 && (
				<RadioGroup
					label={ resultsLabel }
					value={ value ? String( value.id ) : null }
					onChange={ ( id ) => {
						const o = options.find(
							( x ) => String( x.id ) === id
						);
						if ( o ) {
							onChange( { id: o.id, label: o.label } );
						}
					} }
					options={ options.map( ( o ) => ( {
						id: String( o.id ),
						label: o.label,
						description: o.description,
					} ) ) }
				/>
			) }
		</div>
	);
}

/**
 * Pick a contact (GET contacts?q=).
 *
 * @param props          Props.
 * @param props.exclude  Contact ids to leave out.
 * @param props.value    Selected contact.
 * @param props.onChange Select.
 */
export function ContactPicker( {
	exclude,
	value,
	onChange,
}: {
	exclude?: number[];
	value: PickedItem | null;
	onChange: ( item: PickedItem ) => void;
} ) {
	return (
		<SearchPicker
			queryKey="contacts"
			searchLabel={ __( 'Find a contact', 'cliedesk' ) }
			resultsLabel={ __( 'Matching contacts', 'cliedesk' ) }
			description={ __(
				'Name, or an exact email address, phone number or #ID.',
				'cliedesk'
			) }
			searchEmpty={ false }
			exclude={ exclude }
			value={ value }
			onChange={ onChange }
			search={ async ( q, signal ) =>
				q
					? (
							await fetchContactsPage( q, 'active', null, signal )
						).items.map( ( c ) => ( {
							id: c.id,
							label:
								c.displayName ||
								__( 'Unnamed contact', 'cliedesk' ),
							description:
								[ c.email, c.phone ]
									.filter( Boolean )
									.join( ' · ' ) ||
								sprintf(
									/* translators: %d: contact id. */
									__( 'Contact #%d', 'cliedesk' ),
									c.id
								),
						} ) )
					: []
			}
		/>
	);
}

/**
 * Pick an organization (GET organizations?q=).
 *
 * @param props          Props.
 * @param props.exclude  Organization ids to leave out.
 * @param props.value    Selected organization.
 * @param props.onChange Select.
 */
export function OrgPicker( {
	exclude,
	value,
	onChange,
}: {
	exclude?: number[];
	value: PickedItem | null;
	onChange: ( item: PickedItem ) => void;
} ) {
	return (
		<SearchPicker
			queryKey="organizations"
			searchLabel={ __( 'Find an organization', 'cliedesk' ) }
			resultsLabel={ __( 'Organizations', 'cliedesk' ) }
			description={ __( 'Name or domain.', 'cliedesk' ) }
			searchEmpty
			exclude={ exclude }
			value={ value }
			onChange={ onChange }
			search={ async ( q, signal ) =>
				( await fetchOrgsPage( q, null, signal, 20 ) ).items.map(
					( o ) => ( {
						id: o.id,
						label: o.name,
						description: o.domains.join( ', ' ) || undefined,
					} )
				)
			}
		/>
	);
}
