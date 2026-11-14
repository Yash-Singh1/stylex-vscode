import { describe, expect } from "vitest";
import { CancellationToken } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import onDocumentColor from "../../src/capabilities/document-colors";
import ServerState from "../../src/lib/server-state";
import { defaultSettings } from "../../src/lib/settings";
import { StringAsBytes } from "../../src/lib/string-bytes";
import { testParser } from "../helpers/parseSetup";

describe("document colors", () => {
  for (const declaration of ["using", "await using"]) {
    testParser(
      `finds colors inside and after ${declaration} declarations`,
      async ({ parser }) => {
        const source = `import stylex from "@stylexjs/stylex";

async function render() {
  ${declaration} resource = acquire(stylex.create({
    root: { color: "red" },
  }));
  const styles = stylex.create({
    root: { color: "blue" },
  });
}`;
        const textDocument = TextDocument.create(
          "file:///using.ts",
          "typescript",
          1,
          source,
        );
        const serverState = new ServerState();

        const colors = await onDocumentColor({
          params: { textDocument: { uri: textDocument.uri } },
          token: CancellationToken.None,
          serverState,
          settings: defaultSettings,
          textDocument,
          languageId: textDocument.languageId,
          parserInit: parser,
          byteRepresentation: new StringAsBytes(source),
        });

        expect(colors).toEqual(
          [
            { value: "red", color: { red: 1, green: 0, blue: 0, alpha: 1 } },
            { value: "blue", color: { red: 0, green: 0, blue: 1, alpha: 1 } },
          ].map(({ value, color }) => {
            const start = source.indexOf(`"${value}"`) + 1;
            return {
              range: {
                start: textDocument.positionAt(start),
                end: textDocument.positionAt(start + value.length),
              },
              color,
            };
          }),
        );
        expect(serverState.colorCache.get(textDocument.uri)).toEqual(colors);
      },
    );
  }
});
