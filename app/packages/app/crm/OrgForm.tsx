/**
 * Organization form fields (CRM-30..33), shared by the create dialog and the organization page: name, domains
 * (chips, each with its own server error such as "domains.1"), parent picker, owner, default team and
 * "Tag new conversations of members".
 */
import { useQuery } from '@cliedesk/data';
import {
	Button,
	IconButton,
	Modal,
	Select,
	Switch,
	TextField,
	cx,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { teamsLookupQuery } from '../inbox/api';
import { Muted, useAgents } from '../inbox/components';
import { validateText } from '../workspace/forms';
import {
	cleanDomain,
	type Organization,
	type OrgInput,
	type PortalAccess,
} from './api';
import { OrgPicker, type PickedItem } from './components';

const captionClass = 'text-sm font-medium text-fg';

export interface OrgValues {
	name: string;
	parent: PickedItem | null;
	ownerId: number | null;
	defaultTeamId: number | null;
	propagateTags: boolean;
	/** PRT-17: null follows the workspace default. */
	portal?: PortalAccess | null;
	domains: string[];
}

export type OrgField =
	'name' | 'domains' | 'parentId' | 'ownerId' | 'defaultTeamId';

export interface OrgErrors {
	form: Partial< Record< string, string > >;
	/** Domain => message. */
	domains: Record< string, string >;
}

/**
 * DOM id of a field.
 *
 * @param prefix Form prefix.
 * @param field  Field.
 */
export const orgFieldId = ( prefix: string, field: string ) =>
	`${ prefix }-${ field }`;

/**
 * Form values of an organization (or empty values).
 *
 * @param o Organization.
 */
export function orgValues( o?: Organization ): OrgValues {
	return {
		name: o?.name ?? '',
		parent: o?.parentId
			? { id: o.parentId, label: o.parentName ?? `#${ o.parentId }` }
			: null,
		ownerId: o?.ownerId ?? null,
		defaultTeamId: o?.defaultTeamId ?? null,
		propagateTags: o?.propagateTags ?? false,
		portal: o?.portalAccess ?? undefined,
		domains: o?.domains ?? [],
	};
}

/**
 * Request body.
 *
 * @param v Values.
 */
export function orgPayload( v: OrgValues ): OrgInput {
	return {
		name: v.name.trim(),
		parentId: v.parent?.id ?? null,
		ownerId: v.ownerId,
		defaultTeamId: v.defaultTeamId,
		propagateTags: v.propagateTags,
		...( v.portal !== undefined ? { portalAccess: v.portal } : {} ),
		domains: v.domains,
	};
}

/**
 * Client checks (the server validates again).
 *
 * @param v Values.
 */
export function validateOrg(
	v: OrgValues
): Partial< Record< OrgField, string > > {
	const out: Partial< Record< OrgField, string > > = {};
	const name = validateText( v.name, 191, true );
	if ( name ) {
		out.name = name;
	}
	if ( v.domains.length > 50 ) {
		out.domains = __( 'Add up to 50 domains.', 'cliedesk' );
	}
	return out;
}

function DomainsEditor( {
	id,
	domains,
	onChange,
	error,
	chipErrors,
	isReadOnly,
}: {
	id: string;
	domains: string[];
	onChange: ( d: string[] ) => void;
	error: string | null;
	chipErrors: Record< string, string >;
	isReadOnly: boolean;
} ) {
	const [ input, setInput ] = useState( '' );
	const [ inputError, setInputError ] = useState< string | null >( null );
	const add = () => {
		const d = cleanDomain( input );
		if ( ! d ) {
			setInputError(
				__( 'Enter a domain such as example.com.', 'cliedesk' )
			);
			return;
		}
		if ( ! /^[a-z0-9.-]+\.[a-z0-9-]{2,}$/i.test( d ) ) {
			setInputError(
				__( 'Enter a domain such as example.com.', 'cliedesk' )
			);
			return;
		}
		if ( domains.includes( d ) ) {
			setInputError( __( 'This domain is already listed.', 'cliedesk' ) );
			return;
		}
		onChange( [ ...domains, d ] );
		setInput( '' );
		setInputError( null );
	};
	const listId = `${ id }-list`;
	return (
		<div id={ id } className="flex flex-col gap-2">
			<span id={ `${ id }-label` } className={ captionClass }>
				{ __( 'Domains', 'cliedesk' ) }
			</span>
			{ domains.length ? (
				<ul
					id={ listId }
					aria-labelledby={ `${ id }-label` }
					className="flex flex-wrap gap-1.5"
				>
					{ domains.map( ( d, i ) => {
						const err = chipErrors[ d ];
						const errId = `${ id }-err-${ i }`;
						return (
							<li
								key={ d }
								id={ `${ id }-${ i }` }
								className={ cx(
									'inline-flex flex-col rounded-2xl border px-2 py-0.5 text-sm',
									err
										? 'border-danger-line bg-danger-subtle'
										: 'border-line'
								) }
							>
								<span className="inline-flex items-center gap-1">
									<bdi>{ d }</bdi>
									{ ! isReadOnly && (
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: domain. */
												__(
													'Remove domain %s',
													'cliedesk'
												),
												d
											) }
											aria-describedby={
												err ? errId : undefined
											}
											icon={ <X size={ 12 } /> }
											onPress={ () =>
												onChange(
													domains.filter(
														( x ) => x !== d
													)
												)
											}
										/>
									) }
								</span>
								{ err && (
									<span id={ errId } className="text-danger">
										{ err }
									</span>
								) }
							</li>
						);
					} ) }
				</ul>
			) : (
				<Muted>{ __( 'No domains.', 'cliedesk' ) }</Muted>
			) }
			{ error && (
				<p role="alert" className="text-sm text-danger">
					{ error }
				</p>
			) }
			{ ! isReadOnly && (
				<div className="flex items-end gap-2">
					<TextField
						className="flex-1"
						label={ __( 'Add a domain', 'cliedesk' ) }
						description={ __(
							'Contacts with an email address at this domain join the organization automatically.',
							'cliedesk'
						) }
						placeholder="example.com"
						value={ input }
						onChange={ ( x ) => {
							setInput( x );
							setInputError( null );
						} }
						onKeyDown={ ( e: KeyboardEvent ) => {
							if ( e.key === 'Enter' ) {
								e.preventDefault();
								add();
							}
						} }
						errorMessage={ inputError }
					/>
					<Button
						onPress={ add }
						className={ inputError ? 'mb-6' : '' }
					>
						{ __( 'Add domain', 'cliedesk' ) }
					</Button>
				</div>
			) }
		</div>
	);
}

