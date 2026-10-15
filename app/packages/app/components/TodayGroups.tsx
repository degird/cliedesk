/**
 * Home → My day (INB-10): my assigned conversations, deadlines due today, mentions, followed and copied
 * conversations, side-thread answers and any group a module adds — counts and the first 10 of each — and the morning
 * email switch. An item links to its conversation, else to its `path` when the server gives one.
 */
import { api, useMutation, useQuery, useQueryClient } from '@cliedesk/data';
import { Skeleton, Slot, Switch } from '@cliedesk/ui';
import { Link } from '@tanstack/react-router';
import { __, sprintf } from '@wordpress/i18n';

interface TodayItem {
	id: number;
	uid?: string;
	number: number;
	subject: string;
	dueAt: string | null;
	lastAt: string | null;
	/** App path for items that are not a conversation (e.g. '/approvals' with Pro). */
	path?: string;
}

interface TodayData {
	groups: Record< string, { count: number; items: TodayItem[] } >;
	labels: Record< string, string >;
	digest: boolean;
}

const KEY = [ 'home', 'today' ] as const;

const LINK = 'text-accent-fg underline-offset-2 hover:underline';

/**
 * One item: its conversation, else its path, else plain text.
 *
 * @param props      Props.
 * @param props.item Item.
 */
function Item( { item }: { item: TodayItem } ) {
	if ( item.number > 0 ) {
		return (
			<Link
				to="/c/$number"
				params={ { number: String( item.number ) } }
				className={ LINK }
			>
				{ sprintf(
					/* translators: 1: conversation number, 2: subject. */
					__( '#%1$d %2$s', 'cliedesk' ),
					item.number,
					item.subject || __( '(no subject)', 'cliedesk' )
				) }
			</Link>
		);
	}
	if ( item.path ) {
		return (
			<Link to={ item.path } className={ LINK }>
				{ item.subject }
			</Link>
		);
	}
	return <>{ item.subject }</>;
}

export function TodayGroups() {
	const qc = useQueryClient();
	const q = useQuery( {
		queryKey: KEY,
		queryFn: async ( { signal } ) =>
			( await api.get< TodayData >( 'home/today', { signal } ) ).data,
	} );
	const digest = useMutation( {
		mutationFn: ( on: boolean ) =>
			api.put( 'home/digest', { body: { on } } ),
		onSuccess: () => void qc.invalidateQueries( { queryKey: KEY } ),
	} );
	if ( ! q.data ) {
		return <Skeleton lines={ 4 } />;
	}
	const groups = q.data.groups ?? {};
	const labels = q.data.labels ?? {};
	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 md:grid-cols-2">
				{ Object.entries( labels ).map( ( [ key, label ] ) => {
					const group = groups[ key ];
					if ( ! group ) {
						return null;
					}
					return (
						<section
							key={ key }
							aria-label={ label }
							className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4"
						>
							<h3 className="flex items-center justify-between font-semibold">
								<span>{ label }</span>
								<span className="cd-tabular text-fg-muted">
									{ group.count }
								</span>
							</h3>
							{ group.count === 0 ? (
								<p className="text-sm text-fg-muted">
									{ __( 'Nothing here.', 'cliedesk' ) }
								</p>
							) : (
								<ul className="flex flex-col gap-1 text-sm">
									{ group.items.map( ( item, i ) => (
										<li
											key={ `${ key }-${ item.id || item.uid || i }` }
										>
											<Item item={ item } />
										</li>
									) ) }
								</ul>
							) }
						</section>
					);
				} ) }
			</div>
			<Switch
				isSelected={ q.data.digest }
				onChange={ ( on ) => digest.mutate( on ) }
			>
				{ __( 'Email me this every morning', 'cliedesk' ) }
			</Switch>
			{ /* Slack and Teams delivery is Pro: its badge without Pro. */ }
			<Slot name="home.digest_channels" />
		</div>
	);
}
