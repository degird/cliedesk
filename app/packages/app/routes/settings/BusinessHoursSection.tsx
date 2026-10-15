/**
 * Settings → Business hours (SLA-22, SLA-23, SLA-25, SLA-26): the one schedule every consumer uses (the chat widget,
 * the reply promise, automation and snooze times) with a time zone and weekly hours in 15-minute steps (several
 * ranges per day, overnight ranges allowed), its holidays and the closure. Pro adds more schedules, business hours per
 * channel and SLA policies (slots `sla.schedules`, `sla.channel_hours`, `sla.policies`; the hours kit is their
 * `kit` fill prop).
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Banner,
	Button,
	LoadingRegion,
	Slot,
	TextField,
	cx,
	inputClass,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useId, useState, type ReactNode } from 'react';
import { ActionError } from '../../inbox/components';
import {
	announceResult,
	apiFieldErrors,
	focusField,
} from '../../workspace/forms';
import { versionTag } from '../../workspace/api';
import { ScheduleHolidays } from './ScheduleHolidays';
import { ClosureCard } from './ClosureCard';

export const DAYS = [
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat',
	'sun',
] as const;
export type Day = ( typeof DAYS )[ number ];
type Range = [ string, string ];
export type Weekly = Record< Day, Range[] >;

export interface Schedule {
	id: number;
	uid: string;
	name: string;
	timezone: string;
	weekly: Weekly;
	isDefault: boolean;
	archived: boolean;
	version: number;
	updatedAt: string;
}

const dayName = ( d: Day ): string =>
	( {
		mon: __( 'Monday', 'cliedesk' ),
		tue: __( 'Tuesday', 'cliedesk' ),
		wed: __( 'Wednesday', 'cliedesk' ),
		thu: __( 'Thursday', 'cliedesk' ),
		fri: __( 'Friday', 'cliedesk' ),
		sat: __( 'Saturday', 'cliedesk' ),
		sun: __( 'Sunday', 'cliedesk' ),
	} )[ d ];

/**
 * Short text of one day's hours, e.g. "09:00–12:00, 13:00–17:00" or "Closed".
 *
 * @param ranges Ranges.
 */
export function describeDay( ranges: Range[] ): string {
	if ( ! ranges.length ) {
		return __( 'Closed', 'cliedesk' );
	}
	return ranges
		.map( ( [ a, b ] ) =>
			a === '00:00' && ( b === '24:00' || b === '00:00' )
				? __( 'Open 24 hours', 'cliedesk' )
				: `${ a }–${ b === '24:00' ? '00:00' : b }`
		)
		.join( ', ' );
}

const KEY = [ 'schedules' ] as const;

/**
 * One schedule: name, time zone and the hours of each day, with its actions.
 *
 * @param props          Props.
 * @param props.schedule Schedule.
 * @param props.actions  Buttons (Edit, Holidays …).
 */
export function ScheduleCard( {
	schedule: s,
	actions,
}: {
	schedule: Schedule;
	actions?: ReactNode;
} ) {
	return (
		<div className="flex flex-wrap items-start gap-4 p-4">
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-base font-semibold">
						<bdi>{ s.name }</bdi>
					</h2>
					{ s.archived && (
						<span className="rounded-full border border-line px-2 text-xs font-medium text-fg-muted">
							{ __( 'Archived', 'cliedesk' ) }
						</span>
					) }
				</div>
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: %s: time zone name. */
						__( 'Time zone: %s', 'cliedesk' ),
						s.timezone
					) }
				</p>
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
					{ DAYS.map( ( d ) => (
						<div key={ d } className="contents">
							<dt className="text-fg-muted">{ dayName( d ) }</dt>
							<dd>{ describeDay( s.weekly[ d ] ) }</dd>
						</div>
					) ) }
				</dl>
			</div>
			{ actions && (
				<div className="flex flex-wrap gap-2">{ actions }</div>
			) }
		</div>
	);
}

/**
 * Business hours section.
 */
