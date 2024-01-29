import dashifyFn from "@stylexjs/shared/lib/utils/dashify";
import transformValueFn from "@stylexjs/shared/lib/transform-value";

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
