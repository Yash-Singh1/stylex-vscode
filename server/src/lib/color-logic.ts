// Color logic from Tailwind CSS IntelliSense

import * as culori from "culori";
import * as namedColors from "color-name";
import type { Color } from "vscode-languageserver";
import { StringLiteral } from "@swc/wasm-web";

export type KeywordColor = "transparent" | "currentColor";

export function getColorFromValue(
  value: unknown,
): culori.Color | KeywordColor | null {
  // console.log(typeof value);

  if (typeof value !== "string") return null;

  const trimmedValue = value.trim();

  if (trimmedValue.toLowerCase() === "transparent") {
    return "transparent";
  }

  if (trimmedValue.toLowerCase() === "currentcolor") {
    return "currentColor";
  }

  if (
    !/^\s*(?:rgba?|hsla?)\s*\([^)]+\)\s*$/.test(trimmedValue) &&
    !/^\s*#[0-9a-f]+\s*$/i.test(trimmedValue) &&
    !Object.keys(
      (namedColors as unknown as { default: typeof import("color-name") })
        .default,
    ).includes(trimmedValue)
  ) {
    // console.log('fail here', trimmedValue, Object.keys(namedColors));
    return null;
  }

  const color = culori.parse(trimmedValue);
  // console.log('unparsable', color);
  return color ?? null;
}

const toRgb = culori.converter("rgb");

export function culoriColorToVscodeColor(color: culori.Color): Color {
  const rgb = toRgb(color);
  return { red: rgb.r, green: rgb.g, blue: rgb.b, alpha: rgb.alpha ?? 1 };
}
