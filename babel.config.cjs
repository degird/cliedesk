/**
 * Babel: WordPress preset (TypeScript + automatic JSX runtime). Used by webpack (wp-scripts) and Jest.
 */
module.exports = {
	presets: [ require.resolve( '@wordpress/babel-preset-default' ) ],
};
