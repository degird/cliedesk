/**
 * Settings → Forms (CHN-49): how to add the Cliedesk request form. Other form plugins (Contact Form 7, WPForms,
 * Gravity Forms, Fluent Forms, Formidable, CHN-50) are Cliedesk Pro: they fill the `forms.adapters` slot, which shows a
 * PRO badge without Pro.
 */
import { Slot } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';

const SHORTCODE = '[cliedesk_request type="request"]';

/**
 * Forms section.
 */
export default function FormsSection() {
	return (
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold">
					{ __( 'Request form', 'cliedesk' ) }
				</h2>
				<p className="text-sm text-fg-muted">
					{ __(
						'Add the “Request form” block to any page, or the shortcode below. Customers fill in the form of the chosen conversation type; each request arrives in your inbox and replies go by email.',
						'cliedesk'
					) }
				</p>
				<code className="w-fit rounded-md bg-sunken px-2 py-1 text-sm">
					{ SHORTCODE }
				</code>
			</section>
			<Slot name="forms.adapters" />
		</div>
	);
}
