/**
 * Preview, then confirm (COM-40): a commerce action button that first asks the server for a dry-run preview (what
 * changes, which emails go to whom, amounts, gateway refund support, warnings) and runs the action only after the
 * person confirms what they see. Used by the order resend button (COM-11) and the customer account actions
 * (COM-36, COM-37). Lazy: only loaded with those panels.
 *
 * - POST {path} {...body, preview: true} → preview; POST {path} {...body} → result.
 */
import { api, useMutation } from '@cliedesk/data';
import { Button } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../inbox/components';
import { announceResult } from '../workspace/forms';

export interface CommercePreview {
	preview: true;
	changes: string[];
	emails: { email: string; title: string; recipient: string }[];
	amounts: { label: string; amount: number; currency: string }[];
	warnings: string[];
	gateway: { title: string; apiRefunds: boolean; reason: string } | null;
}

/**
 * What the action would do.
 *
 * @param props         Props.
 * @param props.preview Preview.
 */
export function PreviewBox( { preview }: { preview: CommercePreview } ) {
	return (
		<div
			className="flex flex-col gap-1 rounded-md border border-line p-2 text-xs"
			aria-live="polite"
		>
			<p className="font-medium">
				{ __( 'This will happen:', 'cliedesk' ) }
			</p>
			<ul className="list-disc ps-4">
				{ preview.changes.map( ( c ) => (
					<li key={ c }>{ c }</li>
				) ) }
				{ preview.emails.map( ( e ) => (
					<li key={ `${ e.email }:${ e.recipient }` }>
						{ sprintf(
							/* translators: 1: email title, 2: email address. */
							__( 'Email “%1$s” to %2$s', 'cliedesk' ),
							e.title,
							e.recipient
						) }
					</li>
				) ) }
				{ preview.amounts.map( ( a ) => (
					<li key={ a.label }>
						{ a.label }: { a.amount } { a.currency }
					</li>
				) ) }
			</ul>
			{ preview.warnings.map( ( w ) => (
				<p key={ w } className="text-warning">
					{ w }
				</p>
			) ) }
		</div>
	);
}

/**
 * A button that previews, then runs after confirmation.
 *
 * @param props                Props.
 * @param props.label          Button label.
 * @param props.path           REST path (no leading slash).
 * @param props.body           Input.
 * @param props.disabledReason Why the action cannot run ('' when it can).
 * @param props.done           Message announced after it ran.
 * @param props.onDone         Called after it ran.
 */
export function PreviewAction( {
	label,
	path,
	body,
	disabledReason = '',
	done,
	onDone,
}: {
	label: string;
	path: string;
	body: Record< string, unknown >;
	disabledReason?: string;
	done: string;
	onDone?: () => void;
} ) {
	const [ preview, setPreview ] = useState< CommercePreview | null >( null );
	const ask = useMutation( {
		mutationFn: async () =>
			( await api.post( path, { body: { ...body, preview: true } } ) )
				.data as CommercePreview,
		onSuccess: setPreview,
	} );
	const run = useMutation( {
		mutationFn: () => api.post( path, { body } ),
		onSuccess: () => {
			setPreview( null );
			announceResult( done );
			onDone?.();
		},
	} );
	return (
		<div className="flex flex-col gap-1">
			<ActionError error={ ask.error ?? run.error } />
			{ preview ? (
				<>
					<PreviewBox preview={ preview } />
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="primary"
							isLoading={ run.isPending }
							onPress={ () => run.mutate() }
						>
							{ __( 'Confirm', 'cliedesk' ) }
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onPress={ () => {
								setPreview( null );
								run.reset();
							} }
						>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
					</div>
				</>
			) : (
				<div>
					<Button
						size="sm"
						variant="secondary"
						isDisabled={ disabledReason !== '' }
						isLoading={ ask.isPending }
						onPress={ () => {
							run.reset();
							ask.mutate();
						} }
					>
						{ label }
					</Button>
					{ disabledReason !== '' && (
						<Muted>{ disabledReason }</Muted>
					) }
				</div>
			) }
		</div>
	);
}
