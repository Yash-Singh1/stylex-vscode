import { defineConfig } from "tsup";

// TODO: Migrate client over to tsup instead of tsc
export default defineConfig({
  external: ["vscode"],
  banner: { js: "//shaylovestypescriptggs server code start" },
  entry: ["src/extension.ts"],
  sourcemap: true,
  outDir: "out",
});