export default function BusinessHoursSection() {
	const [ editing, setEditing ] = useState< Schedule | null >( null );
	const [ holidays, setHolidays ] = useState< Schedule | null >( null );
	const qc = useQueryClient();
	const canManage = can( 'cliedesk_manage_settings' );
	const q = useQuery( {
		queryKey: [ ...KEY, false ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< Schedule[] >( 'schedules', {
					query: { archived: false },
					signal,
				} )
			).data ?? [],
	} );

	if ( holidays ) {
		return (
			<ScheduleHolidays
				schedule={ holidays }
				onBack={ () => setHolidays( null ) }
			/>
		);
	}
	if ( editing ) {
		return (
			<ScheduleEditor
				schedule={ editing }
				onDone={ () => {
					setEditing( null );
					void qc.invalidateQueries( { queryKey: KEY } );
				} }
			/>
		);
	}
	if ( q.isPending ) {
		return (
			<LoadingRegion
				label={ __( 'Loading business hours…', 'cliedesk' ) }
			/>
		);
	}
	const list = q.data ?? [];
	const main = list.find( ( s ) => s.isDefault ) ?? list[ 0 ];
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-fg-muted">
				{ __(
					'Your business hours tell customers when you are open. The chat widget shows when you open next, and automatic replies promise a reply when you open again.',
					'cliedesk'
				) }
			</p>
			{ canManage && <ClosureCard /> }
			{ main && (
				<div className="rounded-lg border border-line bg-surface">
					<ScheduleCard
						schedule={ main }
						actions={
							canManage && (
								<>
									<Button
										size="sm"
										onPress={ () => setEditing( main ) }
										aria-label={ sprintf(
											/* translators: %s: schedule name. */
											__( 'Edit %s', 'cliedesk' ),
											main.name
										) }
									>
										{ __( 'Edit', 'cliedesk' ) }
									</Button>
									<Button
										size="sm"
										onPress={ () => setHolidays( main ) }
										aria-label={ sprintf(
											/* translators: %s: schedule name. */
											__( 'Holidays of %s', 'cliedesk' ),
											main.name
										) }
									>
										{ __( 'Holidays', 'cliedesk' ) }
									</Button>
								</>
							)
						}
					/>
				</div>
			) }
			{ /* SLA-24 (Pro): more schedules and business hours per channel; SLA policies use these hours. */ }
			<Slot name="sla.schedules" fillProps={ { kit: hoursKit } } />
			{ canManage && (
				<Slot
					name="sla.channel_hours"
					fillProps={ { schedules: list } }
				/>
			) }
			<Slot name="sla.policies" />
		</div>
	);
}

const ALWAYS: Weekly = {
	mon: [ [ '00:00', '24:00' ] ],
	tue: [ [ '00:00', '24:00' ] ],
	wed: [ [ '00:00', '24:00' ] ],
	thu: [ [ '00:00', '24:00' ] ],
	fri: [ [ '00:00', '24:00' ] ],
	sat: [ [ '00:00', '24:00' ] ],
	sun: [ [ '00:00', '24:00' ] ],
};

/**
 * Client checks: 15-minute steps; the server checks overlaps too.
 *
 * @param weekly Weekly hours.
 */
export function validateWeekly( weekly: Weekly ): Record< string, string > {
	const errors: Record< string, string > = {};
	for ( const d of DAYS ) {
		weekly[ d ].forEach( ( r, i ) => {
			if (
				! r.every( ( t ) =>
					/^([01]\d|2[0-3]):(00|15|30|45)$|^24:00$/.test( t )
				)
			) {
				errors[ `weekly.${ d }.${ i }` ] = __(
					'Use times like 09:00 in steps of 15 minutes.',
					'cliedesk'
				);
			}
		} );
	}
	return errors;
}

/**
 * Add or change business hours (adding is Pro: POST schedules).
 *
 * @param props          Props.
 * @param props.schedule Schedule, or null for a new one.
 * @param props.onDone   Back to the list.
 */
