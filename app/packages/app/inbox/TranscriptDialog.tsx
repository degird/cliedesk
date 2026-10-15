/**
 * Transcripts (INB-38). One conversation: print it (or save as PDF from the print dialog) or download it as an HTML
 * or text file (GET conversations/{id}/transcript?format&notes). Several conversations: the bulk bar's export starts
 * a job (POST conversations/export, up to 5000 ids, cliedesk_export_conversations) that the jobs panel follows and
 * downloads when ready. Internal notes are left out unless asked for; held replies and AI drafts never appear.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Checkbox, Modal, RadioGroup } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { trackJob } from '../crm/jobs';
import type { BulkJob } from '../crm/listApi';
import { announceResult } from '../workspace/forms';
import { ActionError } from './components';

export const MAX_EXPORT = 5000;

export interface Transcript {
	format: 'html' | 'text';
	filename: string;
	content: string;
}

type Output = 'print' | 'html' | 'text';

/**
 * Print an HTML document from a hidden frame (srcdoc: no network request and no frame-src exception), then remove it.
 *
 * @param html Document.
 */
export function printHtml( html: string ): void {
	const frame = document.createElement( 'iframe' );
	frame.setAttribute( 'aria-hidden', 'true' );
	frame.setAttribute( 'tabindex', '-1' );
	frame.style.position = 'fixed';
	frame.style.width = '0';
	frame.style.height = '0';
	frame.style.border = '0';
	frame.onload = () => {
		frame.contentWindow?.focus();
		frame.contentWindow?.print();
		window.setTimeout( () => frame.remove(), 1000 );
	};
	frame.srcdoc = html;
	document.body.appendChild( frame );
}

/**
 * Save text as a file.
 *
 * @param content  Content.
 * @param filename File name.
 * @param type     Media type.
 */
export function saveFile(
	content: string,
	filename: string,
	type: string
): void {
	const url = URL.createObjectURL(
		new Blob( [ content ], { type: `${ type };charset=utf-8` } )
	);
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename;
	document.body.appendChild( a );
	a.click();
	a.remove();
	window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
}

function NotesOption( {
	value,
	onChange,
}: {
	value: boolean;
	onChange: ( v: boolean ) => void;
} ) {
	return (
		<Checkbox isSelected={ value } onChange={ onChange }>
			{ __( 'Include internal notes', 'cliedesk' ) }
		</Checkbox>
	);
}

/**
 * Print or download one conversation.
 *
 * @param props                Props.
 * @param props.conversationId Conversation.
 * @param props.onClose        Close.
 */
export function TranscriptDialog( {
	conversationId,
	onClose,
}: {
	conversationId: number;
	onClose: () => void;
} ) {
	const [ output, setOutput ] = useState< Output >( 'print' );
	const [ notes, setNotes ] = useState( false );
	const run = useMutation( {
		mutationFn: async () =>
			(
				await api.get< Transcript >(
					`conversations/${ conversationId }/transcript`,
					{
						query: {
							format: output === 'text' ? 'text' : 'html',
							...( notes ? { notes: 1 } : {} ),
						},
					}
				)
			).data,
		onSuccess: ( t ) => {
			if ( output === 'print' ) {
				printHtml( t.content );
			} else {
				saveFile(
					t.content,
					t.filename,
					t.format === 'text' ? 'text/plain' : 'text/html'
				);
				announceResult( __( 'Transcript downloaded.', 'cliedesk' ) );
			}
			onClose();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		run.mutate();
	};
	return (
		<Modal
			isOpen
			size="sm"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Print or download the transcript', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-transcript"
						variant="primary"
						isLoading={ run.isPending }
					>
						{ output === 'print'
							? __( 'Print', 'cliedesk' )
							: __( 'Download', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-transcript"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ActionError error={ run.error } />
				<RadioGroup
					label={ __( 'Output', 'cliedesk' ) }
					value={ output }
					onChange={ ( v ) => setOutput( v as Output ) }
					options={ [
						{
							id: 'print',
							label: __( 'Print or save as PDF', 'cliedesk' ),
						},
						{ id: 'html', label: __( 'HTML file', 'cliedesk' ) },
						{ id: 'text', label: __( 'Text file', 'cliedesk' ) },
					] }
				/>
				<NotesOption value={ notes } onChange={ setNotes } />
			</form>
		</Modal>
	);
}

/**
 * Export the transcripts of selected conversations (one file).
 *
 * @param props           Props.
 * @param props.ids       Conversation ids.
 * @param props.onClose   Close.
 * @param props.onStarted After the job started.
 */
export function ExportTranscriptsDialog( {
	ids,
	onClose,
	onStarted,
}: {
	ids: number[];
	onClose: () => void;
	onStarted: () => void;
} ) {
	const qc = useQueryClient();
	const [ format, setFormat ] = useState< 'html' | 'text' >( 'html' );
	const [ notes, setNotes ] = useState( false );
	const label = sprintf(
		/* translators: %d: number of conversations. */
		_n(
			'Transcript of %d conversation',
			'Transcripts of %d conversations',
			ids.length,
			'cliedesk'
		),
		ids.length
	);
	const run = useMutation( {
		mutationFn: async () =>
			(
				await api.post< BulkJob >( 'conversations/export', {
					body: { ids, format, notes },
				} )
			).data,
		onSuccess: ( job ) => {
			if ( job?.uid ) {
				trackJob( qc, job, label, { scope: 'inbox', download: true } );
			}
			announceResult( __( 'Export started.', 'cliedesk' ) );
			onStarted();
			onClose();
		},
	} );
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		run.mutate();
	};
	return (
		<Modal
			isOpen
			size="sm"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'Export transcripts', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						type="submit"
						form="cd-export-transcripts"
						variant="primary"
						isLoading={ run.isPending }
					>
						{ __( 'Export', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				id="cd-export-transcripts"
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<p className="text-sm text-fg-muted">
					{ sprintf(
						/* translators: %s: e.g. "Transcripts of 3 conversations". */
						__(
							'%s, in one file. Large exports are also emailed to you when ready.',
							'cliedesk'
						),
						label
					) }
				</p>
				<ActionError error={ run.error } />
				<RadioGroup
					label={ __( 'Format', 'cliedesk' ) }
					value={ format }
					onChange={ ( v ) => setFormat( v as 'html' | 'text' ) }
					options={ [
						{
							id: 'html',
							label: __(
								'HTML (one page per conversation, printable)',
								'cliedesk'
							),
						},
						{ id: 'text', label: __( 'Text', 'cliedesk' ) },
					] }
				/>
				<NotesOption value={ notes } onChange={ setNotes } />
			</form>
		</Modal>
	);
}
