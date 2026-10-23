import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess({})],
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.includes('node_modules') ? undefined : true)
	},
	kit: {
		// Firebase App Hosting builds and runs this as a plain Node server on Cloud Run.
		adapter: adapter()
	}
};

export default config;
