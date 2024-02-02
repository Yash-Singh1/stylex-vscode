// String as bytes class as workaround for SWC giving bytes offset for span
// @see https://github.com/swc-project/swc/issues/1366#issuecomment-1576294504

import type ServerState from "./server-state";
import type { createIntlSegmenterPolyfill } from "intl-segmenter-polyfill";

const CHUNK_SIZE = 1000;

export function getByteRepresentation(
  uri: string,
  text: string,
  serverState: ServerState,
  polyfill: Awaited<ReturnType<typeof createIntlSegmenterPolyfill>>,
) {
  if (serverState.bytePrefixCache.has(uri)) {
    return serverState.bytePrefixCache.get(uri)!;
  } else {
    const byteRepresentation = new StringAsBytes(text, polyfill);
    serverState.bytePrefixCache.set(uri, byteRepresentation);
    return byteRepresentation;
  }
}

export class StringAsBytes {
  private stringLength: number;
  private encoder: TextEncoder;
  private prefixArray: Uint32Array;
  private stringSegments: string[];
  private preStringLength: Uint32Array;

  constructor(
    string: string,
    Segmenter: Awaited<ReturnType<typeof createIntlSegmenterPolyfill>>,
  ) {
    this.encoder = new TextEncoder();
    this.stringLength = 0;
    this.prefixArray = new Uint32Array(0);
    this.preStringLength = new Uint32Array(0);
    this.stringSegments = [
      ...new Segmenter("en", { granularity: "grapheme" })
        .segment(string)
        .map((part) => part.segment),
    ];

    this.calculatePrefixArray();
  }

  /**
   * Calculates the prefix array for the string.
   */
  private calculatePrefixArray() {
    // Break the string into chunks of CHUNK_SIZE characters and calculate the prefix sum array
    const prefixArray = new Uint32Array(
      Math.ceil(this.stringSegments.length / CHUNK_SIZE) + 1,
    );
    const preStringLength = new Uint32Array(
      Math.ceil(this.stringSegments.length / CHUNK_SIZE) + 1,
    );

    prefixArray[0] = 0;
    for (
      let i = 1;
      i <= Math.ceil(this.stringSegments.length / CHUNK_SIZE);
      ++i
    ) {
      prefixArray[i] =
        prefixArray[i - 1] +
        this.encoder.encode(
          this.stringSegments
            .slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE)
            .join(""),
        ).length;
      preStringLength[i] =
        preStringLength[i - 1] +
        this.stringSegments.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE).join("")
          .length;
    }

    this.prefixArray = prefixArray;
    this.preStringLength = preStringLength;
    this.stringLength = prefixArray[prefixArray.length - 1];
  }

  /**
   * Binary searches the prefix sum array to find the character index for a given byte offset.
   * @param byteOffset Byte offset to convert to char index
   * @returns Char index
   */
  public byteOffsetToCharIndex(byteOffset: number) {
    // Calculate the lower bound for the current byte offset
    let l = 0;
    let r = this.prefixArray.length;
    let ans = -1;

    while (l <= r) {
      const m = Math.floor((l + r) / 2);

      if (this.prefixArray[m] <= byteOffset) {
        ans = m;
        l = m + 1;
      } else {
        r = m - 1;
      }
    }

    // Calculate the char index for the current byte offset (should take max of CHUNK_SIZE iterations)
    let curByteOffset = this.prefixArray[ans];
    let strPosition = Math.min(ans * CHUNK_SIZE, this.stringLength);
    let strIndex = strPosition;
    strPosition = this.preStringLength[ans];

    while (curByteOffset < byteOffset) {
      curByteOffset += this.encoder.encode(
        this.stringSegments[strIndex],
      ).length;
      strPosition += this.stringSegments[strIndex].length;
      ++strIndex;
    }

    return strPosition;
  }
}
