// String as bytes class as workaround for SWC giving bytes offset for span
// @see https://github.com/swc-project/swc/issues/1366#issuecomment-1576294504

export class StringAsBytes {
  private string: Uint8Array;
  private decoder: TextDecoder;

  constructor(string: string) {
    this.decoder = new TextDecoder();
    this.string = new TextEncoder().encode(string);
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
