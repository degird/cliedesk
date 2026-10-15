/**
 * Capability checklist grouped by area, each with its plain-language explanation (TEAM-10). Used by the role
 * editor. Capabilities that cannot be on the role (reserved, §3.5 rule 3) or that the editor does not hold
 * (rule 2) are disabled, with the reason in text and in a tooltip.
 */
import { Checkbox } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { allowedOnRole, groupByArea, type Capability } from './api';
import { Badge, LockHint } from './components';
import { areaLabel } from './labels';

/**
 * Why a capability cannot be switched on for a role, or null when it can.
 *
 * @param cap     Capability.
 * @param roleKey Role.
 * @param checked Currently on.
 */
export function capabilityLock(
	cap: Capability,
	roleKey: string,
	checked: boolean
): string | null {
	if ( ! allowedOnRole( cap, roleKey ) ) {
		return cap.protected === 'owner'
			? __(
					'Reserved for the Owner (the WordPress administrator). It cannot be added to other roles.',
					'cliedesk'
				)
			: __(
					'Reserved for Owners and Cliedesk Admins. It cannot be added to other roles.',
					'cliedesk'
				);
	}
	if ( ! cap.held && ! checked ) {
		return __(
			'You can only give permissions you have yourself.',
			'cliedesk'
		);
	}
	return null;
}

export interface CapabilityListProps {
	capabilities: Capability[];
	roleKey: string;
	value: Set< string >;
	onChange: ( cap: string, on: boolean ) => void;
	isDisabled?: boolean;
	/** Capability the server rejected, with its message. */
	invalid?: { cap: string; message: string } | null;
}

export function CapabilityList( {
	capabilities,
	roleKey,
	value,
	onChange,
	isDisabled,
	invalid,
}: CapabilityListProps ) {
	return (
		<div className="flex flex-col gap-4">
			{ groupByArea( capabilities ).map( ( g ) => (
				<fieldset
					key={ g.area }
					className="rounded-lg border border-line bg-surface p-4"
				>
					<legend className="px-1 text-base font-semibold">
						{ areaLabel( g.area ) }
					</legend>
					<ul className="flex flex-col divide-y divide-line">
						{ g.caps.map( ( cap ) => {
							const checked = value.has( cap.key );
							const lock = capabilityLock(
								cap,
								roleKey,
								checked
							);
							const descId = `cd-cap-${ cap.key }-desc`;
							const bad = invalid?.cap === cap.key;
							return (
								<li
									key={ cap.key }
									id={ `cd-cap-${ cap.key }` }
									className="flex items-start gap-2 py-2"
								>
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="flex flex-wrap items-center gap-2">
											<Checkbox
												isSelected={ checked }
												isDisabled={
													isDisabled || !! lock
												}
												isInvalid={ bad }
												onChange={ ( on ) =>
													onChange( cap.key, on )
												}
												aria-describedby={ descId }
											>
												{ cap.label }
											</Checkbox>
											{ cap.protected && (
												<Badge tone="warning">
													{ cap.protected === 'owner'
														? __(
																'Owner only',
																'cliedesk'
															)
														: __(
																'Reserved',
																'cliedesk'
															) }
												</Badge>
											) }
										</span>
										<p
											id={ descId }
											className="ps-6 text-sm text-fg-muted"
										>
											{ cap.description }
											{ lock && (
												<span className="sr-only">
													{ ` ${ lock }` }
												</span>
											) }
										</p>
										{ bad && invalid && (
											<p className="ps-6 text-sm text-danger">
												{ invalid.message }
											</p>
										) }
									</div>
									{ lock && <LockHint reason={ lock } /> }
								</li>
							);
						} ) }
					</ul>
				</fieldset>
			) ) }
		</div>
	);
}
