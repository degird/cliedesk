/**
 * @cliedesk/ui — design system v1 on React Aria Components (window.cliedesk.ui).
 */
export { cx, focusRing } from './cx';
export { announce } from './announce';
export * from './theme';
export * from './slots';
/** Unstyled React Aria button (press/focus behaviour) for custom triggers; shared so app and Pro do not bundle their own copy. */
export { Button as UnstyledButton } from 'react-aria-components/Button';
export {
	Button,
	type ButtonProps,
	type ButtonVariant,
	type ButtonSize,
} from './components/Button';
export { IconButton, type IconButtonProps } from './components/IconButton';
export { Tooltip, type TooltipProps } from './components/Tooltip';
export { TextField, type TextFieldProps } from './components/TextField';
export {
	FieldLabel,
	FieldDescription,
	FieldErrorText,
	inputClass,
	textAreaClass,
} from './components/Field';
export {
	RadioGroup,
	type RadioGroupProps,
	type RadioOption,
} from './components/RadioGroup';
export {
	Select,
	type SelectProps,
	type SelectOption,
} from './components/Select';
export {
	Checkbox,
	Switch,
	type CheckboxProps,
	type SwitchProps,
} from './components/Checkbox';
export {
	Modal,
	ConfirmDestructive,
	type ModalProps,
	type ConfirmDestructiveProps,
} from './components/Dialog';
export { Popover, type PopoverProps } from './components/Popover';
export { Menu, MenuItem, MenuGroup, MenuSeparator } from './components/Menu';
export { Tabs, TabList, Tab, TabPanel } from './components/Tabs';
export {
	ToastRegion,
	toast,
	dismissToast,
	type ToastInput,
} from './components/Toast';
export { Spinner, Skeleton, LoadingRegion } from './components/Spinner';
export {
	EmptyState,
	ErrorState,
	type EmptyStateProps,
	type ErrorStateProps,
} from './components/EmptyState';
export { Banner, SafeModeBanner, type BannerProps } from './components/Banner';
export { StatusIcon, type Tone } from './components/StatusIcon';
export {
	ProBadge,
	ProPill,
	proBadgeContent,
	PRO_ADMIN_CAP,
	type ProBadgeContent,
} from './components/ProBadge';
export {
	Slot,
	useSlotHasFills,
	useVisibleFills,
	type SlotProps,
} from './components/Slot';
