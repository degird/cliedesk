/**
 * Create a tracker (CNV-05) for a bug, outage or request and link conversations to it as its items, or add
 * conversations to an existing tracker by its number. Used from the conversation side panel (this conversation) and
 * the inbox bulk bar (the selected conversations).
 */
import { getBoot, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Modal, Select, TextField, toast } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { inboxKeys } from './api';
import { ActionError } from './components';
import { textToHtml } from './html';
import { addToTrackerNumber, createTracker } from './tasks';
import { announceResult, apiFieldErrors } from '../workspace/forms';

/**
 * Dialog.
 *
 * @param props                 Props.
 * @param props.conversationIds Conversations to link as items.
 * @param props.productId       Default product.
 * @param props.onClose         Close.
 * @param props.onCreated       Created (tracker id).
 */
export function TrackerDialog( {
	conversationIds,
	productId,
	onClose,
	onCreated,
}: {
	conversationIds: number[];
	productId: number | null;
	onClose: () => void;
	onCreated?: ( id: number ) => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const products = getBoot().products ?? [];
	const [ subject, setSubject ] = useState( '' );
	const [ details, setDetails ] = useState( '' );
	const [ product, setProduct ] = useState< string | null >(
		productId !== null
			? String( productId )
			: ( products[ 0 ] && String( products[ 0 ].id ) ) || null
	);
	const [ error, setError ] = useState< string | null >( null );
	const run = useMutation( {
		mutationFn: () =>
			createTracker( {
				productId: Number( product ),
				subject: subject.trim(),
				...( details.trim() ? { html: textToHtml( details ) } : {} ),
				conversationIds,
			} ),
		onSuccess: ( t ) => {
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			for ( const id of conversationIds ) {
				void qc.invalidateQueries( {
					queryKey: [ 'conversation', id ],
				} );
			}
			announceResult( __( 'Tracker created.', 'cliedesk' ) );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: tracker number. */
					__( 'Tracker #%d created.', 'cliedesk' ),
					t?.number ?? 0
				),
				action: t?.number
					? {
							label: __( 'Open tracker', 'cliedesk' ),
							onAction: () =>
								void navigate( {
									to: '/c/$number',
									params: { number: String( t.number ) },
								} ),
						}
					: undefined,
			} );
			if ( t?.id ) {
				onCreated?.( t.id );
			}
			onClose();
		},
	} );
	const server = apiFieldErrors( run.error );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		if ( ! subject.trim() ) {
			setError( __( 'Enter a subject.', 'cliedesk' ) );
			return;
		}
		setError( null );
		run.mutate();
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Create a tracker', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-tracker-form"
						variant="primary"
						isLoading={ run.isPending }
					>
						{ __( 'Create tracker', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-tracker-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: %d: number of conversations. */
						_n(
							'A tracker groups conversations about the same bug, outage or request. %d conversation will be linked to it.',
							'A tracker groups conversations about the same bug, outage or request. %d conversations will be linked to it.',
							conversationIds.length,
							'cliedesk'
						),
						conversationIds.length
					) }
				</p>
				<ActionError
					error={ run.error }
					onDismiss={ () => run.reset() }
				/>
				<TextField
					label={ __( 'Subject', 'cliedesk' ) }
					value={ subject }
					onChange={ setSubject }
					isRequired
					maxLength={ 255 }
					errorMessage={ error ?? server.subject ?? null }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				{ products.length > 1 && (
					<Select
						label={ __( 'Product', 'cliedesk' ) }
						value={ product }
						onChange={ setProduct }
						options={ products.map( ( p ) => ( {
							id: String( p.id ),
							label: p.name,
						} ) ) }
						errorMessage={ server.productId ?? null }
					/>
				) }
				<TextField
					label={ __( 'Details', 'cliedesk' ) }
					description={ __(
						'Internal: customers never see trackers.',
						'cliedesk'
					) }
					multiline
					rows={ 4 }
					value={ details }
					onChange={ setDetails }
				/>
			</form>
		</Modal>
	);
}

/** Most conversations POST trackers/{id}/items takes at once. */
export const MAX_TRACKER_ITEMS = 500;

/**
 * Add conversations to an existing tracker, found by its number (POST trackers/{id}/items).
 *
 * @param props                 Props.
 * @param props.conversationIds Conversations to add.
 * @param props.onClose         Close.
 * @param props.onAdded         Added (tracker id).
 */
export function AddToTrackerDialog( {
	conversationIds,
	onClose,
	onAdded,
}: {
	conversationIds: number[];
	onClose: () => void;
	onAdded?: ( id: number ) => void;
} ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ number, setNumber ] = useState( '' );
	const [ error, setError ] = useState< string | null >( null );
	const run = useMutation( {
		mutationFn: ( n: number ) =>
			addToTrackerNumber( n, conversationIds ).then( ( id ) => ( {
				id,
				n,
			} ) ),
		onSuccess: ( { id, n } ) => {
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			void qc.invalidateQueries( { queryKey: [ 'conversation', id ] } );
			for ( const c of conversationIds ) {
				void qc.invalidateQueries( {
					queryKey: [ 'conversation', c ],
				} );
			}
			announceResult( __( 'Added to the tracker.', 'cliedesk' ) );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: 1: number of conversations, 2: tracker number. */
					_n(
						'%1$d conversation added to tracker #%2$d.',
						'%1$d conversations added to tracker #%2$d.',
						conversationIds.length,
						'cliedesk'
					),
					conversationIds.length,
					n
				),
				action: {
					label: __( 'Open tracker', 'cliedesk' ),
					onAction: () =>
						void navigate( {
							to: '/c/$number',
							params: { number: String( n ) },
						} ),
				},
			} );
			onAdded?.( id );
			onClose();
		},
	} );
	const tooMany = conversationIds.length > MAX_TRACKER_ITEMS;
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		const n = Number( number.replace( /^#/, '' ).trim() );
		if ( ! Number.isInteger( n ) || n <= 0 ) {
			setError(
				__( 'Enter a tracker number, such as 1042.', 'cliedesk' )
			);
			return;
		}
		setError( null );
		run.mutate( n );
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Add to an existing tracker', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-add-tracker-form"
						variant="primary"
						isDisabled={ tooMany }
						isLoading={ run.isPending }
					>
						{ __( 'Add to tracker', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-add-tracker-form"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ tooMany
						? sprintf(
								/* translators: %d: most conversations at once. */
								__(
									'Select at most %d conversations to add them to a tracker.',
									'cliedesk'
								),
								MAX_TRACKER_ITEMS
							)
						: sprintf(
								/* translators: %d: number of conversations. */
								_n(
									'%d conversation will be linked to the tracker as an item.',
									'%d conversations will be linked to the tracker as items.',
									conversationIds.length,
									'cliedesk'
								),
								conversationIds.length
							) }
				</p>
				<ActionError
					error={ run.error }
					onDismiss={ () => run.reset() }
				/>
				<TextField
					label={ __( 'Tracker number', 'cliedesk' ) }
					inputMode="numeric"
					value={ number }
					onChange={ ( v ) => {
						setNumber( v );
						setError( null );
					} }
					isRequired
					errorMessage={ error }
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
			</form>
		</Modal>
	);
}
