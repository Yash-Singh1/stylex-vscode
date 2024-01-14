import type { Module } from "@swc/types";
import type { CancellationToken } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

type Parser = typeof import("../../node_modules/@swc/wasm-web");

const PARSE_CANCELLED_MESSAGE = "[INFO] Parse Job Cancelled";

export function parse({
  source,
  languageId,
  parser,
  token,
}: {
  source: string;
  languageId: string;
  parser: Parser;
  token: CancellationToken;
}) {
  return new Promise<Module>((resolve, reject) => {
    token.onCancellationRequested(() => {
      reject(PARSE_CANCELLED_MESSAGE);
    });

    if (token.isCancellationRequested) {
      reject(PARSE_CANCELLED_MESSAGE);
    }

    parser
      .parse(source, {
        syntax: "typescript",
        tsx: languageId.endsWith("react"),
        target: "es2022",
        comments: true,
        decorators: true,
        dynamicImport: true,
      })
      .then((value) => resolve(value))
      .catch(reject);
  });
}

export function calculateStartOffset(textDocument: {
  getText(range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }): string;
}) {
  let startOffset = 0;
  let line = textDocument
    .getText({
      start: { line: 0, character: 0 },
      end: { line: 1, character: 0 },
    })
    .slice(0, -1);
  let currentLine = 1;
  let multilineComment = false;

  while (
    !line.trim() ||
    line.trim().startsWith("//") ||
    line.trim().startsWith("/*") ||
    multilineComment
  ) {
    let changes = true;
    while (changes) {
      changes = false;
      if (!multilineComment && line.trim().startsWith("/*")) {
        multilineComment = true;
        startOffset += line.indexOf("/*") + 2;
        line = line.trim().slice(2);
        changes = true;
      }

      const multilineCommentEnd = line.indexOf("*/");
      if (multilineComment && multilineCommentEnd !== -1) {
        startOffset += multilineCommentEnd + 2;
        multilineComment = false;
        line = line.slice(multilineCommentEnd + 2);
        changes = true;
      }
    }

    if (!line.trim() || line.trim().startsWith("//") || multilineComment) {
      startOffset += line.length + 1;
      line = textDocument
        .getText({
          start: { line: currentLine, character: 0 },
          end: { line: currentLine + 1, character: 0 },
        })
        .slice(0, -1);
      ++currentLine;
    } else {
      break;
    }
  }

  startOffset += /^\s*/.exec(line)![0].length;

  return startOffset;
}
