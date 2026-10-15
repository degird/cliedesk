/**
 * Edit brand dialog: name, logos (light/dark), portal favicon, colours per role with a swatch preview, email From
 * name and signature. Edits send If-Match with the brand's version. Free edits the workspace brand; Pro's brand list
 * reuses the dialog (through the workspace kit) to add brands, passing `create`.
 */
import {
	api,
	useMutation,
	useQueryClient,
	type ApiResult,
} from '@cliedesk/data';
import { Button, Modal, TextField, toast } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import {
	COLOR_ROLES,
	brandKeys,
	isConflict,
	productKeys,
	versionTag,
	type Brand,
	type BrandInput,
	type ColorRole,
	type Colors,
} from './api';
import { ColorInput } from './ColorInput';
import {
	ConflictBanner,
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	pickError,
	validateHex,
	validateText,
	type SummaryItem,
} from './forms';
import { ImagePicker } from './ImagePicker';
import { colorRoleLabel } from './labels';

type Field =
	| 'name'
	| 'logoLightAttachmentId'
	| 'logoDarkAttachmentId'
	| 'faviconAttachmentId'
	| `colors.${ ColorRole }`
	| 'emailFromName'
	| 'signature';

const fieldId = ( f: Field ) => `cd-brand-${ f.replace( '.', '-' ) }`;

export interface BrandValues {
	name: string;
	logoLightAttachmentId: number | null;
	logoDarkAttachmentId: number | null;
	faviconAttachmentId?: number | null;
	colors: Record< ColorRole, string >;
	emailFromName: string;
	signature: string;
}

/**
 * Client validation of the brand form (mirrors the server).
 *
 * @param v Values.
 */
export function validateBrand(
	v: BrandValues
): Partial< Record< Field, string > > {
	const out: Partial< Record< Field, string > > = {};
	const name = validateText( v.name, 191, true );
	if ( name ) {
		out.name = name;
	}
	for ( const r of COLOR_ROLES ) {
		const m = validateHex( v.colors[ r ] );
		if ( m ) {
			out[ `colors.${ r }` ] = m;
		}
	}
	const from = validateText( v.emailFromName, 191 );
	if ( from ) {
		out.emailFromName = from;
	}
	const sig = validateText( v.signature, 2000 );
	if ( sig ) {
		out.signature = sig;
	}
	return out;
}

/**
 * Request body from the form values (empty colours are left out).
 *
 * @param v Values.
 */
export function brandPayload( v: BrandValues ): BrandInput {
	const colors: Colors = {};
	for ( const r of COLOR_ROLES ) {
		if ( v.colors[ r ].trim() ) {
			colors[ r ] = v.colors[ r ].trim();
		}
	}
	return {
		name: v.name.trim(),
		logoLightAttachmentId: v.logoLightAttachmentId,
		logoDarkAttachmentId: v.logoDarkAttachmentId,
		faviconAttachmentId: v.faviconAttachmentId ?? null,
		colors,
		emailFromName: v.emailFromName.trim(),
		signature: v.signature,
	};
}

function initialValues( b: Brand | null ): BrandValues {
	return {
		name: b?.name ?? '',
		logoLightAttachmentId: b?.logoLightAttachmentId ?? null,
		logoDarkAttachmentId: b?.logoDarkAttachmentId ?? null,
		faviconAttachmentId: b?.faviconAttachmentId ?? null,
		colors: Object.fromEntries(
			COLOR_ROLES.map( ( r ) => [ r, b?.colors?.[ r ] ?? '' ] )
		) as Record< ColorRole, string >,
		emailFromName: b?.emailFromName ?? '',
		signature: b?.signature ?? '',
	};
}

/** Creates a brand (Pro's brand list). */
export type CreateBrand = ( body: BrandInput ) => Promise< ApiResult< Brand > >;

