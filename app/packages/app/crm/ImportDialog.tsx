/**
 * Import contacts from a CSV file (CRM-42): choose the file, check what each column goes to (suggested from the
 * header), optionally check the file first (dry run: new, updated and rows with errors, nothing written), then
 * import. The import runs as a job; rows with errors end up in an error file to download.
 * POST contacts/import/preview {csv} → {header, sample, rows, mapping}; POST contacts/import {csv, mapping, mode,
 * dryRun?} → {dryRun} or {job}.
 */
import { api, isApiError, useMutation, useQuery } from '@cliedesk/data';
import { Banner, Button, Modal, RadioGroup, Select } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useId, useState } from 'react';
import { fieldsQuery } from '../inbox/api';
import { ActionError } from '../inbox/components';
import { JobProgress, openDownload } from './jobs';
import { jobQuery, type BulkJob } from './listApi';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Text of a file.
 *
 * @param file File.
 */
const readText = ( file: File ) =>
	new Promise< string >( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () => resolve( String( reader.result ?? '' ) );
		reader.onerror = () => reject( reader.error );
		reader.readAsText( file );
	} );

interface Preview {
	header: string[];
	sample: string[][];
	rows: number;
	mapping: string[];
}

interface DryRun {
	rows: number;
	create: number;
	merge: number;
	errors: number;
	problems: { line: number; message: string }[];
}

/**
 * Names of the built-in targets.
 */
export function importTargets(): { id: string; label: string }[] {
	return [
		{ id: 'skip', label: __( 'Do not import', 'cliedesk' ) },
		{ id: 'name', label: __( 'Name', 'cliedesk' ) },
		{ id: 'email', label: __( 'Email', 'cliedesk' ) },
		{ id: 'phone', label: __( 'Phone', 'cliedesk' ) },
		{ id: 'external_id', label: __( 'External ID', 'cliedesk' ) },
		{ id: 'language', label: __( 'Language', 'cliedesk' ) },
		{ id: 'timezone', label: __( 'Time zone', 'cliedesk' ) },
		{ id: 'country', label: __( 'Country', 'cliedesk' ) },
		{ id: 'city', label: __( 'City', 'cliedesk' ) },
		{ id: 'tags', label: __( 'Tags (separated by ;)', 'cliedesk' ) },
	];
}

/**
 * Names of the organization targets (CRM-42).
 */
export function organizationTargets(): { id: string; label: string }[] {
	return [
		{ id: 'skip', label: __( 'Do not import', 'cliedesk' ) },
		{ id: 'name', label: __( 'Name', 'cliedesk' ) },
		{ id: 'domains', label: __( 'Domains (separated by ;)', 'cliedesk' ) },
		{ id: 'tags', label: __( 'Tags (separated by ;)', 'cliedesk' ) },
	];
}

/**
 * Dialog.
 *
 * @param props         Props.
 * @param props.onClose Close.
 */
