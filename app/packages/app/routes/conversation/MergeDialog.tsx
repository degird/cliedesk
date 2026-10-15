/**
 * Merge conversations into this one (CNV-43): enter the numbers to merge, preview (timeline, choices, warnings),
 * pick which conversation keeps the subject, requester, assignee and priority, add an optional note, merge.
 * The success toast offers Undo (POST conversations/merges/{mergeId}/undo).
 */
import { api, can, useMutation, useQueryClient } from '@cliedesk/data';
import {
	Banner,
	Button,
	Checkbox,
	Modal,
	RadioGroup,
	TextField,
	toast,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState, type FormEvent } from 'react';
import {
	conversationKeys,
	inboxKeys,
	type Conversation,
	type MergePreview,
} from '../../inbox/api';
import { ActionError, actionMessage } from '../../inbox/components';
import { textToHtml } from '../../inbox/html';
import { priorityLabel } from '../../inbox/labels';

const CHOICES = [ 'subject', 'requester', 'assignee', 'priority' ] as const;

/**
 * Conversation numbers typed by the agent ("1001, #1002 1003").
 *
 * @param text Input.
 */
export function parseNumbers( text: string ): number[] {
	return [
		...new Set(
			( text.match( /\d+/g ) ?? [] )
				.map( Number )
				.filter( ( n ) => n > 0 )
		),
	];
}

function choiceLabel( key: string ): string {
	switch ( key ) {
		case 'subject':
			return __( 'Keep the subject of', 'cliedesk' );
		case 'requester':
			return __( 'Keep the customer of', 'cliedesk' );
		case 'assignee':
			return __( 'Keep the assignee of', 'cliedesk' );
		case 'priority':
			return __( 'Keep the priority of', 'cliedesk' );
	}
	return key;
}

/**
 * Merge dialog.
 *
 * @param props              Props.
 * @param props.conversation Target conversation.
 * @param props.onClose      Close.
 */
