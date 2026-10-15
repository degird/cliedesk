/**
 * Form pieces of the workspace and product screens that Pro's per-product setups reuse (FPS-05). Passed to Pro's
 * fills as the `kit` fill prop, so Pro needs no extra @cliedesk/app exports; only lazy settings chunks import it.
 */
import { needsRole } from '../components/DisabledReason';
import { describeError } from '../components/RouteError';
import { BrandDialog } from './BrandDialog';
import { ColorInput } from './ColorInput';
import {
	ConflictBanner,
	ErrorSummary,
	SaveError,
	announceResult,
	apiFieldErrors,
	pickError,
	validateHex,
	validateText,
} from './forms';
import { ImageName, ImagePicker, ImagePreview } from './ImagePicker';
import { colorRoleLabel, sourceLabel } from './labels';
import { SaveBar, useProductPatch } from './product/shared';

export const workspaceKit = {
	BrandDialog,
	ColorInput,
	ConflictBanner,
	ErrorSummary,
	ImageName,
	ImagePicker,
	ImagePreview,
	SaveBar,
	SaveError,
	announceResult,
	apiFieldErrors,
	colorRoleLabel,
	describeError,
	needsRole,
	pickError,
	sourceLabel,
	useProductPatch,
	validateHex,
	validateText,
};

export type WorkspaceKit = typeof workspaceKit;
