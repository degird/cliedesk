/**
 * Voice notes (INB-45, Free): record in the browser, stop by hand or at the limit (Settings, 3 minutes by default),
 * and the recording is attached to the reply like any file. Chat customers play it in the widget; email customers get
 * a link or attachment. Transcripts come with Pro.
 */
import { getBoot } from '@cliedesk/data';
import { Button, IconButton } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** The recording limit in seconds. */
export function voiceLimit(): number {
	const v = Number(
		getBoot().settings?.[ 'conversations.voice_note_seconds' ]
	);
	return Number.isFinite( v ) && v > 0 ? v : 180;
}

/**
 * Record button.
 *
 * @param props        Props.
 * @param props.onDone Called with the recorded file.
 */
export function VoiceNoteButton( { onDone }: { onDone: ( f: File ) => void } ) {
	const [ seconds, setSeconds ] = useState< number | null >( null );
	const [ error, setError ] = useState( false );
	const recorder = useRef< MediaRecorder | null >( null );
	const timer = useRef< number | null >( null );

	const stop = () => {
		if ( timer.current !== null ) {
			window.clearInterval( timer.current );
			timer.current = null;
		}
		if ( recorder.current && recorder.current.state !== 'inactive' ) {
			recorder.current.stop();
		}
	};
	useEffect( () => stop, [] );

	if (
		typeof window === 'undefined' ||
		typeof window.MediaRecorder === 'undefined' ||
		! navigator.mediaDevices?.getUserMedia
	) {
		return null;
	}
	const limit = voiceLimit();

	const start = async () => {
		setError( false );
		try {
			const stream = await navigator.mediaDevices.getUserMedia( {
				audio: true,
			} );
			const rec = new window.MediaRecorder( stream );
			const chunks: Blob[] = [];
			rec.ondataavailable = ( e ) => chunks.push( e.data );
			rec.onstop = () => {
				stream.getTracks().forEach( ( t ) => t.stop() );
				setSeconds( null );
				const type = rec.mimeType || 'audio/webm';
				onDone(
					new File(
						chunks,
						`voice-note-${ Date.now() }.${
							type.includes( 'ogg' ) ? 'ogg' : 'webm'
						}`,
						{ type }
					)
				);
			};
			recorder.current = rec;
			rec.start();
			setSeconds( 0 );
			timer.current = window.setInterval( () => {
				setSeconds( ( s ) => {
					const next = ( s ?? 0 ) + 1;
					if ( next >= limit ) {
						stop(); // The configured limit.
					}
					return next;
				} );
			}, 1000 );
		} catch {
			setError( true );
		}
	};

	if ( seconds !== null ) {
		return (
			<Button
				size="sm"
				onPress={ stop }
				iconStart={ <Square size={ 14 } /> }
			>
				{ sprintf(
					/* translators: 1: seconds recorded, 2: limit in seconds. */
					__( 'Stop (%1$d / %2$d s)', 'cliedesk' ),
					seconds,
					limit
				) }
			</Button>
		);
	}
	return (
		<>
			<IconButton
				label={ __( 'Voice note', 'cliedesk' ) }
				icon={ <Mic size={ 16 } /> }
				onPress={ () => void start() }
			/>
			{ error && (
				<span role="alert" className="text-sm text-danger">
					{ __( 'The microphone is not available.', 'cliedesk' ) }
				</span>
			) }
		</>
	);
}
