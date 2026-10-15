/**
 * Chat widget texts per language (CHN-11): pick an active language and override any built-in text. Empty fields
 * keep the built-in text; a language without its own text uses the default language's custom text.
 */
import { api, useQuery } from '@cliedesk/data';
import { LoadingRegion, Select, TextField } from '@cliedesk/ui';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useState } from 'react';

export type TextOverrides = Record< string, Record< string, string > >;

interface TextsInfo {
	locale: string;
	default: string;
	languages: Array< { code: string; name: string; isDefault: boolean } >;
	builtin: Record< string, string >;
}

/**
 * Overrides with one text changed; empty texts and empty languages are removed.
 *
 * @param all    All overrides.
 * @param locale Language.
 * @param key    Text key.
 * @param value  New text.
 */
export function withText(
	all: TextOverrides,
	locale: string,
	key: string,
	value: string
): TextOverrides {
	const mine = { ...( all[ locale ] ?? {} ), [ key ]: value };
	if ( ! value.trim() ) {
		delete mine[ key ];
	}
	const next = { ...all, [ locale ]: mine };
	if ( ! Object.keys( mine ).length ) {
		delete next[ locale ];
	}
	return next;
}

export function WidgetTexts( {
	value,
	onChange,
}: {
	value: TextOverrides;
	onChange: ( next: TextOverrides ) => void;
} ) {
	const [ locale, setLocale ] = useState< string | null >( null );
	const q = useQuery( {
		queryKey: [ 'widget-texts', locale ],
		queryFn: async ( { signal } ) =>
			(
				await api.get< TextsInfo >( 'widget-texts', {
					query: locale ? { locale } : {},
					signal,
				} )
			).data,
	} );
	if ( ! q.data ) {
		return <LoadingRegion />;
	}
	const info = q.data;
	const mine = value[ info.locale ] ?? {};
	const count = Object.keys( mine ).length;
	return (
		<fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
			<legend className="px-1 text-sm font-medium">
				{ __( 'Texts and languages', 'cliedesk' ) }
			</legend>
			<p className="text-sm text-fg-muted">
				{ __(
					'Visitors see the widget in their language when it is active, else in the default language. Empty fields keep the built-in text.',
					'cliedesk'
				) }
			</p>
			<Select
				label={ __( 'Language', 'cliedesk' ) }
				value={ info.locale }
				onChange={ ( x ) => setLocale( String( x ) ) }
				options={ info.languages.map( ( l ) => ( {
					id: l.code,
					label: l.isDefault
						? sprintf(
								/* translators: %s: language name. */
								__( '%s (default)', 'cliedesk' ),
								l.name
							)
						: l.name,
				} ) ) }
			/>
			<details>
				<summary className="cursor-pointer text-sm font-medium">
					{ sprintf(
						/* translators: %d: number of custom texts. */
						_n(
							'Edit texts (%d changed)',
							'Edit texts (%d changed)',
							count,
							'cliedesk'
						),
						count
					) }
				</summary>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
					{ Object.entries( info.builtin ).map( ( [ key, text ] ) => (
						<TextField
							key={ `${ info.locale }-${ key }` }
							label={ text }
							placeholder={ text }
							value={ mine[ key ] ?? '' }
							onChange={ ( x ) =>
								onChange(
									withText( value, info.locale, key, x )
								)
							}
						/>
					) ) }
				</div>
			</details>
		</fieldset>
	);
}
