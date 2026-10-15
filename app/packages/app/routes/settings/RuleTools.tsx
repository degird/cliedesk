/**
 * Rule tools in Settings → Rules: the rule checks (AUT-41: many recipients; with Pro also loops and conflicts, AUT-76),
 * delete a paused rule (Free deletes it for good; Pro keeps it in the trash), and the options of the customer event and
 * order triggers. Testing, history, apply to open conversations, the run log and the time, schedule and hook triggers
 * are Pro fills of the rule slots (`rules.row.tools`, `rules.toolbar`, `rules.editor.draft`, `rules.trigger.options`,
 * `rules.row.stats`), which get `automationKit` as their `kit` prop.
 */
import { api, useMutation, useQuery } from '@cliedesk/data';
import {
	Banner,
	Button,
	ConfirmDestructive,
	LoadingRegion,
	Menu,
	MenuItem,
	Modal,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';
import { formatDuration, parseDuration } from './durations';
import type { Rule } from './RulesSection';

export interface RuleWarning {
	kind: 'cycle' | 'flip_flop' | 'never_matches' | 'many_recipients';
	message: string;
	ruleIds: number[];
}

const list = < T, >( x: unknown ): T[] => ( Array.isArray( x ) ? x : [] );

/**
 * Warnings from the rule checks.
 *
 * @param props          Props.
 * @param props.warnings Warnings.
 */
export function RuleWarnings( { warnings }: { warnings: RuleWarning[] } ) {
	if ( ! warnings.length ) {
		return null;
	}
	return (
		<Banner tone="warning" title={ __( 'Check this rule', 'cliedesk' ) }>
			<ul className="list-disc ps-5">
				{ warnings.map( ( w, i ) => (
					<li key={ i }>{ w.message }</li>
				) ) }
			</ul>
		</Banner>
	);
}

/** Free pieces the Pro rule fills get as their `kit` prop (FPS-09). */
export const automationKit = {
	ActionError,
	RuleWarnings,
	announceResult,
	formatDuration,
	parseDuration,
};

export type AutomationKit = typeof automationKit;

function ChecksDialog( {
	rule,
	onClose,
}: {
	rule: Rule;
	onClose: () => void;
} ) {
	const q = useQuery( {
		queryKey: [ 'workflows', 'checks', rule.id ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { warnings: RuleWarning[] } >(
					`workflows/${ rule.id }/checks`,
					{ signal }
				)
			).data?.warnings ?? [],
	} );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: rule name. */
				__( 'Checks for %s', 'cliedesk' ),
				rule.name
			) }
		>
			{ q.isPending && <LoadingRegion /> }
			{ q.data && q.data.length === 0 && (
				<p role="status">{ __( 'No problems found.', 'cliedesk' ) }</p>
			) }
			<RuleWarnings warnings={ list< RuleWarning >( q.data ) } />
		</Modal>
	);
}

/**
 * "More" menu of one rule: check it, delete it (paused rules only).
 *
 * @param props           Props.
 * @param props.rule      Rule.
 * @param props.onChanged After a change.
 */
export function RuleToolsMenu( {
	rule,
	onChanged,
}: {
	rule: Rule;
	onChanged: () => void;
} ) {
	const [ open, setOpen ] = useState< 'checks' | 'delete' | null >( null );
	const remove = useMutation( {
		mutationFn: () =>
			api.del< { deleted: boolean; trashed?: boolean } >(
				`workflows/${ rule.id }`
			),
		onSuccess: ( r ) => {
			setOpen( null );
			toast( {
				tone: 'success',
				title: r.data?.trashed
					? __( 'Rule moved to the trash.', 'cliedesk' )
					: __( 'Rule deleted.', 'cliedesk' ),
			} );
			onChanged();
		},
	} );
	return (
		<>
			<Menu
				aria-label={ sprintf(
					/* translators: %s: rule name. */
					__( 'More for %s', 'cliedesk' ),
					rule.name
				) }
				trigger={
					<Button
						size="sm"
						aria-label={ sprintf(
							/* translators: %s: rule name. */
							__( 'More for %s', 'cliedesk' ),
							rule.name
						) }
					>
						{ __( 'More', 'cliedesk' ) }
					</Button>
				}
			>
				<MenuItem id="checks" onAction={ () => setOpen( 'checks' ) }>
					{ __( 'Check this rule', 'cliedesk' ) }
				</MenuItem>
				{ rule.status !== 'live' && (
					<MenuItem
						id="delete"
						onAction={ () => setOpen( 'delete' ) }
					>
						{ __( 'Delete…', 'cliedesk' ) }
					</MenuItem>
				) }
			</Menu>
			{ open === 'checks' && (
				<ChecksDialog rule={ rule } onClose={ () => setOpen( null ) } />
			) }
			<ConfirmDestructive
				isOpen={ open === 'delete' }
				onOpenChange={ ( o ) => {
					if ( ! o ) {
						setOpen( null );
						remove.reset();
					}
				} }
				title={ sprintf(
					/* translators: %s: rule name. */
					__( 'Delete the rule “%s”?', 'cliedesk' ),
					rule.name
				) }
				description={
					<>
						{ __(
							'The rule stops for good. What it already did stays in the conversations and the reports.',
							'cliedesk'
						) }
						<ActionError error={ remove.error } />
					</>
				}
				confirmLabel={ __( 'Delete rule', 'cliedesk' ) }
				isLoading={ remove.isPending }
				onConfirm={ () => remove.mutate() }
			/>
		</>
	);
}

/** Triggers with their own options in Free (DEV-12 customer events, AUT-17 WooCommerce orders). */
export const EXTERNAL_TRIGGERS = [
	'event.tracked',
	'ext.woo_order_status_changed',
	'ext.woo_order_delayed',
];

/**
 * Options of the customer event and order triggers (Pro adds its triggers' options in `rules.trigger.options`).
 *
 * @param props          Props.
 * @param props.trigger  Trigger.
 * @param props.value    Options.
 * @param props.onChange Change.
 */
export function TriggerOptions( {
	trigger,
	value,
	onChange,
}: {
	trigger: string;
	value: Record< string, unknown >;
	onChange: ( v: Record< string, unknown > ) => void;
} ) {
	const set = ( k: string, v: unknown ) => onChange( { ...value, [ k ]: v } );
	// AUT-17: only orders that move to (or wait in) these statuses.
	if (
		trigger === 'ext.woo_order_status_changed' ||
		trigger === 'ext.woo_order_delayed'
	) {
		const statuses = Array.isArray( value.statuses )
			? ( value.statuses as unknown[] ).map( String )
			: [];
		return (
			<TextField
				label={ __( 'Order statuses', 'cliedesk' ) }
				description={ __(
					'For example completed, on-hold. Leave empty for any status.',
					'cliedesk'
				) }
				value={ statuses.join( ', ' ) }
				onChange={ ( v ) =>
					set(
						'statuses',
						v
							.split( /[,\s]+/ )
							.map( ( x ) => x.trim().toLowerCase() )
							.filter( Boolean )
					)
				}
			/>
		);
	}
	// DEV-12: which custom event (from cliedesk_log_event or Cliedesk.track) starts the rule.
	if ( trigger === 'event.tracked' ) {
		return (
			<TextField
				label={ __( 'Event name', 'cliedesk' ) }
				description={ __(
					'For example license.activated. Leave empty for any customer event.',
					'cliedesk'
				) }
				maxLength={ 57 }
				value={
					typeof value.event === 'string' ? String( value.event ) : ''
				}
				onChange={ ( v ) => set( 'event', v.toLowerCase() ) }
			/>
		);
	}
	return null;
}
