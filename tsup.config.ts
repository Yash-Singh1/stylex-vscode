import { defineConfig } from 'tsup';

// TODO: Migrate client over to tsup instead of tsc
export default defineConfig({
	outExtension({ format }) {
		return {
			js: `.${format}`,
		};
	},
	banner: { js: '//shaylovestypescriptggs server code start' },
});
