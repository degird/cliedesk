/**
 * Macro step types added by extensions (MAC-02): Pro's "Send a CSAT survey", for example. The server maps each type
 * to its Action (`cliedesk_macro_step_types`, `cliedesk_macro_step`); a step type without options shows its
 * description in the editor.
 */
import { hasModule } from '@cliedesk/data';

export interface MacroStepType {
	type: string;
	label: string;
	/** One sentence shown under the step in the editor. */
	description?: string;
	/** Module id; the type is offered only while the module is active. */
	module?: string;
}

const types = new Map< string, MacroStepType >();

/**
 * Register a macro step type (before mount).
 *
 * @param def Step type.
 */
export function registerMacroStep( def: MacroStepType ): void {
	types.set( def.type, def );
}

/**
 * Registered step types whose module is active.
 */
export function extensionStepTypes(): MacroStepType[] {
	return [ ...types.values() ].filter( ( d ) => hasModule( d.module ) );
}

/**
 * One registered step type.
 *
 * @param type Type.
 */
export function extensionStep( type: string ): MacroStepType | undefined {
	return types.get( type );
}
