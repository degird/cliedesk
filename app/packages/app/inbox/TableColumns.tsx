/**
 * My own table columns per view (INB-03): show or hide, order and width, kept in my preferences
 * (prefs.layout.tableColumns, PATCH me/prefs) so they follow me to other devices. People who may share views can
 * "Save for everyone" on a shared custom view (PATCH views/{id} {columns}, If-Match), which changes the view's
 * own columns for everyone who uses it. The subject column always stays.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import type { TableColumnPrefs } from '@cliedesk/data';
import { Button, Checkbox, IconButton, Modal, Select } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { prefsStore, savePrefs, type Prefs } from '../prefs';
import { versionTag } from '../workspace/api';
import { announceResult } from '../workspace/forms';
import { inboxKeys, vocabularyQuery, type CustomView } from './api';
import { ActionError } from './components';

/**
 * Columns to show: my order first (columns the view no longer has are dropped, new view columns are appended),
 * without my hidden columns. The subject always stays.
 *
 * @param viewColumns The view's columns.
 * @param mine        My preferences for the view.
 */
export function applyColumnPrefs(
	viewColumns: string[],
	mine: TableColumnPrefs | undefined
): string[] {
	const order = mine?.order?.length
		? [
				...mine.order,
				...viewColumns.filter( ( c ) => ! mine.order?.includes( c ) ),
			]
		: viewColumns;
	const hidden = new Set(
		( mine?.hidden ?? [] ).filter( ( c ) => c !== 'subject' )
	);
	return order.filter(
		( c, i, all ) => ! hidden.has( c ) && all.indexOf( c ) === i
	);
}

/**
 * My column preferences for a view, and a setter (null resets to the view's columns).
 *
 * @param view View key.
 */
export function useTableColumns(
	view: string
): [ TableColumnPrefs | undefined, ( next: TableColumnPrefs | null ) => void ] {
	const store = prefsStore();
	const prefs = useSyncExternalStore(
		store.subscribe,
		store.get,
		store.get
	) as Prefs;
	const all = prefs?.layout.tableColumns ?? {};
	const set = ( next: TableColumnPrefs | null ) => {
		const copy = { ...all };
		if ( next ) {
			copy[ view ] = next;
		} else {
			delete copy[ view ];
		}
		savePrefs( { layout: { tableColumns: copy } } );
	};
	return [ all[ view ], set ];
}

/**
 * Columns dialog.
 *
 * @param props             Props.
 * @param props.view        View key.
 * @param props.viewColumns The view's own columns.
 * @param props.custom      The custom view, when it is one (for "Save for everyone").
 * @param props.label       Column label.
 * @param props.onClose     Close.
 */
