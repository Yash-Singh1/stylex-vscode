import { defineConfig } from "tsup";

export default defineConfig({
  external: ["vscode"],
  splitting: false,
  banner: { js: "//shaylovestypescriptggs client code start" },
  entry: ["src/extension.ts"],
  sourcemap: true,
  outDir: "out",
  bundle: true,
  clean: true,
});
