import type { CompletionItem, CompletionList } from "vscode-languageserver";
import type { Connection } from "../server";
import ServerState from "../lib/server-state";
import { StringAsBytes } from "../lib/string-bytes";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { UserConfiguration } from "../lib/settings";
import { calculateKeyValue, calculateStartOffset, parse } from "../lib/parser";
import StateManager from "../lib/state-manager";
import { handleImports, handleRequires } from "../lib/imports-handler";
import { States, walk } from "../lib/walk";
import { dashify, isStyleXPropertyType } from "../lib/stylex-utils";

type CompletionParams = Parameters<Parameters<Connection["onCompletion"]>[0]>;

const restrictionToProperty: {
  [K in keyof typeof import("@stylexjs/stylex").types]?: string;
} = {
  angle: `${ServerState.STYLEX_CUSTOM_PROPERTY}-angle`,
  color: "color",
  image: `${ServerState.STYLEX_CUSTOM_PROPERTY}-image`,
  length: `${ServerState.STYLEX_CUSTOM_PROPERTY}-length`,
  number: `${ServerState.STYLEX_CUSTOM_PROPERTY}-number`,
  integer: `${ServerState.STYLEX_CUSTOM_PROPERTY}-integer`,
  lengthPercentage: `${ServerState.STYLEX_CUSTOM_PROPERTY}-lengthPercentage`,
  percentage: `${ServerState.STYLEX_CUSTOM_PROPERTY}-percentage`,
  resolution: `${ServerState.STYLEX_CUSTOM_PROPERTY}-resolution`,
  time: `${ServerState.STYLEX_CUSTOM_PROPERTY}-time`,
  transformFunction: "transform",
  transformList: "transform",
  url: `${ServerState.STYLEX_CUSTOM_PROPERTY}-url`,
};

