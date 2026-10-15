/**
 * Business hours → Holidays (SLA-23): public holidays from a country preset (this year and the next two, topped up
 * every year), custom closures (one day or a range) and alternate hours such as Dec 24 09:00–13:00. SLA clocks
 * in business time, the widget and "open next" all follow them.
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
	Checkbox,
	EmptyState,
	LoadingRegion,
	Modal,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowLeft, CalendarOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { formatDate } from '../../workspace/api';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

export interface Holiday {
	id: number;
	name: string;
	start: string;
	end: string;
	/** Open ranges; null = closed all day. */
	hours: Array< [ string, string ] > | null;
	preset: string | null;
}

interface Country {
	code: string;
	name: string;
}

const day = ( d: string ): string => formatDate( `${ d }T12:00:00Z`, false );

/**
 * "Dec 24" or "Dec 28 – Dec 31".
 *
 * @param h Holiday.
 */
export function holidayDates( h: Pick< Holiday, 'start' | 'end' > ): string {
	return h.start === h.end
		? day( h.start )
		: sprintf(
				/* translators: 1: first day, 2: last day. */
				__( '%1$s – %2$s', 'cliedesk' ),
				day( h.start ),
				day( h.end )
			);
}

/**
 * "Closed" or "Open 09:00–13:00".
 *
 * @param h Holiday.
 */
export function holidayHours( h: Pick< Holiday, 'hours' > ): string {
	if ( ! h.hours ) {
		return __( 'Closed', 'cliedesk' );
	}
	return sprintf(
		/* translators: %s: open hours, like 09:00–13:00. */
		__( 'Open %s', 'cliedesk' ),
		h.hours.map( ( r ) => `${ r[ 0 ] }–${ r[ 1 ] }` ).join( ', ' )
	);
}

function HolidayDialog( {
	scheduleId,
	holiday,
	onClose,
}: {
	scheduleId: number;
	holiday: Holiday | null;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ name, setName ] = useState( holiday?.name ?? '' );
	const [ start, setStart ] = useState( holiday?.start ?? '' );
	const [ end, setEnd ] = useState( holiday?.end ?? '' );
	const [ closed, setClosed ] = useState( ! holiday?.hours );
	const [ from, setFrom ] = useState(
		holiday?.hours?.[ 0 ]?.[ 0 ] ?? '09:00'
	);
	const [ to, setTo ] = useState( holiday?.hours?.[ 0 ]?.[ 1 ] ?? '13:00' );
	const save = useMutation( {
		mutationFn: ( body: Record< string, unknown > ) =>
			holiday
				? api.patch< Holiday >(
						`schedules/${ scheduleId }/holidays/${ holiday.id }`,
						{ body }
					)
				: api.post< Holiday >( `schedules/${ scheduleId }/holidays`, {
						body,
					} ),
		onSuccess: () => {
			announceResult( __( 'Holiday saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'holidays', scheduleId ],
			} );
			onClose();
		},
	} );
	const errors = apiFieldErrors( save.error );
	const submit = () =>
		save.mutate( {
			name: name.trim(),
			start,
			end: end || start,
			hours: closed ? null : [ [ from, to ] ],
		} );
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={
				holiday
					? sprintf(
							/* translators: %s: holiday name. */
							__( 'Edit %s', 'cliedesk' ),
							holiday.name
						)
					: __( 'Add a holiday or closure', 'cliedesk' )
			}
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ save.isPending }
						isDisabled={ ! name.trim() || ! start }
						onPress={ submit }
					>
						{ __( 'Save holiday', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<ActionError error={ save.error } />
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					value={ name }
					onChange={ setName }
					maxLength={ 191 }
					isRequired
					errorMessage={ errors.name ?? null }
				/>
				<div className="flex flex-wrap gap-3">
					<TextField
						label={ __( 'First day', 'cliedesk' ) }
						type="date"
						value={ start }
						onChange={ setStart }
						isRequired
						errorMessage={ errors.start ?? null }
					/>
					<TextField
						label={ __( 'Last day', 'cliedesk' ) }
						description={ __( 'Empty for one day.', 'cliedesk' ) }
						type="date"
						value={ end }
						onChange={ setEnd }
						errorMessage={ errors.end ?? null }
					/>
				</div>
				<Checkbox isSelected={ closed } onChange={ setClosed }>
					{ __( 'Closed all day', 'cliedesk' ) }
				</Checkbox>
				{ ! closed && (
					<div className="flex flex-wrap gap-3">
						<TextField
							label={ __( 'Open from', 'cliedesk' ) }
							type="time"
							value={ from }
							onChange={ setFrom }
							errorMessage={
								errors[ 'hours.0' ] ?? errors.hours ?? null
							}
						/>
						<TextField
							label={ __( 'Open until', 'cliedesk' ) }
							type="time"
							value={ to }
							onChange={ setTo }
						/>
					</div>
				) }
			</div>
		</Modal>
	);
}

