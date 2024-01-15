// String as bytes class as workaround for SWC giving bytes offset for span
// @see https://github.com/swc-project/swc/issues/1366#issuecomment-1576294504

export class StringAsBytes {
  private string: Uint8Array;
  private decoder: TextDecoder;
  private encoder: TextEncoder;
  private prefixArray: Uint32Array;

  constructor(string: string) {
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
    this.string = this.encoder.encode(string);
    this.prefixArray = new Uint32Array(0);

    this.calculatePrefixArray(string);
  }

  /**
   * Calculates the prefix array for the string.
   */
  private calculatePrefixArray(string: string) {
    const prefixArray = new Uint32Array(this.string.length + 1);

    for (let i = 1; i <= this.string.length; i++) {
      prefixArray[i] =
        prefixArray[i - 1] + this.encoder.encode(string[i - 1]).length;
    }

    this.prefixArray = prefixArray;
  }

  /**
   * Binary searches the prefix sum array to find the character index for a given byte offset.
   * @param byteOffset Byte offset to convert to char index
   * @returns Char index
   */
  public byteOffsetToCharIndex(byteOffset: number) {
    let l = 0;
    let r = this.prefixArray.length;
    let ans = -1;

    while (l <= r) {
      const m = Math.floor((l + r) / 2);

      if (this.prefixArray[m] < byteOffset) {
        l = m + 1;
      } else if (this.prefixArray[m] > byteOffset) {
        r = m - 1;
      } else {
        ans = m;
        break;
      }
    }

    return ans;
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
