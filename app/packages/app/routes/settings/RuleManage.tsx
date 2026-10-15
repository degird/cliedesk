/**
 * Rule management on Settings → Rules (AUT-04, AUT-67, AUT-77):
 * - bot behaviours next to the default rules: ask for the email when nobody answers, show the typical reply time,
 *   ask for a rating on resolve (one switch each, audited on the server);
 * - search and filters (name or action, folder, status, channel), drag to reorder (`moveId`);
 * - per rule: copy and folder ("Why didn't it run?" and run stats are Pro, AUT-75);
 * - export to a JSON file and import one (ids are matched by name or email on this site; rules arrive paused).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	Menu,
	MenuItem,
	Modal,
	Select,
	Switch,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useRef, useState } from 'react';
import { ActionError } from '../../inbox/components';

interface RuleLike {
	id: number;
	name: string;
	status: string;
	folder?: string;
	trigger: string;
	definition: {
		actions: Array< { action: string } >;
		trigger: { targeting?: { channels?: string[] } };
	};
}

export interface RuleFilter {
	q: string;
	folder: string;
	status: string;
	channel: string;
}

export const NO_FILTER: RuleFilter = {
	q: '',
	folder: '',
	status: '',
	channel: '',
};

/**
 * Rules that fit the filter: name or an action label contains the text; folder, status and channel match.
 *
 * @param rules       Rules.
 * @param f           Filter.
 * @param actionLabel Label of an action name.
 */
export function filterRules< T extends RuleLike >(
	rules: T[],
	f: RuleFilter,
	actionLabel: ( name: string ) => string
): T[] {
	const q = f.q.trim().toLowerCase();
	return rules.filter( ( r ) => {
		if (
			q &&
			! r.name.toLowerCase().includes( q ) &&
			! r.definition.actions.some( ( a ) =>
				actionLabel( a.action ).toLowerCase().includes( q )
			)
		) {
			return false;
		}
		if ( f.folder && ( r.folder ?? '' ) !== f.folder ) {
			return false;
		}
		if ( f.status && r.status !== f.status ) {
			return false;
		}
		const channels = r.definition.trigger.targeting?.channels ?? [];
		return (
			! f.channel ||
			channels.length === 0 ||
			channels.includes( f.channel )
		);
	} );
}

/**
 * Ids after moving one onto another's place (drag and drop).
 *
 * @param ids  Ids in order.
 * @param from Dragged id.
 * @param to   Id it was dropped on.
 */
export function moveId( ids: number[], from: number, to: number ): number[] {
	const out = ids.filter( ( id ) => id !== from );
	const at = out.indexOf( to );
	if ( at < 0 || from === to ) {
		return ids;
	}
	const index = ids.indexOf( from ) < ids.indexOf( to ) ? at + 1 : at;
	out.splice( index, 0, from );
	return out;
}

/**
 * Filter bar.
 *
 * @param props          Props.
 * @param props.value    Filter.
 * @param props.onChange Change.
 * @param props.folders  Folder names in use.
 */
