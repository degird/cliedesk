/**
 * Tags screen: tag inheritance (CNV-40). Customer tags chosen here are copied to each new conversation of that
 * customer (setting `conversations.inherit_tag_ids`, PATCH settings/conversations, needs cliedesk_manage_tags as well
 * as cliedesk_manage_settings). Open conversations get them only on demand: POST tags/inherit/apply, one page of 500
 * per call, repeated with `after` until `next` is null.
 */
import {
	api,
	can,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, Checkbox, announce } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { tagsQuery } from '../../inbox/api';
import { ActionError, Muted } from '../../inbox/components';
import { settingsQuery } from '../../queries';

const allowed = () =>
	can( 'cliedesk_manage_settings' ) && can( 'cliedesk_manage_tags' );

/**
 * Run the on-demand apply over every page of open conversations.
 *
 * @return Tags added in total.
 */
export async function applyToOpen(): Promise< number > {
	let after: string | null = null;
	let total = 0;
	do {
		const r: { data: { applied: number; next: string | null } } =
			await api.post( 'tags/inherit/apply', {
				body: after ? { after } : {},
			} );
		total += r.data.applied;
		after = r.data.next;
	} while ( after );
	return total;
}

/**
 * Panel.
 */
export function TagInheritance() {
	const qc = useQueryClient();
	const q = useQuery( {
		...settingsQuery( 'conversations' ),
		enabled: allowed(),
	} );
	const tags = useQuery( { ...tagsQuery(), enabled: allowed() } );
	const raw = q.data?.values?.inherit_tag_ids?.value;
	const saved = Array.isArray( raw ) ? raw.map( Number ) : [];
	const savedKey = saved.join( ',' );
	const [ chosen, setChosen ] = useState< number[] >( saved );
	useEffect( () => {
		setChosen( savedKey ? savedKey.split( ',' ).map( Number ) : [] );
	}, [ savedKey ] );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/conversations', {
				body: { values: { inherit_tag_ids: chosen } },
				ifMatch: q.data?.etag ?? undefined,
			} ),
		onSuccess: () => {
			announce( __( 'Tag inheritance saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'conversations' ],
			} );
		},
	} );
	const apply = useMutation( {
		mutationFn: applyToOpen,
		onSuccess: ( n ) =>
			announce(
				sprintf(
					/* translators: %d: number of tags added. */
					_n(
						'%d tag added to open conversations.',
						'%d tags added to open conversations.',
						n,
						'cliedesk'
					),
					n
				)
			),
	} );
	if ( ! allowed() || ! q.data || ! tags.data ) {
		return null;
	}
	const dirty = chosen.join( ',' ) !== savedKey;
	return (
		<section
			aria-labelledby="cd-tag-inherit"
			className="flex flex-col gap-3 border-t border-line pt-6"
		>
			<h2 id="cd-tag-inherit" className="text-base font-semibold">
				{ __( 'Tag inheritance', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'When a customer or their company has one of these tags, their new conversations get it too. Open conversations change only when you apply it.',
					'cliedesk'
				) }
			</p>
			<ActionError
				error={ save.error ?? apply.error }
				onDismiss={ () => {
					save.reset();
					apply.reset();
				} }
			/>
			{ tags.data.length ? (
				<fieldset className="flex max-h-64 flex-col gap-1 overflow-y-auto">
					<legend className="sr-only">
						{ __( 'Tags new conversations inherit', 'cliedesk' ) }
					</legend>
					{ tags.data.map( ( t ) => (
						<Checkbox
							key={ t.id }
							isSelected={ chosen.includes( t.id ) }
							onChange={ ( on ) =>
								setChosen( ( ids ) =>
									on
										? [ ...ids, t.id ]
										: ids.filter( ( x ) => x !== t.id )
								)
							}
						>
							{ t.name }
						</Checkbox>
					) ) }
				</fieldset>
			) : (
				<Muted>{ __( 'No tags yet.', 'cliedesk' ) }</Muted>
			) }
			<div className="flex flex-wrap gap-2">
				<Button
					variant="primary"
					isDisabled={ ! dirty }
					isLoading={ save.isPending }
					onPress={ () => save.mutate() }
				>
					{ __( 'Save inheritance', 'cliedesk' ) }
				</Button>
				<Button
					isDisabled={ dirty || ! saved.length }
					isLoading={ apply.isPending }
					onPress={ () => apply.mutate() }
				>
					{ __( 'Apply to open conversations', 'cliedesk' ) }
				</Button>
			</div>
		</section>
	);
}
