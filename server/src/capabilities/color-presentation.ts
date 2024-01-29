import { Connection } from "../server";
import type ServerState from "../lib/server-state";
import { type Color, formatHex8, formatRgb, formatHsl } from "culori";

type ColorPresentationParams = Parameters<
  Parameters<Connection["onColorPresentation"]>[0]
>;

async function onColorPresentation({
  params,
  serverState,
}: {
  params: ColorPresentationParams[0];
  serverState: ServerState;
}) {
  const prevColors = serverState.colorCache.get(params.textDocument.uri) || [];

  // Binary Search for color we are looking for
  let left = 0,
    right = prevColors.length - 1,
    ans = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (
      prevColors[mid].range.start.line < params.range.start.line ||
      (prevColors[mid].range.start.line === params.range.start.line &&
        prevColors[mid].range.start.character < params.range.start.character)
    ) {
      left = mid + 1;
    } else if (
      prevColors[mid].range.start.line > params.range.start.line ||
      (prevColors[mid].range.start.line === params.range.start.line &&
        prevColors[mid].range.start.character > params.range.start.character)
    ) {
      right = mid - 1;
    } else {
      ans = mid;
      break;
    }
  }

  const prevColor = ans >= 0 ? prevColors[ans] : undefined;

  const colorValue = prevColor
    ? ({
        mode: "rgb",
        r: prevColor.color.red,
        g: prevColor.color.green,
        b: prevColor.color.blue,
        alpha: prevColor.color.alpha,
      } satisfies Color)
    : undefined;

  const newColor = {
    mode: "rgb",
    r: params.color.red,
    g: params.color.green,
    b: params.color.blue,
    alpha: params.color.alpha,
  } satisfies Color;
  let hexValue = formatHex8(newColor);

  if (
    params.color.alpha === 1 &&
    (!colorValue || !colorValue.alpha || colorValue.alpha === 1)
  ) {
    hexValue = hexValue.replace(/ff$/, "");
  }

  return [
    {
      label: hexValue,
    },
    {
      label: formatRgb(newColor),
    },
    {
      label: formatHsl(newColor),
    },
  ];
}

export default onColorPresentation;
