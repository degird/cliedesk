/**
 * Folder editor (INB-11), a lazy chunk: name, the views and queues in the folder (add, remove, move up / down) and,
 * for people with cliedesk_manage_shared_views, sharing with everyone or some teams (only when creating).
 *
 * POST folders {name, items, shared?, teamIds?} or PATCH folders/{id} {name, items, teamIds?}.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	Checkbox,
	IconButton,
	Modal,
	Select,
	Switch,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
	queuePickerQuery,
	teamsLookupQuery,
	type Sidebar,
} from '../../inbox/api';
import { ActionError, Muted } from '../../inbox/components';
import {
	folderChoices,
	folderKeys,
	normaliseFolder,
	resolveRef,
	type Folder,
	type FolderInput,
	type ResolvedItem,
} from '../../inbox/folders';
import { apiFieldErrors, announceResult } from '../../workspace/forms';

/**
 * Label of an item in the editor (kind first, so views and queues with the same name are told apart).
 *
 * @param i Item.
 */
export function itemLabel( i: ResolvedItem ): string {
	switch ( i.kind ) {
		case 'queue':
			return sprintf(
				/* translators: %s: queue name. */
				__( 'Queue: %s', 'cliedesk' ),
				i.name
			);
		case 'view':
			return sprintf(
				/* translators: %s: view name. */
				__( 'My view: %s', 'cliedesk' ),
				i.name
			);
		default:
			return sprintf(
				/* translators: %s: view name. */
				__( 'View: %s', 'cliedesk' ),
				i.name
			);
	}
}

/**
 * Folder editor.
 *
 * @param props         Props.
 * @param props.folder  Folder, or null for a new one.
 * @param props.sidebar Sidebar views.
 * @param props.onClose Close.
 */
