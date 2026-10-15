/**
 * AUT-65: the name and avatar customers see on messages written by rules (and the AI agent with Pro).
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Button, TextField } from '@cliedesk/ui';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../../inbox/components';
import { settingsQuery } from '../../queries';
import { announceResult } from '../../workspace/forms';

export function AssistantCard() {
	const q = useQuery( settingsQuery( 'conversations' ) );
	if ( ! q.data ) {
		return null;
	}
	const v = ( k: string ) => String( q.data?.values?.[ k ]?.value ?? '' );
	return (
		<AssistantForm
			key={ String( q.data.etag ) }
			name={ v( 'assistant_name' ) }
			avatar={ v( 'assistant_avatar' ) }
			etag={ q.data.etag ?? undefined }
		/>
	);
}

function AssistantForm( props: {
	name: string;
	avatar: string;
	etag: string | undefined;
} ) {
	const qc = useQueryClient();
	const [ name, setName ] = useState( props.name );
	const [ avatar, setAvatar ] = useState( props.avatar );
	const save = useMutation( {
		mutationFn: () =>
			api.patch( 'settings/conversations', {
				body: {
					values: {
						assistant_name: name.trim(),
						assistant_avatar: avatar.trim(),
					},
				},
				ifMatch: props.etag,
			} ),
		onSuccess: () => {
			announceResult( __( 'Assistant saved.', 'cliedesk' ) );
			void qc.invalidateQueries( {
				queryKey: [ 'settings', 'conversations' ],
			} );
		},
	} );
	const onSubmit = ( e: FormEvent ) => {
		e.preventDefault();
		save.mutate();
	};
	return (
		<form
			noValidate
			onSubmit={ onSubmit }
			className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
		>
			<h2 className="text-base font-semibold">
				{ __( 'Assistant', 'cliedesk' ) }
			</h2>
			<p className="text-sm text-fg-muted">
				{ __(
					'Customers see this name and picture on messages that rules send, never a teammate’s name.',
					'cliedesk'
				) }
			</p>
			<ActionError error={ save.error } />
			<div className="flex flex-wrap gap-3">
				<TextField
					label={ __( 'Name', 'cliedesk' ) }
					description={ __(
						'Empty: “Support assistant”.',
						'cliedesk'
					) }
					maxLength={ 60 }
					value={ name }
					onChange={ setName }
				/>
				<TextField
					label={ __( 'Avatar image address', 'cliedesk' ) }
					type="url"
					maxLength={ 500 }
					value={ avatar }
					onChange={ setAvatar }
				/>
			</div>
			<div>
				<Button type="submit" isLoading={ save.isPending }>
					{ __( 'Save assistant', 'cliedesk' ) }
				</Button>
			</div>
		</form>
	);
}
