/**
 * Manual rules (AUT-20): rules with the trigger "An agent runs it" can ask for inputs (text, number or a choice)
 * before they run on one or many conversations. Who sees a rule follows `cliedesk_run_workflow_{id}` (the server
 * lists only the rules the agent may run). The conversation header menu, the bulk bar, ⌘K and the reply picker all
 * open the same dialog: the palette and the picker ask for it with `requestRunRule()`, which the open conversation's
 * header answers.
 */
import {
	api,
	isApiError,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, Modal, Select, TextField, toast } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { ActionError } from '../../inbox/components';

export interface RuleInput {
	key: string;
	label: string;
	type: 'text' | 'number' | 'choice';
	required: boolean;
	choices: string[];
}

export interface ManualRule {
	id: number;
	name: string;
	inputs?: RuleInput[];
}

interface RunResult {
	results: Array< { status: string; error: string | null } >;
}

export const RUN_RULE_EVENT = 'cliedesk-run-rule';

/** The manual rules this agent may run. */
export function manualRulesQuery() {
	return {
		queryKey: [ 'workflows', 'manual' ],
		queryFn: async ( { signal }: { signal: AbortSignal } ) => {
			const data = (
				await api.get< ManualRule[] >( 'workflows/manual', { signal } )
			).data;
			return Array.isArray( data ) ? data : [];
		},
		staleTime: 60 * 1000,
		retry: false,
	};
}

/**
 * Ask the open conversation to run a rule (from the palette or the reply picker).
 *
 * @param rule Rule.
 */
export function requestRunRule( rule: ManualRule ): void {
	window.dispatchEvent( new CustomEvent( RUN_RULE_EVENT, { detail: rule } ) );
}

/**
 * Listen for run requests.
 *
 * @param onRequest Called with the rule.
 */
export function useRunRuleRequests( onRequest: ( rule: ManualRule ) => void ) {
	useEffect( () => {
		const handler = ( e: Event ) => {
			const rule = ( e as CustomEvent< ManualRule > ).detail;
			if ( rule && typeof rule.id === 'number' ) {
				onRequest( rule );
			}
		};
		window.addEventListener( RUN_RULE_EVENT, handler );
		return () => window.removeEventListener( RUN_RULE_EVENT, handler );
	}, [ onRequest ] );
}

/**
 * Inputs that are missing or invalid, by key (checked again by the server).
 *
 * @param inputs Definitions.
 * @param values Values.
 */
export function inputErrors(
	inputs: RuleInput[],
	values: Record< string, string >
): Record< string, string > {
	const out: Record< string, string > = {};
	for ( const i of inputs ) {
		const v = ( values[ i.key ] ?? '' ).trim();
		if ( v === '' ) {
			if ( i.required ) {
				out[ i.key ] = __( 'This is required.', 'cliedesk' );
			}
		} else if ( i.type === 'number' && Number.isNaN( Number( v ) ) ) {
			out[ i.key ] = __( 'Enter a number.', 'cliedesk' );
		}
	}
	return out;
}

/**
 * Run a rule on conversations: asks for its inputs first (when it has any).
 *
 * @param props                 Props.
 * @param props.rule            Rule.
 * @param props.conversationIds Conversations (1 to 100).
 * @param props.onClose         Close.
 * @param props.onDone          After a run.
 * @param props.confirm         Ask before a rule without inputs runs (the bulk bar); else it runs at once.
 */
