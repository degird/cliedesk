/**
 * Settings → Help center → Suggestions while typing (KB-47): words that stop article suggestions (refund, billing,
 * cancel …) and articles suggested first on some pages. KB-55: how often articles are due for review. KB-44: what a
 * "did not help" vote starts (a review task for the article owner).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, Select, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

export function SuggestionSettings() {
	const qc = useQueryClient();
	const q = useQuery( settingsQuery( 'knowledge' ) );
	const [ draft, setDraft ] = useState< Record< string, string > >( {} );
	const value = ( key: string ) =>
		draft[ key ] ?? String( q.data?.values?.[ key ]?.value ?? '' );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/knowledge', {
				body: {
					values: {
						...draft,
						...( draft.review_months === undefined
							? {}
							: {
									review_months:
										Number( draft.review_months ) || 0,
								} ),
					},
				},
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			setDraft( {} );
			announceResult( __( 'Saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'settings' ] } );
		},
	} );
	return (
		<section
			aria-labelledby="cd-kb-suggest"
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
		>
			<h2 id="cd-kb-suggest" className="font-semibold">
				{ __( 'Suggestions while typing', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'When customers write in the chat or the request form, up to 3 articles are suggested. “That helped” ends the contact without a conversation.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ save.error } />
			<TextField
				label={ __( 'No suggestions for these words', 'cliedesk' ) }
				description={ __( 'Comma separated.', 'cliedesk' ) }
				maxLength={ 1000 }
				value={ value( 'suggest_suppress' ) }
				onChange={ ( v ) =>
					setDraft( { ...draft, suggest_suppress: v } )
				}
			/>
			<TextField
				label={ __( 'Articles first on some pages', 'cliedesk' ) }
				description={ __(
					'One rule per line: page address start = article ids, e.g. /checkout = 12, 15',
					'cliedesk'
				) }
				multiline
				rows={ 3 }
				maxLength={ 5000 }
				value={ value( 'suggest_rules' ) }
				onChange={ ( v ) => setDraft( { ...draft, suggest_rules: v } ) }
			/>
			<TextField
				label={ __( 'Review articles every (months)', 'cliedesk' ) }
				description={ __(
					'After this time the article owner gets a review task; verifying sets a new date. 0 turns reviews off.',
					'cliedesk'
				) }
				inputMode="numeric"
				maxLength={ 2 }
				value={ value( 'review_months' ) }
				onChange={ ( v ) =>
					setDraft( {
						...draft,
						review_months: v.replace( /\D/g, '' ),
					} )
				}
			/>
			<Select
				label={ __(
					'When a reader says an article did not help',
					'cliedesk'
				) }
				value={ value( 'negative_feedback' ) || 'none' }
				options={ [
					{ id: 'none', label: __( 'Do nothing', 'cliedesk' ) },
					{
						id: 'task',
						label: __(
							'Create a review task for the article owner',
							'cliedesk'
						),
					},
				] }
				onChange={ ( v ) =>
					setDraft( { ...draft, negative_feedback: String( v ) } )
				}
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
