/**
 * Settings → Workspace → Customer cards (CRM-18), for people with cliedesk_manage_settings.
 *
 * Admins choose which attributes and fields the contact and organization cards show in the conversation side panel,
 * in which order and under which label: a default layout for everyone and, optionally, a layout per role.
 *
 * - GET cards/{contact|organization}/config → {default, roles: {role: [...]}, available: [{key, label}]}.
 * - PUT cards/{context}/config {role?, items: [{key, label?}]}; an empty list for a role resets it to the default.
 * - Role names come from GET roles/picker.
 */
import { useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	ConfirmDestructive,
	IconButton,
	LoadingRegion,
	RadioGroup,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useState } from 'react';
import { ActionError, Muted, QueryFailed } from '../../inbox/components';
import { rolePickerQuery } from '../../team/api';
import { announceResult } from '../../workspace/forms';
import {
	cardConfigQuery,
	cardKeys,
	saveCardConfig,
	type CardConfig,
	type CardContext,
	type ConfigItem,
} from '../../crm/cards';

const DEFAULT = '_default';

/**
 * Move an item of a list (immutable).
 *
 * @param list List.
 * @param from Index.
 * @param to   New index.
 */
export function moveItem< T >( list: T[], from: number, to: number ): T[] {
	if ( to < 0 || to >= list.length || from === to ) {
		return list;
	}
	const next = [ ...list ];
	const [ item ] = next.splice( from, 1 );
	next.splice( to, 0, item as T );
	return next;
}

/**
 * The items a layout starts from: the role's own layout, else the default, else every built-in attribute (what
 * people see while nothing is configured).
 *
 * @param config Configuration.
 * @param role   Role key, or null for the default.
 */
export function startingItems(
	config: CardConfig,
	role: string | null
): ConfigItem[] {
	const own = role ? config.roles[ role ] : config.default;
	if ( own?.length ) {
		return own;
	}
	if ( config.default.length ) {
		return config.default;
	}
	return config.available
		.filter( ( a ) => ! a.key.startsWith( 'field:' ) )
		.map( ( a ) => ( { key: a.key } ) );
}

const withLabel = ( key: string, label: string ): ConfigItem =>
	label ? { key, label } : { key };

function LayoutEditor( {
	context,
	role,
	roleName,
	config,
}: {
	context: CardContext;
	role: string | null;
	roleName: string;
	config: CardConfig;
} ) {
	const qc = useQueryClient();
	const [ items, setItems ] = useState< ConfigItem[] >( () =>
		startingItems( config, role )
	);
	const [ dirty, setDirty ] = useState( false );
	const [ confirmReset, setConfirmReset ] = useState( false );
	const labels = new Map(
		config.available.map( ( a ) => [ a.key, a.label ] )
	);
	const ownLayout = role ? !! config.roles[ role ]?.length : true;
	const save = useMutation( {
		mutationFn: ( next: ConfigItem[] ) =>
			saveCardConfig( context, role, next ),
		onSuccess: ( next, sent ) => {
			qc.setQueryData( cardKeys.config( context ), next );
			// People's own layouts change too (the configuration itself is up to date).
			void qc.invalidateQueries( {
				queryKey: cardKeys.layout( context ),
				exact: true,
			} );
			setDirty( false );
			setConfirmReset( false );
			if ( role && ! sent.length ) {
				setItems( startingItems( next, role ) );
				announceResult(
					sprintf(
						/* translators: %s: role name. */
						__( '%s now uses the default layout.', 'cliedesk' ),
						roleName
					)
				);
			} else {
				announceResult( __( 'Card layout saved.', 'cliedesk' ) );
			}
		},
	} );
	const change = ( next: ConfigItem[] ) => {
		setItems( next );
		setDirty( true );
		save.reset();
	};
	const addable = config.available.filter(
		( a ) => ! items.some( ( i ) => i.key === a.key )
	);
	const nameOf = ( key: string ) => labels.get( key ) ?? key;
	const listId = `cd-cards-${ context }-${ role ?? 'default' }`;
	return (
		<section
			aria-labelledby={ `${ listId }-title` }
			className="flex flex-col gap-4"
		>
			<h2 id={ `${ listId }-title` } className="font-semibold">
				{ role
					? sprintf(
							/* translators: %s: role name. */
							__( 'Layout for %s', 'cliedesk' ),
							roleName
						)
					: __( 'Default layout', 'cliedesk' ) }
			</h2>
			{ role && ! ownLayout && (
				<Banner
					tone="info"
					title={ __(
						'This role uses the default layout.',
						'cliedesk'
					) }
				>
					{ __(
						'Change the list below and save to give this role its own layout.',
						'cliedesk'
					) }
				</Banner>
			) }
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
			{ items.length ? (
				<ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
					{ items.map( ( item, i ) => {
						const name = nameOf( item.key );
						return (
							<li
								key={ item.key }
								className="flex flex-wrap items-end gap-2 px-3 py-2"
							>
								<div className="flex min-w-48 flex-1 flex-col gap-1">
									<span className="text-sm font-medium">
										<span className="cd-tabular me-2 text-fg-muted">
											{ `${ i + 1 }.` }
										</span>
										<bdi>{ name }</bdi>
										{ item.key.startsWith( 'field:' ) && (
											<span className="ms-2 text-xs text-fg-muted">
												{ __( '(field)', 'cliedesk' ) }
											</span>
										) }
									</span>
									<TextField
										label={ sprintf(
											/* translators: %s: attribute or field name. */
											__( 'Label for %s', 'cliedesk' ),
											name
										) }
										description={ __(
											'Optional. Leave empty to use the name above.',
											'cliedesk'
										) }
										maxLength={ 191 }
										value={ item.label ?? '' }
										onChange={ ( label ) =>
											change(
												items.map( ( x, j ) =>
													j === i
														? withLabel(
																x.key,
																label
															)
														: x
												)
											)
										}
									/>
								</div>
								<div className="flex items-center gap-1 pb-6">
									<IconButton
										size="sm"
										label={ sprintf(
											/* translators: %s: attribute or field name. */
											__( 'Move %s up', 'cliedesk' ),
											name
										) }
										icon={ <ArrowUp size={ 14 } /> }
										isDisabled={ i === 0 }
										onPress={ () =>
											change(
												moveItem( items, i, i - 1 )
											)
										}
									/>
									<IconButton
										size="sm"
										label={ sprintf(
											/* translators: %s: attribute or field name. */
											__( 'Move %s down', 'cliedesk' ),
											name
										) }
										icon={ <ArrowDown size={ 14 } /> }
										isDisabled={ i === items.length - 1 }
										onPress={ () =>
											change(
												moveItem( items, i, i + 1 )
											)
										}
									/>
									<IconButton
										size="sm"
										label={ sprintf(
											/* translators: %s: attribute or field name. */
											__( 'Remove %s', 'cliedesk' ),
											name
										) }
										icon={ <X size={ 14 } /> }
										onPress={ () =>
											change(
												items.filter(
													( _x, j ) => j !== i
												)
											)
										}
									/>
								</div>
							</li>
						);
					} ) }
				</ol>
			) : (
				<Muted>
					{ __(
						'No cards. Add at least one attribute or field.',
						'cliedesk'
					) }
				</Muted>
			) }
			{ addable.length > 0 && (
				<Select
					className="max-w-sm"
					label={ __( 'Add an attribute or field', 'cliedesk' ) }
					value={ null }
					options={ addable.map( ( a ) => ( {
						id: a.key,
						label: a.key.startsWith( 'field:' )
							? sprintf(
									/* translators: %s: custom field name. */
									__( 'Field: %s', 'cliedesk' ),
									a.label
								)
							: a.label,
					} ) ) }
					onChange={ ( key ) => {
						change( [ ...items, { key } ] );
						announceResult(
							sprintf(
								/* translators: %s: attribute or field name. */
								__( '%s added at the end.', 'cliedesk' ),
								nameOf( key )
							)
						);
					} }
				/>
			) }
			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="primary"
					isLoading={ save.isPending && items.length > 0 }
					isDisabled={ ! items.length || ( ! dirty && ownLayout ) }
					onPress={ () => save.mutate( items ) }
				>
					{ __( 'Save layout', 'cliedesk' ) }
				</Button>
				{ role && ownLayout && (
					<Button onPress={ () => setConfirmReset( true ) }>
						{ __( 'Use the default layout', 'cliedesk' ) }
					</Button>
				) }
				{ dirty && (
					<p className="text-sm text-fg-muted">
						{ __( 'You have unsaved changes.', 'cliedesk' ) }
					</p>
				) }
			</div>
			<ConfirmDestructive
				isOpen={ confirmReset }
				onOpenChange={ setConfirmReset }
				title={ sprintf(
					/* translators: %s: role name. */
					__( 'Remove the layout of %s?', 'cliedesk' ),
					roleName
				) }
				description={ __(
					'People with this role see the default layout again.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Use the default layout', 'cliedesk' ) }
				isLoading={ save.isPending }
				onConfirm={ () => save.mutate( [] ) }
			/>
		</section>
	);
}

