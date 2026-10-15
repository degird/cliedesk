/**
 * Snooze (INB-69, INB-70): presets (later today, tomorrow and next week when my working hours start, else 9:00, a
 * custom time) and the snooze mode. By
 * default a customer reply wakes the conversation (`if_no_reply`); "wake even if the customer replies" sends
 * `regardless`, so it sleeps until its time. Shared by the conversation header and the inbox bulk bar.
 */
import { api, getBoot, useQuery } from '@cliedesk/data';
import { Checkbox, RadioGroup, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';

export type SnoozeMode = 'if_no_reply' | 'regardless';
export type SnoozePreset = 'later_today' | 'tomorrow' | 'next_week' | 'custom';

export interface SnoozeChoice {
	preset: SnoozePreset;
	/** Value of the datetime-local field (custom time). */
	custom: string;
	/** Wake at the time even if the customer replies. */
	regardless: boolean;
}

/**
 * UTC `YYYY-MM-DDTHH:MM:SSZ` for a local `datetime-local` value.
 *
 * @param local Value of a datetime-local input.
 */
export function snoozeValue( local: string ): string | null {
	if ( ! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test( local ) ) {
		return null;
	}
	const d = new Date( local );
	return Number.isNaN( d.getTime() ) ? null : utcValue( d );
}

/**
 * API form of a date (UTC, seconds, Z).
 *
 * @param d Date.
 */
export const utcValue = ( d: Date ): string =>
	d.toISOString().slice( 0, 19 ) + 'Z';

/** INB-69: when my working hours start tomorrow and next week (GET me/snooze-times); null: 9:00. */
let workStarts: { tomorrow: Date | null; nextWeek: Date | null } = {
	tomorrow: null,
	nextWeek: null,
};

/**
 * Use my working hours for the Tomorrow and Next week presets.
 *
 * @param times          Start times (UTC strings) or null.
 * @param times.tomorrow Tomorrow.
 * @param times.nextWeek Next week.
 */
export function setWorkStarts( times: {
	tomorrow?: string | null;
	nextWeek?: string | null;
} ): void {
	const at = ( v?: string | null ) => {
		const d = v ? new Date( v ) : null;
		return d && ! Number.isNaN( d.getTime() ) ? d : null;
	};
	workStarts = {
		tomorrow: at( times.tomorrow ),
		nextWeek: at( times.nextWeek ),
	};
}

/**
 * The preset times (local), from `now`. "Later today" is left out when three hours from now is tomorrow.
 *
 * @param now       Now.
 * @param weekStart First day of the week (0 Sunday … 6 Saturday; 1 Monday by default).
 */
export function snoozePresets(
	now: Date,
	weekStart = 1
): Array< { id: Exclude< SnoozePreset, 'custom' >; at: Date } > {
	const out: Array< { id: Exclude< SnoozePreset, 'custom' >; at: Date } > =
		[];
	const later = new Date( now.getTime() + 3 * 3600 * 1000 );
	// Round up to the next quarter hour.
	later.setSeconds( 0, 0 );
	const rest = later.getMinutes() % 15;
	if ( rest ) {
		later.setMinutes( later.getMinutes() + 15 - rest );
	}
	if ( later.toDateString() === now.toDateString() ) {
		out.push( { id: 'later_today', at: later } );
	}
	const tomorrow = new Date( now );
	tomorrow.setDate( tomorrow.getDate() + 1 );
	tomorrow.setHours( 9, 0, 0, 0 );
	out.push( {
		id: 'tomorrow',
		at:
			workStarts.tomorrow && workStarts.tomorrow > now
				? workStarts.tomorrow
				: tomorrow,
	} );
	const start = ( ( weekStart % 7 ) + 7 ) % 7;
	const next = new Date( now );
	const ahead = ( start - now.getDay() + 7 ) % 7 || 7;
	next.setDate( next.getDate() + ahead );
	next.setHours( 9, 0, 0, 0 );
	out.push( {
		id: 'next_week',
		at:
			workStarts.nextWeek && workStarts.nextWeek > now
				? workStarts.nextWeek
				: next,
	} );
	return out;
}

/**
 * Local date and time for a preset label.
 *
 * @param d Date.
 */
export function shortWhen( d: Date ): string {
	try {
		return new Intl.DateTimeFormat(
			( typeof document !== 'undefined' &&
				document.documentElement.lang ) ||
				undefined,
			{ weekday: 'short', hour: 'numeric', minute: '2-digit' }
		).format( d );
	} catch {
		return d.toISOString();
	}
}

/**
 * Preset name.
 *
 * @param p Preset.
 */
export function presetLabel( p: SnoozePreset ): string {
	switch ( p ) {
		case 'later_today':
			return __( 'Later today', 'cliedesk' );
		case 'tomorrow':
			return __( 'Tomorrow morning', 'cliedesk' );
		case 'next_week':
			return __( 'Next week', 'cliedesk' );
		case 'custom':
			return __( 'Pick a date and time', 'cliedesk' );
	}
	return p;
}

export const defaultSnoozeChoice = (): SnoozeChoice => ( {
	preset: 'tomorrow',
	custom: '',
	regardless: false,
} );

/**
 * The wake-up time and mode of a choice, or an error.
 *
 * @param choice Choice.
 * @param now    Now.
 */
export function resolveSnooze(
	choice: SnoozeChoice,
	now: Date = new Date()
):
	| { until: string; mode: SnoozeMode; error: null }
	| { until: null; mode: SnoozeMode; error: string } {
	const mode: SnoozeMode = choice.regardless ? 'regardless' : 'if_no_reply';
	let until: string | null = null;
	if ( choice.preset === 'custom' ) {
		until = snoozeValue( choice.custom );
	} else {
		const p = snoozePresets(
			now,
			getBoot().workspace?.weekStart ?? 1
		).find( ( x ) => x.id === choice.preset );
		until = p ? utcValue( p.at ) : null;
	}
	if ( ! until || new Date( until ).getTime() <= now.getTime() ) {
		return {
			until: null,
			mode,
			error: __( 'Choose a time in the future.', 'cliedesk' ),
		};
	}
	return { until, mode, error: null };
}

/**
 * Snooze fields: when (presets or a custom time) and the mode.
 *
 * @param props          Props.
 * @param props.value    Choice.
 * @param props.onChange Change.
 * @param props.error    Error of the time.
 * @param props.idPrefix Prefix of the field ids.
 */
export function SnoozeFields( {
	value,
	onChange,
	error,
	idPrefix = 'cd-snooze',
}: {
	value: SnoozeChoice;
	onChange: ( next: SnoozeChoice ) => void;
	error?: string | null;
	idPrefix?: string;
} ) {
	// INB-69: Tomorrow and Next week start when my working hours start.
	const starts = useQuery( {
		queryKey: [ 'me', 'snooze-times' ] as const,
		queryFn: async ( { signal } ) => {
			const d = (
				await api.get< {
					tomorrow: string | null;
					nextWeek: string | null;
				} >( 'me/snooze-times', { signal } )
			).data;
			setWorkStarts( d ?? {} );
			return d ?? null;
		},
		staleTime: 10 * 60 * 1000,
		retry: false,
	} );
	if ( starts.data ) {
		setWorkStarts( starts.data );
	}
	const presets = snoozePresets(
		new Date(),
		getBoot().workspace?.weekStart ?? 1
	);
	const options = [
		...presets.map( ( p ) => ( {
			id: p.id,
			label: sprintf(
				/* translators: 1: preset name, 2: day and time. */
				__( '%1$s (%2$s)', 'cliedesk' ),
				presetLabel( p.id ),
				shortWhen( p.at )
			),
		} ) ),
		{ id: 'custom', label: presetLabel( 'custom' ) },
	];
	const preset = options.some( ( o ) => o.id === value.preset )
		? value.preset
		: 'custom';
	return (
		<div className="flex flex-col gap-4">
			<RadioGroup
				id={ `${ idPrefix }-when` }
				label={ __( 'Snooze until', 'cliedesk' ) }
				options={ options }
				value={ preset }
				onChange={ ( p ) =>
					onChange( { ...value, preset: p as SnoozePreset } )
				}
			/>
			<TextField
				id={ `${ idPrefix }-custom` }
				label={ __( 'Wake up at', 'cliedesk' ) }
				description={ __(
					'The conversation comes back as Open at this time (your time zone).',
					'cliedesk'
				) }
				type="datetime-local"
				value={ value.custom }
				onChange={ ( x ) =>
					onChange( { ...value, custom: x, preset: 'custom' } )
				}
				errorMessage={ error ?? null }
			/>
			<Checkbox
				isSelected={ value.regardless }
				onChange={ ( on ) => onChange( { ...value, regardless: on } ) }
			>
				{ __(
					'Stay snoozed until then, even if the customer replies',
					'cliedesk'
				) }
			</Checkbox>
		</div>
	);
}

/**
 * "Snoozed until …" with what wakes it.
 *
 * @param until When (UTC).
 * @param mode  Mode.
 * @param when  Formatted time.
 */
export function snoozeSummary(
	until: string,
	mode: SnoozeMode | null | undefined,
	when: string
): string {
	return mode === 'regardless'
		? sprintf(
				/* translators: %s: date and time. */
				__(
					'Snoozed until %s, even if the customer replies.',
					'cliedesk'
				),
				when
			)
		: sprintf(
				/* translators: %s: date and time. */
				__(
					'Snoozed until %s, or until the customer replies.',
					'cliedesk'
				),
				when || until
			);
}