function ParentField( {
	id,
	value,
	onChange,
	selfId,
	error,
	isReadOnly,
}: {
	id: string;
	value: PickedItem | null;
	onChange: ( v: PickedItem | null ) => void;
	selfId?: number;
	error: string | null;
	isReadOnly: boolean;
} ) {
	const [ open, setOpen ] = useState( false );
	const [ picked, setPicked ] = useState< PickedItem | null >( null );
	return (
		<div id={ id } className="flex flex-col gap-1">
			<span className={ captionClass }>
				{ __( 'Parent organization', 'cliedesk' ) }
			</span>
			<div className="flex flex-wrap items-center gap-2">
				<span className={ value ? '' : 'text-fg-muted' }>
					{ value ? (
						<bdi>{ value.label }</bdi>
					) : (
						__( 'None', 'cliedesk' )
					) }
				</span>
				{ ! isReadOnly && (
					<>
						<Button
							size="sm"
							onPress={ () => {
								setPicked( null );
								setOpen( true );
							} }
						>
							{ value
								? __( 'Change parent…', 'cliedesk' )
								: __( 'Choose parent…', 'cliedesk' ) }
						</Button>
						{ value && (
							<Button
								size="sm"
								variant="ghost"
								onPress={ () => onChange( null ) }
							>
								{ __( 'Remove parent', 'cliedesk' ) }
							</Button>
						) }
					</>
				) }
			</div>
			{ error && (
				<p role="alert" className="text-sm text-danger">
					{ error }
				</p>
			) }
			{ open && (
				<Modal
					isOpen
					onOpenChange={ setOpen }
					title={ __( 'Choose a parent organization', 'cliedesk' ) }
					footer={
						<>
							<Button onPress={ () => setOpen( false ) }>
								{ __( 'Cancel', 'cliedesk' ) }
							</Button>
							<Button
								variant="primary"
								isDisabled={ ! picked }
								onPress={ () => {
									onChange( picked );
									setOpen( false );
								} }
							>
								{ __( 'Use as parent', 'cliedesk' ) }
							</Button>
						</>
					}
				>
					<OrgPicker
						exclude={ selfId ? [ selfId ] : [] }
						value={ picked }
						onChange={ setPicked }
					/>
				</Modal>
			) }
		</div>
	);
}

/**
 * The organization fields.
 *
 * @param props            Props.
 * @param props.prefix     DOM id prefix.
 * @param props.values     Values.
 * @param props.onChange   Change.
 * @param props.errors     Client and server errors.
 * @param props.isReadOnly Read only (no cliedesk_edit_contacts).
 * @param props.selfId     The organization being edited (not its own parent).
 */
