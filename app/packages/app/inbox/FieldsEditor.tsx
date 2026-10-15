/**
 * Custom field values of a conversation or contact (CNV-26…28, CNV-42, CRM): visible fields only, typed inputs,
 * required flags, and a save that sends the changed values with the values the editor saw (`previous`), so the
 * server can report fields someone else changed meanwhile (`notices`).
 *
 * TEAM-20: fields hidden for the person never arrive; read-only ones (`readonly` on the definition or the value) show
 * as non-editable with "Read-only for you". A 403 `cliedesk_field_readonly` / `cliedesk_field_restricted` (access
 * changed while editing) explains itself and reloads the fields.
 */
import {
	api,
	isApiError,
	useMutation,
	type ApiResult,
	type UseMutationResult,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Banner, Button, LoadingRegion } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { announceResult } from '../workspace/forms';
import {
	fieldValuesQuery,
	fieldsQuery,
	type FieldDef,
	type FieldEntity,
	type FieldValue,
	type FieldValues,
} from './api';
import { ActionError, Muted, QueryFailed } from './components';
import {
	FieldInput,
	isEditableType,
	readOnlyHint,
	toDraft,
	fromDraft,
} from './FieldInput';

const ACCESS_CODES = [ 'cliedesk_field_readonly', 'cliedesk_field_restricted' ];

/**
 * Whether an error says the person may no longer change (or see) a field (TEAM-20).
 *
 * @param e Error.
 */
export const isFieldAccessError = ( e: unknown ): boolean =>
	isApiError( e ) && e.status === 403 && ACCESS_CODES.includes( e.code );

type SaveMutation = UseMutationResult<
	ApiResult< FieldValues >,
	Error,
	unknown
>;
export { fromDraft, isEditableType, toDraft } from './FieldInput';

function readOnlyText( value: unknown ): string {
	if ( value === null || value === undefined || value === '' ) {
		return __( 'Not set', 'cliedesk' );
	}
	if ( typeof value === 'object' ) {
		const v = value as Record< string, unknown >;
		if ( 'id' in v ) {
			return `#${ String( v.id ) }`;
		}
		return JSON.stringify( value );
	}
	return typeof value === 'number' ? `#${ value }` : String( value );
}

function Form( {
	entity,
	entityId,
	defs,
	values,
	canEdit,
	save,
	notices,
	saved,
	setSaved,
}: {
	entity: FieldEntity;
	entityId: number;
	defs: FieldDef[];
	values: Record< string, FieldValue >;
	canEdit: boolean;
	save: SaveMutation;
	notices: Record< string, string >;
	saved: boolean;
	setSaved: ( v: boolean ) => void;
} ) {
	const shown = defs.filter( ( d ) => values[ d.key ]?.visible );
	const lockedFor = ( d: FieldDef ) =>
		d.readonly === true || values[ d.key ]?.readonly === true;
	const [ drafts, setDrafts ] = useState< Record< string, unknown > >( () =>
		Object.fromEntries(
			shown.map( ( d ) => [
				d.key,
				toDraft( d, values[ d.key ]?.value ),
			] )
		)
	);
	const fieldErrors = isApiError( save.error ) ? save.error.fields : {};
	const changed = shown.filter( ( d ) => {
		if ( lockedFor( d ) ) {
			return false;
		}
		const before = toDraft( d, values[ d.key ]?.value );
		return JSON.stringify( before ) !== JSON.stringify( drafts[ d.key ] );
	} );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSaved( false );
		if ( ! changed.length ) {
			return;
		}
		save.mutate( {
			entity,
			entityId,
			values: changed.map( ( d ) => ( {
				key: d.key,
				value: fromDraft( d, drafts[ d.key ], values[ d.key ]?.value ),
			} ) ),
			previous: changed.map( ( d ) => ( {
				key: d.key,
				value: values[ d.key ]?.value ?? null,
			} ) ),
		} );
	};
	const set = ( key: string, v: unknown ) => {
		setSaved( false );
		setDrafts( ( o ) => ( { ...o, [ key ]: v } ) );
	};
	if ( ! shown.length ) {
		return <Muted>{ __( 'No fields apply here.', 'cliedesk' ) }</Muted>;
	}
	const labels = Object.fromEntries(
		defs.map( ( d ) => [ d.key, d.label ] )
	);
	const idFor = ( key: string ) => `cd-${ entity }-field-${ key }`;
	return (
		<form noValidate onSubmit={ onSubmit } className="flex flex-col gap-3">
			{ Object.keys( notices ).length > 0 && (
				<Banner
					tone="warning"
					title={ __(
						'Someone else changed fields while you were editing',
						'cliedesk'
					) }
				>
					<ul className="list-disc ps-5">
						{ Object.entries( notices ).map( ( [ k, msg ] ) => (
							<li
								key={ k }
							>{ `${ labels[ k ] ?? k }: ${ msg }` }</li>
						) ) }
					</ul>
				</Banner>
			) }
			{ isFieldAccessError( save.error ) ? (
				<Banner
					tone="warning"
					role="alert"
					title={ __(
						'You can no longer change some of these fields',
						'cliedesk'
					) }
				>
					{ __(
						'Who can see and edit them changed while you were editing. The fields were reloaded; your other changes were not saved.',
						'cliedesk'
					) }
				</Banner>
			) : null }
			{ save.error &&
			! isFieldAccessError( save.error ) &&
			! Object.keys( fieldErrors ).length ? (
				<ActionError error={ save.error } labels={ labels } />
			) : null }
			{ shown.map( ( d ) => {
				const meta = values[ d.key ] as FieldValue;
				const err =
					fieldErrors[ `values.${ d.key }` ] ??
					fieldErrors[ d.key ] ??
					null;
				const locked = lockedFor( d );
				const readOnly =
					! canEdit || locked || ! isEditableType( d.type );
				const hint = locked ? (
					<p className="text-sm text-fg-muted">{ readOnlyHint() }</p>
				) : null;
				if ( ! isEditableType( d.type ) ) {
					return (
						<div key={ d.key } className="flex flex-col gap-0.5">
							<p className="text-sm font-medium">{ d.label }</p>
							<p className="text-sm text-fg-muted">
								{ readOnlyText( meta.value ) }
							</p>
							{ hint }
						</div>
					);
				}
				const input = (
					<FieldInput
						key={ d.key }
						def={ d }
						id={ idFor( d.key ) }
						draft={ drafts[ d.key ] }
						onChange={ ( v ) => set( d.key, v ) }
						required={ meta.required }
						readOnly={ readOnly }
						locked={ locked }
						error={ err }
						currency={
							( meta.value as { currency?: string } | null )
								?.currency
						}
					/>
				);
				return meta.setBy ? (
					<div key={ d.key } className="flex flex-col gap-1">
						{ input }
						<RuleSource
							entity={ entity }
							entityId={ entityId }
							field={ d.key }
							name={ meta.setBy.name }
							canUndo={ canEdit && ! locked }
						/>
					</div>
				) : (
					input
				);
			} ) }
			{ canEdit && shown.some( ( d ) => ! lockedFor( d ) ) && (
				<div className="flex items-center gap-3">
					<Button
						type="submit"
						size="sm"
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ ! changed.length }
					>
						{ __( 'Save fields', 'cliedesk' ) }
					</Button>
					<p role="status" className="text-sm text-success">
						{ saved ? __( 'Saved', 'cliedesk' ) : '' }
					</p>
				</div>
			) }
		</form>
	);
}

