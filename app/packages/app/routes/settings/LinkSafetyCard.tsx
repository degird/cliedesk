/**
 * Link safety (SEC-22): blocked domains (links disabled for agents, replies with them refused) and trusted domains
 * (opened without a warning; this site is always trusted).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

export function LinkSafetyCard() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'security' ) );
	const [ draft, setDraft ] = useState< Record< string, string > >( {} );
	const value = ( key: string ) =>
		draft[ key ] ?? String( q.data?.values?.[ key ]?.value ?? '' );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/security', {
				body: { values: draft },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'security' ],
			} );
		},
	} );
	return (
		<section
			aria-labelledby="cd-security-links"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-security-links" className="text-lg font-semibold">
				{ __( 'Links and files', 'cliedesk' ) }
			</h2>
			<ActionError error={ save.error } />
			<TextField
				label={ __( 'Blocked domains', 'cliedesk' ) }
				description={ __(
					'Links to these domains (and their subdomains) cannot be opened by agents, and replies containing them are not sent. One per line.',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				maxLength={ 5000 }
				value={ value( 'link_blocklist' ) }
				onChange={ ( x ) =>
					setDraft( { ...draft, link_blocklist: x } )
				}
			/>
			<TextField
				label={ __( 'Trusted domains', 'cliedesk' ) }
				description={ __(
					'Other links show where they really go. This website is always trusted.',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				maxLength={ 5000 }
				value={ value( 'link_trusted' ) }
				onChange={ ( x ) => setDraft( { ...draft, link_trusted: x } ) }
			/>
			<TextField
				label={ __( 'ClamAV malware scanner', 'cliedesk' ) }
				description={ __(
					'Every file is scanned and infected files are quarantined. For example unix:///var/run/clamav/clamd.ctl or tcp://127.0.0.1:3310. Empty: files are marked "Not scanned".',
					'cliedesk'
				) }
				maxLength={ 255 }
				value={ value( 'clamav' ) }
				onChange={ ( x ) => setDraft( { ...draft, clamav: x.trim() } ) }
			/>
			<Button
				className="self-start"
				variant="primary"
				isDisabled={ ! Object.keys( draft ).length }
				isLoading={ save.isPending }
				onPress={ () => save.mutate() }
			>
				{ __( 'Save', 'cliedesk' ) }
			</Button>
		</section>
	);
}
