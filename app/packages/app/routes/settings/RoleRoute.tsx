/**
 * `/settings/team/roles/$roleKey`: one role, read-only (TEAM-11, TEAM-12): levels, permissions by area with their
 * explanations, which conversations and products. Changing roles (TEAM-13, TEAM-19) is Pro: its editor fills
 * `team.role.editor`; this page is the slot's fallback, shown after the PRO badge.
 */
import { useQuery } from '@cliedesk/data';
import { Button, LoadingRegion, Select, Slot } from '@cliedesk/ui';
import { Link, useParams } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { PlayOnlySetting } from './PlayOnlySetting';
import { productListQuery, type ProductSummary } from '../../workspace/api';
import {
	ADMIN_ROLE,
	OWNER_ROLE,
	capabilitiesQuery,
	rolesQuery,
	type Capability,
	type Role,
} from '../../team/api';
import { CapabilityList, capabilityLock } from '../../team/CapabilityList';
import { canRemoveLimit, useRemoveLimit } from '../../team/ProductLimit';
import {
	LEVEL_OBJECTS,
	applyLevel,
	levelCaps,
	levelFromCaps,
	levelLabel,
	levelObjectLabel,
	levelsOf,
	type LevelObject,
} from '../../team/levels';
import { QueryError } from '../../team/components';
import { roleName, roleTypeLabel, scopeLabel } from '../../team/labels';
import { ROLES_PATH } from '../../team/paths';
import { NotFound } from '../NotFound';

function Shell( {
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
} ) {
	return (
		<div className="mx-auto flex max-w-3xl flex-col">
			<Link
				to={ ROLES_PATH }
				className="mb-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				<ArrowLeft
					aria-hidden="true"
					size={ 14 }
					className="rtl:rotate-180"
				/>
				{ __( 'All roles', 'cliedesk' ) }
			</Link>
			<PageHeader title={ title } description={ description } />
			{ children }
		</div>
	);
}

/**
 * Levels for views, saved replies and tags (TEAM-15/16): a summary, and one select per object when the role can be
 * edited. A level sets its capability and every lower one and clears the higher ones. Levels that need a capability
 * this editor cannot give are left out.
 *
 * @param props              Props.
 * @param props.caps         Current capabilities.
 * @param props.capabilities Catalogue.
 * @param props.roleKey      Role.
 * @param props.readOnly     No editing.
 * @param props.onChange     New capability set.
 */
function Levels( {
	caps,
	capabilities,
	roleKey,
	readOnly,
	onChange,
}: {
	caps: Set< string >;
	capabilities: Capability[];
	roleKey: string;
	readOnly: boolean;
	onChange: ( next: Set< string > ) => void;
} ) {
	const available = ( object: LevelObject, level: string ) =>
		levelCaps( object, level ).set.every( ( key ) => {
			const cap = capabilities.find( ( c ) => c.key === key );
			return !! cap && ! capabilityLock( cap, roleKey, caps.has( key ) );
		} );
	return (
		<section
			aria-labelledby="cd-role-levels"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-role-levels" className="text-lg font-semibold">
				{ __( 'Levels', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'How far people with this role can go with views, saved replies and tags. Each level includes the ones below it.',
					'cliedesk'
				) }
			</p>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-surface p-3 text-sm">
				{ LEVEL_OBJECTS.map( ( object ) => (
					<div key={ object } className="contents">
						<dt className="font-medium">
							{ levelObjectLabel( object ) }
						</dt>
						<dd>
							{ levelLabel(
								object,
								levelFromCaps( caps, object )
							) }
						</dd>
					</div>
				) ) }
			</dl>
			{ ! readOnly && (
				<div className="grid gap-3 sm:grid-cols-3">
					{ LEVEL_OBJECTS.map( ( object ) => {
						const current = levelFromCaps( caps, object );
						return (
							<Select
								key={ object }
								id={ `cd-role-level-${ object }` }
								label={ levelObjectLabel( object ) }
								value={ current }
								onChange={ ( level ) =>
									onChange(
										applyLevel( caps, object, level )
									)
								}
								options={ levelsOf( object )
									.filter(
										( level ) =>
											level === current ||
											available( object, level )
									)
									.map( ( level ) => ( {
										id: level,
										label: levelLabel( object, level ),
									} ) ) }
							/>
						);
					} ) }
				</div>
			) }
		</section>
	);
}

/**
 * "Remove limit" for a role's product limit (set with Pro's role editor).
 *
 * @param props         Props.
 * @param props.roleKey Role.
 */
