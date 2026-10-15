/**
 * Panel bundle entry: exposes `window.__cliedeskPanel` for the loader.
 */
import { createRoot, type Root } from 'react-dom/client';
import { WidgetClient } from './client';
import { ChatPanel } from './ChatPanel';
import type { PanelApi } from './types';

const roots = new WeakMap< HTMLElement, Root >();
let client: WidgetClient | null = null;
let opened = 0;

const api: PanelApi = {
	open( mount, config, onClose, start ) {
		client ??= new WidgetClient( config );
		let root = roots.get( mount );
		if ( ! root ) {
			root = createRoot( mount );
			roots.set( mount, root );
		}
		root.render(
			<ChatPanel
				key={ start ? ++opened : 0 }
				config={ config }
				client={ client }
				onClose={ onClose }
				start={ start }
			/>
		);
	},
	close( mount ) {
		roots.get( mount )?.render( null );
	},
	forget() {
		client?.forget();
	},
};

window.__cliedeskPanel = api;
