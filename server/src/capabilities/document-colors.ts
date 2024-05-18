import type { Connection } from "../server";
import ServerState from "../lib/server-state";
import { StringAsBytes } from "../lib/string-bytes";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { UserConfiguration } from "../lib/settings";
import { calculateStartOffset, parse } from "../lib/parser";
import StateManager from "../lib/state-manager";
import { handleImports, handleRequires } from "../lib/imports-handler";
import { walk } from "../lib/walk";
import type { ColorInformation } from "vscode-languageserver";
import type {
  Identifier,
  StringLiteral,
  TsLiteralType,
  TsUnionType,
} from "@swc/types";
import {
  culoriColorToVscodeColor,
  getColorFromValue,
} from "../lib/color-logic";
import { evaluate } from "../lib/evaluate";
import { inspect } from "node:util";
import { isStyleXPropertyType } from "../lib/stylex-utils";

type ColorParams = Parameters<Parameters<Connection["onDocumentColor"]>[0]>;

async function onDocumentColor({
  params,
  token,
  serverState,
  settings,
  textDocument,
  languageId,
  parserInit,
  byteRepresentation,
}: {
  params: ColorParams[0];
  token: ColorParams[1];
  serverState: ServerState;
  textDocument: TextDocument;
  settings: UserConfiguration;
  languageId: string;
  parserInit: typeof import("@swc/wasm-web/wasm-web.js");
  byteRepresentation: StringAsBytes;
}): Promise<ColorInformation[] | null> {
  const text = textDocument.getText();

  if (!settings.colorDecorators) return null;

  let parseResult;
  try {
    if (serverState.parserCache.has(params.textDocument.uri)) {
      parseResult = serverState.parserCache.get(params.textDocument.uri)!;
    } else {
      parseResult = await parse({
        source: text,
        languageId,
        parser: parserInit,
        token,
      });
      serverState.parserCache.set(params.textDocument.uri, parseResult);
    }
  } catch (e) {
    console.log(e);
    return [];
  }

  const colors: ColorInformation[] = [];

  const stateManager = new StateManager();

  const startOffset = calculateStartOffset(textDocument);
  let moduleStart = 0;

  function handleStringLiteral(
    node: StringLiteral | { value: string; span: StringLiteral["span"] },
  ) {
    const color = getColorFromValue(node.value);

    if (
      color === null ||
      typeof color === "string" ||
      (color.alpha ?? 1) === 0
    ) {
      return false;
    }

    return {
      range: {
        // Offsets to keep colors inside the quotes
        start: textDocument.positionAt(
          byteRepresentation.byteOffsetToCharIndex(
            node.span.start - moduleStart + startOffset + 1,
          ),
        ),
        end: textDocument.positionAt(
          byteRepresentation.byteOffsetToCharIndex(
            node.span.end - moduleStart + startOffset - 1,
          ),
        ),
      },
      color: culoriColorToVscodeColor(color),
    };
  }

  function handleTypeStrings(typeNode: TsUnionType | TsLiteralType) {
    if (typeNode.type === "TsUnionType") {
      for (const unionValue of typeNode.types) {
        if (unionValue.type === "TsLiteralType") {
          handleTypeStrings(unionValue);
        }
      }
    } else {
      if (
        typeNode.literal.type === "StringLiteral" ||
        typeNode.literal.type === "TemplateLiteral"
      ) {
        const resultingValue = evaluate(typeNode.literal, stateManager);

        if (
          resultingValue.static &&
          "value" in resultingValue &&
          typeof resultingValue.value === "string"
        ) {
          const color = handleStringLiteral({
            value: resultingValue.value,
            span: resultingValue.span,
          });
          if (color) colors.push(color);
        }
      }
    }
  }

  await walk<{ callInside: string | null | undefined }>(
    parseResult,
    {
      Module(node) {
        moduleStart = node.span.start;
      },

      ImportDeclaration(node) {
        handleImports(node, stateManager, settings);

        return false;
      },

      VariableDeclarator(node) {
        handleRequires(node, stateManager, settings);
      },

      TsTypeReference(node) {
        if (
          node.typeName.type === "Identifier" &&
          ["StyleXStyles", "StaticStyles"].includes(
            stateManager.verifyNamedImport(node.typeName.value) || "",
          ) &&
          node.typeParams
        ) {
          node.typeParams.params.forEach((param) => {
            if (param.type === "TsTypeLiteral") {
              param.members.forEach((member) => {
                if (
                  member.type === "TsPropertySignature" &&
                  member.typeAnnotation &&
                  (member.typeAnnotation.typeAnnotation.type ===
                    "TsLiteralType" ||
                    member.typeAnnotation.typeAnnotation.type === "TsUnionType")
                ) {
                  handleTypeStrings(member.typeAnnotation.typeAnnotation);
                }
              });
            }
          });
        }
      },

      CallExpression(node) {
        let verifiedImport: string | undefined;

        if (
          (node.callee.type === "MemberExpression" &&
            node.callee.property.type === "Identifier" &&
            (node.callee.property.value === "create" ||
              node.callee.property.value === "createTheme" ||
              node.callee.property.value === "defineVars" ||
              node.callee.property.value === "keyframes") &&
            node.callee.object.type === "Identifier" &&
            stateManager.verifyStylexIdentifier(node.callee.object.value)) ||
          (node.callee.type === "Identifier" &&
            ["create", "createTheme", "defineVars", "keyframes"].includes(
              (verifiedImport = stateManager.verifyNamedImport(
                node.callee.value,
              )) || "",
            ) &&
            verifiedImport)
        ) {
          return {
            callInside:
              node.callee.type === "Identifier"
                ? verifiedImport
                : (<Identifier>node.callee.property).value,
          };
        }
      },

      KeyValueProperty(node, state) {
        if (
          state &&
          state.callInside != null &&
          (node.value.type === "StringLiteral" ||
            node.value.type === "CallExpression" ||
            node.value.type === "ArrayExpression" ||
            node.value.type === "TemplateLiteral")
        ) {
          let nodeValue = node.value;

          if (
            node.value.type === "CallExpression" &&
            node.value.callee.type === "MemberExpression" &&
            isStyleXPropertyType(node.value.callee, stateManager)
          ) {
            if (node.value.callee.property.value === "color") {
              if (node.value.arguments.length > 0) {
                const newNodeValue = node.value.arguments[0].expression;
                if (
                  newNodeValue.type === "StringLiteral" ||
                  newNodeValue.type === "TemplateLiteral" ||
                  newNodeValue.type === "CallExpression" ||
                  newNodeValue.type === "ArrayExpression"
                ) {
                  nodeValue = newNodeValue;
                }
              } else {
                return;
              }
            } else {
              return false;
            }
          }

          const resultingValue = evaluate(nodeValue, stateManager);

          if (resultingValue.static && "value" in resultingValue) {
            if (typeof resultingValue.value === "string") {
              const color = handleStringLiteral({
                value: resultingValue.value,
                span: resultingValue.span,
              });
              if (color) colors.push(color);
            } else if (Array.isArray(resultingValue.value)) {
              for (const element of resultingValue.value) {
                if (
                  element.static &&
                  "value" in element &&
                  typeof element.value === "string"
                ) {
                  const color = handleStringLiteral({
                    value: element.value,
                    span: element.span,
                  });
                  if (color) colors.push(color);
                }
              }
            }
          }
        }
      },
    },
    token,
    { callInside: null },
  );

  serverState.colorCache.delete(params.textDocument.uri);
  serverState.colorCache.set(params.textDocument.uri, colors);

  console.log("Found colors", inspect(colors, { depth: 10 }));

  return colors;
}

export default onDocumentColor;
