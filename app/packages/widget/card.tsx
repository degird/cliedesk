/**
 * Cards in replies (DEV-20): the same card the agent sidebar shows (title, badge, text, fields, list, https image,
 * buttons, a small form), for the chat widget and the customer portal. Link buttons open their page; action buttons
 * and forms call `onPress( index, values )`, which asks the server to run the card's own action.
 */
import { useId, useState, type FormEvent } from 'react';

export interface ReplyCard {
	title?: string;
	badge?: { text: string; tone: string };
	blocks: Array<
		| { type: 'text'; text: string }
		| { type: 'fields'; items: Array< { label: string; value: string } > }
		| { type: 'list'; items: string[] }
		| { type: 'image'; url: string; alt?: string }
		| {
				type: 'buttons';
				items: Array< {
					label: string;
					url?: string;
					action?: string;
				} >;
		  }
		| {
				type: 'form';
				action: string;
				submit?: string;
				inputs: Array< {
					name: string;
					label: string;
					type: string;
					required?: boolean;
					options?: string[];
				} >;
		  }
	>;
}

type Press = (
	index: number,
	values?: Record< string, string | boolean >
) => Promise< void >;

function CardForm( {
	block,
	index,
	onPress,
	send,
}: {
	block: Extract< ReplyCard[ 'blocks' ][ number ], { type: 'form' } >;
	index: number;
	onPress: Press;
	send: string;
} ) {
	const [ values, setValues ] = useState<
		Record< string, string | boolean >
	>( {} );
	const id = useId();
	const submit = ( e: FormEvent ) => {
		e.preventDefault();
		void onPress( index, values );
	};
	return (
		<form className="cdw-card-form" onSubmit={ submit }>
			{ block.inputs.map( ( i ) => (
				<div key={ i.name }>
					<label htmlFor={ `${ id }-${ i.name }` }>{ i.label }</label>
					{ i.type === 'select' && (
						<select
							id={ `${ id }-${ i.name }` }
							required={ i.required }
							value={ String( values[ i.name ] ?? '' ) }
							onChange={ ( e ) =>
								setValues( {
									...values,
									[ i.name ]: e.currentTarget.value,
								} )
							}
						>
							<option value="" />
							{ ( i.options ?? [] ).map( ( o ) => (
								<option key={ o } value={ o }>
									{ o }
								</option>
							) ) }
						</select>
					) }
					{ i.type === 'bool' && (
						<input
							id={ `${ id }-${ i.name }` }
							type="checkbox"
							checked={ !! values[ i.name ] }
							onChange={ ( e ) =>
								setValues( {
									...values,
									[ i.name ]: e.currentTarget.checked,
								} )
							}
						/>
					) }
					{ ( i.type === 'text' || i.type === 'number' ) && (
						<input
							id={ `${ id }-${ i.name }` }
							type={ i.type }
							required={ i.required }
							value={ String( values[ i.name ] ?? '' ) }
							onChange={ ( e ) =>
								setValues( {
									...values,
									[ i.name ]: e.currentTarget.value,
								} )
							}
						/>
					) }
				</div>
			) ) }
			<button type="submit">{ block.submit || send }</button>
		</form>
	);
}

/**
 * A card.
 *
 * @param props         Props.
 * @param props.card    Card.
 * @param props.onPress Run a button or form (by its number among buttons and forms).
 * @param props.send    Label of a form's button when the card has none.
 */
export function CardBlocks( {
	card,
	onPress,
	send = 'Send',
}: {
	card: ReplyCard;
	onPress: Press;
	send?: string;
} ) {
	const [ done, setDone ] = useState< string | null >( null );
	let pressable = -1;
	const press = (
		index: number,
		values?: Record< string, string | boolean >
	) =>
		onPress( index, values ).then(
			() => setDone( '✓' ),
			( e: Error ) => setDone( e.message || '!' )
		);
	return (
		<section
			className="cdw-reply-card"
			aria-label={ card.title || undefined }
		>
			{ ( card.title || card.badge ) && (
				<p className="cdw-reply-card-head">
					{ card.title && <strong>{ card.title }</strong> }
					{ card.badge && (
						<span
							className={ `cdw-badge cdw-tone-${ card.badge.tone }` }
						>
							{ card.badge.text }
						</span>
					) }
				</p>
			) }
			{ card.blocks.map( ( b, i ) => {
				switch ( b.type ) {
					case 'text':
						return <p key={ i }>{ b.text }</p>;
					case 'fields':
						return (
							<dl key={ i }>
								{ b.items.map( ( f ) => (
									<div key={ f.label }>
										<dt>{ f.label }</dt>
										<dd>{ f.value }</dd>
									</div>
								) ) }
							</dl>
						);
					case 'list':
						return (
							<ul key={ i }>
								{ b.items.map( ( item ) => (
									<li key={ item }>{ item }</li>
								) ) }
							</ul>
						);
					case 'image':
						return (
							<img key={ i } src={ b.url } alt={ b.alt ?? '' } />
						);
					case 'buttons':
						return (
							<div key={ i } className="cdw-options">
								{ b.items.map( ( item ) => {
									if ( item.url ) {
										return (
											<a
												key={ item.label }
												href={ item.url }
												target="_blank"
												rel="noopener noreferrer"
											>
												{ item.label }
											</a>
										);
									}
									const n = ++pressable;
									return (
										<button
											key={ item.label }
											type="button"
											onClick={ () => void press( n ) }
										>
											{ item.label }
										</button>
									);
								} ) }
							</div>
						);
					case 'form': {
						const n = ++pressable;
						return (
							<CardForm
								key={ i }
								block={ b }
								index={ n }
								onPress={ press }
								send={ send }
							/>
						);
					}
				}
				return null;
			} ) }
			{ done && (
				<p role="status" className="cdw-reply-card-done">
					{ done }
				</p>
			) }
		</section>
	);
}
