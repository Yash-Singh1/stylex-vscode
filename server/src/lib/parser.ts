import type { TextDocument } from 'vscode-languageserver-textdocument';

type Parser = typeof import("../../node_modules/@swc/wasm-web");

export function parse({
  source,
  languageId,
  parser,
}: {
  source: string;
  languageId: string;
  parser: Parser;
}) {
  return parser.parse(source, {
    syntax: "typescript",
    tsx: languageId.endsWith("react"),
    target: "es2022",
    comments: true,
    decorators: true,
    dynamicImport: true,
  });
}

export function calculateStartOffset(textDocument: TextDocument) {
  let startOffset = 0;
  let line = textDocument.getText({
    start: { line: 0, character: 0 },
    end: { line: 1, character: 0 },
  });
  let currentLine = 1;
  let multilineComment = false;
  while (
    !line.trim() ||
    line.trim().startsWith("//") ||
    line.trim().startsWith("/*") ||
    multilineComment
  ) {
    let changes = true;
    let multilineCommentWasThere = false;
    while (changes) {
      changes = false;
      if (!multilineComment && line.trim().startsWith("/*")) {
        multilineComment = true;
        startOffset += line.indexOf("/*") + 2;
        line = line.trim().slice(2);
        changes = true;
        multilineCommentWasThere = true;
      }

      const multilineCommentEnd = line.indexOf("*/");
      if (multilineComment && multilineCommentEnd !== -1) {
        startOffset += multilineCommentEnd + 2;
        multilineComment = false;
        line = line.slice(multilineCommentEnd + 2);
        changes = true;
        multilineCommentWasThere = true;
        --startOffset;
      }
    }

    if (multilineCommentWasThere) {
      ++startOffset;
    }

    if (!line.trim() || line.trim().startsWith("//") || multilineComment) {
      startOffset += line.length;
      line = textDocument.getText({
        start: { line: currentLine, character: 0 },
        end: { line: currentLine + 1, character: 0 },
      });
      ++currentLine;
    } else {
      break;
    }
  }

  startOffset += /^\s*/.exec(line)![0].length;

  return startOffset;
}
