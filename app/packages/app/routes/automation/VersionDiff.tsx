/**
 * Saved reply history: what a version changed compared with the one before it (MAC-16). Reads both snapshots
 * (GET saved-replies/{id}/versions/{version}) and shows changed fields and a line diff per language.
 */
import { api, queryOptions, useQuery } from '@cliedesk/data';
import { Button, LoadingRegion, Modal, cx } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Muted, QueryFailed } from '../../inbox/components';
import {
	fieldChanges,
	variantChanges,
	type DiffLine,
	type Snapshot,
} from '../../macros/diff';

export const versionSnapshotQuery = ( id: number, version: number ) =>
	queryOptions( {
		queryKey: [ 'saved-replies', 'version', id, version ] as const,
		queryFn: async ( { signal } ) =>
			(
				await api.get< { version: number; snapshot: Snapshot } >(
					`saved-replies/${ id }/versions/${ version }`,
					{ signal }
				)
			).data.snapshot,
		staleTime: Infinity,
	} );

const MARK: Record< DiffLine[ 'kind' ], string > = {
	same: ' ',
	add: '+',
	del: '−',
};

function Lines( { lines }: { lines: DiffLine[] } ) {
	return (
		<ol className="overflow-x-auto rounded-md border border-line font-mono text-xs">
			{ lines.map( ( l, i ) => (
				<li
					key={ i }
					className={ cx(
						'flex gap-2 whitespace-pre-wrap px-2 py-0.5',
						l.kind === 'add' && 'bg-success-subtle',
						l.kind === 'del' && 'bg-danger-subtle'
					) }
				>
					<span aria-hidden="true">{ MARK[ l.kind ] }</span>
					<span className="sr-only">
						{ l.kind === 'add' && __( 'Added:', 'cliedesk' ) }
						{ l.kind === 'del' && __( 'Removed:', 'cliedesk' ) }
					</span>
					<span>{ l.text || ' ' }</span>
				</li>
			) ) }
		</ol>
	);
}

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.replyId Saved reply id.
 * @param props.version Version to explain (compared with version - 1).
 * @param props.onClose Close.
 */
export function VersionDiff( {
	replyId,
	version,
	onClose,
}: {
	replyId: number;
	version: number;
	onClose: () => void;
} ) {
	const before = useQuery( versionSnapshotQuery( replyId, version - 1 ) );
	const after = useQuery( versionSnapshotQuery( replyId, version ) );
	const none = __( '(empty)', 'cliedesk' );
	let body;
	if ( before.isPending || after.isPending ) {
		body = (
			<LoadingRegion label={ __( 'Loading versions…', 'cliedesk' ) } />
		);
	} else if ( before.isError || after.isError ) {
		body = (
			<QueryFailed
				headingLevel={ 3 }
				title={ __( 'Could not load the versions', 'cliedesk' ) }
				error={ before.error ?? after.error }
				onRetry={ () => {
					void before.refetch();
					void after.refetch();
				} }
			/>
		);
	} else {
		const fields = fieldChanges( before.data, after.data );
		const texts = variantChanges( before.data, after.data );
		body =
			fields.length || texts.length ? (
				<div className="flex flex-col gap-5">
					{ fields.length > 0 && (
						<table className="w-full text-start text-sm">
							<caption className="sr-only">
								{ __( 'Changed settings', 'cliedesk' ) }
							</caption>
							<thead className="text-xs text-fg-muted">
								<tr>
									<th
										scope="col"
										className="py-1 pe-3 font-medium"
									>
										{ __( 'Setting', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="py-1 pe-3 font-medium"
									>
										{ __( 'Before', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="py-1 font-medium"
									>
										{ __( 'After', 'cliedesk' ) }
									</th>
								</tr>
							</thead>
							<tbody>
								{ fields.map( ( f ) => (
									<tr
										key={ f.label }
										className="border-t border-line align-top"
									>
										<th
											scope="row"
											className="py-2 pe-3 font-medium"
										>
											{ f.label }
										</th>
										<td className="break-all py-2 pe-3">
											{ f.before || none }
										</td>
										<td className="break-all py-2">
											{ f.after || none }
										</td>
									</tr>
								) ) }
							</tbody>
						</table>
					) }
					{ texts.map( ( t ) => (
						<section
							key={ t.language }
							aria-labelledby={ `cd-diff-${ t.language }` }
							className="flex flex-col gap-2"
						>
							<h3
								id={ `cd-diff-${ t.language }` }
								className="text-sm font-semibold"
							>
								{ sprintf(
									/* translators: %s: language code. */
									__( 'Text (%s)', 'cliedesk' ),
									t.language || __( 'default', 'cliedesk' )
								) }
							</h3>
							{ t.subject && (
								<p className="text-sm">
									{ sprintf(
										/* translators: 1: old subject, 2: new subject. */
										__(
											'Subject: %1$s → %2$s',
											'cliedesk'
										),
										t.subject.before || none,
										t.subject.after || none
									) }
								</p>
							) }
							<Lines lines={ t.lines } />
						</section>
					) ) }
				</div>
			) : (
				<Muted>
					{ __( 'Nothing changed in this version.', 'cliedesk' ) }
				</Muted>
			);
	}
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ sprintf(
				/* translators: 1: version number, 2: previous version number. */
				__( 'Version %1$d compared with version %2$d', 'cliedesk' ),
				version,
				version - 1
			) }
			footer={
				<Button onPress={ onClose }>
					{ __( 'Close', 'cliedesk' ) }
				</Button>
			}
		>
			{ body }
		</Modal>
	);
}
