/**
 * Product → Details: name, slug, description, icon, website, support email and the default queue (new conversations
 * that no rule put in a queue go there, so round robin works without rules). Only changed fields are sent. A help
 * center per product is Pro (BRD-08): it fills the `product.help_center` slot below the form.
 */
import { useQuery } from '@cliedesk/data';
import { Select, Slot, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { queuePickerQuery } from '../../inbox/api';
import type { ProductInput } from '../api';
import {
	ErrorSummary,
	apiFieldErrors,
	pickError,
	validateEmail,
	validateSlug,
	validateText,
	validateUrl,
	type SummaryItem,
} from '../forms';
import { ImagePicker } from '../ImagePicker';
import { workspaceKit } from '../kit';
import { SaveBar, useProductPatch, type ProductTabProps } from './shared';

type Field =
	| 'name'
	| 'slug'
	| 'description'
	| 'iconAttachmentId'
	| 'website'
	| 'supportEmail';

const ID: Record< Field, string > = {
	name: 'cd-product-name',
	slug: 'cd-product-slug',
	description: 'cd-product-description',
	iconAttachmentId: 'cd-product-icon',
	website: 'cd-product-website',
	supportEmail: 'cd-product-email',
};

interface Values {
	name: string;
	slug: string;
	description: string;
	iconAttachmentId: number | null;
	website: string;
	supportEmail: string;
}

function validate( v: Values ): Partial< Record< Field, string > > {
	const out: Partial< Record< Field, string > > = {};
	const checks: Array< [ Field, string | null ] > = [
		[ 'name', validateText( v.name, 191, true ) ],
		[
			'slug',
			v.slug.trim() === ''
				? __( 'Enter a slug.', 'cliedesk' )
				: validateSlug( v.slug ),
		],
		[ 'description', validateText( v.description, 5000 ) ],
		[ 'website', validateUrl( v.website ) ],
		[ 'supportEmail', validateEmail( v.supportEmail ) ],
	];
	for ( const [ f, msg ] of checks ) {
		if ( msg ) {
			out[ f ] = msg;
		}
	}
	return out;
}

/**
 * Details tab.
 *
 * @param props Props.
 */
export function DetailsTab( {
	product,
	etag,
	onSaved,
	onReload,
	canManage,
}: ProductTabProps ) {
	const initial: Values = {
		name: product.name,
		slug: product.slug,
		description: product.description,
		iconAttachmentId: product.iconAttachmentId,
		website: product.website,
		supportEmail: product.supportEmail,
	};
	const [ v, setV ] = useState< Values >( initial );
	const [ queue, setQueue ] = useState< number | null >(
		product.defaultQueueId
	);
	const queues = useQuery( queuePickerQuery() );
	const [ touched, setTouched ] = useState< Set< Field > >( () => new Set() );
	const [ server, setServer ] = useState<
		Partial< Record< Field, string > >
	>( {} );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );

	const save = useProductPatch( product, etag, onSaved, ( e ) => {
		const fields = apiFieldErrors( e );
		const next: Partial< Record< Field, string > > = {};
		const items: SummaryItem[] = [];
		for ( const f of Object.keys( ID ) as Field[] ) {
			const msg = pickError( fields, f );
			if ( msg ) {
				next[ f ] = msg;
				items.push( { fieldId: ID[ f ], message: msg } );
			}
		}
		setServer( next );
		setSummary( items );
	} );

	const client = validate( v );
	const err = ( f: Field ) =>
		( touched.has( f ) ? client[ f ] : undefined ) ?? server[ f ] ?? null;
	const set = < K extends Field >( f: K, value: Values[ K ] ) => {
		setV( ( o ) => ( { ...o, [ f ]: value } ) );
		setServer( ( s ) => ( { ...s, [ f ]: undefined } ) );
	};
	const blur = ( f: Field ) => () =>
		setTouched( ( t ) => new Set( t ).add( f ) );

	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setTouched( new Set( Object.keys( ID ) as Field[] ) );
		const errors = validate( v );
		const items = ( Object.keys( errors ) as Field[] ).map( ( f ) => ( {
			fieldId: ID[ f ],
			message: errors[ f ] as string,
		} ) );
		setSummary( items );
		if ( items.length ) {
			return;
		}
		const body: ProductInput = {};
		if ( v.name.trim() !== initial.name ) {
			body.name = v.name.trim();
		}
		if ( v.slug.trim() !== initial.slug ) {
			body.slug = v.slug.trim();
		}
		if ( v.description !== initial.description ) {
			body.description = v.description;
		}
		if ( v.iconAttachmentId !== initial.iconAttachmentId ) {
			body.iconAttachmentId = v.iconAttachmentId;
		}
		if ( v.website.trim() !== initial.website ) {
			body.website = v.website.trim();
		}
		if ( v.supportEmail.trim() !== initial.supportEmail ) {
			body.supportEmail = v.supportEmail.trim();
		}
		if ( queue !== product.defaultQueueId ) {
			body.defaultQueueId = queue;
		}
		if ( ! Object.keys( body ).length ) {
			return;
		}
		save.mutate( body );
	};

	const disabled = ! canManage;

	return (
		<div className="flex flex-col gap-5">
			<form
				noValidate
				onSubmit={ onSubmit }
				className="flex flex-col gap-5"
			>
				<ErrorSummary items={ summary } />
				<div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
					<TextField
						id={ ID.name }
						label={ __( 'Product name', 'cliedesk' ) }
						value={ v.name }
						onChange={ ( x ) => set( 'name', x ) }
						onBlur={ blur( 'name' ) }
						errorMessage={ err( 'name' ) }
						isRequired
						isDisabled={ disabled }
					/>
					<TextField
						id={ ID.slug }
						label={ __( 'Slug', 'cliedesk' ) }
						description={ __(
							'Used in addresses and the widget’s data-product attribute.',
							'cliedesk'
						) }
						value={ v.slug }
						onChange={ ( x ) => set( 'slug', x ) }
						onBlur={ blur( 'slug' ) }
						errorMessage={ err( 'slug' ) }
						isRequired
						isDisabled={ disabled }
						spellCheck="false"
					/>
					<TextField
						id={ ID.description }
						label={ __( 'Description', 'cliedesk' ) }
						multiline
						value={ v.description }
						onChange={ ( x ) => set( 'description', x ) }
						onBlur={ blur( 'description' ) }
						errorMessage={ err( 'description' ) }
						isDisabled={ disabled }
					/>
					<ImagePicker
						id={ ID.iconAttachmentId }
						label={ __( 'Icon', 'cliedesk' ) }
						value={ v.iconAttachmentId }
						onChange={ ( x ) => set( 'iconAttachmentId', x ) }
						errorMessage={ err( 'iconAttachmentId' ) }
						isDisabled={ disabled }
					/>
					<TextField
						id={ ID.website }
						label={ __( 'Website', 'cliedesk' ) }
						type="url"
						inputMode="url"
						placeholder="https://"
						value={ v.website }
						onChange={ ( x ) => set( 'website', x ) }
						onBlur={ blur( 'website' ) }
						errorMessage={ err( 'website' ) }
						isDisabled={ disabled }
					/>
					<TextField
						id={ ID.supportEmail }
						label={ __( 'Support email address', 'cliedesk' ) }
						type="email"
						inputMode="email"
						value={ v.supportEmail }
						onChange={ ( x ) => set( 'supportEmail', x ) }
						onBlur={ blur( 'supportEmail' ) }
						errorMessage={ err( 'supportEmail' ) }
						isDisabled={ disabled }
					/>
					<Select
						label={ __( 'Default queue', 'cliedesk' ) }
						description={ __(
							'New conversations of this product that no rule put in a queue go here.',
							'cliedesk'
						) }
						value={ String( queue ?? 0 ) }
						options={ [
							{ id: '0', label: __( 'None', 'cliedesk' ) },
							...( queues.data ?? [] ).map( ( q ) => ( {
								id: String( q.id ),
								label: q.name,
							} ) ),
						] }
						onChange={ ( x ) =>
							setQueue( Number( x ) > 0 ? Number( x ) : null )
						}
						isDisabled={ disabled }
					/>
				</div>
				<SaveBar
					error={ save.error }
					pending={ save.isPending }
					onReload={ onReload }
					disabled={ disabled }
				/>
			</form>
			<Slot
				name="product.help_center"
				fillProps={ {
					product,
					etag,
					onSaved,
					onReload,
					canManage,
					kit: workspaceKit,
				} }
				className="flex flex-col gap-4"
			/>
		</div>
	);
}