async function onCompletion({
  params,
  token,
  serverState,
  settings,
  textDocument,
  languageId,
  parserInit,
  byteRepresentation,
}: {
  params: CompletionParams[0];
  token: CompletionParams[1];
  serverState: ServerState;
  textDocument: TextDocument;
  settings: UserConfiguration;
  languageId: string;
  parserInit: typeof import("@swc/wasm-web/wasm-web.js");
  byteRepresentation: StringAsBytes;
}): Promise<CompletionList | null> {
  const text = textDocument.getText();

  if (!settings.suggestions) return null;

  let parseResult;
  try {
    if (serverState.parserCache.has(textDocument.uri)) {
      parseResult = serverState.parserCache.get(textDocument.uri)!;
    } else {
      parseResult = await parse({
        source: text,
        languageId,
        parser: parserInit,
        token,
      });
      serverState.parserCache.set(textDocument.uri, parseResult);
    }
  } catch (e) {
    console.log(e);
    return null;
  }

  let completions: CompletionItem[] = [];
  let itemDefaults: CompletionList["itemDefaults"];
  const stateManager = new StateManager();
  let moduleStart = 0;

  // Precalculate the byte offset of the parameter
  const paramByte = byteRepresentation.charIndexToByteOffset(
    textDocument.offsetAt(params.position),
  );

  await walk<{
    propertyName: string | undefined;
    callInside: string | null | undefined;
    propertyDeep: number;
  }>(
    parseResult,
    {
      Module(node) {
        moduleStart = node.span.start - calculateStartOffset(textDocument);
      },

      ImportDeclaration(node) {
        handleImports(node, stateManager, settings);

        return false;
      },

      VariableDeclarator(node) {
        handleRequires(node, stateManager, settings);
      },

      "*"(node) {
        if (
          "span" in node &&
          node.type !== "VariableDeclaration" &&
          paramByte < node.span.start - moduleStart &&
          paramByte > node.span.end - moduleStart
        ) {
          return false;
        }
      },

      WithStatement() {
        return false;
      },

      CallExpression(node, state) {
        let verifiedImport: string | undefined;

        if (
          (node.callee.type === "MemberExpression" &&
            node.callee.object.type === "Identifier" &&
            stateManager.verifyStylexIdentifier(node.callee.object.value) &&
            node.callee.property.type === "Identifier" &&
            (verifiedImport = node.callee.property.value)) ||
          (node.callee.type === "Identifier" &&
            [
              "create",
              "createTheme",
              "defineVars",
              "keyframes",
              "firstThatWorks",
            ].includes(
              (verifiedImport = stateManager.verifyNamedImport(
                node.callee.value,
              )) || "",
            ) &&
            verifiedImport)
        ) {
          if (verifiedImport === "create" || verifiedImport === "keyframes") {
            state.callInside = verifiedImport;
            state.propertyDeep = 1;
            return state;
          } else if (
            verifiedImport === "createTheme" ||
            verifiedImport === "defineVars"
          ) {
            state.callInside = verifiedImport;
            state.propertyDeep = 1;
            return {
              state,
              ignore: [
                verifiedImport === "createTheme" ? "arguments.0" : "",
                "callee",
              ],
            };
          } else if (verifiedImport === "firstThatWorks") {
            return;
          }
        } else if (
          node.callee.type === "MemberExpression" &&
          isStyleXPropertyType(node.callee, stateManager)
        ) {
          state.propertyName =
            restrictionToProperty[
              node.callee.property
                .value as keyof typeof import("@stylexjs/stylex").types
            ];
          if (
            node.arguments.length > 0 &&
            node.arguments[0].expression.type === "ObjectExpression"
          ) {
            state.propertyDeep += 1;
          }
          return state;
        }

        state.callInside = null;
        return state;
      },

      KeyValueProperty(node, state) {
        if (state && state.callInside) {
          if (
            (state.callInside === "create" ||
              state.callInside === "keyframes") &&
            state.propertyDeep === 2
          ) {
            state.propertyName = calculateKeyValue(node, stateManager);
            state.propertyDeep = 3;
          } else if (
            state.callInside === "createTheme" ||
            state.callInside === "defineVars"
          ) {
            if (node.value.type === "ObjectExpression") {
              state.propertyDeep += 1;
            }
            state.propertyName ??= ServerState.STYLEX_CUSTOM_PROPERTY;
          } else {
            state.propertyDeep += 1;
          }
          return state;
        }
      },

      StringLiteral(node, state) {
        if (state && state.callInside && state.propertyName !== "content") {
          const startSpanRelative = textDocument.positionAt(
            byteRepresentation.byteOffsetToCharIndex(
              node.span.start - moduleStart,
            ),
          );

          if (
            paramByte < node.span.start - moduleStart ||
            paramByte > node.span.end - moduleStart
          ) {
            return false;
          }

          const doc = serverState.virtualDocumentFactory.createVirtualDocument(
            dashify(state.propertyName || "--custom"),
            node.value,
          );

          const relativePosition = doc.positionAt(
            serverState.virtualDocumentFactory.mapOffsetToVirtualOffset(
              doc,
              params.position.character - startSpanRelative.character,
            ),
          );

          const cssCompletions = serverState.cssLanguageService!.doComplete(
            doc,
            relativePosition,
            serverState.cssLanguageService!.parseStylesheet(doc),
            {
              completePropertyWithSemicolon: false,
              triggerPropertyValueCompletion: true,
            },
          );

          completions = cssCompletions.items.map((item) => {
            const newTextEdit = item;
            if (newTextEdit.textEdit) {
              if ("range" in newTextEdit.textEdit) {
                newTextEdit.textEdit.range.start.line +=
                  params.position.line - relativePosition.line;
                newTextEdit.textEdit.range.end.line +=
                  params.position.line - relativePosition.line;
                newTextEdit.textEdit.range.start.character +=
                  params.position.character - relativePosition.character;
                newTextEdit.textEdit.range.end.character +=
                  params.position.character - relativePosition.character;
              } else {
                console.log(
                  "[WARN] Mapping InsertReplaceEdit is not supported yet.",
                );
                delete newTextEdit.textEdit;
              }
            }
            return newTextEdit;
          });

          // TODO: Preprocess itemDefaults
          itemDefaults = cssCompletions.itemDefaults;

          console.log("Found completions", completions);

          return States.EXIT;
        }
      },
    },
    token,
    {
      propertyName: undefined,
      propertyDeep: 0,
      callInside: undefined,
    },
  );

  return { items: completions, isIncomplete: true };
}

export default onCompletion;
