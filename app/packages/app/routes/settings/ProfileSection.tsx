/**
 * Settings → Team & roles → My profile (TEAM-05, TEAM-06): the signed-in user's own profile. Also reachable from
 * the account menu.
 */
import { useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { profileQuery } from '../../team/api';
import { QueryError } from '../../team/components';
import { ProfileForm } from '../../team/ProfileForm';
import { SessionsSection } from '../../team/Sessions';
import { FocusSwitch } from '../../components/FocusGuard';

/**
 * My profile section.
 */
export default function ProfileSection() {
	const q = useQuery( profileQuery() );
	if ( q.isPending ) {
		return (
			<LoadingRegion
				label={ __( 'Loading your profile…', 'cliedesk' ) }
			/>
		);
	}
	if ( q.isError ) {
		return (
			<QueryError
				title={ __( 'Could not load your profile', 'cliedesk' ) }
				error={ q.error }
				onRetry={ () => void q.refetch() }
			/>
		);
	}
	return (
		<>
			<ProfileForm profile={ q.data } mode="self" />
			<FocusSwitch />
			<SessionsSection />
		</>
	);
}
