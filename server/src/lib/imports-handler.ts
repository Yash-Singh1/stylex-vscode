import type { ImportDeclaration, VariableDeclarator } from "@swc/types";
import StateManager from "./state-manager";
import type { UserConfiguration } from "./settings";

export function handleImports(
  node: ImportDeclaration,
  state: StateManager,
  config: UserConfiguration,
) {
  if (!config.aliasModuleNames.includes(node.source.value)) {
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

export function handleRequires(
  node: VariableDeclarator,
  state: StateManager,
  config: UserConfiguration,
) {
  if (
    node.init?.type !== "CallExpression" ||
    node.init.callee.type !== "Identifier" ||
    node.init.callee.value !== "require" ||
    node.init.arguments[0].expression.type !== "StringLiteral"
  ) {
    return;
  }

  if (
    !config.aliasModuleNames.includes(node.init.arguments[0].expression.value)
  ) {
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
          if (property.value.type === "Identifier") {
            if (property.key.type === "Computed") {
              if (property.key.expression.type === "StringLiteral") {
                state.addNamedImport(
                  property.value.value,
                  property.key.expression.value,
                );
              } else if (property.key.expression.type === "Identifier") {
                const constantValue = state.getConstantFromScope(
                  property.key.expression.value,
                );
                if (typeof constantValue === "string") {
                  state.addNamedImport(property.value.value, constantValue);
                }
              }
            } else {
              state.addNamedImport(
                property.value.value,
                property.key.value.toString(),
              );
            }
          }
        }
      }
      break;
  }
}
