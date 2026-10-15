/**
 * Settings → Workspace → Field access (SEC-08, CNV-17), for people with cliedesk_manage_settings: for each
 * conversation, contact and organization field, "Protected" (`settings.protected`: only server code, signed identity
 * or the API can change it) and, for conversation fields, "Editable after close" (`settings.editableAfterClose`:
 * closed conversations lock their fields except these; people who manage settings can always edit).
 * Saved with PATCH fields/{id} {settings: {protected, editableAfterClose}}; the server merges settings key by key, so
 * the field's other settings stay as they are.
 *
 * Hidden and read-only fields per role and team (TEAM-20) are Pro: they fill the `fields.access` slot with the fields
 * of the chosen scope.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import {
	Button,
	Checkbox,
	LoadingRegion,
	Modal,
	Select,
	Slot,
} from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { fieldsQuery, type FieldDef } from '../../inbox/api';
import { ActionError, Muted, Pill, QueryFailed } from '../../inbox/components';
import { announceResult } from '../../workspace/forms';

type Scope = 'conversation' | 'contact' | 'organization';

function scopeLabel( s: Scope ): string {
	switch ( s ) {
		case 'conversation':
			return __( 'Conversation fields', 'cliedesk' );
		case 'contact':
			return __( 'Contact fields', 'cliedesk' );
		case 'organization':
			return __( 'Organization fields', 'cliedesk' );
	}
	return s;
}

/**
 * "Protected" and "Editable after close" dialog.
 *
 * @param props         Props.
 * @param props.field   Field.
 * @param props.onClose Close.
 */
function FieldAccessDialog( {
	field,
	onClose,
}: {
	field: FieldDef;
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ isProtected, setProtected ] = useState(
		field.settings?.protected === true
	);
	const conversation = field.scope === 'conversation';
	const [ afterClose, setAfterClose ] = useState(
		field.settings?.editableAfterClose === true
	);
	const save = useMutation( {
		mutationFn: () =>
			api.patch< FieldDef >( `fields/${ field.id }`, {
				body: {
					settings: {
						protected: isProtected,
						...( conversation
							? { editableAfterClose: afterClose }
							: {} ),
					},
				},
			} ),
		onSuccess: () => {
			void qc.invalidateQueries( { queryKey: [ 'fields' ] } );
			announceResult(
				sprintf(
					/* translators: %s: field label. */
					__( 'Access to %s saved.', 'cliedesk' ),
					field.label
				)
			);
			onClose();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: %s: field label. */
				__( 'Who can change “%s”', 'cliedesk' ),
				field.label
			) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-field-access"
						variant="primary"
						isLoading={ save.isPending }
					>
						{ __( 'Save', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-field-access"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-5"
			>
				<ActionError
					error={ save.error }
					onDismiss={ () => save.reset() }
				/>
				<div className="flex flex-col gap-1">
					<Checkbox
						isSelected={ isProtected }
						onChange={ setProtected }
					>
						{ __( 'Protected', 'cliedesk' ) }
					</Checkbox>
					<p className="text-sm text-fg-muted">
						{ __(
							'Only server code, signed identity or the API can change it (browser and widget changes are ignored).',
							'cliedesk'
						) }
					</p>
				</div>
				{ conversation && (
					<div className="flex flex-col gap-1">
						<Checkbox
							isSelected={ afterClose }
							onChange={ setAfterClose }
						>
							{ __( 'Editable after close', 'cliedesk' ) }
						</Checkbox>
						<p className="text-sm text-fg-muted">
							{ __(
								'Closed conversations lock their fields. Agents can still change this one, for example a follow-up note or a refund reference. People who manage settings can always edit.',
								'cliedesk'
							) }
						</p>
					</div>
				) }
			</form>
		</Modal>
	);
}

/**
 * Section.
 */
export default function FieldAccessSection() {
	const [ scope, setScope ] = useState< Scope >( 'conversation' );
	const [ editing, setEditing ] = useState< FieldDef | null >( null );
	const list = useQuery( fieldsQuery( scope ) );
	const fields = list.data ?? [];
	return (
		<div className="flex flex-col gap-6">
			<p className="text-fg-muted">
				{ __(
					'Choose which custom fields only server code can change, and which conversation fields stay editable after close.',
					'cliedesk'
				) }
			</p>
			<Select
				className="max-w-xs"
				label={ __( 'Fields of', 'cliedesk' ) }
				value={ scope }
				onChange={ ( s ) => setScope( s as Scope ) }
				options={ (
					[ 'conversation', 'contact', 'organization' ] as Scope[]
				 ).map( ( s ) => ( { id: s, label: scopeLabel( s ) } ) ) }
			/>
			{ list.isPending && (
				<LoadingRegion label={ __( 'Loading fields…', 'cliedesk' ) } />
			) }
			{ list.isError && (
				<QueryFailed
					title={ __( 'Could not load the fields', 'cliedesk' ) }
					error={ list.error }
					onRetry={ () => void list.refetch() }
				/>
			) }
			{ list.isSuccess && ! fields.length && (
				<Muted>{ __( 'No fields here yet.', 'cliedesk' ) }</Muted>
			) }
			{ fields.length > 0 && (
				<div className="overflow-x-auto rounded-lg border border-line bg-surface">
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ scopeLabel( scope ) }
						</caption>
						<thead className="border-b border-line text-fg-muted">
							<tr>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									{ __( 'Field', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									{ __( 'Who can change it', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="px-3 py-2 text-start font-medium"
								>
									<span className="sr-only">
										{ __( 'Actions', 'cliedesk' ) }
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{ fields.map( ( f ) => (
								<tr
									key={ f.id }
									className="border-b border-line last:border-b-0"
								>
									<td className="px-3 py-2">
										<span className="flex flex-col">
											<span className="font-medium">
												<bdi>{ f.label }</bdi>
											</span>
											<code className="text-xs text-fg-muted">
												{ f.key }
											</code>
										</span>
									</td>
									<td className="px-3 py-2">
										<span className="flex flex-wrap gap-1">
											{ f.settings?.protected === true ? (
												<Pill tone="accent">
													{ __(
														'Protected',
														'cliedesk'
													) }
												</Pill>
											) : (
												<Pill>
													{ __(
														'Everyone who can edit fields',
														'cliedesk'
													) }
												</Pill>
											) }
											{ f.settings?.editableAfterClose ===
												true && (
												<Pill>
													{ __(
														'Editable after close',
														'cliedesk'
													) }
												</Pill>
											) }
										</span>
									</td>
									<td className="px-3 py-2">
										<Button
											size="sm"
											variant="ghost"
											aria-label={ sprintf(
												/* translators: %s: field label. */
												__(
													'Who can change %s',
													'cliedesk'
												),
												f.label
											) }
											onPress={ () => setEditing( f ) }
										>
											{ __( 'Change', 'cliedesk' ) }
										</Button>
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
			) }
			<Slot name="fields.access" fillProps={ { fields } } />
			{ editing && (
				<FieldAccessDialog
					field={ editing }
					onClose={ () => setEditing( null ) }
				/>
			) }
		</div>
	);
}
