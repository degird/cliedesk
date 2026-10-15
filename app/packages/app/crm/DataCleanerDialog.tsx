/**
 * Data cleaner (CRM-43): phones not in international format, emails that bounced, organizations without members and
 * old anonymous visitors. Nothing changes until the person selects fixes and applies them. AI-proposed fixes and
 * auto-apply come with Pro.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, Modal } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError, Muted } from '../inbox/components';
import { announceResult } from '../workspace/forms';

interface Item {
	id: number;
	label: string;
	detail: string;
	fix: string | null;
}

type Scan = Record< string, Item[] >;

const KEY = [ 'crm', 'cleaner' ] as const;

/**
 * Group titles and what the fix does.
 *
 * @param kind Kind.
 */
function kindText( kind: string ): {
	title: string;
	fix: ( value: string ) => string;
} {
	switch ( kind ) {
		case 'phone':
			return {
				title: __(
					'Phone numbers not in international format',
					'cliedesk'
				),
				fix: ( value ) =>
					/* translators: %s: phone number in international format. */
					sprintf( __( 'Change to %s', 'cliedesk' ), value ),
			};
		case 'bounced':
			return {
				title: __( 'Emails that bounced', 'cliedesk' ),
				fix: () =>
					__( 'Remove this email from the contact', 'cliedesk' ),
			};
		case 'empty_org':
			return {
				title: __( 'Organizations without members', 'cliedesk' ),
				fix: () => __( 'Delete the organization', 'cliedesk' ),
			};
		default:
			return {
				title: __( 'Visitors not seen for 90 days', 'cliedesk' ),
				fix: () => __( 'Delete the visitor', 'cliedesk' ),
			};
	}
}

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.onClose Close.
 */
export default function DataCleanerDialog( {
	onClose,
}: {
	onClose: () => void;
} ) {
	const qc = useQueryClient();
	const [ picked, setPicked ] = useState< string[] >( [] );
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< Scan >( 'crm/cleaner', { signal } ) ).data ?? {},
	} );
	const apply = useMutation( {
		mutationFn: async () =>
			(
				await api.post< { applied: number } >( 'crm/cleaner', {
					body: {
						fixes: picked.map( ( p ) => {
							const [ kind, id ] = p.split( ':' );
							return { kind, id: Number( id ) };
						} ),
					},
				} )
			).data,
		onSuccess: ( d ) => {
			setPicked( [] );
			announceResult(
				sprintf(
					/* translators: %d: number of fixes. */
					__( '%d fixes applied.', 'cliedesk' ),
					d?.applied ?? 0
				)
			);
			void qc.invalidateQueries( { queryKey: KEY } );
			void qc.invalidateQueries( { queryKey: [ 'contacts' ] } );
		},
	} );
	const groups = Object.entries( q.data ?? {} ).filter(
		( [ , items ] ) => Array.isArray( items ) && items.length > 0
	);
	return (
		<Modal
			isOpen
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Clean up data', 'cliedesk' ) }
			size="lg"
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Close', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isDisabled={ ! picked.length }
						isLoading={ apply.isPending }
						onPress={ () => apply.mutate() }
					>
						{ sprintf(
							/* translators: %d: number of selected fixes. */
							__( 'Apply %d selected', 'cliedesk' ),
							picked.length
						) }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<Muted>
					{ __(
						'Select the fixes to apply. Nothing changes until you apply them.',
						'cliedesk'
					) }
				</Muted>
				<ActionError error={ apply.error } />
				{ q.isSuccess && ! groups.length && (
					<p>{ __( 'Nothing needs care.', 'cliedesk' ) }</p>
				) }
				{ groups.map( ( [ kind, items ] ) => {
					const text = kindText( kind );
					return (
						<fieldset key={ kind } className="flex flex-col gap-1">
							<legend className="mb-1 font-medium">
								{ text.title }
							</legend>
							{ items.map( ( it ) => {
								const key = `${ kind }:${ it.id }`;
								const label = `${ it.label }${
									it.detail ? ` · ${ it.detail }` : ''
								}`;
								return it.fix ? (
									<Checkbox
										key={ key }
										isSelected={ picked.includes( key ) }
										onChange={ ( on ) =>
											setPicked(
												on
													? [ ...picked, key ]
													: picked.filter(
															( p ) => p !== key
														)
											)
										}
									>
										{ label } → { text.fix( it.fix ) }
									</Checkbox>
								) : (
									<p key={ key } className="text-sm">
										{ label } →{ ' ' }
										<span className="text-fg-muted">
											{ __( 'Fix by hand', 'cliedesk' ) }
										</span>
									</p>
								);
							} ) }
						</fieldset>
					);
				} ) }
			</div>
		</Modal>
	);
}