export function OrgFields( {
	prefix,
	values: v,
	onChange,
	errors,
	isReadOnly = false,
	selfId,
}: {
	prefix: string;
	values: OrgValues;
	onChange: ( patch: Partial< OrgValues > ) => void;
	errors: OrgErrors;
	isReadOnly?: boolean;
	selfId?: number;
} ) {
	const { agents } = useAgents();
	const teams = useQuery( teamsLookupQuery() );
	const err = ( f: string ) => errors.form[ f ] ?? null;
	const ownerOptions = [
		{ id: '0', label: __( 'No owner', 'cliedesk' ) },
		...agents.map( ( a ) => ( { id: String( a.userId ), label: a.name } ) ),
	];
	if ( v.ownerId && ! agents.some( ( a ) => a.userId === v.ownerId ) ) {
		ownerOptions.push( {
			id: String( v.ownerId ),
			label: `#${ v.ownerId }`,
		} );
	}
	const teamOptions = [
		{ id: '0', label: __( 'No default team', 'cliedesk' ) },
		...( teams.data ?? [] ).map( ( t ) => ( {
			id: String( t.id ),
			label: t.name,
		} ) ),
	];
	if (
		v.defaultTeamId &&
		! ( teams.data ?? [] ).some( ( t ) => t.id === v.defaultTeamId )
	) {
		teamOptions.push( {
			id: String( v.defaultTeamId ),
			label: `#${ v.defaultTeamId }`,
		} );
	}
	return (
		<div className="flex flex-col gap-4">
			<TextField
				id={ orgFieldId( prefix, 'name' ) }
				label={ __( 'Name', 'cliedesk' ) }
				isRequired
				isReadOnly={ isReadOnly }
				maxLength={ 191 }
				value={ v.name }
				onChange={ ( name ) => onChange( { name } ) }
				errorMessage={ err( 'name' ) }
			/>
			<DomainsEditor
				id={ orgFieldId( prefix, 'domains' ) }
				domains={ v.domains }
				onChange={ ( domains ) => onChange( { domains } ) }
				error={ err( 'domains' ) }
				chipErrors={ errors.domains }
				isReadOnly={ isReadOnly }
			/>
			<ParentField
				id={ orgFieldId( prefix, 'parentId' ) }
				value={ v.parent }
				onChange={ ( parent ) => onChange( { parent } ) }
				selfId={ selfId }
				error={ err( 'parentId' ) }
				isReadOnly={ isReadOnly }
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<Select
					id={ orgFieldId( prefix, 'ownerId' ) }
					label={ __( 'Owner', 'cliedesk' ) }
					isDisabled={ isReadOnly }
					value={ String( v.ownerId ?? 0 ) }
					options={ ownerOptions }
					onChange={ ( x ) =>
						onChange( { ownerId: Number( x ) || null } )
					}
					errorMessage={ err( 'ownerId' ) }
				/>
				<Select
					id={ orgFieldId( prefix, 'defaultTeamId' ) }
					label={ __( 'Default team', 'cliedesk' ) }
					description={ __(
						'New conversations of members go to this team.',
						'cliedesk'
					) }
					isDisabled={ isReadOnly }
					value={ String( v.defaultTeamId ?? 0 ) }
					options={ teamOptions }
					onChange={ ( x ) =>
						onChange( { defaultTeamId: Number( x ) || null } )
					}
					errorMessage={ err( 'defaultTeamId' ) }
				/>
			</div>
			<Switch
				isSelected={ v.propagateTags }
				isReadOnly={ isReadOnly }
				onChange={ ( propagateTags ) => onChange( { propagateTags } ) }
			>
				{ __( 'Tag new conversations of members', 'cliedesk' ) }
			</Switch>
			{ err( 'propagateTags' ) && (
				<p role="alert" className="text-sm text-danger">
					{ err( 'propagateTags' ) }
				</p>
			) }
			<Select
				id={ orgFieldId( prefix, 'portalAccess' ) }
				label={ __(
					'In the customer portal, members see',
					'cliedesk'
				) }
				description={ __(
					'Colleagues’ requests are read only, unless a member may reply for the organization.',
					'cliedesk'
				) }
				isDisabled={ isReadOnly }
				value={ v.portal?.view ?? '' }
				options={ [
					{ id: '', label: __( 'Workspace default', 'cliedesk' ) },
					{
						id: 'own',
						label: __( 'Only their own requests', 'cliedesk' ),
					},
					{
						id: 'full',
						label: __(
							'All requests of the organization',
							'cliedesk'
						),
					},
					...( v.portal?.view === 'custom'
						? [
								{
									id: 'custom',
									label: __(
										'All except some types or queues',
										'cliedesk'
									),
								},
							]
						: [] ),
				] }
				onChange={ ( x ) =>
					onChange( {
						portal: x
							? {
									view: String( x ) as PortalAccess[ 'view' ],
									children: v.portal?.children ?? false,
									excludeTypes: v.portal?.excludeTypes ?? [],
									excludeQueues:
										v.portal?.excludeQueues ?? [],
								}
							: null,
					} )
				}
			/>
			{ v.portal && v.portal.view !== 'own' && (
				<Switch
					isSelected={ v.portal.children }
					isReadOnly={ isReadOnly }
					onChange={ ( children ) =>
						v.portal &&
						onChange( { portal: { ...v.portal, children } } )
					}
				>
					{ __( 'Include child organizations', 'cliedesk' ) }
				</Switch>
			) }
		</div>
	);
}