export function TableColumnsDialog( {
	view,
	viewColumns,
	custom,
	label,
	onClose,
}: {
	view: string;
	viewColumns: string[];
	custom: CustomView | null;
	label: ( key: string ) => string;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ mine, setMine ] = useTableColumns( view );
	const vocabulary = useQuery( vocabularyQuery() );
	const offered = vocabulary.data?.columns.map( ( c ) => c.key ) ?? [];
	const start = [
		...( mine?.order?.length ? mine.order : viewColumns ),
		...viewColumns,
		...offered,
	].filter( ( c, i, all ) => all.indexOf( c ) === i );
	const [ order, setOrder ] = useState< string[] >( start );
	const [ shown, setShown ] = useState< string[] >(
		applyColumnPrefs( viewColumns, mine )
	);
	const [ widths, setWidths ] = useState< Record< string, number > >(
		mine?.widths ?? {}
	);
	const names = Object.fromEntries(
		( vocabulary.data?.columns ?? [] ).map( ( c ) => [ c.key, c.label ] )
	);
	const name = ( c: string ) => names[ c ] ?? label( c );
	const visible = order.filter(
		( c ) => shown.includes( c ) || c === 'subject'
	);
	const share =
		custom &&
		custom.visibility !== 'private' &&
		can( 'cliedesk_manage_shared_views' );
	const saveAll = useMutation( {
		mutationFn: () =>
			api.patch( `views/${ custom?.id }`, {
				body: { columns: visible },
				ifMatch: versionTag( custom?.version ?? 0 ),
			} ),
		onSuccess: () => {
			setMine( null );
			announceResult( __( 'Columns saved for everyone.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			onClose();
		},
	} );
	const move = ( c: string, step: -1 | 1 ) =>
		setOrder( ( l ) => {
			const i = l.indexOf( c );
			const j = i + step;
			if ( j < 0 || j >= l.length ) {
				return l;
			}
			const next = [ ...l ];
			[ next[ i ], next[ j ] ] = [
				next[ j ] as string,
				next[ i ] as string,
			];
			return next;
		} );
	const saveMine = () => {
		setMine( {
			order: visible,
			hidden: viewColumns.filter( ( c ) => ! visible.includes( c ) ),
			widths: Object.fromEntries(
				Object.entries( widths ).filter( ( [ c ] ) =>
					visible.includes( c )
				)
			),
		} );
		announceResult( __( 'Your columns are saved.', 'cliedesk' ) );
		onClose();
	};
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Table columns', 'cliedesk' ) }
			footer={
				<>
					<Button
						variant="ghost"
						onPress={ () => {
							setMine( null );
							announceResult(
								__( 'The view’s columns are back.', 'cliedesk' )
							);
							onClose();
						} }
					>
						{ __( 'Reset to the view', 'cliedesk' ) }
					</Button>
					{ share && (
						<Button
							isLoading={ saveAll.isPending }
							onPress={ () => saveAll.mutate() }
						>
							{ __( 'Save for everyone', 'cliedesk' ) }
						</Button>
					) }
					<Button variant="primary" onPress={ saveMine }>
						{ __( 'Save my columns', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="text-sm text-fg-muted">
					{ share
						? __(
								'“Save my columns” changes the table for you only. “Save for everyone” changes the view for everyone who uses it.',
								'cliedesk'
							)
						: __( 'These columns are for you only.', 'cliedesk' ) }
				</p>
				<ActionError error={ saveAll.error } />
				<ul className="flex flex-col divide-y divide-line rounded-md border border-line">
					{ order.map( ( c, i ) => (
						<li
							key={ c }
							className="flex flex-wrap items-center gap-2 px-3 py-2"
						>
							<Checkbox
								isSelected={
									c === 'subject' || shown.includes( c )
								}
								isDisabled={ c === 'subject' }
								onChange={ ( on ) =>
									setShown( ( l ) =>
										on
											? [ ...l, c ]
											: l.filter( ( x ) => x !== c )
									)
								}
							>
								{ name( c ) }
							</Checkbox>
							<span className="ms-auto flex items-center gap-1">
								<Select
									className="w-36"
									label={ sprintf(
										/* translators: %s: column name. */
										__( 'Width of %s', 'cliedesk' ),
										name( c )
									) }
									value={
										widths[ c ]
											? String( widths[ c ] )
											: 'auto'
									}
									onChange={ ( v ) =>
										setWidths( ( w ) => {
											const next = { ...w };
											if ( v !== 'auto' ) {
												next[ c ] = Number( v );
											} else {
												delete next[ c ];
											}
											return next;
										} )
									}
									options={ [
										{
											id: 'auto',
											label: __(
												'Automatic',
												'cliedesk'
											),
										},
										{
											id: '120',
											label: __( 'Narrow', 'cliedesk' ),
										},
										{
											id: '200',
											label: __( 'Medium', 'cliedesk' ),
										},
										{
											id: '320',
											label: __( 'Wide', 'cliedesk' ),
										},
									] }
								/>
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: column name. */
										__( 'Move %s up', 'cliedesk' ),
										name( c )
									) }
									icon={
										<ArrowUp
											aria-hidden="true"
											size={ 14 }
										/>
									}
									isDisabled={ i === 0 }
									onPress={ () => move( c, -1 ) }
								/>
								<IconButton
									size="sm"
									label={ sprintf(
										/* translators: %s: column name. */
										__( 'Move %s down', 'cliedesk' ),
										name( c )
									) }
									icon={
										<ArrowDown
											aria-hidden="true"
											size={ 14 }
										/>
									}
									isDisabled={ i === order.length - 1 }
									onPress={ () => move( c, 1 ) }
								/>
							</span>
						</li>
					) ) }
				</ul>
			</div>
		</Modal>
	);
}
