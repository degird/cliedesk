/**
 * New conversation (INB-55): an agent starts a conversation with a customer by email (or logs a call as a note).
 * POST conversations {productId, email, name, subject, html, asNote?, priority?, assigneeId?, typeId?, values?} →
 * /c/{number}. CNV-31: the chosen type's agent form (fields shown and required by its conditions) is filled in here
 * and checked again by the server.
 * COM-07: opened from a WooCommerce order (`orderId`), the customer and subject come from the order and the order is
 * linked to the new conversation.
 */
import {
	api,
	can,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import {
	Button,
	Checkbox,
	Modal,
	Select,
	TextField,
	toast,
} from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { useMultiProduct } from '../../multiProduct';
import { linkRecord } from '../../crm/records';
import {
	PRIORITIES,
	inboxKeys,
	typeFormQuery,
	typesQuery,
	type Conversation,
	type FieldDef,
	type FormField,
	type Priority,
} from '../../inbox/api';
import { FieldInput, fromDraft } from '../../inbox/FieldInput';
import { useAgents } from '../../inbox/components';
import { textToHtml } from '../../inbox/html';
import {
	CallFields,
	callPayload,
	type CallValues,
} from '../conversation/CallLog';
import { priorityLabel } from '../../inbox/labels';
import {
	ErrorSummary,
	SaveError,
	apiFieldErrors,
	validateEmail,
	type SummaryItem,
} from '../../workspace/forms';

type Field = 'productId' | 'email' | 'name' | 'subject' | 'html';
const fid = ( f: Field ) => `cd-new-conv-${ f }`;
const formFieldId = ( key: string ) => `cd-new-conv-field-${ key }`;
const ME = 'me';

/**
 * A form field as a field definition (for the shared input).
 *
 * @param f Form field.
 */
export const formDef = ( f: FormField ): FieldDef => ( {
	id: 0,
	key: f.key,
	scope: 'conversation',
	type: f.type,
	label: f.label,
	settings: {},
	archived: false,
	sort: 0,
	options: f.options ?? undefined,
	readonly: f.readonly,
} );

/**
 * API values of the form drafts (empty ones left out).
 *
 * @param fields Form fields.
 * @param drafts Drafts by key.
 * @param shown  Only visible fields.
 */
export function formValues(
	fields: FormField[],
	drafts: Record< string, unknown >,
	shown = false
): Record< string, unknown > {
	const out: Record< string, unknown > = {};
	for ( const f of fields ) {
		if ( shown && ! f.visible ) {
			continue;
		}
		const value = fromDraft( formDef( f ), drafts[ f.key ], null );
		if ( value !== null && ! ( f.type === 'boolean' && value === false ) ) {
			out[ f.key ] = value;
		}
	}
	return out;
}

/**
 * A value that follows its source after a pause (form conditions refetch once typing stops).
 *
 * @param value Value.
 * @param ms    Pause.
 */
function useSettled< T >( value: T, ms: number ): T {
	const [ settled, setSettled ] = useState( value );
	const key = JSON.stringify( value );
	useEffect( () => {
		const t = window.setTimeout( () => setSettled( value ), ms );
		return () => window.clearTimeout( t );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the JSON key stands for the value.
	}, [ key, ms ] );
	return settled;
}
const NOBODY = 'none';

export interface NewConversationValues {
	productId: string;
	email: string;
	name: string;
	subject: string;
	body: string;
	asNote: boolean;
	/** VOX-01: log a phone call instead of sending. */
	call?: CallValues | null;
	priority: Priority;
	assignee: string;
}

/**
 * Client checks.
 *
 * @param v Values.
 */
export function validateNewConversation(
	v: NewConversationValues
): Partial< Record< Field, string > > {
	const out: Partial< Record< Field, string > > = {};
	if ( ! v.productId ) {
		out.productId = __( 'Choose a product.', 'cliedesk' );
	}
	if ( v.email.trim() === '' ) {
		out.email = __( 'Enter the customer’s email address.', 'cliedesk' );
	} else {
		const e = validateEmail( v.email );
		if ( e ) {
			out.email = e;
		}
	}
	if ( v.subject.trim() === '' ) {
		out.subject = __( 'Enter a subject.', 'cliedesk' );
	} else if ( v.subject.length > 255 ) {
		out.subject = __( 'Enter up to 255 characters.', 'cliedesk' );
	}
	if ( v.body.trim() === '' ) {
		out.html = __( 'Write a message.', 'cliedesk' );
	}
	return out;
}

/**
 * Request body.
 *
 * @param v  Values.
 * @param me Current user id.
 */
export function newConversationPayload(
	v: NewConversationValues,
	me: number | null
) {
	let assigneeId: number | null = null;
	if ( v.assignee === ME ) {
		assigneeId = me;
	} else if ( v.assignee !== NOBODY ) {
		assigneeId = Number( v.assignee );
	}
	let how: Record< string, unknown > = {};
	if ( v.call ) {
		how = { call: callPayload( v.call ) };
	} else if ( v.asNote ) {
		how = { asNote: true };
	}
	return {
		productId: Number( v.productId ),
		email: v.email.trim(),
		...( v.name.trim() ? { name: v.name.trim() } : {} ),
		subject: v.subject.trim(),
		html: textToHtml( v.body ),
		...how,
		priority: v.priority,
		assigneeId,
	};
}

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.onClose Close.
 * @param props.orderId WooCommerce order to start from (COM-07).
 * @param props.prefill Fields from a pre-filled address (INB-55): email, name, subject, body, type (key or id), queue.
 */
export default function NewConversationDialog( {
	onClose,
	orderId = null,
	prefill: start = null,
}: {
	onClose: () => void;
	orderId?: number | null;
	prefill?: {
		email: string;
		name: string;
		subject: string;
		body: string;
		type: string;
		queue: number | null;
	} | null;
} ) {
	const boot = getBoot();
	const multi = useMultiProduct();
	const qc = useQueryClient();
	const navigate = useNavigate();
	const { agents } = useAgents();
	const [ v, setV ] = useState< NewConversationValues >( {
		productId: boot.products[ 0 ] ? String( boot.products[ 0 ].id ) : '',
		email: start?.email ?? '',
		name: start?.name ?? '',
		subject: start?.subject ?? '',
		body: start?.body ?? '',
		asNote: false,
		priority: 'normal',
		assignee: ME,
	} );
	const [ submitted, setSubmitted ] = useState( false );
	const order = useQuery( {
		queryKey: [ 'orders', orderId, 'detail' ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< {
					number: string;
					customer: { name: string; email: string };
				} >( `orders/${ orderId }`, { signal } )
			).data,
		enabled: orderId !== null && can( 'cliedesk_view_orders' ),
	} );
	const prefill = order.data;
	useEffect( () => {
		if ( prefill ) {
			setV( ( o ) => ( {
				...o,
				email: o.email || prefill.customer.email,
				name: o.name || prefill.customer.name,
				subject:
					o.subject ||
					sprintf(
						/* translators: %s: order number. */
						__( 'Order #%s', 'cliedesk' ),
						prefill.number
					),
			} ) );
		}
	}, [ prefill ] );
	const types = useQuery( typesQuery() ).data ?? [];
	const startType = types.find(
		( t ) => t.key === start?.type || String( t.id ) === start?.type
	);
	const [ pickedType, setPickedType ] = useState( '' );
	useEffect( () => {
		if ( startType && ! pickedType ) {
			setPickedType( String( startType.id ) );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ startType?.id ] );
	const typeId =
		pickedType ||
		String(
			( types.find( ( t ) => t.key === 'conversation' ) ?? types[ 0 ] )
				?.id ?? ''
		);
	const [ drafts, setDrafts ] = useState< Record< string, unknown > >( {} );
	const [ fields, setFields ] = useState< FormField[] >( [] );
	const conditionValues = useSettled( formValues( fields, drafts ), 300 );
	const form = useQuery( {
		...typeFormQuery( Number( typeId ), conditionValues ),
		enabled: typeId !== '',
	} );
	useEffect( () => {
		// Placeholder data is the previous answer (maybe another type): keep the fields until the fresh one.
		if ( form.data && ! form.isPlaceholderData ) {
			setFields( form.data );
		}
	}, [ form.data, form.isPlaceholderData ] );
	const shownFields = fields.filter( ( f ) => f.visible );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const create = useMutation( {
		mutationFn: (
			body: ReturnType< typeof newConversationPayload > & {
				typeId?: number;
				values?: string;
			}
		) => api.post< Conversation >( 'conversations', { body } ),
		onSuccess: async ( r ) => {
			if ( start?.queue ) {
				await api
					.post( `conversations/${ r.data.id }/move`, {
						body: { queueId: start.queue },
					} )
					.catch( () => undefined );
			}
			if ( orderId !== null ) {
				await linkRecord(
					'conversation',
					r.data.id,
					'woo_order',
					String( orderId )
				).catch( () => undefined );
			}
			void qc.invalidateQueries( { queryKey: inboxKeys.all } );
			toast( {
				tone: 'success',
				title: sprintf(
					/* translators: %d: conversation number. */
					__( 'Conversation #%d started.', 'cliedesk' ),
					r.data.number
				),
			} );
			onClose();
			void navigate( {
				to: '/c/$number',
				params: { number: String( r.data.number ) },
			} );
		},
		onError: ( e ) => {
			const f = apiFieldErrors( e );
			setSummary(
				Object.entries( f ).map( ( [ k, msg ] ) => {
					if ( k.startsWith( 'values.' ) ) {
						return {
							fieldId: formFieldId( k.slice( 7 ) ),
							message: msg,
						};
					}
					return {
						fieldId: fid(
							( [
								'productId',
								'email',
								'name',
								'subject',
							].includes( k )
								? k
								: 'html' ) as Field
						),
						message: msg,
					};
				} )
			);
		},
	} );
	const server = apiFieldErrors( create.error );
	const client = submitted ? validateNewConversation( v ) : {};
	const err = ( f: Field ) => client[ f ] ?? server[ f ] ?? null;
	const missing = ( list: FormField[] ) =>
		list.filter(
			( f ) => f.required && ! ( f.key in formValues( [ f ], drafts ) )
		);
	const fieldErr = ( f: FormField ) =>
		( submitted && missing( [ f ] ).length
			? __( 'This field is required.', 'cliedesk' )
			: null ) ??
		server[ `values.${ f.key }` ] ??
		null;
	const upd = < K extends keyof NewConversationValues >(
		k: K,
		value: NewConversationValues[ K ]
	) => setV( ( o ) => ( { ...o, [ k ]: value } ) );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		setSubmitted( true );
		const errors = validateNewConversation( v );
		const items = [
			...( Object.keys( errors ) as Field[] ).map( ( f ) => ( {
				fieldId: fid( f ),
				message: errors[ f ] as string,
			} ) ),
			...missing( shownFields ).map( ( f ) => ( {
				fieldId: formFieldId( f.key ),
				message: sprintf(
					/* translators: %s: field label. */
					__( '%s is required.', 'cliedesk' ),
					f.label
				),
			} ) ),
		];
		setSummary( items );
		if ( ! items.length ) {
			create.mutate( {
				...newConversationPayload( v, boot.user?.id ?? null ),
				...( fields.length
					? {
							typeId: Number( typeId ),
							values: JSON.stringify(
								formValues( fields, drafts, true )
							),
						}
					: {} ),
			} );
		}
	};
	const assignees = [
		{ id: ME, label: __( 'Me', 'cliedesk' ) },
		{ id: NOBODY, label: __( 'Unassigned', 'cliedesk' ) },
		...agents
			.filter(
				( a ) =>
					a.userId !== boot.user?.id && a.status !== 'deactivated'
			)
			.map( ( a ) => ( { id: String( a.userId ), label: a.name } ) ),
	];
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={ __( 'New conversation', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-new-conversation"
						variant="primary"
						isLoading={ create.isPending }
					>
						{ v.asNote || v.call
							? __( 'Log conversation', 'cliedesk' )
							: __( 'Send', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-new-conversation"
				noValidate
				onSubmit={ onSubmit }
				className="flex flex-col gap-4"
			>
				<ErrorSummary items={ summary } />
				{ ! Object.keys( server ).length && (
					<SaveError
						error={ create.error }
						title={ __(
							'Could not start the conversation',
							'cliedesk'
						) }
					/>
				) }
				{ multi && (
					<Select
						id={ fid( 'productId' ) }
						label={ __( 'Product', 'cliedesk' ) }
						isRequired
						value={ v.productId || null }
						onChange={ ( x ) => upd( 'productId', x ) }
						errorMessage={ err( 'productId' ) }
						options={ boot.products.map( ( p ) => ( {
							id: String( p.id ),
							label: p.name,
						} ) ) }
					/>
				) }
				{ types.length > 1 && (
					<Select
						label={ __( 'Type', 'cliedesk' ) }
						value={ typeId || null }
						onChange={ ( x ) => {
							setPickedType( x );
							setDrafts( {} );
							setFields( [] );
						} }
						options={ types.map( ( t ) => ( {
							id: String( t.id ),
							label: t.name,
						} ) ) }
					/>
				) }
				<div className="grid gap-4 sm:grid-cols-2">
					<TextField
						id={ fid( 'email' ) }
						label={ __( 'Customer email', 'cliedesk' ) }
						inputMode="email"
						isRequired
						value={ v.email }
						onChange={ ( x ) => upd( 'email', x ) }
						errorMessage={ err( 'email' ) }
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
					/>
					<TextField
						id={ fid( 'name' ) }
						label={ __( 'Customer name', 'cliedesk' ) }
						value={ v.name }
						onChange={ ( x ) => upd( 'name', x ) }
						errorMessage={ err( 'name' ) }
					/>
				</div>
				<TextField
					id={ fid( 'subject' ) }
					label={ __( 'Subject', 'cliedesk' ) }
					isRequired
					value={ v.subject }
					onChange={ ( x ) => upd( 'subject', x ) }
					errorMessage={ err( 'subject' ) }
				/>
				<TextField
					id={ fid( 'html' ) }
					label={
						v.asNote
							? __( 'Note', 'cliedesk' )
							: __( 'Message', 'cliedesk' )
					}
					multiline
					rows={ 6 }
					isRequired
					value={ v.body }
					onChange={ ( x ) => upd( 'body', x ) }
					errorMessage={ err( 'html' ) }
				/>
				{ shownFields.length > 0 && (
					<fieldset className="flex flex-col gap-3">
						<legend className="pb-1 font-medium">
							{ __( 'Form', 'cliedesk' ) }
						</legend>
						{ shownFields.map( ( f ) => (
							<FieldInput
								key={ f.key }
								def={ formDef( f ) }
								id={ formFieldId( f.key ) }
								draft={ drafts[ f.key ] }
								onChange={ ( x ) =>
									setDrafts( ( o ) => ( {
										...o,
										[ f.key ]: x,
									} ) )
								}
								required={ f.required }
								readOnly={ f.readonly }
								locked={ f.readonly }
								error={ fieldErr( f ) }
							/>
						) ) }
					</fieldset>
				) }
				<Checkbox
					isSelected={ v.asNote }
					onChange={ ( x ) => upd( 'asNote', x ) }
				>
					{ __(
						'Log as an internal note; nothing is sent',
						'cliedesk'
					) }
				</Checkbox>
				<Checkbox
					isSelected={ !! v.call }
					onChange={ ( on ) =>
						setV( ( x ) => ( {
							...x,
							call: on
								? {
										direction: 'inbound',
										number: '',
										minutes: '',
									}
								: null,
						} ) )
					}
				>
					{ __( 'Log a phone call; nothing is sent', 'cliedesk' ) }
				</Checkbox>
				{ v.call && (
					<CallFields
						value={ v.call }
						onChange={ ( call ) =>
							setV( ( x ) => ( { ...x, call } ) )
						}
					/>
				) }
				<div className="grid gap-4 sm:grid-cols-2">
					<Select
						label={ __( 'Priority', 'cliedesk' ) }
						value={ v.priority }
						onChange={ ( x ) => upd( 'priority', x as Priority ) }
						options={ PRIORITIES.map( ( p ) => ( {
							id: p,
							label: priorityLabel( p ),
						} ) ) }
					/>
					<Select
						label={ __( 'Assignee', 'cliedesk' ) }
						value={ v.assignee }
						onChange={ ( x ) => upd( 'assignee', x ) }
						options={ assignees }
					/>
				</div>
			</form>
		</Modal>
	);
}