export function RuleFilterBar( {
	value,
	onChange,
	folders,
}: {
	value: RuleFilter;
	onChange: ( f: RuleFilter ) => void;
	folders: string[];
} ) {
	return (
		<div className="flex flex-wrap items-end gap-2">
			<TextField
				label={ __( 'Find rules', 'cliedesk' ) }
				description={ __(
					'Name or action, e.g. “assign”.',
					'cliedesk'
				) }
				value={ value.q }
				onChange={ ( q ) => onChange( { ...value, q } ) }
			/>
			<Select
				label={ __( 'Status', 'cliedesk' ) }
				value={ value.status || 'any' }
				options={ [
					{ id: 'any', label: __( 'Any', 'cliedesk' ) },
					{ id: 'live', label: __( 'On', 'cliedesk' ) },
					{ id: 'paused', label: __( 'Off', 'cliedesk' ) },
				] }
				onChange={ ( v ) =>
					onChange( { ...value, status: v === 'any' ? '' : v } )
				}
			/>
			<Select
				label={ __( 'Channel', 'cliedesk' ) }
				value={ value.channel || 'any' }
				options={ [
					{ id: 'any', label: __( 'Any', 'cliedesk' ) },
					{ id: 'email', label: __( 'Email', 'cliedesk' ) },
					{ id: 'widget', label: __( 'Chat', 'cliedesk' ) },
					{ id: 'form', label: __( 'Form', 'cliedesk' ) },
				] }
				onChange={ ( v ) =>
					onChange( { ...value, channel: v === 'any' ? '' : v } )
				}
			/>
			{ folders.length > 0 && (
				<Select
					label={ __( 'Folder', 'cliedesk' ) }
					value={ value.folder || 'any' }
					options={ [
						{ id: 'any', label: __( 'Any', 'cliedesk' ) },
						...folders.map( ( f ) => ( { id: f, label: f } ) ),
					] }
					onChange={ ( v ) =>
						onChange( { ...value, folder: v === 'any' ? '' : v } )
					}
				/>
			) }
		</div>
	);
}

interface Behaviour {
	key: string;
	label: string;
	on: boolean;
}

/**
 * AUT-67: bot behaviours, on the same screen as the default rules.
 */
export function BotBehaviours() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: [ 'workflows', 'behaviours' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< Behaviour[] >( 'automation/behaviours', {
					signal,
				} )
			).data ?? [],
		retry: false,
	} );
	const save = useMutation( {
		mutationFn: ( b: { key: string; on: boolean } ) =>
			api.post( 'automation/behaviours', { body: b } ),
		onSuccess: () =>
			void qc.invalidateQueries( {
				queryKey: [ 'workflows', 'behaviours' ],
			} ),
	} );
	const items = Array.isArray( q.data ) ? q.data : [];
	if ( items.length === 0 ) {
		return null;
	}
	return (
		<section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
			<h2 className="text-base font-semibold">
				{ __( 'Bot behaviour', 'cliedesk' ) }
			</h2>
			<ActionError error={ save.error } />
			{ items.map( ( b ) => (
				<Switch
					key={ b.key }
					isSelected={ b.on }
					onChange={ ( on ) => save.mutate( { key: b.key, on } ) }
				>
					{ b.label }
				</Switch>
			) ) }
		</section>
	);
}

/**
 * Copy and folder for one rule.
 *
 * @param props           Props.
 * @param props.rule      Rule.
 * @param props.onChanged After a change.
 */
export function RuleManageMenu( {
	rule,
	onChanged,
}: {
	rule: RuleLike;
	onChanged: () => void;
} ) {
	const [ open, setOpen ] = useState< 'folder' | null >( null );
	const copy = useMutation( {
		mutationFn: () =>
			api.post( `workflows/${ rule.id }/clone`, { body: {} } ),
		onSuccess: () => {
			toast( {
				tone: 'success',
				title: __(
					'Copied. The copy is off until you turn it on.',
					'cliedesk'
				),
			} );
			onChanged();
		},
	} );
	return (
		<>
			<Menu
				aria-label={ sprintf(
					/* translators: %s: rule name. */
					__( 'Organise %s', 'cliedesk' ),
					rule.name
				) }
				trigger={
					<Button
						size="sm"
						variant="ghost"
						aria-label={ sprintf(
							/* translators: %s: rule name. */
							__( 'Organise %s', 'cliedesk' ),
							rule.name
						) }
					>
						{ __( 'Organise', 'cliedesk' ) }
					</Button>
				}
			>
				<MenuItem id="copy" onAction={ () => copy.mutate() }>
					{ __( 'Copy', 'cliedesk' ) }
				</MenuItem>
				<MenuItem id="folder" onAction={ () => setOpen( 'folder' ) }>
					{ __( 'Folder…', 'cliedesk' ) }
				</MenuItem>
			</Menu>
			{ open === 'folder' && (
				<FolderDialog
					rule={ rule }
					onClose={ () => setOpen( null ) }
					onChanged={ onChanged }
				/>
			) }
		</>
	);
}