/**
 * TRI-16: "Set by rule …" under a value a rule set, with Undo (conversations).
 *
 * @param props          Props.
 * @param props.entity   Entity.
 * @param props.entityId Entity id.
 * @param props.field    Field key.
 * @param props.name     Rule name.
 * @param props.canUndo  The person may change the value.
 */
function RuleSource( {
	entity,
	entityId,
	field,
	name,
	canUndo,
}: {
	entity: FieldEntity;
	entityId: number;
	field: string;
	name: string;
	canUndo: boolean;
} ) {
	const qc = useQueryClient();
	const undo = useMutation( {
		mutationFn: () =>
			api.post( 'field-values/undo', {
				body: { entityId, key: field },
			} ),
		onSuccess: () => {
			announceResult( __( 'Undone.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: fieldValuesQuery( entity, entityId ).queryKey,
			} );
		},
	} );
	return (
		<p className="flex items-center gap-2 text-xs text-fg-muted">
			{ name
				? sprintf(
						/* translators: %s: rule name. */
						__( 'Set by rule “%s”', 'cliedesk' ),
						name
					)
				: __( 'Set by a rule', 'cliedesk' ) }
			{ canUndo && entity === 'conversation' && (
				<Button
					size="sm"
					variant="link"
					isLoading={ undo.isPending }
					onPress={ () => undo.mutate() }
				>
					{ __( 'Undo', 'cliedesk' ) }
				</Button>
			) }
		</p>
	);
}

/**
 * Field values editor.
 *
 * @param props          Props.
 * @param props.entity   Entity.
 * @param props.entityId Entity id.
 * @param props.canEdit  The user may change values.
 */
export function FieldsEditor( {
	entity,
	entityId,
	canEdit,
}: {
	entity: FieldEntity;
	entityId: number;
	canEdit: boolean;
} ) {
	const qc = useQueryClient();
	const defs = useQuery( fieldsQuery( entity ) );
	const values = useQuery( fieldValuesQuery( entity, entityId ) );
	const [ notices, setNotices ] = useState< Record< string, string > >( {} );
	const [ saved, setSaved ] = useState( false );
	const save = useMutation( {
		mutationFn: ( body: unknown ) =>
			api.patch< FieldValues >( 'field-values', { body } ),
		onSuccess: ( r ) => {
			setNotices( r.data?.notices ?? {} );
			setSaved( true );
			qc.setQueryData(
				fieldValuesQuery( entity, entityId ).queryKey,
				r.data?.values ?? {}
			);
			announceResult( __( 'Fields saved.', 'cliedesk' ) );
			if ( entity === 'conversation' ) {
				void qc.invalidateQueries( {
					queryKey: [ 'conversation', entityId, 'events' ],
				} );
			}
		},
		onError: ( e ) => {
			// TEAM-20: access changed while editing; show the fields as they are now.
			if ( isFieldAccessError( e ) ) {
				void qc.invalidateQueries( { queryKey: [ 'fields', entity ] } );
				void qc.invalidateQueries( {
					queryKey: fieldValuesQuery( entity, entityId ).queryKey,
				} );
			}
		},
	} );
	if ( defs.isPending || values.isPending ) {
		return <LoadingRegion label={ __( 'Loading fields…', 'cliedesk' ) } />;
	}
	if ( defs.isError || values.isError ) {
		return (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load fields', 'cliedesk' ) }
				error={ defs.error ?? values.error }
				onRetry={ () => {
					void defs.refetch();
					void values.refetch();
				} }
			/>
		);
	}
	return (
		<Form
			// A new server state (save, live update) resets the drafts.
			key={ JSON.stringify( values.data ) }
			entity={ entity }
			entityId={ entityId }
			defs={ defs.data }
			values={ values.data }
			canEdit={ canEdit }
			save={ save }
			notices={ notices }
			saved={ saved }
			setSaved={ setSaved }
		/>
	);
}
