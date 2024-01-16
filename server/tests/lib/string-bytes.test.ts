import { StringAsBytes } from "../../src/lib/string-bytes";
import { expect, describe, test } from "vitest";

describe("StringAsBytes", () => {
  test("byteOffsetToCharIndex no unicode", () => {
    const string = "Hello, world!";
    const stringAsBytes = new StringAsBytes(string);

    expect(stringAsBytes.byteOffsetToCharIndex(0)).toBe(0);
    expect(stringAsBytes.byteOffsetToCharIndex(1)).toBe(1);
    expect(stringAsBytes.byteOffsetToCharIndex(5)).toBe(5);
    expect(stringAsBytes.byteOffsetToCharIndex(6)).toBe(6);
    expect(stringAsBytes.byteOffsetToCharIndex(12)).toBe(12);
    expect(stringAsBytes.byteOffsetToCharIndex(13)).toBe(13);
  });

  test("byteOffsetToCharIndex with unicode", () => {
    const string = "❤️ Hello, ❤️ world!";
    const stringAsBytes = new StringAsBytes(string);

    expect(stringAsBytes.byteOffsetToCharIndex(4)).toBe(2);
    expect(stringAsBytes.byteOffsetToCharIndex(8)).toBe(4);
  });
});
