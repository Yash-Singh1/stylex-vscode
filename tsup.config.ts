import { defineConfig } from 'tsup';

export default defineConfig({
	outExtension({ format }) {
		return {
			js: `.${format}`,
		};
	},
	banner: { js: '//shaylovestypescriptggs server code start' },
});
