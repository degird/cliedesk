/**
 * Webpack (wp-scripts) for the /dash app: three entries, each exposed as a global (plan.frontend-ux.md §4.1).
 *
 *   build/data.js  → window.cliedesk.data   (handle cliedesk-data)
 *   build/ui.js    → window.cliedesk.ui     (handle cliedesk-ui, imports @cliedesk/data as an external)
 *   build/app.js   → window.cliedesk.app    (handle cliedesk-app, imports @cliedesk/data and @cliedesk/ui as externals)
 *   build/app.css  ← Tailwind v4 over the --cd-* tokens
 *   build/public.css ← plain CSS over the same tokens: sign-in page and full-screen portal (PRT-29)
 *   build/chunks/app.{name}.{contenthash}.js  lazy route chunks
 *
 * React, ReactDOM, the JSX runtime and @wordpress/* come from WordPress core through dependency extraction.
 */
const path = require( 'node:path' );
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const DependencyExtractionWebpackPlugin = require( '@wordpress/dependency-extraction-webpack-plugin' );

const CLIEDESK_PACKAGES = { '@cliedesk/data': 'data', '@cliedesk/ui': 'ui', '@cliedesk/app': 'app' };

const base = Array.isArray( defaultConfig ) ? defaultConfig[ 0 ] : defaultConfig;

// Keep wp-scripts' loaders, CSS extraction and minifier; drop block, PHP-copy and RTL plugins (CSS uses logical properties).
const KEEP = new Set( [ 'MiniCssExtractPlugin', 'DefinePlugin', 'ProgressPlugin', 'BundleAnalyzerPlugin', 'ReactRefreshPlugin' ] );
const plugins = base.plugins.filter( ( p ) => p && KEEP.has( p.constructor.name ) );

const entry = ( name, file ) => ( {
	import: path.resolve( __dirname, file ),
	library: { name: [ 'cliedesk', name ], type: 'window' },
} );

const app = {
	...base,
	entry: {
		data: entry( 'data', 'app/packages/data/index.ts' ),
		ui: entry( 'ui', 'app/packages/ui/index.ts' ),
		app: entry( 'app', 'app/packages/app/index.ts' ),
		// PRT-29: build/public.css for the sign-in page and the full-screen portal (no script of its own).
		public: path.resolve( __dirname, 'app/styles/public.css' ),
	},
	output: {
		...base.output,
		path: path.resolve( __dirname, 'build' ),
		filename: '[name].js',
		chunkFilename: 'chunks/app.[name].[contenthash:8].js',
		uniqueName: 'cliedesk',
		publicPath: 'auto',
		// The widget build writes build/widget/ in parallel.
		clean: { keep: /^widget\// },
	},
	resolve: {
		...base.resolve,
		alias: {
			...( base.resolve && base.resolve.alias ),
		},
	},
	optimization: {
		...base.optimization,
		splitChunks: {
			chunks: 'async',
			cacheGroups: { default: false, defaultVendors: false },
		},
	},
	performance: { hints: false },
	plugins: [
		...plugins,
		new DependencyExtractionWebpackPlugin( {
			requestToExternal( request ) {
				if ( CLIEDESK_PACKAGES[ request ] ) {
					return [ 'cliedesk', CLIEDESK_PACKAGES[ request ] ];
				}
				return undefined;
			},
			requestToHandle( request ) {
				if ( CLIEDESK_PACKAGES[ request ] ) {
					return 'cliedesk-' + CLIEDESK_PACKAGES[ request ];
				}
				return undefined;
			},
		} ),
	],
};

/**
 * Chat widget (CHN-07, CHN-16): build/widget/cliedesk-widget.js (loader, no framework) and build/widget/panel.js
 * (Preact through preact/compat). Runs on the site's own pages, so nothing comes from WordPress globals.
 */
const widget = {
	...base,
	entry: {
		'cliedesk-widget': path.resolve( __dirname, 'app/packages/widget/loader.ts' ),
		panel: path.resolve( __dirname, 'app/packages/widget/panel-entry.tsx' ),
		request: path.resolve( __dirname, 'app/packages/widget/request-entry.ts' ),
		portal: path.resolve( __dirname, 'app/packages/widget/portal-entry.tsx' ),
	},
	output: {
		path: path.resolve( __dirname, 'build/widget' ),
		filename: '[name].js',
		uniqueName: 'cliedeskWidget',
		clean: true,
	},
	resolve: {
		...base.resolve,
		alias: {
			...( base.resolve && base.resolve.alias ),
			react: 'preact/compat',
			'react-dom/client': 'preact/compat/client',
			'react-dom': 'preact/compat',
			'react/jsx-runtime': 'preact/jsx-runtime',
		},
	},
	optimization: { ...base.optimization, splitChunks: false },
	performance: { hints: false },
	plugins: base.plugins.filter( ( p ) => p && [ 'DefinePlugin' ].includes( p.constructor.name ) ),
};

module.exports = [ app, widget ];