function RemoveRoleLimit( { roleKey }: { roleKey: string } ) {
	const remove = useRemoveLimit();
	if ( ! canRemoveLimit( 'role' ) ) {
		return null;
	}
	return (
		<Button
			size="sm"
			variant="ghost"
			isLoading={ remove.isPending }
			onPress={ () => remove.mutate( { subject: 'role', key: roleKey } ) }
		>
			{ __( 'Remove limit', 'cliedesk' ) }
		</Button>
	);
}

/**
 * The role as it is (no editing in Free).
 *
 * @param props              Props.
 * @param props.role         Role.
 * @param props.capabilities Catalogue.
 * @param props.products     Active products (names of a product limit).
 */
function RoleView( {
	role,
	capabilities,
	products,
}: {
	role: Role;
	capabilities: Capability[];
	products: ProductSummary[];
} ) {
	const caps =
		role.key === OWNER_ROLE
			? new Set( capabilities.map( ( c ) => c.key ) )
			: new Set( role.caps );
	const limit = role.productLimit;
	return (
		<div className="flex flex-col gap-6">
			<Levels
				caps={ caps }
				capabilities={ capabilities }
				roleKey={ role.key }
				readOnly
				onChange={ () => undefined }
			/>
			<section
				aria-labelledby="cd-role-caps"
				className="flex flex-col gap-3"
			>
				<h2 id="cd-role-caps" className="text-lg font-semibold">
					{ __( 'Permissions', 'cliedesk' ) }
				</h2>
				<CapabilityList
					capabilities={ capabilities }
					roleKey={ role.key }
					value={ caps }
					isDisabled
					onChange={ () => undefined }
				/>
			</section>
			<section
				aria-labelledby="cd-role-access"
				className="flex flex-col gap-2"
			>
				<h2 id="cd-role-access" className="text-lg font-semibold">
					{ __( 'Which conversations', 'cliedesk' ) }
				</h2>
				<p>{ scopeLabel( role.conversationScope ) }</p>
				{ limit && (
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm text-fg-muted">
							{ __( 'Only these products:', 'cliedesk' ) }{ ' ' }
							<bdi>
								{ limit
									.map(
										( id ) =>
											products.find(
												( p ) => p.id === id
											)?.name ?? `#${ id }`
									)
									.join( ', ' ) }
							</bdi>
						</p>
						{ /* BRD-14 fails closed: Free keeps the limit set with Pro and can remove it. */ }
						<RemoveRoleLimit roleKey={ role.key } />
					</div>
				) }
			</section>
		</div>
	);
}

/**
 * Role page.
 */
export default function RoleRoute() {
	const params = useParams( { strict: false } ) as { roleKey?: string };
	const key = params.roleKey ?? '';
	const rolesQ = useQuery( rolesQuery() );
	const capsQ = useQuery( capabilitiesQuery() );
	const productsQ = useQuery( productListQuery( 'active' ) );

	if ( rolesQ.isPending || capsQ.isPending ) {
		return (
			<Shell title={ __( 'Role', 'cliedesk' ) }>
				<LoadingRegion />
			</Shell>
		);
	}
	if ( rolesQ.isError || capsQ.isError ) {
		const failed = rolesQ.isError ? rolesQ : capsQ;
		return (
			<Shell title={ __( 'Role', 'cliedesk' ) }>
				<QueryError
					title={ __( 'Could not load the role', 'cliedesk' ) }
					error={ failed.error }
					onRetry={ () => void failed.refetch() }
				/>
			</Shell>
		);
	}
	const roles = rolesQ.data.roles;
	const role = roles.find( ( r ) => r.key === key );
	if ( ! role ) {
		return <NotFound />;
	}
	return (
		<Shell
			title={ roleName( role.key, roles ) }
			description={ roleTypeLabel( role.type ) }
		>
			{ /* Pro's editor reuses CapabilityList and Levels through fillProps (no extra @cliedesk/app exports). */ }
			<Slot
				name="team.role.editor"
				fillProps={ {
					role,
					roles,
					capabilities: capsQ.data,
					products: productsQ.data?.items ?? [],
					CapabilityList,
					Levels,
					scopeLabel,
				} }
				fallback={
					<RoleView
						role={ role }
						capabilities={ capsQ.data }
						products={ productsQ.data?.items ?? [] }
					/>
				}
			/>
			{ role.key !== OWNER_ROLE && role.key !== ADMIN_ROLE && (
				<PlayOnlySetting roleKey={ role.key } />
			) }
		</Shell>
	);
}
