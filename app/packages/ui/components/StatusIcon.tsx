import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { cx } from '../cx';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

export const TONE_TEXT: Record< Tone, string > = {
	info: 'text-info',
	success: 'text-success',
	warning: 'text-warning',
	danger: 'text-danger',
};

export const TONE_BOX: Record< Tone, string > = {
	info: 'bg-info-subtle border-info-line',
	success: 'bg-success-subtle border-success-line',
	warning: 'bg-warning-subtle border-warning-line',
	danger: 'bg-danger-subtle border-danger-line',
};

/**
 * Icon for a tone; decorative (the text always carries the meaning).
 *
 * @param props           Props.
 * @param props.tone      Tone.
 * @param props.size      Size.
 * @param props.className Classes.
 */
export function StatusIcon( {
	tone,
	size = 18,
	className,
}: {
	tone: Tone;
	size?: number;
	className?: string;
} ) {
	const Icon = {
		info: Info,
		success: CheckCircle2,
		warning: AlertTriangle,
		danger: OctagonAlert,
	}[ tone ];
	return (
		<Icon
			aria-hidden="true"
			size={ size }
			strokeWidth={ 1.75 }
			className={ cx( 'mt-px shrink-0', TONE_TEXT[ tone ], className ) }
		/>
	);
}