export function RunRuleDialog( {
	rule,
	conversationIds,
	onClose,
	onDone,
	confirm = false,
}: {
	rule: ManualRule;
	conversationIds: number[];
	onClose: () => void;
	onDone?: () => void;
	confirm?: boolean;
} ) {
	const qc = useQueryClient();
	const inputs = rule.inputs ?? [];
	const [ values, setValues ] = useState< Record< string, string > >( {} );
	const [ shown, setShown ] = useState< Record< string, string > >( {} );
	const run = useMutation( {
		mutationFn: () =>
			api.post< RunResult >( `workflows/${ rule.id }/run`, {
				body: {
					conversationIds,
					...( inputs.length
						? { inputs: JSON.stringify( values ) }
						: {} ),
				},
			} ),
		onSuccess: ( r ) => {
			const results = r.data?.results ?? [];
			const failed = results.filter( ( x ) => x.status === 'failed' );
			toast(
				failed.length
					? {
							tone: 'danger',
							title: sprintf(
								/* translators: 1: rule name, 2: error. */
								__( '“%1$s” did not finish: %2$s', 'cliedesk' ),
								rule.name,
								failed[ 0 ]?.error ?? ''
							),
						}
					: {
							tone: 'success',
							title: sprintf(
								/* translators: 1: rule name, 2: number of conversations. */
								_n(
									'“%1$s” ran on %2$d conversation.',
									'“%1$s” ran on %2$d conversations.',
									conversationIds.length,
									'cliedesk'
								),
								rule.name,
								conversationIds.length
							),
						}
			);
			void qc.invalidateQueries( { queryKey: [ 'conversations' ] } );
			onDone?.();
			onClose();
		},
	} );
	const silent = inputs.length === 0 && ! confirm;
	useEffect( () => {
		if ( silent ) {
			run.mutate( undefined, {
				onError: () => {
					toast( {
						tone: 'danger',
						title: __( 'The rule could not run.', 'cliedesk' ),
					} );
					onClose();
				},
			} );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the dialog opens.
	}, [] );
	const server = isApiError( run.error ) ? run.error.fields : {};
	const errorOf = ( key: string ) =>
		shown[ key ] ?? server[ `inputs.${ key }` ] ?? null;
	const submit = () => {
		const errors = inputErrors( inputs, values );
		setShown( errors );
		if ( Object.keys( errors ).length === 0 ) {
			run.mutate();
		}
	};
	if ( silent ) {
		return null;
	}
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: rule name. */
				__( 'Run “%s”', 'cliedesk' ),
				rule.name
			) }
			footer={
				<>
					<Button variant="ghost" onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ run.isPending }
						onPress={ submit }
					>
						{ sprintf(
							/* translators: %d: number of conversations. */
							_n(
								'Run on %d conversation',
								'Run on %d conversations',
								conversationIds.length,
								'cliedesk'
							),
							conversationIds.length
						) }
					</Button>
				</>
			}
		>
			<form
				className="flex flex-col gap-3"
				onSubmit={ ( e ) => {
					e.preventDefault();
					submit();
				} }
			>
				<ActionError error={ run.error } />
				{ inputs.length === 0 && (
					<p>
						{ __(
							'The rule runs now, with your permissions.',
							'cliedesk'
						) }
					</p>
				) }
				{ inputs.map( ( i ) =>
					i.type === 'choice' ? (
						<Select
							key={ i.key }
							label={ i.label }
							isRequired={ i.required }
							value={ values[ i.key ] ?? null }
							errorMessage={ errorOf( i.key ) }
							options={ i.choices.map( ( c ) => ( {
								id: c,
								label: c,
							} ) ) }
							onChange={ ( v ) =>
								setValues( { ...values, [ i.key ]: v } )
							}
						/>
					) : (
						<TextField
							key={ i.key }
							label={ i.label }
							isRequired={ i.required }
							inputMode={
								i.type === 'number' ? 'decimal' : 'text'
							}
							value={ values[ i.key ] ?? '' }
							errorMessage={ errorOf( i.key ) }
							onChange={ ( v ) =>
								setValues( { ...values, [ i.key ]: v } )
							}
						/>
					)
				) }
			</form>
		</Modal>
	);
}

/**
 * Bulk bar: run a manual rule on the selected conversations.
 *
 * @param props     Props.
 * @param props.ids Selected conversations.
 */
export default function BulkRunRule( { ids }: { ids: number[] } ) {
	const q = useQuery( manualRulesQuery() );
	const [ rule, setRule ] = useState< ManualRule | null >( null );
	const rules = q.data ?? [];
	if ( rules.length === 0 ) {
		return null;
	}
	return (
		<>
			<Select
				label={ __( 'Run rule', 'cliedesk' ) }
				labelHidden
				value={ null }
				options={ rules.map( ( r ) => ( {
					id: String( r.id ),
					label: r.name,
				} ) ) }
				onChange={ ( v ) =>
					setRule(
						rules.find( ( r ) => String( r.id ) === v ) ?? null
					)
				}
			/>
			{ rule && (
				<RunRuleDialog
					rule={ rule }
					conversationIds={ ids.slice( 0, 100 ) }
					onClose={ () => setRule( null ) }
					confirm
				/>
			) }
		</>
	);
}