export function ScheduleEditor( {
	schedule,
	onDone,
}: {
	schedule: Schedule | null;
	onDone: () => void;
} ) {
	const [ name, setName ] = useState( schedule?.name ?? '' );
	const [ timezone, setTimezone ] = useState(
		schedule?.timezone ??
			Intl.DateTimeFormat().resolvedOptions().timeZone ??
			'UTC'
	);
	const [ weekly, setWeekly ] = useState< Weekly >(
		schedule?.weekly ?? ALWAYS
	);
	const [ local, setLocal ] = useState< Record< string, string > >( {} );
	const save = useMutation( {
		mutationFn: () => {
			const body = { name: name.trim(), timezone, weekly };
			return schedule
				? api.patch< Schedule >( `schedules/${ schedule.id }`, {
						body,
						ifMatch: versionTag( schedule.version ),
					} )
				: api.post< Schedule >( 'schedules', { body } );
		},
		onSuccess: () => {
			announceResult( __( 'Business hours saved.', 'cliedesk' ) );
			onDone();
		},
	} );
	const errors = { ...apiFieldErrors( save.error ), ...local };
	const setDay = ( d: Day, ranges: Range[] ) =>
		setWeekly( ( w ) => ( { ...w, [ d ]: ranges } ) );
	const title = schedule
		? sprintf(
				/* translators: %s: schedule name. */
				__( 'Edit business hours “%s”', 'cliedesk' ),
				schedule.name
			)
		: __( 'Add business hours', 'cliedesk' );

	return (
		<form
			className="flex flex-col gap-4"
			aria-label={ title }
			noValidate
			onSubmit={ ( e ) => {
				e.preventDefault();
				const found = validateWeekly( weekly );
				if ( ! name.trim() ) {
					found.name = __( 'Enter a name.', 'cliedesk' );
				}
				setLocal( found );
				const first = Object.keys( found )[ 0 ];
				if ( first ) {
					focusField( `cd-hours-${ first.replace( /\./g, '-' ) }` );
					return;
				}
				save.mutate();
			} }
		>
			<h2 className="text-lg font-semibold">{ title }</h2>
			<ActionError error={ save.error } />
			<TextField
				id="cd-hours-name"
				label={ __( 'Name', 'cliedesk' ) }
				value={ name }
				onChange={ setName }
				errorMessage={ errors.name }
				isRequired
			/>
			<TextField
				id="cd-hours-timezone"
				label={ __( 'Time zone', 'cliedesk' ) }
				description={ __(
					'For example Europe/Berlin or America/New_York.',
					'cliedesk'
				) }
				value={ timezone }
				onChange={ setTimezone }
				errorMessage={ errors.timezone }
			/>
			<div className="flex flex-wrap gap-2">
				<Button size="sm" onPress={ () => setWeekly( ALWAYS ) }>
					{ __( 'Open 24/7', 'cliedesk' ) }
				</Button>
				<Button
					size="sm"
					onPress={ () =>
						setWeekly( ( w ) => ( {
							...w,
							tue: w.mon,
							wed: w.mon,
							thu: w.mon,
							fri: w.mon,
						} ) )
					}
				>
					{ __( 'Copy Monday to Tuesday–Friday', 'cliedesk' ) }
				</Button>
			</div>
			{ DAYS.map( ( d ) => (
				<fieldset
					key={ d }
					className="flex flex-col gap-2 rounded-md border border-line p-3"
				>
					<legend className="px-1 font-medium">
						{ dayName( d ) }
					</legend>
					{ ! weekly[ d ].length && (
						<p className="text-sm text-fg-muted">
							{ __( 'Closed', 'cliedesk' ) }
						</p>
					) }
					{ weekly[ d ].map( ( r, i ) => {
						const err = errors[ `weekly.${ d }.${ i }` ];
						const errId = `cd-hours-weekly-${ d }-${ i }-error`;
						return (
							<div
								key={ i }
								className="flex flex-wrap items-end gap-2"
							>
								<TimeInput
									id={ `cd-hours-weekly-${ d }-${ i }` }
									label={ sprintf(
										/* translators: 1: day name, 2: range number. */
										__( '%1$s opens (%2$d)', 'cliedesk' ),
										dayName( d ),
										i + 1
									) }
									value={ r[ 0 ] }
									invalid={ !! err }
									errorId={ errId }
									onChange={ ( v ) =>
										setDay(
											d,
											weekly[ d ].map( ( x, j ) =>
												j === i ? [ v, x[ 1 ] ] : x
											)
										)
									}
								/>
								<TimeInput
									label={ sprintf(
										/* translators: 1: day name, 2: range number. */
										__( '%1$s closes (%2$d)', 'cliedesk' ),
										dayName( d ),
										i + 1
									) }
									value={
										r[ 1 ] === '24:00' ? '00:00' : r[ 1 ]
									}
									invalid={ !! err }
									errorId={ errId }
									onChange={ ( v ) =>
										setDay(
											d,
											weekly[ d ].map( ( x, j ) =>
												j === i ? [ x[ 0 ], v ] : x
											)
										)
									}
								/>
								<Button
									size="sm"
									variant="ghost"
									onPress={ () =>
										setDay(
											d,
											weekly[ d ].filter(
												( _x, j ) => j !== i
											)
										)
									}
									aria-label={ sprintf(
										/* translators: 1: day name, 2: range number. */
										__(
											'Remove %1$s hours %2$d',
											'cliedesk'
										),
										dayName( d ),
										i + 1
									) }
								>
									{ __( 'Remove', 'cliedesk' ) }
								</Button>
								{ err && (
									<p
										id={ errId }
										className="w-full text-sm text-danger"
									>
										{ err }
									</p>
								) }
							</div>
						);
					} ) }
					{ weekly[ d ].length < 6 && (
						<div>
							<Button
								size="sm"
								variant="ghost"
								onPress={ () =>
									setDay( d, [
										...weekly[ d ],
										[ '09:00', '17:00' ],
									] )
								}
								aria-label={ sprintf(
									/* translators: %s: day name. */
									__( 'Add hours on %s', 'cliedesk' ),
									dayName( d )
								) }
							>
								{ __( 'Add hours', 'cliedesk' ) }
							</Button>
						</div>
					) }
				</fieldset>
			) ) }
			<p className="text-sm text-fg-muted">
				{ __(
					'Closing time before the opening time means the hours run past midnight, e.g. 22:00 to 02:00. 00:00 to 00:00 is the whole day.',
					'cliedesk'
				) }
			</p>
			{ Object.keys( local ).length > 0 && (
				<Banner
					tone="danger"
					role="alert"
					title={ __( 'Please fix the marked fields.', 'cliedesk' ) }
				/>
			) }
			<div className="flex gap-2">
				<Button
					type="submit"
					variant="primary"
					isLoading={ save.isPending }
				>
					{ __( 'Save business hours', 'cliedesk' ) }
				</Button>
				<Button onPress={ onDone }>
					{ __( 'Cancel', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}

function TimeInput( {
	id,
	label,
	value,
	invalid,
	errorId,
	onChange,
}: {
	id?: string;
	label: string;
	value: string;
	invalid: boolean;
	errorId: string;
	onChange: ( v: string ) => void;
} ) {
	const auto = useId();
	const inputId = id ?? auto;
	return (
		<div className="flex flex-col gap-1 text-sm">
			<label htmlFor={ inputId }>{ label }</label>
			<input
				id={ inputId }
				type="time"
				step={ 900 }
				className={ cx(
					inputClass,
					'w-32 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
					invalid && 'border-danger'
				) }
				value={ value }
				aria-invalid={ invalid || undefined }
				aria-describedby={ invalid ? errorId : undefined }
				onChange={ ( e ) => onChange( e.currentTarget.value ) }
			/>
		</div>
	);
}

/**
 * Business-hours pieces Pro's schedule screens reuse (FPS-06: several schedules, SLA-24). Passed to Pro's fills as the
 * `kit` fill prop, so Pro needs no extra @cliedesk/app exports.
 */
export const hoursKit = {
	ActionError,
	ScheduleCard,
	ScheduleEditor,
	ScheduleHolidays,
};

export type HoursKit = typeof hoursKit;
