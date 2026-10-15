/**
 * My reminders on a conversation (INB-71): list, add, change and remove (GET/POST conversations/{id}/reminders,
 * PATCH/DELETE reminders/{id}). Each reminder has a due time (sent in UTC) and an optional note. Reminders are
 * personal: other people do not see them.
 *
 * The composer's `/remind <when> [note]` command adds one too (remindCommand.ts).
 */
import {
	api,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { fullTime } from '../../inbox/labels';
import { snoozeValue } from '../../inbox/snooze';
import { announceResult, apiFieldErrors } from '../../workspace/forms';

export interface Reminder {
	id: number;
	conversationId: number;
	/** UTC `YYYY-MM-DDTHH:MM:SSZ`. */
	at: string;
	note: string;
	pending: boolean;
}

export const remindersQuery = ( id: number ) =>
	queryOptions( {
		queryKey: [ 'conversation', id, 'reminders' ] as const,
		queryFn: async ( { signal } ) => {
			const items = (
				await api.get< { items: Reminder[] } >(
					`conversations/${ id }/reminders`,
					{ signal }
				)
			).data?.items;
			return Array.isArray( items ) ? items : [];
		},
	} );

/**
 * Value for a datetime-local input (local time) from a UTC time.
 *
 * @param utc UTC time.
 */
export function localInputValue( utc: string ): string {
	const d = new Date( utc );
	if ( Number.isNaN( d.getTime() ) ) {
		return '';
	}
	const pad = ( n: number ) => String( n ).padStart( 2, '0' );
	return `${ d.getFullYear() }-${ pad( d.getMonth() + 1 ) }-${ pad(
		d.getDate()
	) }T${ pad( d.getHours() ) }:${ pad( d.getMinutes() ) }`;
}

function ReminderForm( {
	idPrefix,
	initial,
	submitLabel,
	isLoading,
	error,
	onSubmit,
	onCancel,
}: {
	idPrefix: string;
	initial?: Reminder;
	submitLabel: string;
	isLoading: boolean;
	error: unknown;
	onSubmit: ( at: string, note: string ) => void;
	onCancel?: () => void;
} ) {
	const [ when, setWhen ] = useState(
		initial ? localInputValue( initial.at ) : ''
	);
	const [ note, setNote ] = useState( initial?.note ?? '' );
	const [ invalid, setInvalid ] = useState< string | null >( null );
	const server = apiFieldErrors( error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const at = snoozeValue( when );
		if ( ! at || new Date( at ).getTime() <= Date.now() ) {
			setInvalid( __( 'Choose a time in the future.', 'cliedesk' ) );
			return;
		}
		setInvalid( null );
		onSubmit( at, note.trim() );
	};
	return (
		<form noValidate onSubmit={ submit } className="flex flex-col gap-2">
			<TextField
				id={ `${ idPrefix }-at` }
				label={ __( 'Remind me at', 'cliedesk' ) }
				type="datetime-local"
				isRequired
				value={ when }
				onChange={ ( v ) => {
					setWhen( v );
					setInvalid( null );
				} }
				errorMessage={ invalid ?? server.at ?? null }
			/>
			<TextField
				id={ `${ idPrefix }-note` }
				label={ __( 'Note', 'cliedesk' ) }
				description={ __( 'Optional. Only you see it.', 'cliedesk' ) }
				maxLength={ 500 }
				value={ note }
				onChange={ setNote }
				errorMessage={ server.note ?? null }
			/>
			{ error && ! Object.keys( server ).length ? (
				<ActionError error={ error } />
			) : null }
			<div className="flex gap-2">
				<Button type="submit" size="sm" isLoading={ isLoading }>
					{ submitLabel }
				</Button>
				{ onCancel && (
					<Button size="sm" variant="ghost" onPress={ onCancel }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
				) }
			</div>
		</form>
	);
}

/**
 * Reminders panel.
 *
 * @param props                Props.
 * @param props.conversationId Conversation.
 */
export function RemindersPanel( {
	conversationId,
}: {
	conversationId: number;
} ) {
	const qc = useQueryClient();
	const q = useQuery( remindersQuery( conversationId ) );
	const [ adding, setAdding ] = useState( false );
	const [ editing, setEditing ] = useState< number | null >( null );
	const refresh = () =>
		void qc.invalidateQueries( {
			queryKey: [ 'conversation', conversationId, 'reminders' ],
		} );
	const create = useMutation( {
		mutationFn: ( v: { at: string; note: string } ) =>
			api.post< Reminder >(
				`conversations/${ conversationId }/reminders`,
				{
					body: { at: v.at, ...( v.note ? { note: v.note } : {} ) },
				}
			),
		onSuccess: () => {
			refresh();
			setAdding( false );
			announceResult( __( 'Reminder added.', 'cliedesk' ) );
		},
	} );
	const update = useMutation( {
		mutationFn: ( v: { id: number; at: string; note: string } ) =>
			api.patch< Reminder >( `reminders/${ v.id }`, {
				body: { at: v.at, note: v.note },
			} ),
		onSuccess: () => {
			refresh();
			setEditing( null );
			announceResult( __( 'Reminder changed.', 'cliedesk' ) );
		},
	} );
	const remove = useMutation( {
		mutationFn: ( id: number ) => api.del( `reminders/${ id }` ),
		onSuccess: () => {
			refresh();
			announceResult( __( 'Reminder removed.', 'cliedesk' ) );
		},
	} );
	const items = q.data ?? [];
	return (
		<div className="flex flex-col gap-2">
			{ q.isPending && <Muted>{ __( 'Loading…', 'cliedesk' ) }</Muted> }
			{ q.isError && (
				<Muted>
					{ __( 'Could not load your reminders.', 'cliedesk' ) }
				</Muted>
			) }
			{ q.isSuccess && ! items.length && ! adding && (
				<Muted>{ __( 'No reminders.', 'cliedesk' ) }</Muted>
			) }
			{ items.length > 0 && (
				<ul className="flex flex-col gap-2 text-sm">
					{ items.map( ( r ) => (
						<li key={ r.id } className="flex flex-col gap-1">
							{ editing === r.id ? (
								<ReminderForm
									idPrefix={ `cd-reminder-${ r.id }` }
									initial={ r }
									submitLabel={ __(
										'Save reminder',
										'cliedesk'
									) }
									isLoading={ update.isPending }
									error={ update.error }
									onSubmit={ ( at, note ) =>
										update.mutate( { id: r.id, at, note } )
									}
									onCancel={ () => {
										setEditing( null );
										update.reset();
									} }
								/>
							) : (
								<>
									<p>
										<time dateTime={ r.at }>
											{ fullTime( r.at ) }
										</time>
										{ r.note ? ` · ${ r.note }` : '' }
									</p>
									<div className="flex gap-2">
										<Button
											size="sm"
											variant="ghost"
											aria-label={ sprintf(
												/* translators: %s: date and time. */
												__(
													'Change the reminder at %s',
													'cliedesk'
												),
												fullTime( r.at )
											) }
											onPress={ () => setEditing( r.id ) }
										>
											{ __( 'Change', 'cliedesk' ) }
										</Button>
										<Button
											size="sm"
											variant="ghost"
											aria-label={ sprintf(
												/* translators: %s: date and time. */
												__(
													'Remove the reminder at %s',
													'cliedesk'
												),
												fullTime( r.at )
											) }
											isLoading={
												remove.isPending &&
												remove.variables === r.id
											}
											onPress={ () =>
												remove.mutate( r.id )
											}
										>
											{ __( 'Remove', 'cliedesk' ) }
										</Button>
									</div>
								</>
							) }
						</li>
					) ) }
				</ul>
			) }
			<ActionError
				error={ remove.error }
				onDismiss={ () => remove.reset() }
			/>
			{ adding ? (
				<ReminderForm
					idPrefix="cd-reminder-new"
					submitLabel={ __( 'Add reminder', 'cliedesk' ) }
					isLoading={ create.isPending }
					error={ create.error }
					onSubmit={ ( at, note ) => create.mutate( { at, note } ) }
					onCancel={ () => {
						setAdding( false );
						create.reset();
					} }
				/>
			) : (
				<Button
					size="sm"
					className="self-start"
					onPress={ () => setAdding( true ) }
				>
					{ __( 'Remind me…', 'cliedesk' ) }
				</Button>
			) }
		</div>
	);
}
