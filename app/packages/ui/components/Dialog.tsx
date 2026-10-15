import { __ } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading } from 'react-aria-components/Dialog';
import { Modal as AriaModal, ModalOverlay } from 'react-aria-components/Modal';
import { cx } from '../cx';
import { Button } from './Button';

export type DialogSize = 'sm' | 'md' | 'lg';

const WIDTH: Record< DialogSize, string > = {
	sm: 'sm:max-w-[400px]',
	md: 'sm:max-w-[560px]',
	lg: 'sm:max-w-[720px]',
};

export interface ModalProps {
	isOpen: boolean;
	onOpenChange: ( open: boolean ) => void;
	title: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	size?: DialogSize;
	/** alertdialog: confirmations; default focus goes to the element with autoFocus (Cancel). */
	role?: 'dialog' | 'alertdialog';
	/** Close on outside click (default true; false for alert dialogs). */
	isDismissable?: boolean;
	className?: string;
}

/**
 * Modal dialog: focus trap, Esc closes, focus returns to the trigger (React Aria). Full-screen sheet < 640 px.
 *
 * @param props Props.
 */
export function Modal( {
	isOpen,
	onOpenChange,
	title,
	children,
	footer,
	size = 'md',
	role = 'dialog',
	isDismissable,
	className,
}: ModalProps ) {
	return (
		<ModalOverlay
			isOpen={ isOpen }
			onOpenChange={ onOpenChange }
			isDismissable={ isDismissable ?? role === 'dialog' }
			className="fixed inset-0 z-[1200] flex items-end justify-center bg-overlay sm:items-center sm:p-4"
		>
			<AriaModal
				className={ cx(
					'flex max-h-full w-full flex-col rounded-t-xl border border-(--cd-raised-outline) bg-raised text-fg shadow-3 outline-none sm:rounded-xl',
					WIDTH[ size ],
					className
				) }
			>
				<AriaDialog
					role={ role }
					className="flex max-h-[90vh] flex-col outline-none"
				>
					<div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
						<Heading slot="title" className="text-lg font-semibold">
							{ title }
						</Heading>
					</div>
					<div className="overflow-auto px-5 py-4">{ children }</div>
					{ footer && (
						<div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
							{ footer }
						</div>
					) }
				</AriaDialog>
			</AriaModal>
		</ModalOverlay>
	);
}

export interface ConfirmDestructiveProps {
	isOpen: boolean;
	onOpenChange: ( open: boolean ) => void;
	/** Verb + object, e.g. "Delete 12 conversations permanently?" */
	title: string;
	/** One sentence on the consequence. */
	description: ReactNode;
	/** Repeats the action, e.g. "Delete 12 conversations". */
	confirmLabel: string;
	onConfirm: () => void | Promise< void >;
	isLoading?: boolean;
	/** Typed confirmation for workspace-level destruction (§7.11). */
	children?: ReactNode;
	isConfirmDisabled?: boolean;
}

/**
 * Confirm-destructive pattern (§7.11): alertdialog, default focus on Cancel, danger button repeats the action.
 *
 * @param props Props.
 */
export function ConfirmDestructive( {
	isOpen,
	onOpenChange,
	title,
	description,
	confirmLabel,
	onConfirm,
	isLoading,
	children,
	isConfirmDisabled,
}: ConfirmDestructiveProps ) {
	return (
		<Modal
			isOpen={ isOpen }
			onOpenChange={ onOpenChange }
			title={ title }
			role="alertdialog"
			size="sm"
			footer={
				<>
					<Button
						// Alert dialogs focus Cancel first (§8.3).
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						variant="secondary"
						onPress={ () => onOpenChange( false ) }
					>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="danger"
						isLoading={ isLoading }
						isDisabled={ isConfirmDisabled }
						onPress={ () => void onConfirm() }
					>
						{ confirmLabel }
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3 text-base text-fg-muted">
				<p>{ description }</p>
				{ children }
			</div>
		</Modal>
	);
}
