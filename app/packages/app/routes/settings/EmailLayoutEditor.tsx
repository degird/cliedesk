/**
 * Settings → Email → Layout (CHN-46): one HTML + text layout for the workspace and the workspace brand, with the
 * allowed tokens listed, a preview with sample data (sandboxed frame, no scripts) and "Use the default" to reset.
 * Layouts for other brands are Pro (BRD-04/BRD-07): its fill of `email.layout.brand` replaces the picker.
 */
import {
	api,
	getBoot,
	useMutation,
	useQuery,
	useQueryClient,
} from '@cliedesk/data';
import { Button, LoadingRegion, Select, Slot, TextField } from '@cliedesk/ui';
import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { ActionError, Muted } from '../../inbox/components';
import { announceResult, apiFieldErrors } from '../../workspace/forms';
import { brandDetailQuery } from '../../workspace/api';

interface Layout {
	brandId: number | null;
	html: string;
	text: string;
	source: 'workspace' | 'brand' | 'default';
	tokens: string[];
}

/**
 * Plain label of where a layout comes from.
 *
 * @param source  Source.
 * @param isBrand A brand is selected.
 */
export function layoutSource(
	source: Layout[ 'source' ],
	isBrand: boolean
): string {
	if ( source === 'brand' ) {
		return __( 'This brand has its own layout.', 'cliedesk' );
	}
	if ( source === 'workspace' ) {
		return isBrand
			? __( 'This brand uses the workspace layout.', 'cliedesk' )
			: __( 'The workspace layout is customised.', 'cliedesk' );
	}
	return __( 'The built-in layout is used.', 'cliedesk' );
}

/**
 * Editor.
 */
export default function EmailLayoutEditor() {
	const qc = useQueryClient();
	const workspaceBrand = getBoot().workspace.brandId;
	const brandRow = useQuery( {
		...brandDetailQuery( workspaceBrand ?? 0 ),
		enabled: !! workspaceBrand,
	} );
	const [ brand, setBrand ] = useState( 'workspace' );
	const brandId = brand === 'workspace' ? null : Number( brand );
	const key = [ 'email', 'layout', brand ];
	const q = useQuery( {
		queryKey: key,
		queryFn: async ( { signal } ) =>
			(
				await api.get< Layout >( 'email/layout', {
					query: brandId ? { brandId } : undefined,
					signal,
				} )
			).data,
	} );
	const [ html, setHtml ] = useState( '' );
	const [ text, setText ] = useState( '' );
	useEffect( () => {
		if ( q.data ) {
			setHtml( q.data.html );
			setText( q.data.text );
		}
	}, [ q.data ] );
	const body = () => ( {
		...( brandId ? { brandId } : {} ),
		html,
		text,
	} );
	const save = useMutation( {
		mutationFn: () => api.put( 'email/layout', { body: body() } ),
		onSuccess: () => {
			announceResult( __( 'Layout saved.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'email', 'layout' ] } );
		},
	} );
	const reset = useMutation( {
		mutationFn: () =>
			api.del( 'email/layout', {
				query: brandId ? { brandId } : undefined,
			} ),
		onSuccess: () => {
			announceResult( __( 'Layout reset.', 'cliedesk' ) );
			void qc.invalidateQueries( { queryKey: [ 'email', 'layout' ] } );
		},
	} );
	const preview = useMutation( {
		mutationFn: () =>
			api.post< { html: string; text: string } >(
				'email/layout/preview',
				{ body: body() }
			),
	} );
	const errors = {
		...apiFieldErrors( preview.error ),
		...apiFieldErrors( save.error ),
	};
	const resettable =
		q.data?.source === 'brand' ||
		( brandId === null && q.data?.source === 'workspace' );
	return (
		<section
			aria-labelledby="cd-email-layout"
			className="flex flex-col gap-3"
		>
			<h2 id="cd-email-layout" className="text-lg font-semibold">
				{ __( 'Email layout', 'cliedesk' ) }
			</h2>
			<Muted>
				{ __(
					'The frame around every reply and automatic email. Use only the tokens listed; a line whose tokens are empty is left out.',
					'cliedesk'
				) }
			</Muted>
			<Slot
				name="email.layout.brand"
				fillProps={ { value: brand, onChange: setBrand } }
				fallback={
					<Select
						label={ __( 'Layout for', 'cliedesk' ) }
						value={ brand }
						onChange={ setBrand }
						options={ [
							{
								id: 'workspace',
								label: __( 'Workspace (default)', 'cliedesk' ),
							},
							...( brandRow.data
								? [
										{
											id: String( brandRow.data.id ),
											label: brandRow.data.name,
										},
									]
								: [] ),
						] }
					/>
				}
			/>
			{ q.isPending ? (
				<LoadingRegion />
			) : (
				<>
					<p className="text-sm">
						{ q.data && layoutSource( q.data.source, !! brandId ) }
					</p>
					<p className="text-sm text-fg-muted">
						{ sprintf(
							/* translators: %s: list of tokens. */
							__( 'Tokens: %s', 'cliedesk' ),
							( q.data?.tokens ?? [] )
								.map( ( t ) => `{${ t }}` )
								.join( ' ' )
						) }
					</p>
					<TextField
						label={ __( 'HTML layout', 'cliedesk' ) }
						multiline
						rows={ 10 }
						value={ html }
						onChange={ setHtml }
						errorMessage={ errors.html ?? null }
					/>
					<TextField
						label={ __( 'Plain-text layout', 'cliedesk' ) }
						multiline
						rows={ 5 }
						value={ text }
						onChange={ setText }
						errorMessage={ errors.text ?? null }
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="primary"
							isLoading={ save.isPending }
							onPress={ () => save.mutate() }
						>
							{ __( 'Save layout', 'cliedesk' ) }
						</Button>
						<Button
							isLoading={ preview.isPending }
							onPress={ () => preview.mutate() }
						>
							{ __( 'Preview', 'cliedesk' ) }
						</Button>
						{ resettable && (
							<Button
								variant="ghost"
								isLoading={ reset.isPending }
								onPress={ () => reset.mutate() }
							>
								{ __( 'Use the default', 'cliedesk' ) }
							</Button>
						) }
					</div>
					{ ! Object.keys( errors ).length && (
						<ActionError
							error={ save.error ?? preview.error ?? reset.error }
						/>
					) }
					{ preview.data?.data && (
						<div className="grid gap-3 lg:grid-cols-2">
							<iframe
								title={ __( 'HTML preview', 'cliedesk' ) }
								sandbox=""
								srcDoc={ preview.data.data.html }
								className="h-80 w-full rounded-md border border-line bg-white"
							/>
							<pre
								aria-label={ __(
									'Plain-text preview',
									'cliedesk'
								) }
								className="h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-sunken p-3 text-sm"
							>
								{ preview.data.data.text }
							</pre>
						</div>
					) }
				</>
			) }
		</section>
	);
}
