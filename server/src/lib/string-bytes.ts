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
  private string: Uint8Array;
  private decoder: TextDecoder;
  private encoder: TextEncoder;
  private prefixArray: Uint32Array;
  private originalString: string[];
  private preStringLength: Uint32Array;

  constructor(
    string: string,
    Segmenter: Awaited<ReturnType<typeof createIntlSegmenterPolyfill>>,
  ) {
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
    this.string = this.encoder.encode(string);
    this.prefixArray = new Uint32Array(0);
    this.preStringLength = new Uint32Array(0);
    this.originalString = [
      ...new Segmenter("en", { granularity: "grapheme" })
        .segment(string)
        .map((part) => part.segment),
    ];

    this.calculatePrefixArray(this.originalString);
  }

  /**
   * Calculates the prefix array for the string.
   */
  private calculatePrefixArray(string: string[]) {
    // Break the string into chunks of CHUNK_SIZE characters and calculate the prefix sum array
    const prefixArray = new Uint32Array(
      Math.ceil(string.length / CHUNK_SIZE) + 1,
    );
    const preStringLength = new Uint32Array(
      Math.ceil(string.length / CHUNK_SIZE) + 1,
    );

    prefixArray[0] = 0;
    for (let i = 1; i <= Math.ceil(string.length / CHUNK_SIZE); ++i) {
      prefixArray[i] =
        prefixArray[i - 1] +
        this.encoder.encode(
          string.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE).join(""),
        ).length;
      preStringLength[i] =
        preStringLength[i - 1] +
        string.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE).join("").length;
    }

    this.prefixArray = prefixArray;
    this.preStringLength = preStringLength;
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
    let strPosition = Math.min(ans * CHUNK_SIZE, this.string.length);
    let strIndex = strPosition;
    strPosition = this.preStringLength[ans];

    while (curByteOffset < byteOffset) {
      curByteOffset += this.encoder.encode(
        this.originalString[strIndex],
      ).length;
      strPosition += this.originalString[strIndex].length;
      ++strIndex;
    }

    return strPosition;
  }

  /**
   * Returns a slice of the string by providing byte indices.
   * @param from - Byte index to slice from
   * @param to - Optional byte index to slice to
   */
  public slice(from: number, to?: number): string {
    return this.decoder.decode(
      new DataView(
        this.string.buffer,
        from,
        to !== undefined ? to - from : undefined,
      ),
    );
  }
}
