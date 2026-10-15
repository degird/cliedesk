/**
 * `/organizations` (CRM-30): organizations with search (name or domain) and keyset pages ("Load more"),
 * plus "New organization" (cliedesk_edit_contacts).
 */
import { can, useInfiniteQuery } from '@cliedesk/data';
import { Button, EmptyState, LoadingRegion, TextField } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import { Plus, Search } from 'lucide-react';
import { Suspense, lazy, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { fetchOrgsPage, orgKeys } from '../../crm/api';
import { CreateOrgDialog } from '../../crm/CreateOrgDialog';
import { QueryFailed } from '../../inbox/components';

const th = 'px-4 py-2 text-start font-medium';

const ImportDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "contacts-import" */ '../../crm/ImportDialog'
		)
);

const OrgSourcesDialog = lazy(
	() =>
		import(
			/* webpackChunkName: "org-sources" */ '../../crm/OrgSourcesDialog'
		)
);

/**
 * Organizations screen.
 */
export default function OrganizationsRoute() {
	const [ input, setInput ] = useState( '' );
	const [ q, setQ ] = useState( '' );
	const [ creating, setCreating ] = useState( false );
	const [ importing, setImporting ] = useState( false );
	const [ sources, setSources ] = useState( false );
	const list = useInfiniteQuery( {
		queryKey: orgKeys.list( q ),
		queryFn: ( { pageParam, signal } ) =>
			fetchOrgsPage( q, pageParam, signal ),
		initialPageParam: null as string | null,
		getNextPageParam: ( last ) => last.nextCursor ?? undefined,
	} );
	const items = list.data?.pages.flatMap( ( p ) => p.items ) ?? [];
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		setQ( input.trim() );
	};
	return (
		<div className="mx-auto flex max-w-5xl flex-col">
			<PageHeader
				title={ __( 'Organizations', 'cliedesk' ) }
				description={ __(
					'Companies your contacts belong to.',
					'cliedesk'
				) }
				actions={
					<>
						<Button onPress={ () => setSources( true ) }>
							{ __( 'From plugins…', 'cliedesk' ) }
						</Button>
						{ can( 'cliedesk_import_data' ) && (
							<Button onPress={ () => setImporting( true ) }>
								{ __( 'Import…', 'cliedesk' ) }
							</Button>
						) }
						{ can( 'cliedesk_edit_contacts' ) && (
							<Button
								variant="primary"
								iconStart={
									<Plus aria-hidden="true" size={ 14 } />
								}
								onPress={ () => setCreating( true ) }
							>
								{ __( 'New organization', 'cliedesk' ) }
							</Button>
						) }
					</>
				}
			/>
			{ sources && (
				<Suspense fallback={ null }>
					<OrgSourcesDialog onClose={ () => setSources( false ) } />
				</Suspense>
			) }
			{ importing && (
				<Suspense fallback={ null }>
					<ImportDialog
						entity="organization"
						onClose={ () => setImporting( false ) }
					/>
				</Suspense>
			) }
			<form
				role="search"
				noValidate
				onSubmit={ submit }
				className="flex items-end gap-2 pb-4"
			>
				<TextField
					className="flex-1"
					label={ __( 'Search organizations', 'cliedesk' ) }
					description={ __( 'Name or domain.', 'cliedesk' ) }
					inputMode="search"
					value={ input }
					onChange={ setInput }
				/>
				<Button
					type="submit"
					iconStart={ <Search aria-hidden="true" size={ 14 } /> }
				>
					{ __( 'Search', 'cliedesk' ) }
				</Button>
			</form>
			{ list.isPending && (
				<LoadingRegion
					label={ __( 'Loading organizations…', 'cliedesk' ) }
				/>
			) }
			{ list.isError && (
				<QueryFailed
					title={ __(
						'Could not load the organizations',
						'cliedesk'
					) }
					error={ list.error }
					onRetry={ () => void list.refetch() }
				/>
			) }
			{ list.isSuccess &&
				items.length === 0 &&
				( q ? (
					<p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-fg-muted">
						{ __(
							'No organizations match your search.',
							'cliedesk'
						) }
					</p>
				) : (
					// ADM-04: every empty state offers a way to start.
					<EmptyState
						title={ __( 'No organizations yet.', 'cliedesk' ) }
						description={ __(
							'Group contacts by company, for example everyone writing from @acme.com, to see their conversations together.',
							'cliedesk'
						) }
						actions={
							<>
								{ can( 'cliedesk_edit_contacts' ) && (
									<Button
										variant="primary"
										onPress={ () => setCreating( true ) }
									>
										{ __(
											'Add your first organization',
											'cliedesk'
										) }
									</Button>
								) }
								<Button onPress={ () => setSources( true ) }>
									{ __( 'From plugins…', 'cliedesk' ) }
								</Button>
							</>
						}
					/>
				) ) }
			{ items.length > 0 && (
				<div className="overflow-x-auto rounded-lg border border-line bg-surface">
					<table className="w-full text-start text-sm">
						<caption className="sr-only">
							{ __( 'Organizations', 'cliedesk' ) }
						</caption>
						<thead className="border-b border-line text-fg-muted">
							<tr>
								<th scope="col" className={ th }>
									{ __( 'Name', 'cliedesk' ) }
								</th>
								<th scope="col" className={ th }>
									{ __( 'Domains', 'cliedesk' ) }
								</th>
								<th scope="col" className={ th }>
									{ __( 'Parent', 'cliedesk' ) }
								</th>
								<th
									scope="col"
									className="px-4 py-2 text-end font-medium"
								>
									{ __( 'Members', 'cliedesk' ) }
								</th>
							</tr>
						</thead>
						<tbody>
							{ items.map( ( o ) => (
								<tr
									key={ o.id }
									className="border-b border-line last:border-b-0"
								>
									<td className="px-4 py-2">
										<Link
											to="/organizations/$orgId"
											params={ { orgId: String( o.id ) } }
											className="font-medium text-accent-fg underline-offset-2 hover:underline"
										>
											<bdi>{ o.name }</bdi>
										</Link>
									</td>
									<td className="px-4 py-2">
										<bdi>{ o.domains.join( ', ' ) }</bdi>
									</td>
									<td className="px-4 py-2">
										<bdi>{ o.parentName ?? '' }</bdi>
									</td>
									<td className="cd-tabular px-4 py-2 text-end">
										{ o.memberCount }
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
			) }
			{ list.hasNextPage && (
				<Button
					className="mt-4 self-center"
					isLoading={ list.isFetchingNextPage }
					onPress={ () => void list.fetchNextPage() }
				>
					{ __( 'Load more', 'cliedesk' ) }
				</Button>
			) }
			{ creating && (
				<CreateOrgDialog onClose={ () => setCreating( false ) } />
			) }
		</div>
	);
}
