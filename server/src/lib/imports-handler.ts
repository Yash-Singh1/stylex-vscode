import type { ImportDeclaration, VariableDeclarator } from "@swc/types";
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

export function handleRequires(node: VariableDeclarator, state: StateManager) {
  if (
    node.init?.type !== "CallExpression" ||
    node.init.callee.type !== "Identifier" ||
    node.init.callee.value !== "require" ||
    node.init.arguments[0].expression.type !== "StringLiteral"
  ) {
    return;
  }

  if (node.init.arguments[0].expression.value !== "@stylexjs/stylex") {
    return;
  }

  switch (node.id.type) {
    case "Identifier":
      state.addStylexIdentifier(node.id.value);
      break;

    case "ObjectPattern":
      for (const property of node.id.properties) {
        if (property.type === "AssignmentPatternProperty") {
          state.addNamedImport(property.key.value, property.key.value);
        } else if (property.type === "KeyValuePatternProperty") {
          // TODO: Handle computed property keys
          if (
            property.value.type === "Identifier" &&
            property.key.type !== "Computed"
          ) {
            state.addNamedImport(
              property.value.value,
              property.key.value.toString(),
            );
          }
        }
      }
      break;
  }
}
