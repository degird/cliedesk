/**
 * Settings → Side panel layouts (INB-66): admins set the conversation side panel's section order, hidden and
 * collapsed sections for everyone, per team, per conversation type, or per team and type. No cap on layouts.
 * People get the most specific layout that matches them; their own "Customize panel" layout goes on top.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	ConfirmDestructive,
	LoadingRegion,
	Modal,
	Select,
	TextField,
	EmptyState,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { typesQuery } from '../../inbox/api';
import { ActionError, QueryFailed } from '../../inbox/components';
import { PanelOrderEditor, fullLayout } from '../../inbox/PanelOrderEditor';
import { LinkButtonsCard } from './LinkButtonsCard';
import { ContextRulesCard } from './ContextRulesCard';
import type { AdminPanelLayout, PanelLayout } from '../../inbox/panel';
import { teamListQuery } from '../../team/api';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

const ANY = 'any';
const KEY = [ 'panel-layouts' ] as const;

const layoutsQuery = () => ( {
	queryKey: [ ...KEY, 'list' ] as const,
	queryFn: async ( { signal }: { signal: AbortSignal } ) =>
		(
			await api.get< { items: AdminPanelLayout[] } >( 'panel-layouts', {
				signal,
			} )
		).data?.items ?? [],
} );

interface Draft extends PanelLayout {
	id?: number;
	name: string;
	team: string;
	type: string;
}

function LayoutDialog( {
	initial,
	onClose,
}: {
	initial: AdminPanelLayout | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const teams = useQuery( teamListQuery() ).data ?? [];
	const types = useQuery( typesQuery() ).data ?? [];
	const [ draft, setDraft ] = useState< Draft >( () => ( {
		...fullLayout( initial ),
		id: initial?.id,
		name: initial?.name ?? '',
		team: initial?.teamId ? String( initial.teamId ) : ANY,
		type: initial?.typeId ? String( initial.typeId ) : ANY,
	} ) );
	const [ nameError, setNameError ] = useState< string | null >( null );
	const save = useMutation( {
		mutationFn: ( d: Draft ) =>
			api.post< AdminPanelLayout >( 'panel-layouts', {
				body: {
					...( d.id ? { id: d.id } : {} ),
					name: d.name.trim(),
					teamId: d.team === ANY ? null : Number( d.team ),
					typeId: d.type === ANY ? null : Number( d.type ),
					order: d.order,
					collapsed: d.collapsed,
					hidden: d.hidden,
				},
			} ),
		onSuccess: () => {
			announceResult( __( 'Side panel layout saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: KEY } );
			onClose();
		},
	} );
	const server = apiFieldErrors( save.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( draft.name.trim() === '' ) {
			setNameError( __( 'Enter a name.', 'cliedesk' ) );
			return;
		}
		setNameError( null );
		save.mutate( draft );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={
				initial
					? __( 'Edit side panel layout', 'cliedesk' )
					: __( 'Add side panel layout', 'cliedesk' )
			}
			size="lg"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-panel-layout"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save layout', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-panel-layout"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				{ ! Object.keys( server ).length && (
					<ActionError error={ save.error } />
				) }
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					isRequired
					value={ draft.name }
					onChange={ ( name ) => setDraft( { ...draft, name } ) }
					errorMessage={ nameError ?? server.name ?? null }
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<Select
						label={ __( 'Team', 'cliedesk' ) }
						value={ draft.team }
						onChange={ ( team ) => setDraft( { ...draft, team } ) }
						errorMessage={ server.teamId ?? null }
						options={ [
							{ id: ANY, label: __( 'Every team', 'cliedesk' ) },
							...teams.map( ( t ) => ( {
								id: String( t.id ),
								label: t.name,
							} ) ),
						] }
					/>
					<Select
						label={ __( 'Conversation type', 'cliedesk' ) }
						value={ draft.type }
						onChange={ ( type ) => setDraft( { ...draft, type } ) }
						options={ [
							{ id: ANY, label: __( 'Every type', 'cliedesk' ) },
							...types.map( ( t ) => ( {
								id: String( t.id ),
								label: t.name,
							} ) ),
						] }
					/>
				</div>
				<PanelOrderEditor
					value={ draft }
					onChange={ ( l ) => setDraft( { ...draft, ...l } ) }
				/>
			</form>
		</Modal>
	);
}

/**
 * Section.
 */
