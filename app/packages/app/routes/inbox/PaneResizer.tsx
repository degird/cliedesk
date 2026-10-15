/**
 * Splitter between the inbox list and the conversation pane (INB-02): a focusable separator with its value
 * (aria-valuenow, in px). Arrow keys move it 16 px, Home / End go to the minimum / maximum; it can also be
 * dragged. In right-to-left layouts the arrows follow the visual direction.
 */
import { cx } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { LIST_MAX, LIST_MIN, RESIZE_STEP } from '../../inbox/layout';

export interface PaneResizerProps {
	value: number;
	onChange: ( value: number ) => void;
	/** Id of the pane it resizes. */
	controls: string;
	min?: number;
	max?: number;
}

const rtl = () => document.documentElement.getAttribute( 'dir' ) === 'rtl';

/**
 * Resizer.
 *
 * @param props Props.
 */
export function PaneResizer( {
	value,
	onChange,
	controls,
	min = LIST_MIN,
	max = LIST_MAX,
}: PaneResizerProps ) {
	const drag = useRef< { x: number; start: number } | null >( null );
	const clamp = ( v: number ) => Math.min( max, Math.max( min, v ) );
	const onKeyDown = ( e: KeyboardEvent< HTMLDivElement > ) => {
		const dir = rtl() ? -1 : 1;
		let next: number | null = null;
		if ( e.key === 'ArrowRight' || e.key === 'ArrowUp' ) {
			next = value + RESIZE_STEP * ( e.key === 'ArrowUp' ? 1 : dir );
		} else if ( e.key === 'ArrowLeft' || e.key === 'ArrowDown' ) {
			next = value - RESIZE_STEP * ( e.key === 'ArrowDown' ? 1 : dir );
		} else if ( e.key === 'Home' ) {
			next = min;
		} else if ( e.key === 'End' ) {
			next = max;
		}
		if ( next !== null ) {
			e.preventDefault();
			onChange( clamp( next ) );
		}
	};
	const onPointerDown = ( e: PointerEvent< HTMLDivElement > ) => {
		drag.current = { x: e.clientX, start: value };
		e.currentTarget.setPointerCapture?.( e.pointerId );
	};
	const onPointerMove = ( e: PointerEvent< HTMLDivElement > ) => {
		if ( drag.current ) {
			const delta = ( e.clientX - drag.current.x ) * ( rtl() ? -1 : 1 );
			onChange( clamp( drag.current.start + delta ) );
		}
	};
	const end = () => {
		drag.current = null;
	};
	return (
		// A focusable separator is an interactive widget (window splitter pattern).
		// eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={ __( 'Resize the conversation list', 'cliedesk' ) }
			aria-controls={ controls }
			aria-valuenow={ value }
			aria-valuemin={ min }
			aria-valuemax={ max }
			aria-valuetext={ sprintf(
				/* translators: %d: width in pixels. */
				__( '%d pixels wide', 'cliedesk' ),
				value
			) }
			tabIndex={ 0 }
			onKeyDown={ onKeyDown }
			onPointerDown={ onPointerDown }
			onPointerMove={ onPointerMove }
			onPointerUp={ end }
			onPointerCancel={ end }
			className={ cx(
				'group relative w-3 shrink-0 cursor-col-resize touch-none self-stretch outline-none',
				'focus-visible:outline-2 focus-visible:outline-focus'
			) }
		>
			<span
				aria-hidden="true"
				className="absolute inset-y-0 start-1/2 w-px bg-line group-hover:w-0.5 group-hover:bg-accent group-focus-visible:bg-accent"
			/>
		</div>
	);
}
