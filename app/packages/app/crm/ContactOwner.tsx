/**
 * Contact owner (CRM-23): the agent responsible for a customer, shown on the contact page and the customer card.
 * People with cliedesk_edit_contacts change it with the agent picker (PATCH contacts/{id} {ownerId} with If-Match);
 * "No owner" sends null. The server answers 400 `ownerId` when the person is not an agent.
 */
import { api, can, useMutation, useQueryClient } from '@cliedesk/data';
import { Select } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { contactKeys, normaliseContact, type Contact } from '../inbox/api';
import { ActionError, useAgents } from '../inbox/components';
import { versionTag } from '../workspace/api';
import { announceResult } from '../workspace/forms';

const NONE = '0';

/**
 * Owner picker (or the owner's name without the right to edit).
 *
 * @param props         Props.
 * @param props.contact Contact.
 * @param props.version Version the screen knows (If-Match).
 * @param props.onSaved Saved contact.
 * @param props.compact Smaller text (customer card).
 */
export function ContactOwner( {
	contact,
	version,
	onSaved,
	compact = false,
}: {
	contact: Contact;
	version?: number;
	onSaved?: ( c: Contact ) => void;
	compact?: boolean;
} ) {
	const qc = useQueryClient();
	const { agents, nameFor } = useAgents();
	const owner = contact.ownerId ?? null;
	const save = useMutation( {
		mutationFn: ( ownerId: number | null ) =>
			api.patch< Contact >( `contacts/${ contact.id }`, {
				body: { ownerId },
				ifMatch: versionTag( version ?? contact.version ),
			} ),
		onSuccess: ( r ) => {
			const next = normaliseContact( r.data );
			qc.setQueryData( contactKeys.detail( contact.id ), next );
			void qc.invalidateQueries( { queryKey: [ 'contacts' ] } );
			onSaved?.( next );
			announceResult( __( 'Owner changed.', 'cliedesk' ) );
		},
	} );
	const ownerName =
		owner === null
			? null
			: ( nameFor( owner ) ??
				sprintf(
					/* translators: %d: user id. */
					__( 'Agent #%d', 'cliedesk' ),
					owner
				) );
	if ( ! can( 'cliedesk_edit_contacts' ) ) {
		return (
			<p className={ compact ? 'text-sm' : undefined }>
				{ ownerName ?? (
					<span className="text-fg-muted">
						{ __( 'No owner', 'cliedesk' ) }
					</span>
				) }
			</p>
		);
	}
	const options = [
		{ id: NONE, label: __( 'No owner', 'cliedesk' ) },
		...agents
			.filter( ( a ) => a.status !== 'deactivated' || a.userId === owner )
			.map( ( a ) => ( { id: String( a.userId ), label: a.name } ) ),
	];
	if (
		owner !== null &&
		! options.some( ( o ) => o.id === String( owner ) )
	) {
		options.push( { id: String( owner ), label: ownerName ?? '' } );
	}
	return (
		<div className="flex flex-col gap-1">
			<Select
				id={ `cd-contact-owner-${ contact.id }` }
				label={ __( 'Owner', 'cliedesk' ) }
				description={
					compact
						? undefined
						: __(
								'The agent responsible for this customer. They can be notified when the customer writes in.',
								'cliedesk'
							)
				}
				value={ owner === null ? NONE : String( owner ) }
				isDisabled={ save.isPending }
				options={ options }
				onChange={ ( id ) => {
					const next = id === NONE ? null : Number( id );
					if ( next !== owner ) {
						save.mutate( next );
					}
				} }
			/>
			<ActionError
				error={ save.error }
				onDismiss={ () => save.reset() }
			/>
		</div>
	);
}
