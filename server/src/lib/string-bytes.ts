// String as bytes class as workaround for SWC giving bytes offset for span
// @see https://github.com/swc-project/swc/issues/1366#issuecomment-1576294504

const CHUNK_SIZE = 1000;

export class StringAsBytes {
  private string: Uint8Array;
  private decoder: TextDecoder;
  private encoder: TextEncoder;
  private prefixArray: Uint32Array;
  private originalString: string;

  constructor(string: string) {
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
    this.string = this.encoder.encode(string);
    this.prefixArray = new Uint32Array(0);
    this.originalString = string;

    this.calculatePrefixArray(string);
  }

  /**
   * Calculates the prefix array for the string.
   */
  private calculatePrefixArray(string: string) {
    // Break the string into chunks of CHUNK_SIZE characters and calculate the prefix sum array
    const prefixArray = new Uint32Array(
      Math.ceil(this.string.length / CHUNK_SIZE) + 1,
    );

    prefixArray[0] = 0;
    for (let i = 1; i <= Math.ceil(this.string.length / CHUNK_SIZE); ++i) {
      prefixArray[i] =
        prefixArray[i - 1] +
        this.encoder.encode(string.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE))
          .length;
    }

    this.prefixArray = prefixArray;
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
    while (curByteOffset < byteOffset) {
      curByteOffset += this.encoder.encode(
        this.originalString[strPosition],
      ).length;
      strPosition++;
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
