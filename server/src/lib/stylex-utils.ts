import dashifyFn from "@stylexjs/shared/lib/utils/dashify";
import transformValueFn from "@stylexjs/shared/lib/transform-value";
import type { Identifier, MemberExpression } from "@swc/types";
import type StateManager from "./state-manager";

export const dashify = (
  dashifyFn as unknown as typeof import("@stylexjs/shared/lib/utils/dashify")
).default;

const _transformValue = (
  transformValueFn as unknown as typeof import("@stylexjs/shared/lib/transform-value")
).default;

export const transformValue: typeof _transformValue = function (...args) {
  if (typeof args[1] === "string" && args[1] === "") return '""';
  return _transformValue(...args);
};

export function isStyleXPropertyType(
  expr: MemberExpression,
  stateManager: StateManager,
): expr is MemberExpression & { property: Identifier } {
  if (
    (expr.object.type === "MemberExpression" &&
      expr.object.object.type === "Identifier" &&
      expr.object.property.type === "Identifier" &&
      stateManager.verifyStylexIdentifier(expr.object.object.value) &&
      expr.object.property.value === "types") ||
    (expr.object.type === "Identifier" &&
      stateManager.verifyNamedImport(expr.object.value) === "types")
  ) {
    return true;
  }

  return false;
}
