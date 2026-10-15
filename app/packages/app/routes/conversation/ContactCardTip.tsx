/**
 * Customer name with a contact card on hover or focus (INB-39): email, phone, organization, place and local time.
 * The card reads the contact already loaded for the conversation (no extra request when it is cached).
 */
import { useQuery } from '@cliedesk/data';
import { Tooltip, UnstyledButton } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { contactQuery } from '../../inbox/api';
import { localTime } from './CustomerChips';

/**
 * Card content.
 *
 * @param props    Props.
 * @param props.id Contact id.
 */
function Card( { id }: { id: number } ) {
	const q = useQuery( contactQuery( id ) );
	const c = q.data;
	if ( ! c ) {
		return <span>{ __( 'Loading…', 'cliedesk' ) }</span>;
	}
	const time = localTime( c.timezone, new Date() );
	const org = c.organizations?.[ 0 ]?.name;
	const place = [ c.city, c.country ].filter( Boolean ).join( ', ' );
	return (
		<span className="flex flex-col gap-0.5" data-cd-contact-card={ id }>
			<strong>
				<bdi>
					{ c.displayName || __( 'Unnamed contact', 'cliedesk' ) }
				</bdi>
			</strong>
			{ c.email && <span>{ c.email }</span> }
			{ c.phone && <span>{ c.phone }</span> }
			{ org && <span>{ org }</span> }
			{ place && <span>{ place }</span> }
			<span>
				{ time
					? sprintf(
							/* translators: %s: the customer's local time, e.g. 14:05. */
							__( 'Local time %s', 'cliedesk' ),
							time
						)
					: __( 'Local time unknown', 'cliedesk' ) }
			</span>
		</span>
	);
}

/**
 * The customer's name; hovering or focusing it opens the contact card.
 *
 * @param props      Props.
 * @param props.id   Contact id.
 * @param props.name Name shown.
 */
export function ContactCardTip( { id, name }: { id: number; name: string } ) {
	return (
		<Tooltip
			content={ <Card id={ id } /> }
			placement="bottom"
			delay={ 300 }
		>
			<UnstyledButton className="cursor-default rounded-sm font-semibold outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus">
				<bdi>{ name }</bdi>
			</UnstyledButton>
		</Tooltip>
	);
}
