/**
 * The pieces of Free's Settings → Email that Pro's email fills receive as the `kit` fill prop (FPS-10: the slots
 * `email.mailboxes` and `email.reply_options`), so Pro needs no extra exports from the app package.
 */
import { ActionError, Muted, Pill } from '../../inbox/components';
import { fieldsQuery, queuePickerQuery } from '../../inbox/api';
import { fullTime } from '../../inbox/labels';
import { announceResult, apiFieldErrors } from '../../workspace/forms';
import { versionTag } from '../../workspace/api';

export const emailKit = {
	ActionError,
	Muted,
	Pill,
	announceResult,
	apiFieldErrors,
	fullTime,
	fieldsQuery,
	queuePickerQuery,
	versionTag,
};

export type EmailKit = typeof emailKit;
