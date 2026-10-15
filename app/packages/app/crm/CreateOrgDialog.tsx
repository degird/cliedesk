/**
 * "New organization" dialog (POST organizations). Opens the new organization's page on success.
 */
import { api, useMutation, useQueryClient } from '@cliedesk/data';
import { Button, Modal } from '@cliedesk/ui';
import { useNavigate } from '@tanstack/react-router';
import { __ } from '@wordpress/i18n';
import { useState, type FormEvent } from 'react';
import { ActionError } from '../inbox/components';
import {
	ErrorSummary,
	announceResult,
	apiFieldErrors,
	type SummaryItem,
} from '../workspace/forms';
import { orgErrors, orgKeys, type Organization } from './api';
import {
	OrgFields,
	orgFieldId,
	orgPayload,
	orgValues,
	validateOrg,
	type OrgErrors,
	type OrgValues,
} from './OrgForm';

const PREFIX = 'cd-org-new';

/**
 * Summary items for client and server errors.
 *
 * @param prefix  DOM id prefix.
 * @param errors  Errors.
 * @param domains Current domains (chip positions).
 */
export function orgSummary(
	prefix: string,
	errors: OrgErrors,
	domains: string[]
): SummaryItem[] {
	const known = [ 'name', 'domains', 'parentId', 'ownerId', 'defaultTeamId' ];
	const items: SummaryItem[] = Object.entries( errors.form )
		.filter( ( [ , m ] ) => !! m )
		.map( ( [ k, message ] ) => ( {
			fieldId: orgFieldId( prefix, known.includes( k ) ? k : 'name' ),
			message: message as string,
		} ) );
	for ( const [ d, message ] of Object.entries( errors.domains ) ) {
		const i = domains.indexOf( d );
		items.push( {
			fieldId:
				i >= 0
					? `${ orgFieldId( prefix, 'domains' ) }-${ i }`
					: orgFieldId( prefix, 'domains' ),
			message: `${ d }: ${ message }`,
		} );
	}
	return items;
}

/**
 * Create dialog.
 *
 * @param props         Props.
 * @param props.onClose Close.
 */
export function CreateOrgDialog( { onClose }: { onClose: () => void } ) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [ v, setV ] = useState< OrgValues >( () => orgValues() );
	const [ submitted, setSubmitted ] = useState( false );
	const [ summary, setSummary ] = useState< SummaryItem[] >( [] );
	const create = useMutation( {
		mutationFn: ( body: ReturnType< typeof orgPayload > ) =>
			api.post< Organization >( 'organizations', { body } ),
		onSuccess: ( r ) => {
			void qc.invalidateQueries( { queryKey: orgKeys.all } );
			announceResult( __( 'Organization created.', 'cliedesk' ) );
			onClose();
			if ( r.data?.id ) {
				void navigate( {
					to: '/organizations/$orgId',
					params: { orgId: String( r.data.id ) },
				} );
			}
		},
		onError: ( e, body ) => {
			const server = orgErrors( apiFieldErrors( e ), body.domains );
			setSummary( orgSummary( PREFIX, server, body.domains ) );
		},
	} );
	const server = orgErrors(
		apiFieldErrors( create.error ),
		create.variables?.domains ?? []
	);
	const client = submitted ? validateOrg( v ) : {};
	const errors: OrgErrors = {
		form: { ...server.form, ...client },
		domains: server.domains,
	};
	const submit = ( e?: FormEvent ) => {
		e?.preventDefault();
		setSubmitted( true );
		const c = validateOrg( v );
		const items = orgSummary( PREFIX, { form: c, domains: {} }, v.domains );
		setSummary( items );
		if ( ! items.length ) {
			create.mutate( orgPayload( v ) );
		}
	};
	const hasFieldErrors =
		Object.keys( apiFieldErrors( create.error ) ).length > 0;
	return (
		<Modal
			isOpen
			size="lg"
			onOpenChange={ ( o ) => ! o && onClose() }
			title={ __( 'New organization', 'cliedesk' ) }
			footer={
				<>
					<Button onPress={ onClose }>
						{ __( 'Cancel', 'cliedesk' ) }
					</Button>
					<Button
						variant="primary"
						isLoading={ create.isPending }
						onPress={ () => submit() }
					>
						{ __( 'Create organization', 'cliedesk' ) }
					</Button>
				</>
			}
		>
			<form
				noValidate
				onSubmit={ submit }
				className="flex flex-col gap-4"
			>
				<ErrorSummary items={ summary } />
				{ ! hasFieldErrors && (
					<ActionError
						error={ create.error }
						onDismiss={ () => create.reset() }
					/>
				) }
				<OrgFields
					prefix={ PREFIX }
					values={ v }
					onChange={ ( patch ) =>
						setV( ( o ) => ( { ...o, ...patch } ) )
					}
					errors={ errors }
				/>
			</form>
		</Modal>
	);
}