function BrandForm( {
	brand,
	create,
	onDone,
}: {
	brand: Brand | null;
	create?: CreateBrand;
	onDone: () => void;
} ) {
	const qc = useQueryClient();
	const [ v, setV ] = useState< BrandValues >( () => initialValues( brand ) );
	const [ touched, setTouched ] = useState< Set< Field > >( () => new Set() );
	const [ server, setServer ] = useState<
		Partial< Record< Field, string > >
	>( {} );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );

	const save = useMutation( {
		mutationFn: ( body: BrandInput ) => {
			if ( brand ) {
				return api.patch< Brand >( `brands/${ brand.id }`, {
					body,
					ifMatch: versionTag( brand.version ),
				} );
			}
			if ( ! create ) {
				throw new Error( 'No brand to save.' );
			}
			return create( body );
		},
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: brandKeys.all } );
			void qc.invalidateQueries( { queryKey: productKeys.all } );
			const msg = brand
				? sprintf(
						/* translators: %s: brand name. */
						__( 'Brand “%s” saved.', 'cliedesk' ),
						r.data.name
					)
				: sprintf(
						/* translators: %s: brand name. */
						__( 'Brand “%s” added.', 'cliedesk' ),
						r.data.name
					);
			toast( { tone: 'success', title: msg } );
			announceResult( msg );
			onDone();
		},
		onError: ( e ) => {
			const fields = apiFieldErrors( e );
			const next: Partial< Record< Field, string > > = {};
			const items: SummaryItem[] = [];
			const keys: Field[] = [
				'name',
				'logoLightAttachmentId',
				'logoDarkAttachmentId',
				'faviconAttachmentId',
				...COLOR_ROLES.map( ( r ) => `colors.${ r }` as Field ),
				'emailFromName',
				'signature',
			];
			for ( const f of keys ) {
				const msg = pickError(
					fields,
					f,
					...( f === 'colors.primary' ? [ 'colors' ] : [] ),
					...( f === 'name' ? [ 'slug' ] : [] )
				);
				if ( msg ) {
					next[ f ] = msg;
					items.push( { fieldId: fieldId( f ), message: msg } );
				}
			}
			setServer( next );
			setSummary( items );
		},
	} );

	const client = validateBrand( v );
	const err = ( f: Field ) =>
		( touched.has( f ) ? client[ f ] : undefined ) ?? server[ f ] ?? null;
	const set = < K extends keyof BrandValues >(
		k: K,
		value: BrandValues[ K ],
		f: Field
	) => {
		setV( ( o ) => ( { ...o, [ k ]: value } ) );
		setServer( ( s ) => ( { ...s, [ f ]: undefined } ) );
	};
	const blur = ( f: Field ) => () =>
		setTouched( ( t ) => new Set( t ).add( f ) );

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		const errors = validateBrand( v );
		setTouched( new Set( Object.keys( errors ) as Field[] ) );
		const items = ( Object.keys( errors ) as Field[] ).map( ( f ) => ( {
			fieldId: fieldId( f ),
			message: errors[ f ] as string,
		} ) );
		setSummary( items );
		if ( items.length ) {
			return;
		}
		save.mutate( brandPayload( v ) );
	};

	return (
		<form
			id="cd-brand-form"
			noValidate
			onSubmit={ onSubmit }
			className="flex flex-col gap-4"
		>
			<ErrorSummary items={ summary } />
			{ isConflict( save.error ) && (
				<ConflictBanner
					message={ __(
						'Someone else changed this brand. Close this dialog and open it again to see their changes.',
						'cliedesk'
					) }
					onReload={ () => {
						void qc.invalidateQueries( {
							queryKey: brandKeys.all,
						} );
						onDone();
					} }
				/>
			) }
			<SaveError error={ save.error } />
			<TextField
				id={ fieldId( 'name' ) }
				label={ __( 'Brand name', 'cliedesk' ) }
				value={ v.name }
				onChange={ ( x ) => set( 'name', x, 'name' ) }
				onBlur={ blur( 'name' ) }
				errorMessage={ err( 'name' ) }
				isRequired
				// eslint-disable-next-line jsx-a11y/no-autofocus
				autoFocus
			/>
			<ImagePicker
				id={ fieldId( 'logoLightAttachmentId' ) }
				label={ __( 'Logo for light backgrounds', 'cliedesk' ) }
				value={ v.logoLightAttachmentId }
				onChange={ ( x ) =>
					set( 'logoLightAttachmentId', x, 'logoLightAttachmentId' )
				}
				errorMessage={ err( 'logoLightAttachmentId' ) }
			/>
			<ImagePicker
				id={ fieldId( 'logoDarkAttachmentId' ) }
				label={ __( 'Logo for dark backgrounds', 'cliedesk' ) }
				value={ v.logoDarkAttachmentId }
				onChange={ ( x ) =>
					set( 'logoDarkAttachmentId', x, 'logoDarkAttachmentId' )
				}
				errorMessage={ err( 'logoDarkAttachmentId' ) }
			/>
			<ImagePicker
				id={ fieldId( 'faviconAttachmentId' ) }
				label={ __( 'Portal favicon', 'cliedesk' ) }
				value={ v.faviconAttachmentId ?? null }
				onChange={ ( x ) =>
					set( 'faviconAttachmentId', x, 'faviconAttachmentId' )
				}
				errorMessage={ err( 'faviconAttachmentId' ) }
			/>
			<fieldset className="flex flex-col gap-3">
				<legend className="pb-1 text-sm font-semibold">
					{ __( 'Colours', 'cliedesk' ) }
				</legend>
				<div className="grid gap-3 sm:grid-cols-2">
					{ COLOR_ROLES.map( ( r ) => (
						<ColorInput
							key={ r }
							id={ fieldId( `colors.${ r }` ) }
							label={ colorRoleLabel( r ) }
							value={ v.colors[ r ] }
							onChange={ ( x ) =>
								set(
									'colors',
									{ ...v.colors, [ r ]: x },
									`colors.${ r }`
								)
							}
							onBlur={ blur( `colors.${ r }` ) }
							errorMessage={ err( `colors.${ r }` ) }
						/>
					) ) }
				</div>
			</fieldset>
			<TextField
				id={ fieldId( 'emailFromName' ) }
				label={ __( 'Email From name', 'cliedesk' ) }
				description={ __(
					'Shown as the sender of emails for products using this brand.',
					'cliedesk'
				) }
				value={ v.emailFromName }
				onChange={ ( x ) => set( 'emailFromName', x, 'emailFromName' ) }
				onBlur={ blur( 'emailFromName' ) }
				errorMessage={ err( 'emailFromName' ) }
			/>
			<TextField
				id={ fieldId( 'signature' ) }
				label={ __( 'Email signature', 'cliedesk' ) }
				multiline
				rows={ 4 }
				value={ v.signature }
				onChange={ ( x ) => set( 'signature', x, 'signature' ) }
				onBlur={ blur( 'signature' ) }
				errorMessage={ err( 'signature' ) }
			/>
			<div className="flex justify-end gap-2 border-t border-line pt-3">
				<Button onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
					isDisabled={ isConflict( save.error ) }
				>
					{ brand
						? __( 'Save brand', 'cliedesk' )
						: __( 'Add brand', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

/**
 * Brand dialog.
 *
 * @param props              Props.
 * @param props.isOpen       Open.
 * @param props.onOpenChange Open change.
 * @param props.brand        Brand to edit, or null to add one (with `create`).
 * @param props.create       Creates a brand (Pro).
 */
export function BrandDialog( {
	isOpen,
	onOpenChange,
	brand,
	create,
}: {
	isOpen: boolean;
	onOpenChange: ( open: boolean ) => void;
	brand: Brand | null;
	create?: CreateBrand;
} ) {
	return (
		<Modal
			isOpen={ isOpen }
			onOpenChange={ onOpenChange }
			title={
				brand
					? sprintf(
							/* translators: %s: brand name. */
							__( 'Edit brand “%s”', 'cliedesk' ),
							brand.name
						)
					: __( 'Add brand', 'cliedesk' )
			}
			size="lg"
		>
			<BrandForm
				key={ brand ? `${ brand.id }:${ brand.version }` : 'new' }
				brand={ brand }
				create={ create }
				onDone={ () => onOpenChange( false ) }
			/>
		</Modal>
	);
}
