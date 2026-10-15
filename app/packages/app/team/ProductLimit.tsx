/**
 * Product limits of teams, people and roles (BRD-14), Free: read-only, with "Remove limit". A product limit is a
 * confidentiality boundary that fails closed: limits set with Pro keep limiting in Free, Free never adds or widens
 * one, and an admin who sees every product (and manages settings) can remove one. Pro's editors fill the
 * `team.team.products` and `team.person.products` slots.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Banner, Button, LoadingRegion, Slot } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import { describeError } from '../components/RouteError';
import { productListQuery, productKeys } from '../workspace/api';
import { announceResult } from '../workspace/forms';
import {
	productScopeQuery,
	teamKeys,
	teamsKeys,
	type LimitSubject,
} from './api';

/**
 * A function that names products by id (the full list is loaded once).
 */
function useProductNames(): ( ids: number[] ) => string {
	const q = useQuery( productListQuery( 'all' ) );
	return ( ids ) =>
		ids
			.map(
				( id ) =>
					q.data?.items.find( ( p ) => p.id === id )?.name ??
					sprintf(
						/* translators: %d: product id. */
						__( 'Product #%d', 'cliedesk' ),
						id
					)
			)
			.join( ', ' );
}

/** Whether the current user may remove a limit (it widens access). */
export function canRemoveLimit( subject: LimitSubject ): boolean {
	if ( subject === 'role' ) {
		return can( 'cliedesk_manage_roles' );
	}
	return can( 'cliedesk_manage_settings' );
}

/**
 * "Remove limit" mutation.
 */
export function useRemoveLimit() {
	const qc = useQueryClient();
	return useMutation( {
		mutationFn: ( v: { subject: LimitSubject; key?: string } ) =>
			api.post( 'product-scope/remove', { body: v } ),
		onSuccess: () => {
			announceResult( __( 'Product limit removed.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: teamKeys.all } );
			void qc.invalidateQueries( { queryKey: teamsKeys.all } );
			void qc.invalidateQueries( { queryKey: productKeys.all } );
		},
	} );
}

function LimitRow( {
	label,
	ids,
	subject,
	limitKey,
	children,
}: {
	label: string;
	ids: number[];
	subject: LimitSubject;
	limitKey?: string;
	children?: ReactNode;
} ) {
	const names = useProductNames();
	const remove = useRemoveLimit();
	return (
		<li className="flex flex-wrap items-center gap-2">
			<span>
				{ sprintf(
					/* translators: 1: where the limit comes from, 2: product names. */
					__( '%1$s: %2$s', 'cliedesk' ),
					label,
					names( ids )
				) }
			</span>
			{ children }
			{ canRemoveLimit( subject ) && (
				<Button
					size="sm"
					variant="ghost"
					isLoading={ remove.isPending }
					onPress={ () =>
						remove.mutate( { subject, key: limitKey } )
					}
				>
					{ __( 'Remove limit', 'cliedesk' ) }
				</Button>
			) }
			{ remove.isError && (
				<Banner
					tone="danger"
					role="alert"
					title={ describeError( remove.error ) }
				/>
			) }
		</li>
	);
}

/**
 * The products of a team: read-only in Free (Pro's editor fills `team.team.products`).
 *
 * @param props        Props.
 * @param props.teamId Team.
 * @param props.ids    Product ids of the team (empty: no limit).
 */
export function TeamProducts( {
	teamId,
	ids,
}: {
	teamId: number;
	ids: number[];
} ) {
	return (
		<section
			aria-labelledby="cd-team-products"
			className="flex flex-col gap-2"
		>
			<h3 id="cd-team-products" className="text-sm font-medium">
				{ __( 'Products this team handles', 'cliedesk' ) }
			</h3>
			<Slot
				name="team.team.products"
				fillProps={ { teamId, productIds: ids } }
				className="flex flex-col gap-2"
				fallback={
					ids.length ? (
						<ul className="text-sm">
							<LimitRow
								label={ __( 'Members see only', 'cliedesk' ) }
								ids={ ids }
								subject="team"
								limitKey={ String( teamId ) }
							/>
						</ul>
					) : (
						<p className="text-sm text-fg-muted">
							{ __(
								'All products: the team does not limit what its members see.',
								'cliedesk'
							) }
						</p>
					)
				}
			/>
		</section>
	);
}

/**
 * Which products a person sees and why (Teams tab of the person page); Pro's editor fills `team.person.products`.
 *
 * @param props        Props.
 * @param props.userId Person.
 */
export function PersonProducts( { userId }: { userId: number } ) {
	const q = useQuery( productScopeQuery( userId ) );
	const names = useProductNames();
	if ( q.isPending ) {
		return <LoadingRegion />;
	}
	if ( q.isError ) {
		return (
			<Banner
				tone="danger"
				role="alert"
				title={ describeError( q.error ) }
			/>
		);
	}
	const scope = q.data;
	const rows = [
		...( scope.own.length
			? [
					<LimitRow
						key="own"
						label={ __( 'Their own limit', 'cliedesk' ) }
						ids={ scope.own }
						subject="user"
						limitKey={ String( userId ) }
					/>,
				]
			: [] ),
		...scope.teams.map( ( t ) => (
			<LimitRow
				key={ `t${ t.id }` }
				label={ sprintf(
					/* translators: %s: team name. */
					__( 'Team “%s”', 'cliedesk' ),
					t.name
				) }
				ids={ t.productIds }
				subject="team"
				limitKey={ String( t.id ) }
			/>
		) ),
		...scope.roles.map( ( r ) => (
			<LimitRow
				key={ `r${ r.key }` }
				label={ sprintf(
					/* translators: %s: role key. */
					__( 'Role %s', 'cliedesk' ),
					r.key
				) }
				ids={ r.productIds }
				subject="role"
				limitKey={ r.key }
			/>
		) ),
		...( scope.defaults.length && ! scope.own.length && ! scope.teams.length
			? [
					<LimitRow
						key="default"
						label={ __( 'Default for new agents', 'cliedesk' ) }
						ids={ scope.defaults }
						subject="default"
					/>,
				]
			: [] ),
	];
	return (
		<section
			aria-labelledby="cd-person-products"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-person-products" className="text-lg font-semibold">
				{ __( 'Products', 'cliedesk' ) }
			</h2>
			<p>
				{ scope.products === null
					? __( 'Sees every product.', 'cliedesk' )
					: sprintf(
							/* translators: %s: product names. */
							__( 'Sees only: %s.', 'cliedesk' ),
							scope.products.length
								? names( scope.products )
								: __( 'no product', 'cliedesk' )
						) }
			</p>
			{ rows.length > 0 && (
				<ul className="flex flex-col gap-1 text-sm">{ rows }</ul>
			) }
			<Slot
				name="team.person.products"
				fillProps={ { userId, scope } }
				className="flex flex-col gap-2"
			/>
		</section>
	);
}
