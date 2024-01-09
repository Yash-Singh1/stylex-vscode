import type { ImportDeclaration } from "@swc/types";
import StateManager from "./state-manager";

export function handleImports(node: ImportDeclaration, state: StateManager) {
  // TODO: Configuration option for stylex package name or scan for it
  if (node.source.value !== "@stylexjs/stylex") {
    return;
  }

  for (const specifier of node.specifiers) {
    switch (specifier.type) {
      case "ImportDefaultSpecifier":
        state.addStylexIdentifier(specifier.local.value);
        break;

      case "ImportSpecifier": {
        if (specifier.imported && specifier.imported.value === "default") {
          state.addStylexIdentifier(specifier.local.value);
        } else if (specifier.imported) {
          state.addNamedImport(specifier.local.value, specifier.imported.value);
        } else {
          state.addNamedImport(specifier.local.value, specifier.local.value);
        }
        break;
      }

      case "ImportNamespaceSpecifier":
        state.addStylexIdentifier(specifier.local.value);
        break;
    }
  }
}
