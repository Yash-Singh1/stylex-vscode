// The idea of have a virtual document is to create a fake document to pass into the CSS Language Service to get the correct CSS completions.
// This is what the now deprecated `typescript-styled-plugin` did internall to get the correct (S)CSS completions.

import type { TextDocument } from "vscode-languageserver-textdocument";

interface CSSVirtualDocumentImplementation {
  createVirtualDocument(key: string, value: string): TextDocument;
  mapOffsetToVirtualOffset(
    virtualDocument: TextDocument,
    offset: number,
  ): number;
}

export class CSSVirtualDocument implements CSSVirtualDocumentImplementation {
  private static readonly wrapperPreRoot = ":root{\n";

  public constructor() {}

  public createVirtualDocument(key: string, value: string) {
    const text = `${CSSVirtualDocument.wrapperPreRoot}${key}: ${value};\n}`;
    return {
      uri: "untitled://embedded.css",
      languageId: "css",
      version: 1,
      getText: () => text,

      // Position utilities that are needed to implement TextDocument
      // We don't need binary search here because the stylesheets are relatively small
      positionAt(offset) {
        let lineNum = 0;
        let curOffset = 0;
        for (const line of text.split(/\r?\n/)) {
          if (curOffset + line.length < offset) {
            curOffset += line.length + 1;
          } else {
            return {
              line: lineNum,
              character: offset - curOffset,
            };
          }
          ++lineNum;
        }
        return {
          line: -1,
          character: -1,
        };
      },

      offsetAt(position) {
        let offset = 0;
        for (let i = 0; i < position.line; ++i) {
          offset += text.split("\n")[i].length + 1;
        }
        return offset + position.character;
      },

      lineCount: text.split("\n").length + 1,
    } satisfies TextDocument;
  }

  public mapOffsetToVirtualOffset(
    virtualDocument: TextDocument,
    offset: number,
  ): number {
    return (
      offset +
      virtualDocument
        .getText()
        .indexOf(": ", CSSVirtualDocument.wrapperPreRoot.length) +
      1
    );
  }
}
