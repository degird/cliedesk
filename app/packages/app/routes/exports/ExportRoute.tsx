/**
 * `/exports/$uid` (CRM-41): one export job, polled until it finishes, with Download (GET bulk/{uid}/download
 * returns a signed link valid for 15 minutes). The "export ready" email links here.
 */
import { isApiError, useQuery } from '@cliedesk/data';
import { LoadingRegion } from '@cliedesk/ui';
import { Link, useParams } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { JobProgress } from '../../crm/jobs';
import { jobQuery } from '../../crm/listApi';
import { QueryFailed } from '../../inbox/components';
import { NotFound } from '../NotFound';

const UID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Export page.
 */
export default function ExportRoute() {
	const params = useParams( { strict: false } ) as { uid?: string };
	const uid = String( params.uid ?? '' ).toUpperCase();
	const valid = UID.test( uid );
	const q = useQuery( { ...jobQuery( uid ), enabled: valid } );
	if ( ! valid ) {
		return <NotFound />;
	}
	if ( q.isError && isApiError( q.error ) && q.error.status === 404 ) {
		return <NotFound />;
	}
	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-4">
			<Link
				to="/contacts"
				className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
			>
				<ArrowLeft
					aria-hidden="true"
					size={ 14 }
					className="rtl:rotate-180"
				/>
				{ __( 'All contacts', 'cliedesk' ) }
			</Link>
			<PageHeader
				title={ __( 'Contact export', 'cliedesk' ) }
				description={ __(
					'The download link works for 15 minutes; open this page again for a new one.',
					'cliedesk'
				) }
			/>
			{ q.isPending && (
				<LoadingRegion
					label={ __( 'Loading the export…', 'cliedesk' ) }
				/>
			) }
			{ q.isError && (
				<QueryFailed
					title={ __( 'Could not load the export', 'cliedesk' ) }
					error={ q.error }
					onRetry={ () => void q.refetch() }
				/>
			) }
			{ q.isSuccess && (
				<JobProgress
					uid={ uid }
					label={ __( 'Contacts CSV', 'cliedesk' ) }
					download
					pageLink={ false }
				/>
			) }
		</div>
	);
}