/**
 * Section.
 */
export default function CustomerCardsSection() {
	const [ context, setContext ] = useState< CardContext >( 'contact' );
	const [ target, setTarget ] = useState( DEFAULT );
	const q = useQuery( cardConfigQuery( context ) );
	const roles = useQuery( rolePickerQuery() );
	const roleList = roles.data ?? [];
	const role = target === DEFAULT ? null : target;
	const roleName =
		roleList.find( ( r ) => r.key === role )?.name ?? role ?? '';
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end gap-6">
				<RadioGroup
					label={ __( 'Card', 'cliedesk' ) }
					orientation="horizontal"
					value={ context }
					onChange={ ( v ) => setContext( v as CardContext ) }
					options={ [
						{ id: 'contact', label: __( 'Contact', 'cliedesk' ) },
						{
							id: 'organization',
							label: __( 'Organization', 'cliedesk' ),
						},
					] }
				/>
				<Select
					className="min-w-64"
					label={ __( 'Layout for', 'cliedesk' ) }
					value={ target }
					onChange={ setTarget }
					options={ [
						{
							id: DEFAULT,
							label: __( 'Everyone (default)', 'cliedesk' ),
						},
						...roleList.map( ( r ) => ( {
							id: r.key,
							label: q.data?.roles[ r.key ]?.length
								? sprintf(
										/* translators: %s: role name. */
										__( '%s (own layout)', 'cliedesk' ),
										r.name
									)
								: r.name,
						} ) ),
					] }
				/>
			</div>
			<p className="text-sm text-fg-muted">
				{ __(
					'What the customer card in the conversation side panel shows, in this order. Agents can still collapse or hide cards for themselves. Fields someone may not see are always left out.',
					'cliedesk'
				) }
			</p>
			{ q.isPending && (
				<LoadingRegion
					label={ __( 'Loading the layout…', 'cliedesk' ) }
				/>
			) }
			{ q.isError && (
				<QueryFailed
					title={ __( 'Could not load the card layout', 'cliedesk' ) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			) }
			{ q.isSuccess && (
				<LayoutEditor
					key={ `${ context }:${ target }` }
					context={ context }
					role={ role }
					roleName={ roleName }
					config={ q.data }
				/>
			) }
		</div>
	);
}
