/**
 * Send split-button (INB-49): the main button sends with the default choice (the team's "Default send action", from
 * GET …/drafts → postSend); the menu next to it offers Send, Send & resolve, Send & wait and Send & snooze (which
 * asks for a time: tomorrow 9:00, Monday 9:00 or a custom time). "After sending, assign to" optionally changes the
 * assignee in the same request.
 */
import { can, getBoot } from '@cliedesk/data';
import {
	Button,
	Menu,
	MenuItem,
	Modal,
	RadioGroup,
	Select,
	TextField,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { ChevronDown } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAgents } from '../../inbox/components';
import { shortWhen, snoozeValue } from '../../inbox/snooze';
import {
	POST_SEND,
	postSendLabel,
	postSendPresets,
	utcValue,
	type AfterAssignee,
	type PostSend,
} from './compose';

/**
 * Label of the main send button for the default choice.
 *
 * @param a Choice.
 */
export function sendButtonLabel( a: PostSend ): string {
	switch ( a ) {
		case 'resolve':
			return __( 'Send & resolve', 'cliedesk' );
		case 'wait':
			return __( 'Send & wait', 'cliedesk' );
		case 'snooze':
			return __( 'Send & snooze…', 'cliedesk' );
		default:
			return __( 'Send reply', 'cliedesk' );
	}
}

/**
 * Main button and menu.
 *
 * @param props               Props.
 * @param props.defaultAction Default choice.
 * @param props.isLoading     Sending.
 * @param props.onSend        Send with a choice.
 */
export function SendSplitButton( {
	defaultAction,
	isLoading,
	onSend,
}: {
	defaultAction: PostSend;
	isLoading: boolean;
	onSend: ( action: PostSend ) => void;
} ) {
	return (
		<span className="inline-flex items-center gap-0.5">
			<Button type="submit" variant="primary" isLoading={ isLoading }>
				{ sendButtonLabel( defaultAction ) }
			</Button>
			<Menu
				aria-label={ __( 'Send options', 'cliedesk' ) }
				placement="top start"
				onAction={ ( k ) => onSend( k as PostSend ) }
				trigger={
					<Button
						variant="primary"
						aria-label={ __( 'More send options', 'cliedesk' ) }
						isDisabled={ isLoading }
						className="px-2"
					>
						<ChevronDown aria-hidden="true" size={ 16 } />
					</Button>
				}
			>
				{ POST_SEND.map( ( a ) => (
					<MenuItem key={ a } id={ a }>
						{ a === defaultAction
							? sprintf(
									/* translators: %s: send choice, e.g. "Send & resolve". */
									__( '%s (default)', 'cliedesk' ),
									postSendLabel( a )
								)
							: postSendLabel( a ) }
					</MenuItem>
				) ) }
			</Menu>
		</span>
	);
}

type Preset = 'tomorrow' | 'monday' | 'custom';

/**
 * Send & snooze: when the conversation comes back.
 *
 * @param props           Props.
 * @param props.onClose   Close.
 * @param props.onConfirm Send with the wake-up time (UTC).
 * @param props.isLoading Sending.
 */
export function SnoozeSendDialog( {
	onClose,
	onConfirm,
	isLoading,
}: {
	onClose: () => void;
	onConfirm: ( until: string ) => void;
	isLoading: boolean;
} ) {
	const [ preset, setPreset ] = useState< Preset >( 'tomorrow' );
	const [ custom, setCustom ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const presets = postSendPresets( new Date() );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		// The dialog is rendered inside the composer form (React tree): do not submit that one too.
		e.stopPropagation();
		let until: string | null = null;
		if ( preset === 'custom' ) {
			until = snoozeValue( custom );
		} else {
			until = utcValue( presets[ preset ] );
		}
		if ( ! until || new Date( until ).getTime() <= Date.now() ) {
			setError( __( 'Choose a time in the future.', 'cliedesk' ) );
			return;
		}
		onConfirm( until );
	};
	return (
		<Modal
			isOpen
			size="sm"
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'Send & snooze', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-send-snooze"
						variant="primary"
						isLoading={ isLoading }
					>
						{ __( 'Send and snooze', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-send-snooze"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<RadioGroup
					label={ __( 'Snooze until', 'cliedesk' ) }
					value={ preset }
					onChange={ ( v ) => {
						setPreset( v as Preset );
						setError( null );
					} }
					options={ [
						{
							id: 'tomorrow',
							label: sprintf(
								/* translators: %s: day and time. */
								__( 'Tomorrow at 9:00 (%s)', 'cliedesk' ),
								shortWhen( presets.tomorrow )
							),
						},
						{
							id: 'monday',
							label: sprintf(
								/* translators: %s: day and time. */
								__( 'Monday at 9:00 (%s)', 'cliedesk' ),
								shortWhen( presets.monday )
							),
						},
						{
							id: 'custom',
							label: __( 'Pick a date and time', 'cliedesk' ),
						},
					] }
				/>
				<TextField
					label={ __( 'Wake up at', 'cliedesk' ) }
					description={ __( 'Your time zone.', 'cliedesk' ) }
					type="datetime-local"
					value={ custom }
					onChange={ ( v ) => {
						setCustom( v );
						setPreset( 'custom' );
						setError( null );
					} }
					errorMessage={ error }
				/>
			</form>
		</Modal>
	);
}

const KEEP = 'keep';

/**
 * "After sending, assign to": keep, me, unassigned or a person (people need cliedesk_assign_others).
 *
 * @param props          Props.
 * @param props.value    Choice.
 * @param props.onChange Change.
 */
export function AfterSendAssignee( {
	value,
	onChange,
}: {
	value: AfterAssignee;
	onChange: ( v: AfterAssignee ) => void;
} ) {
	const { agents } = useAgents();
	const canSelf = can( 'cliedesk_assign_self' );
	const canOthers = can( 'cliedesk_assign_others' );
	if ( ! canSelf && ! canOthers ) {
		return null;
	}
	const me = getBoot().user?.id ?? 0;
	const options = [
		{ id: KEEP, label: __( 'Keep the assignee', 'cliedesk' ) },
		{ id: 'me', label: __( 'Me', 'cliedesk' ) },
		...( canOthers
			? [
					{ id: 'none', label: __( 'Unassigned', 'cliedesk' ) },
					...agents
						.filter(
							( a ) =>
								a.userId !== me && a.status !== 'deactivated'
						)
						.map( ( a ) => ( {
							id: String( a.userId ),
							label: a.name,
						} ) ),
				]
			: [] ),
	];
	return (
		<Select
			className="min-w-48"
			label={ __( 'After sending, assign to', 'cliedesk' ) }
			value={ String( value ) }
			options={ options }
			onChange={ ( id ) => {
				if ( id === KEEP || id === 'me' || id === 'none' ) {
					onChange( id );
				} else {
					onChange( Number( id ) );
				}
			} }
		/>
	);
}
