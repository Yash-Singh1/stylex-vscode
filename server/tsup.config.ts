import { defineConfig } from "tsup";

export default defineConfig({
  outExtension({ format }) {
    return {
      js: `.${format}`,
    };
  },
  splitting: false,
  outDir: "out",
  banner: { js: "//shaylovestypescriptggs server code start" },
  clean: true,
  entry: ["src/server.ts"],
  bundle: true,
  external: ["prettier"],
});