function FolderDialog( {
	rule,
	onClose,
	onChanged,
}: {
	rule: RuleLike;
	onClose: () => void;
	onChanged: () => void;
} ) {
	const [ folder, setFolder ] = useState( rule.folder ?? '' );
	const save = useMutation( {
		mutationFn: () =>
			api.post( 'workflows/folder', {
				body: { ids: [ rule.id ], folder },
			} ),
		onSuccess: () => {
			onChanged();
			onClose();
		},
	} );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: rule name. */
				__( 'Folder of %s', 'cliedesk' ),
				rule.name
			) }
			footer={
				<Button
					variant="primary"
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save', 'cliedesk' ) }
				</Button>
			}
		>
			<ActionError error={ save.error } />
			<TextField
				label={ __( 'Folder', 'cliedesk' ) }
				description={ __( 'Leave empty for no folder.', 'cliedesk' ) }
				value={ folder }
				onChange={ setFolder }
			/>
		</Modal>
	);
}

/**
 * Export the rules to a JSON file and import one (AUT-77).
 *
 * @param props           Props.
 * @param props.onChanged After an import.
 */
export function ExportImport( { onChanged }: { onChanged: () => void } ) {
	const file = useRef< HTMLInputElement >( null );
	const [ busy, setBusy ] = useState( false );
	const exportNow = async () => {
		setBusy( true );
		try {
			const doc = ( await api.get< unknown >( 'workflows/export' ) ).data;
			const url = URL.createObjectURL(
				new Blob( [ JSON.stringify( doc, null, 2 ) ], {
					type: 'application/json',
				} )
			);
			const a = document.createElement( 'a' );
			a.href = url;
			a.download = 'cliedesk-rules.json';
			a.click();
			URL.revokeObjectURL( url );
		} finally {
			setBusy( false );
		}
	};
	const importer = useMutation( {
		mutationFn: async ( f: File ) =>
			(
				await api.post< {
					rules: Array< { id: number } >;
					unresolved: string[];
				} >( 'workflows/import', {
					body: { document: await f.text() },
				} )
			).data,
		onSuccess: ( r ) => {
			toast( {
				tone: r?.unresolved.length ? 'warning' : 'success',
				title: sprintf(
					/* translators: %d: number of rules. */
					_n(
						'%d rule imported (off).',
						'%d rules imported (off).',
						r?.rules.length ?? 0,
						'cliedesk'
					),
					r?.rules.length ?? 0
				),
				description: r?.unresolved.length
					? sprintf(
							/* translators: %s: list of missing teams, tags or people. */
							__( 'Not found on this site: %s', 'cliedesk' ),
							r.unresolved.join( ', ' )
						)
					: undefined,
			} );
			onChanged();
		},
		onError: () =>
			toast( {
				tone: 'danger',
				title: __( 'This file could not be imported.', 'cliedesk' ),
			} ),
	} );
	return (
		<>
			<Button isLoading={ busy } onPress={ () => void exportNow() }>
				{ __( 'Export', 'cliedesk' ) }
			</Button>
			<Button
				isLoading={ importer.isPending }
				onPress={ () => file.current?.click() }
			>
				{ __( 'Import', 'cliedesk' ) }
			</Button>
			<input
				ref={ file }
				type="file"
				accept="application/json,.json"
				className="sr-only"
				aria-label={ __( 'Rules file to import', 'cliedesk' ) }
				tabIndex={ -1 }
				onChange={ ( e ) => {
					const f = e.target.files?.[ 0 ];
					if ( f ) {
						importer.mutate( f );
					}
					e.target.value = '';
				} }
			/>
		</>
	);
}