/**
 * Holidays of one schedule.
 *
 * @param props          Props.
 * @param props.schedule Schedule.
 * @param props.onBack   Back to the list.
 */
export function ScheduleHolidays( {
	schedule,
	onBack,
}: {
	schedule: { id: number; name: string };
	onBack: () => void;
} ) {
	const qc = useQueryClient();
	const canManage = can( 'cliedesk_manage_settings' );
	const thisYear = new Date().getFullYear();
	const [ year, setYear ] = useState( thisYear );
	const [ country, setCountry ] = useState( '' );
	const [ editing, setEditing ] = useState< Holiday | 'new' | null >( null );
	const key = [ 'holidays', schedule.id ] as const;
	const q = useQuery( {
		queryKey: [ ...key, year ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< { items: Holiday[]; presets: string[] } >(
					`schedules/${ schedule.id }/holidays`,
					{ query: { year }, signal }
				)
			).data ?? { items: [], presets: [] },
	} );
	const countries = useQuery( {
		queryKey: [ 'holiday-countries' ],
		queryFn: async ( { signal } ) =>
			( await api.get< Country[] >( 'holiday-countries', { signal } ) )
				.data ?? [],
		staleTime: Infinity,
	} );
	const preset = useMutation( {
		mutationFn: ( body: { country: string; remove?: boolean } ) =>
			api.post< { added?: number; removed?: number } >(
				`schedules/${ schedule.id }/holidays/preset`,
				{ body }
			),
		onSuccess: ( res, body ) => {
			const n = res.data?.added ?? res.data?.removed ?? 0;
			announceResult(
				body.remove
					? sprintf(
							/* translators: %d: number of holidays. */
							__( '%d public holidays removed.', 'cliedesk' ),
							n
						)
					: sprintf(
							/* translators: %d: number of holidays. */
							__( '%d public holidays added.', 'cliedesk' ),
							n
						)
			);
			void qc.invalidateQueries( { queryKey: key } );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( h: Holiday ) =>
			api.del( `schedules/${ schedule.id }/holidays/${ h.id }` ),
		onSuccess: () => void qc.invalidateQueries( { queryKey: key } ),
	} );
	const name = ( code: string ) =>
		countries.data?.find( ( c ) => c.code === code )?.name ?? code;
	const items = q.data?.items ?? [];
	return (
		<div className="flex flex-col gap-4">
			<div>
				<Button
					variant="ghost"
					iconStart={ <ArrowLeft aria-hidden="true" size={ 16 } /> }
					onPress={ onBack }
				>
					{ __( 'All business hours', 'cliedesk' ) }
				</Button>
			</div>
			<h2 className="text-lg font-semibold">
				{ sprintf(
					/* translators: %s: schedule name. */
					__( 'Holidays and closures: %s', 'cliedesk' ),
					schedule.name
				) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'On these days the business hours are closed or shorter. SLA timers in business time, the chat widget and auto-replies follow them.',
					'cliedesk'
				) }
			</p>
			<ActionError
				error={ preset.error ?? remove.error }
				onDismiss={ () => {
					preset.reset();
					remove.reset();
				} }
			/>
			{ canManage && (
				<section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
					<h3 className="font-semibold">
						{ __( 'Public holidays', 'cliedesk' ) }
					</h3>
					<p className="text-sm text-fg-muted">
						{ __(
							'Loads national public holidays for this year and the next two, and adds new years automatically. Holidays that follow a lunar calendar are not included; add them below.',
							'cliedesk'
						) }
					</p>
					<div className="flex flex-wrap items-end gap-3">
						<Select
							label={ __( 'Country', 'cliedesk' ) }
							value={ country }
							onChange={ setCountry }
							options={ [
								{
									id: '',
									label: __( 'Choose a country', 'cliedesk' ),
								},
								...( countries.data ?? [] ).map( ( c ) => ( {
									id: c.code,
									label: c.name,
								} ) ),
							] }
						/>
						<Button
							isDisabled={ ! country }
							isLoading={ preset.isPending }
							onPress={ () => preset.mutate( { country } ) }
						>
							{ __( 'Load public holidays', 'cliedesk' ) }
						</Button>
					</div>
					{ ( q.data?.presets ?? [] ).length > 0 && (
						<ul className="flex flex-wrap gap-2">
							{ ( q.data?.presets ?? [] ).map( ( code ) => (
								<li
									key={ code }
									className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm"
								>
									{ name( code ) }
									<Button
										size="sm"
										variant="ghost"
										onPress={ () =>
											preset.mutate( {
												country: code,
												remove: true,
											} )
										}
										aria-label={ sprintf(
											/* translators: %s: country name. */
											__(
												'Remove public holidays of %s',
												'cliedesk'
											),
											name( code )
										) }
									>
										{ __( 'Remove', 'cliedesk' ) }
									</Button>
								</li>
							) ) }
						</ul>
					) }
				</section>
			) }
			<div className="flex flex-wrap items-end justify-between gap-3">
				<Select
					label={ __( 'Year', 'cliedesk' ) }
					value={ String( year ) }
					onChange={ ( v ) => setYear( Number( v ) ) }
					options={ [
						thisYear - 1,
						thisYear,
						thisYear + 1,
						thisYear + 2,
					].map( ( y ) => ( {
						id: String( y ),
						label: String( y ),
					} ) ) }
				/>
				{ canManage && (
					<Button
						variant="primary"
						iconStart={ <Plus aria-hidden="true" size={ 16 } /> }
						onPress={ () => setEditing( 'new' ) }
					>
						{ __( 'Add a holiday or closure', 'cliedesk' ) }
					</Button>
				) }
			</div>
			{ q.isPending && <LoadingRegion /> }
			{ q.isError && (
				<Banner
					tone="danger"
					title={ __( 'Could not load the holidays.', 'cliedesk' ) }
				/>
			) }
			{ ! q.isPending && items.length === 0 && (
				<EmptyState
					icon={ <CalendarOff size={ 32 } strokeWidth={ 1.75 } /> }
					title={ sprintf(
						/* translators: %d: year. */
						__( 'No holidays in %d', 'cliedesk' ),
						year
					) }
					description={ __(
						'Load your country’s public holidays above, or add a closure such as “Office party, closed from 14:00”.',
						'cliedesk'
					) }
					actions={
						// ADM-04: every empty state offers a way to start.
						canManage && (
							<Button onPress={ () => setEditing( 'new' ) }>
								{ __( 'Add a holiday or closure', 'cliedesk' ) }
							</Button>
						)
					}
				/>
			) }
			{ items.length > 0 && (
				<ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
					{ items.map( ( h ) => (
						<li
							key={ h.id }
							className="flex flex-wrap items-center gap-3 p-3"
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="font-medium">
									<bdi>{ h.name }</bdi>
								</span>
								<span className="text-sm text-fg-muted">
									{ holidayDates( h ) } ·{ ' ' }
									{ holidayHours( h ) }
									{ h.preset
										? ` · ${ name( h.preset ) }`
										: '' }
								</span>
							</div>
							{ canManage && (
								<div className="flex gap-2">
									<Button
										size="sm"
										onPress={ () => setEditing( h ) }
										aria-label={ sprintf(
											/* translators: %s: holiday name. */
											__( 'Edit %s', 'cliedesk' ),
											h.name
										) }
									>
										{ __( 'Edit', 'cliedesk' ) }
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onPress={ () => remove.mutate( h ) }
										aria-label={ sprintf(
											/* translators: %s: holiday name. */
											__( 'Delete %s', 'cliedesk' ),
											h.name
										) }
									>
										{ __( 'Delete', 'cliedesk' ) }
									</Button>
								</div>
							) }
						</li>
					) ) }
				</ul>
			) }
			{ editing && (
				<HolidayDialog
					scheduleId={ schedule.id }
					holiday={ editing === 'new' ? null : editing }
					onClose={ () => setEditing( null ) }
				/>
			) }
		</div>
	);
}
