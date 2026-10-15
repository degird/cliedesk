/**
 * "Add product" dialog (BRD-03): name, website and support email. Owner team is not asked until teams exist (no dead
 * controls). Pro adds the help center, brand and "Copy settings from" (BRD-04, BRD-08) in the `products.wizard`
 * slot: its fill gets the extra input values and the server's field errors, and the values go into the request.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Modal, Slot, TextField, toast } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { productKeys, type ProductDetail, type ProductInput } from './api';
import {
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	pickError,
	validateEmail,
	validateText,
	validateUrl,
	type SummaryItem,
} from './forms';

const IDS = {
	name: 'cd-new-product-name',
	website: 'cd-new-product-website',
	supportEmail: 'cd-new-product-email',
} as const;

type WizardField = keyof typeof IDS;

export interface WizardValues {
	name: string;
	website: string;
	supportEmail: string;
}

/**
 * Request body for POST /products from the wizard values (empty optional fields are left out) and the input an
 * extension added.
 *
 * @param v     Values.
 * @param extra Extra input (Pro: help center, brand, copy settings).
 */
export function wizardPayload(
	v: WizardValues,
	extra: Record< string, unknown > = {}
): ProductInput {
	const body: ProductInput = { ...extra, name: v.name.trim() };
	if ( v.website.trim() ) {
		body.website = v.website.trim();
	}
	if ( v.supportEmail.trim() ) {
		body.supportEmail = v.supportEmail.trim();
	}
	return body;
}

function validate( v: WizardValues ): Partial< Record< WizardField, string > > {
	const out: Partial< Record< WizardField, string > > = {};
	const name = validateText( v.name, 191, true );
	if ( name ) {
		out.name = name;
	}
	const web = validateUrl( v.website );
	if ( web ) {
		out.website = web;
	}
	const email = validateEmail( v.supportEmail );
	if ( email ) {
		out.supportEmail = email;
	}
	return out;
}

const EMPTY: WizardValues = {
	name: '',
	website: '',
	supportEmail: '',
};

/**
 * Add-product dialog.
 *
 * @param props              Props.
 * @param props.isOpen       Open.
 * @param props.onOpenChange Open state change.
 * @param props.onCreated    Called with the new product.
 */
export function ProductWizard( {
	isOpen,
	onOpenChange,
	onCreated,
}: {
	isOpen: boolean;
	onOpenChange: ( open: boolean ) => void;
	onCreated?: ( p: ProductDetail ) => void;
} ) {
	const qc = useQueryClient();
	const [ v, setV ] = useState< WizardValues >( EMPTY );
	const [ touched, setTouched ] = useState< Set< WizardField > >(
		() => new Set()
	);
	const [ server, setServer ] = useState<
		Partial< Record< WizardField, string > >
	>( {} );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const [ extra, setExtra ] = useState< Record< string, unknown > >( {} );
	const [ fieldErrors, setFieldErrors ] = useState<
		Record< string, string >
	>( {} );

	const reset = () => {
		setV( EMPTY );
		setExtra( {} );
		setFieldErrors( {} );
		setTouched( new Set() );
		setServer( {} );
		setSummary( [] );
	};

	const create = useMutation( {
		mutationFn: ( body: ProductInput ) =>
			api.post< ProductDetail >( 'products', { body } ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: productKeys.all } );
			const msg = sprintf(
				/* translators: %s: product name. */
				__( 'Product “%s” added.', 'cliedesk' ),
				r.data.name
			);
			toast( { tone: 'success', title: msg } );
			announceResult( msg );
			reset();
			onOpenChange( false );
			onCreated?.( r.data );
		},
		onError: ( e ) => {
			const fields = apiFieldErrors( e );
			setFieldErrors( fields );
			const next: Partial< Record< WizardField, string > > = {};
			const items: SummaryItem[] = [];
			const map: Array< [ WizardField, string[] ] > = [
				[ 'name', [ 'name', 'slug' ] ],
				[ 'website', [ 'website' ] ],
				[ 'supportEmail', [ 'supportEmail' ] ],
			];
			for ( const [ f, keys ] of map ) {
				const msg = pickError( fields, ...keys );
				if ( msg ) {
					next[ f ] = msg;
					items.push( { fieldId: IDS[ f ], message: msg } );
				}
			}
			setServer( next );
			setSummary( items );
		},
	} );

	const client = validate( v );
	const err = ( f: WizardField ) =>
		( touched.has( f ) ? client[ f ] : undefined ) ?? server[ f ] ?? null;
	const set = < K extends WizardField >( f: K, value: WizardValues[ K ] ) => {
		setV( ( o ) => ( { ...o, [ f ]: value } ) );
		setServer( ( s ) => ( { ...s, [ f ]: undefined } ) );
	};
	const blur = ( f: WizardField ) => () =>
		setTouched( ( t ) => new Set( t ).add( f ) );

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setTouched( new Set( Object.keys( IDS ) as WizardField[] ) );
		const errors = validate( v );
		const items = ( Object.keys( errors ) as WizardField[] ).map(
			( f ) => ( { fieldId: IDS[ f ], message: errors[ f ] as string } )
		);
		if ( items.length ) {
			setSummary( items );
			return;
		}
		create.mutate( wizardPayload( v, extra ) );
	};

	return (
		<Modal
			isOpen={ isOpen }
			onOpenChange={ ( open ) => {
				if ( ! open ) {
					reset();
				}
				onOpenChange( open );
			} }
			title={ __( 'Add product', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ () => onOpenChange( false ) }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-new-product"
						variant="primary"
						isLoading={ create.isPending }
					>
						{ __( 'Create product', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-new-product"
				noValidate
				onSubmit={ onSubmit }
				className="flex flex-col gap-4"
			>
				<ErrorSummary items={ summary } />
				<SaveError
					error={ create.error }
					title={ __( 'Could not add the product', 'cliedesk' ) }
				/>
				<TextField
					id={ IDS.name }
					label={ __( 'Product name', 'cliedesk' ) }
					value={ v.name }
					onChange={ ( x ) => set( 'name', x ) }
					onBlur={ blur( 'name' ) }
					errorMessage={ err( 'name' ) }
					isRequired
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<TextField
					id={ IDS.website }
					label={ __( 'Website', 'cliedesk' ) }
					description={ __(
						'Chats from this domain are assigned to this product.',
						'cliedesk'
					) }
					type="url"
					inputMode="url"
					placeholder="https://"
					value={ v.website }
					onChange={ ( x ) => set( 'website', x ) }
					onBlur={ blur( 'website' ) }
					errorMessage={ err( 'website' ) }
				/>
				<TextField
					id={ IDS.supportEmail }
					label={ __( 'Support email address', 'cliedesk' ) }
					description={ __(
						'Email sent to this address is assigned to this product.',
						'cliedesk'
					) }
					type="email"
					inputMode="email"
					value={ v.supportEmail }
					onChange={ ( x ) => set( 'supportEmail', x ) }
					onBlur={ blur( 'supportEmail' ) }
					errorMessage={ err( 'supportEmail' ) }
				/>
				<Slot
					name="products.wizard"
					fillProps={ {
						values: extra,
						onChange: ( patch: Record< string, unknown > ) =>
							setExtra( ( o ) => ( { ...o, ...patch } ) ),
						errors: fieldErrors,
						isOpen,
					} }
					className="flex flex-col gap-4"
				/>
			</form>
		</Modal>
	);
}