export default function ImportDialog( {
	onClose,
	entity = 'contact',
}: {
	onClose: () => void;
	entity?: 'contact' | 'organization';
} ) {
	const orgs = entity === 'organization';
	const fileId = useId();
	const [ csv, setCsv ] = useState< string | null >( null );
	const [ fileError, setFileError ] = useState< string | null >( null );
	const [ mapping, setMapping ] = useState< string[] >( [] );
	const [ mode, setMode ] = useState( 'fill' );
	const [ dry, setDry ] = useState< DryRun | null >( null );
	const [ job, setJob ] = useState< BulkJob | null >( null );
	const fields = useQuery( fieldsQuery( entity ) ).data ?? [];
	const preview = useMutation( {
		mutationFn: ( text: string ) =>
			api.post< Preview >( 'contacts/import/preview', {
				body: { csv: text, entity },
			} ),
		onSuccess: ( r ) => setMapping( r.data.mapping ),
	} );
	const run = useMutation( {
		mutationFn: ( dryRun: boolean ) =>
			api.post< { dryRun?: DryRun; job?: BulkJob } >( 'contacts/import', {
				body: { csv, mapping, mode, dryRun, entity },
			} ),
		onSuccess: ( r ) => {
			if ( r.data.dryRun ) {
				setDry( r.data.dryRun );
			}
			if ( r.data.job ) {
				setJob( r.data.job );
			}
		},
	} );
	const head = preview.data?.data;
	const targets = [
		...( orgs ? organizationTargets() : importTargets() ),
		...fields
			.filter( ( f ) => ! f.archived )
			.map( ( f ) => ( {
				id: `field:${ f.key }`,
				label: sprintf(
					/* translators: %s: custom field name. */
					__( 'Field: %s', 'cliedesk' ),
					f.label
				),
			} ) ),
	];
	const choose = async ( file: File | undefined ) => {
		setDry( null );
		setJob( null );
		if ( ! file ) {
			return;
		}
		if ( file.size > MAX_BYTES ) {
			setFileError(
				__(
					'The file is larger than 10 MB. Split it into smaller files.',
					'cliedesk'
				)
			);
			return;
		}
		setFileError( null );
		const text = await readText( file );
		setCsv( text );
		preview.mutate( text );
	};
	const mappingError =
		isApiError( run.error ) && run.error.fields?.mapping
			? run.error.fields.mapping
			: null;
	const result = job?.result as
		| { created?: number; merged?: number; errors?: number }
		| null
		| undefined;
	return (
		<Modal
			isOpen
			onOpenChange={ ( open ) => ! open && onClose() }
			title={
				orgs
					? __( 'Import organizations', 'cliedesk' )
					: __( 'Import contacts', 'cliedesk' )
			}
			size="lg"
			footer={
				job ? (
					<Button onPress={ onClose }>
						{ __( 'Close', 'cliedesk' ) }
					</Button>
				) : (
					<>
						<Button onPress={ onClose }>
							{ __( 'Cancel', 'cliedesk' ) }
						</Button>
						<Button
							isDisabled={ ! head }
							isLoading={
								run.isPending && run.variables === true
							}
							onPress={ () => run.mutate( true ) }
						>
							{ __( 'Check file', 'cliedesk' ) }
						</Button>
						<Button
							variant="primary"
							isDisabled={ ! head }
							isLoading={
								run.isPending && run.variables === false
							}
							onPress={ () => run.mutate( false ) }
						>
							{ __( 'Import', 'cliedesk' ) }
						</Button>
					</>
				)
			}
		>
			<div className="flex flex-col gap-4">
				{ ! job && (
					<div className="flex flex-col gap-1">
						<label
							htmlFor={ fileId }
							className="text-sm font-medium"
						>
							{ __( 'CSV file', 'cliedesk' ) }
						</label>
						<input
							id={ fileId }
							type="file"
							accept=".csv,text/csv"
							aria-describedby={ `${ fileId }-help` }
							onChange={ ( e ) =>
								void choose( e.target.files?.[ 0 ] )
							}
							className="text-sm"
						/>
						<p
							id={ `${ fileId }-help` }
							className="text-sm text-fg-muted"
						>
							{ orgs
								? __(
										'One organization per row, with a header row. Rows that match an existing organization by domain or name update it.',
										'cliedesk'
									)
								: __(
										'One contact per row, with a header row. Each row needs an email address or a phone number: rows that match an existing contact update it.',
										'cliedesk'
									) }
						</p>
						{ fileError && (
							<p role="alert" className="text-sm text-danger">
								{ fileError }
							</p>
						) }
					</div>
				) }
				<ActionError error={ preview.error } />
				{ head && ! job && (
					<>
						<p className="text-sm">
							{ sprintf(
								/* translators: %d: number of rows. */
								_n(
									'%d row found.',
									'%d rows found.',
									head.rows,
									'cliedesk'
								),
								head.rows
							) }
						</p>
						<table className="w-full text-sm">
							<caption className="sr-only">
								{ __(
									'What each column contains',
									'cliedesk'
								) }
							</caption>
							<thead>
								<tr className="text-start text-fg-muted">
									<th
										scope="col"
										className="py-1 text-start font-medium"
									>
										{ __( 'Column', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="py-1 text-start font-medium"
									>
										{ __( 'Example', 'cliedesk' ) }
									</th>
									<th
										scope="col"
										className="py-1 text-start font-medium"
									>
										{ __( 'Import as', 'cliedesk' ) }
									</th>
								</tr>
							</thead>
							<tbody>
								{ head.header.map( ( name, i ) => (
									<tr
										key={ i }
										className="border-t border-line"
									>
										<th
											scope="row"
											className="py-2 pe-2 text-start font-medium"
										>
											{ name }
										</th>
										<td className="max-w-40 truncate py-2 pe-2 text-fg-muted">
											{ head.sample[ 0 ]?.[ i ] ?? '' }
										</td>
										<td className="py-2">
											<Select
												label={ sprintf(
													/* translators: %s: column name from the file. */
													__(
														'Import column %s as',
														'cliedesk'
													),
													name
												) }
												labelHidden
												value={ mapping[ i ] ?? 'skip' }
												onChange={ ( x ) => {
													setDry( null );
													setMapping( ( m ) =>
														m.map( ( t, j ) =>
															j === i ? x : t
														)
													);
												} }
												options={ targets }
											/>
										</td>
									</tr>
								) ) }
							</tbody>
						</table>
						<RadioGroup
							label={ __(
								'Contacts that already exist',
								'cliedesk'
							) }
							value={ mode }
							onChange={ ( x ) => {
								setMode( x );
								setDry( null );
							} }
							options={ [
								{
									id: 'fill',
									label: __(
										'Only fill in empty details',
										'cliedesk'
									),
								},
								{
									id: 'overwrite',
									label: __(
										'Replace details with the file’s values',
										'cliedesk'
									),
								},
							] }
						/>
						{ mappingError ? (
							<Banner
								tone="danger"
								role="alert"
								title={ mappingError }
							/>
						) : (
							<ActionError error={ run.error } />
						) }
					</>
				) }
				{ dry && ! job && (
					<section
						aria-label={ __( 'Check result', 'cliedesk' ) }
						className="flex flex-col gap-2 rounded-lg border border-line p-3"
					>
						<p role="status" className="text-sm font-medium">
							{ sprintf(
								/* translators: 1: new contacts, 2: updated contacts, 3: rows with errors. */
								__(
									'%1$d new contacts, %2$d updated, %3$d rows with errors. Nothing was imported yet.',
									'cliedesk'
								),
								dry.create,
								dry.merge,
								dry.errors
							) }
						</p>
						{ dry.problems.length > 0 && (
							<ul className="flex max-h-48 list-disc flex-col gap-0.5 overflow-auto ps-5 text-sm">
								{ dry.problems.map( ( p ) => (
									<li key={ p.line }>
										{ sprintf(
											/* translators: 1: line number in the file, 2: error. */
											__( 'Line %1$d: %2$s', 'cliedesk' ),
											p.line,
											p.message
										) }
									</li>
								) ) }
							</ul>
						) }
					</section>
				) }
				{ job && (
					<>
						<JobProgress
							uid={ job.uid }
							label={ __( 'Contact import', 'cliedesk' ) }
							pageLink={ false }
						/>
						<ImportResult uid={ job.uid } initial={ result } />
					</>
				) }
			</div>
		</Modal>
	);
}

function ImportResult( {
	uid,
	initial,
}: {
	uid: string;
	initial:
		| { created?: number; merged?: number; errors?: number }
		| null
		| undefined;
} ) {
	const q = useQuery( jobQuery( uid ) );
	const result = ( q.data?.result ?? initial ) as
		| { created?: number; merged?: number; errors?: number }
		| null
		| undefined;
	if ( ! result || result.created === undefined ) {
		return null;
	}
	return (
		<div className="flex flex-col gap-2">
			<p role="status" className="text-sm font-medium">
				{ sprintf(
					/* translators: 1: new contacts, 2: updated contacts, 3: rows with errors. */
					__(
						'%1$d contacts created, %2$d updated, %3$d rows with errors.',
						'cliedesk'
					),
					result.created ?? 0,
					result.merged ?? 0,
					result.errors ?? 0
				) }
			</p>
			{ ( result.errors ?? 0 ) > 0 && (
				<div>
					<Button
						size="sm"
						onPress={ () => void openDownload( uid ) }
					>
						{ __( 'Download the rows with errors', 'cliedesk' ) }
					</Button>
				</div>
			) }
		</div>
	);
}
