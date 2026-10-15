/**
 * Run a rule by hand (AUT-20): rules with the trigger "An agent runs it" are offered in the conversation's More menu
 * (More → Run rule… → pick one); the rule runs now, as the agent, with their own permissions. A rule with inputs asks
 * for them first; ⌘K and the reply picker ask the open conversation to run a rule.
 */
import { useQuery } from '@cliedesk/data';
import { Button, Modal } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useCallback, useState } from 'react';
import {
	RunRuleDialog,
	manualRulesQuery,
	useRunRuleRequests,
	type ManualRule,
} from './ManualRules';

/**
 * Manual rules of a conversation: the list, `pick()` to choose one, `run( id )` and the dialogs to render.
 *
 * @param conversationId Conversation.
 * @param enabled        Load and listen (off: no rules, no dialog).
 */
export function useManualRules( conversationId: number, enabled = true ) {
	const q = useQuery( { ...manualRulesQuery(), enabled } );
	const [ picking, setPicking ] = useState( false );
	const [ running, setRunning ] = useState< ManualRule | null >( null );
	useRunRuleRequests(
		useCallback(
			( rule: ManualRule ) => enabled && setRunning( rule ),
			[ enabled ]
		)
	);
	const rules = enabled && Array.isArray( q.data ) ? q.data : [];
	const run = ( id: string ) => {
		setPicking( false );
		setRunning( rules.find( ( r ) => String( r.id ) === id ) ?? null );
	};
	let dialog = null;
	if ( running ) {
		dialog = (
			<RunRuleDialog
				rule={ running }
				conversationIds={ [ conversationId ] }
				onClose={ () => setRunning( null ) }
			/>
		);
	} else if ( picking ) {
		dialog = (
			<Modal
				isOpen
				size="sm"
				onOpenChange={ ( open ) => ! open && setPicking( false ) }
				title={ __( 'Run a rule', 'cliedesk' ) }
				footer={
					<Button onPress={ () => setPicking( false ) }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
				}
			>
				<ul className="flex flex-col gap-1">
					{ rules.map( ( r ) => (
						<li key={ r.id }>
							<Button
								variant="ghost"
								className="w-full justify-start"
								onPress={ () => run( String( r.id ) ) }
							>
								{ r.name }
							</Button>
						</li>
					) ) }
				</ul>
			</Modal>
		);
	}
	return { rules, pick: () => setPicking( true ), run, dialog };
}
