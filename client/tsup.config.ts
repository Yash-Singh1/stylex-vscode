import { defineConfig } from "tsup";

export default defineConfig({
  external: ["vscode"],
  banner: { js: "//shaylovestypescriptggs server code start" },
  entry: ["src/extension.ts"],
  sourcemap: true,
  outDir: "out",
});