export default function MergeDialog( {
	conversation: c,
	initialNumbers = [],
	onClose,
}: {
	conversation: Conversation;
	/** Numbers to merge, filled in and previewed at once (bulk merge). */
	initialNumbers?: number[];
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ numbers, setNumbers ] = useState( initialNumbers.join( ', ' ) );
	const [ inputError, setInputError ] = useState< string | null >( null );
	const [ sources, setSources ] = useState<
		Array< { id: number; number: number } >
	>( [] );
	const [ preview, setPreview ] = useState< MergePreview | null >( null );
	const [ choices, setChoices ] = useState< Record< string, string > >( {} );
	const [ note, setNote ] = useState( '' );
	const [ isPublic, setPublic ] = useState( false );

	const load = useMutation( {
		mutationFn: async ( list: number[] ) => {
			const found: Array< { id: number; number: number } > = [];
			for ( const n of list ) {
				const r = await api.get< { id: number; number: number } >(
					`conversations/number/${ n }`
				);
				if ( r.data.id !== c.id ) {
					found.push( r.data );
				}
			}
			if ( ! found.length ) {
				throw new Error(
					__(
						'Enter the number of another conversation.',
						'cliedesk'
					)
				);
			}
			const p = await api.post< MergePreview >(
				`conversations/${ c.id }/merge/preview`,
				{
					body: { sourceIds: found.map( ( f ) => f.id ) },
				}
			);
			return { found, preview: p.data };
		},
		onSuccess: ( r ) => {
			setSources( r.found );
			setPreview( r.preview );
			setChoices(
				Object.fromEntries(
					CHOICES.map( ( k ) => [ k, String( c.id ) ] )
				)
			);
		},
	} );
	// Bulk merge arrives with the numbers: preview them at once.
	const loadNow = load.mutate;
	const initial = initialNumbers.join( ',' );
	useEffect( () => {
		if ( initial ) {
			loadNow( initial.split( ',' ).map( Number ) );
		}
	}, [ initial, loadNow ] );
	const merge = useMutation( {
		mutationFn: () =>
			api.post< { mergeId: number } >( `conversations/${ c.id }/merge`, {
				body: {
					sourceIds: sources.map( ( s ) => s.id ),
					choices: Object.fromEntries(
						Object.entries( choices ).map( ( [ k, v ] ) => [
							k,
							Number( v ),
						] )
					),
					...( note.trim()
						? {
								note: {
									html: textToHtml( note ),
									public: isPublic,
								},
							}
						: {} ),
				},
			} ),
		onSuccess: ( r ) => {
			const mergeId = r.data.mergeId;
			void qc.invalidateQueries( {
				queryKey: conversationKeys.all( c.id ),
			} );
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: conversation number. */
					__( 'Conversations merged into #%d.', 'cliedesk' ),
					c.number
				),
				timeout: 15000,
				action: {
					label: __( 'Undo', 'cliedesk' ),
					onAction: () =>
						void api
							.post( `conversations/merges/${ mergeId }/undo` )
							.then( () => {
								void qc.invalidateQueries( {
									queryKey: conversationKeys.all( c.id ),
								} );
								void qc.invalidateQueries( {
									queryKey: inboxKeys.all,
								} );
								toast( {
									tone: 'success',
									title: __( 'Merge undone.', 'cliedesk' ),
								} );
							} )
							.catch( ( e ) =>
								toast( {
									tone: 'danger',
									title: __(
										'Could not undo the merge.',
										'cliedesk'
									),
									description: actionMessage( e ),
								} )
							),
				},
			} );
			onClose();
		},
	} );

	const submitNumbers = ( e: FormEvent ) => {
		e.preventDefault();
		const list = parseNumbers( numbers );
		if ( ! list.length ) {
			setInputError(
				__( 'Enter one or more conversation numbers.', 'cliedesk' )
			);
			return;
		}
		setInputError( null );
		load.mutate( list );
	};
	const numberOf = ( id: number ) =>
		id === c.id
			? c.number
			: ( sources.find( ( s ) => s.id === id )?.number ?? id );
	const valueText = ( key: string, v: string | number | null ) => {
		if ( v === null || v === '' ) {
			return __( 'none', 'cliedesk' );
		}
		return key === 'priority' ? priorityLabel( String( v ) ) : String( v );
	};

	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ sprintf(
				/* translators: %d: conversation number. */
				__( 'Merge into #%d', 'cliedesk' ),
				c.number
			) }
			size="lg"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					{ preview && (
						<Button
							variant="primary"
							isLoading={ merge.isPending }
							onPress={ () => merge.mutate() }
						>
							{ __( 'Merge conversations', 'cliedesk' ) }
						</Button>
					) }
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<form
					noValidate
					onSubmit={ submitNumbers }
					className="flex flex-wrap items-end gap-2"
				>
					<TextField
						className="min-w-60 flex-1"
						label={ __(
							'Conversations to merge into this one',
							'cliedesk'
						) }
						description={ __(
							'Conversation numbers, separated by commas.',
							'cliedesk'
						) }
						value={ numbers }
						onChange={ setNumbers }
						errorMessage={ inputError }
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
					/>
					<Button type="submit" isLoading={ load.isPending }>
						{ __( 'Preview', 'cliedesk' ) }
					</Button>
				</form>
				<ActionError
					error={ load.error }
					onDismiss={ () => load.reset() }
				/>
				<ActionError
					error={ merge.error }
					onDismiss={ () => merge.reset() }
				/>
				{ preview && (
					<>
						{ preview.warnings.map( ( w ) => (
							<Banner
								key={ w.code }
								tone="warning"
								title={ w.message }
							/>
						) ) }
						<p>
							{ sprintf(
								/* translators: %d: number of messages. */
								__(
									'%d messages will be in the merged conversation, in time order.',
									'cliedesk'
								),
								preview.timeline.length
							) }
						</p>
						{ CHOICES.filter( ( k ) => preview.choices[ k ] ).map(
							( k ) => (
								<RadioGroup
									key={ k }
									label={ choiceLabel( k ) }
									value={ choices[ k ] ?? String( c.id ) }
									onChange={ ( v ) =>
										setChoices( ( o ) => ( {
											...o,
											[ k ]: v,
										} ) )
									}
									options={ (
										preview.choices[ k ] ?? []
									).map( ( o ) => ( {
										id: String( o.conversationId ),
										label: sprintf(
											/* translators: 1: conversation number, 2: value. */
											__( '#%1$d: %2$s', 'cliedesk' ),
											numberOf( o.conversationId ),
											valueText( k, o.value )
										),
									} ) ) }
								/>
							)
						) }
						<TextField
							label={ __(
								'Note about the merge (optional)',
								'cliedesk'
							) }
							multiline
							rows={ 3 }
							value={ note }
							onChange={ setNote }
						/>
						{ can( 'cliedesk_reply_conversations' ) && (
							<Checkbox
								isSelected={ isPublic }
								onChange={ setPublic }
							>
								{ __(
									'Send the note to the customer',
									'cliedesk'
								) }
							</Checkbox>
						) }
					</>
				) }
			</div>
		</Modal>
	);
}