export default function FolderDialog( {
	folder,
	sidebar,
	onClose,
}: {
	folder: Folder | null;
	sidebar: Sidebar;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const canShare = can( 'cliedesk_manage_shared_views' );
	const queues = useQuery( queuePickerQuery() );
	const teams = useQuery( {
		...teamsLookupQuery(),
		enabled: canShare && can( 'cliedesk_manage_team' ),
	} );
	const [ name, setName ] = useState( folder?.name ?? '' );
	const [ items, setItems ] = useState< string[] >( folder?.items ?? [] );
	const [ shared, setShared ] = useState( folder?.shared ?? false );
	const [ teamIds, setTeamIds ] = useState< number[] >(
		folder?.teamIds ?? []
	);
	const [ nameError, setNameError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: ( body: FolderInput ) =>
			folder
				? api.patch< Folder >( `folders/${ folder.id }`, { body } )
				: api.post< Folder >( 'folders', { body } ),
		onSuccess: ( r ) => {
			const saved = r.data?.id ? normaliseFolder( r.data ) : null;
			if ( saved ) {
				qc.setQueryData< Folder[] >( folderKeys.all, ( old ) => {
					const list = old ?? [];
					return list.some( ( f ) => f.id === saved.id )
						? list.map( ( f ) =>
								f.id === saved.id
									? { ...saved, collapsed: f.collapsed }
									: f
							)
						: [ ...list, saved ];
				} );
			}
			void qc.invalidateQueries( { queryKey: folderKeys.all } );
			announceResult(
				folder
					? __( 'Folder saved.', 'cliedesk' )
					: __( 'Folder added.', 'cliedesk' )
			);
			onClose();
		},
	} );
	const choices = folderChoices( sidebar, queues.data ?? [] );
	const resolved = items.map(
		( ref ) =>
			resolveRef( ref, sidebar, queues.data ?? null ) ?? {
				ref,
				kind: 'view' as const,
				key: ref,
				name: __( 'Unavailable item', 'cliedesk' ),
			}
	);
	const addable = choices.filter( ( c ) => ! items.includes( c.ref ) );
	const move = ( from: number, to: number ) => {
		const next = [ ...items ];
		const [ x ] = next.splice( from, 1 );
		next.splice( to, 0, x as string );
		setItems( next );
	};
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! name.trim() ) {
			setNameError( __( 'Enter a name.', 'cliedesk' ) );
			return;
		}
		const body: FolderInput = { name: name.trim(), items };
		if ( ! folder && shared ) {
			body.shared = true;
		}
		if ( shared && canShare ) {
			body.teamIds = teamIds;
		}
		save.mutate( body );
	};
	const server = apiFieldErrors( save.error );
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={
				folder
					? __( 'Edit folder', 'cliedesk' )
					: __( 'New folder', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-folder-form"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ folder
							? __( 'Save folder', 'cliedesk' )
							: __( 'Add folder', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-folder-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ActionError
					error={ save.error }
					onDismiss={ () => save.reset() }
				/>
				<TextField
					label={ __( 'Folder name', 'cliedesk' ) }
					isRequired
					maxLength={ 191 }
					value={ name }
					onChange={ ( v ) => {
						setName( v );
						setNameError( null );
					} }
					errorMessage={ nameError ?? server.name ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				<div className="flex flex-col gap-2">
					<h3 className="text-sm font-medium">
						{ __( 'In this folder', 'cliedesk' ) }
					</h3>
					{ resolved.length ? (
						<ol className="flex flex-col divide-y divide-line rounded-md border border-line">
							{ resolved.map( ( item, i ) => {
								const label = itemLabel( item );
								return (
									<li
										key={ item.ref }
										className="flex items-center gap-1 px-2 py-1"
									>
										<span className="min-w-0 flex-1 truncate text-sm">
											{ label }
										</span>
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: view or queue. */
												__( 'Move %s up', 'cliedesk' ),
												label
											) }
											icon={ <ArrowUp size={ 14 } /> }
											isDisabled={ i === 0 }
											onPress={ () => move( i, i - 1 ) }
										/>
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: view or queue. */
												__(
													'Move %s down',
													'cliedesk'
												),
												label
											) }
											icon={ <ArrowDown size={ 14 } /> }
											isDisabled={
												i === items.length - 1
											}
											onPress={ () => move( i, i + 1 ) }
										/>
										<IconButton
											size="sm"
											label={ sprintf(
												/* translators: %s: view or queue. */
												__(
													'Remove %s from the folder',
													'cliedesk'
												),
												label
											) }
											icon={ <X size={ 14 } /> }
											onPress={ () =>
												setItems(
													items.filter(
														( r ) => r !== item.ref
													)
												)
											}
										/>
									</li>
								);
							} ) }
						</ol>
					) : (
						<Muted>
							{ __(
								'Nothing yet. Add views or queues below.',
								'cliedesk'
							) }
						</Muted>
					) }
					{ addable.length > 0 && (
						<Select
							label={ __( 'Add a view or queue', 'cliedesk' ) }
							value={ null }
							options={ addable.map( ( c ) => ( {
								id: c.ref,
								label: itemLabel( c ),
							} ) ) }
							onChange={ ( ref ) =>
								setItems( [ ...items, ref ] )
							}
						/>
					) }
				</div>
				{ canShare && (
					<div className="flex flex-col gap-2">
						<Switch
							isSelected={ shared }
							isReadOnly={ !! folder }
							onChange={ setShared }
						>
							{ __(
								'Share this folder with the team',
								'cliedesk'
							) }
						</Switch>
						{ folder && (
							<p className="text-sm text-fg-muted">
								{ folder.shared
									? __(
											'A shared folder stays shared.',
											'cliedesk'
										)
									: __(
											'Only you see this folder. To share one, create a new folder.',
											'cliedesk'
										) }
							</p>
						) }
						{ shared && (
							<fieldset className="flex flex-col gap-1">
								<legend className="pb-1 text-sm font-medium">
									{ __( 'Teams', 'cliedesk' ) }
								</legend>
								<p className="pb-1 text-sm text-fg-muted">
									{ __(
										'Choose no team to share it with everyone.',
										'cliedesk'
									) }
								</p>
								{ ( teams.data ?? [] ).map( ( t ) => (
									<Checkbox
										key={ t.id }
										isSelected={ teamIds.includes( t.id ) }
										onChange={ ( on ) =>
											setTeamIds(
												on
													? [ ...teamIds, t.id ]
													: teamIds.filter(
															( x ) => x !== t.id
														)
											)
										}
									>
										{ t.name }
									</Checkbox>
								) ) }
								{ ! teams.data?.length && (
									<Muted>
										{ __(
											'No teams to choose from: the folder is shared with everyone.',
											'cliedesk'
										) }
									</Muted>
								) }
							</fieldset>
						) }
					</div>
				) }
			</form>
		</Modal>
	);
}