export default function PanelLayoutsSection() {
	const qc = useQueryClient();
	const q = useQuery( layoutsQuery() );
	const teams = useQuery( teamListQuery() ).data ?? [];
	const types = useQuery( typesQuery() ).data ?? [];
	const [ editing, setEditing ] = useState< AdminPanelLayout | 'new' | null >(
		null
	);
	const [ deleting, setDeleting ] = useState< AdminPanelLayout | null >(
		null
	);
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `panel-layouts/${ id }` ),
		onSuccess: () => {
			announceResult( __( 'Side panel layout deleted.', 'cliedesk' ) );
			setDeleting( null );
			void qc.invalidateQueries( { queryKey: KEY } );
		},
	} );
	const appliesTo = ( l: AdminPanelLayout ) => {
		const team = teams.find( ( t ) => t.id === l.teamId )?.name;
		const type = types.find( ( t ) => t.id === l.typeId )?.name;
		if ( l.teamId && l.typeId ) {
			return sprintf(
				/* translators: 1: team name, 2: conversation type. */
				__( 'Team %1$s, type %2$s', 'cliedesk' ),
				team ?? `#${ l.teamId }`,
				type ?? `#${ l.typeId }`
			);
		}
		if ( l.teamId ) {
			return sprintf(
				/* translators: %s: team name. */
				__( 'Team %s', 'cliedesk' ),
				team ?? `#${ l.teamId }`
			);
		}
		if ( l.typeId ) {
			return sprintf(
				/* translators: %s: conversation type. */
				__( 'Type %s', 'cliedesk' ),
				type ?? `#${ l.typeId }`
			);
		}
		return __( 'Everyone (default)', 'cliedesk' );
	};
	let body;
	if ( q.isPending ) {
		body = <LoadingRegion />;
	} else if ( q.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the layouts', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	} else if ( ! q.data.length ) {
		body = (
			<EmptyState
				headingLevel={ 3 }
				title={ __( 'No layouts yet', 'cliedesk' ) }
				description={ __(
					'No layouts yet: everyone sees the built-in order. For example, put Orders first for the billing team.',
					'cliedesk'
				) }
				actions={
					// ADM-04: every empty state offers a way to start.
					<Button onPress={ () => setEditing( 'new' ) }>
						{ __( 'Add your first layout', 'cliedesk' ) }
					</Button>
				}
			/>
		);
	} else {
		body = (
			<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
				{ q.data.map( ( l ) => (
					<li
						key={ l.id }
						className="flex flex-wrap items-center gap-3 px-4 py-3"
					>
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="font-medium">{ l.name }</span>
							<span className="text-sm text-fg-muted">
								{ appliesTo( l ) }
							</span>
						</div>
						<Button size="sm" onPress={ () => setEditing( l ) }>
							{ sprintf(
								/* translators: %s: layout name. */
								__( 'Edit %s', 'cliedesk' ),
								l.name
							) }
						</Button>
						<Button
							size="sm"
							variant="danger"
							onPress={ () => setDeleting( l ) }
						>
							{ sprintf(
								/* translators: %s: layout name. */
								__( 'Delete %s', 'cliedesk' ),
								l.name
							) }
						</Button>
					</li>
				) ) }
			</ul>
		);
	}
	return (
		<section
			aria-labelledby="cd-panel-layouts"
			className="flex flex-col gap-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="cd-panel-layouts" className="text-lg font-semibold">
					{ __( 'Side panel layouts', 'cliedesk' ) }
				</h2>
				<Button
					variant="primary"
					iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
					onPress={ () => setEditing( 'new' ) }
				>
					{ __( 'Add layout', 'cliedesk' ) }
				</Button>
			</div>
			<p className="text-sm text-fg-muted">
				{ __(
					'The most specific layout applies: team and type, then type, then team, then the default. People can still change their own panel.',
					'cliedesk'
				) }
			</p>
			{ body }
			<ContextRulesCard />
			<LinkButtonsCard />
			{ editing && (
				<LayoutDialog
					initial={ editing === 'new' ? null : editing }
					onClose={ () => setEditing( null ) }
				/>
			) }
			<ConfirmDestructive
				isOpen={ deleting !== null }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setDeleting( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: layout name. */
					__( 'Delete the layout “%s”?', 'cliedesk' ),
					deleting?.name ?? ''
				) }
				description={ __(
					'People it applied to get the next matching layout.',
					'cliedesk'
				) }
				confirmLabel={ __( 'Delete layout', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => {
					if ( deleting ) {
						remove.mutate( deleting.id );
					}
				} }
			>
				<ActionError error={ remove.error } />
			</ConfirmDestructive>
		</section>
	);
}
