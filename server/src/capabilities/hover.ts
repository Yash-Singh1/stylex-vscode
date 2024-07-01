import type { TextDocument } from "vscode-languageserver-textdocument";
import type ServerState from "../lib/server-state";
import { StringAsBytes } from "../lib/string-bytes";
import { Connection } from "../server";
import { UserConfiguration } from "../lib/settings";
import { calculateStartOffset, parse } from "../lib/parser";
import StateManager from "../lib/state-manager";
import { MarkupKind, type Hover } from "vscode-languageserver";
import { States, walk } from "../lib/walk";
import { evaluate } from "../lib/evaluate";
import { handleImports, handleRequires } from "../lib/imports-handler";
import * as prettier from "prettier";
import stylexBabelPlugin from "@stylexjs/babel-plugin";
import {
  dashify,
  isStyleXPropertyType,
  transformValue,
} from "../lib/stylex-utils";

type HoverParams = Parameters<Parameters<Connection["onHover"]>[0]>;

const precedeDoubleDash = (value: string) => {
  return value.startsWith("--") ? value : `--${value}`;
};

async function onHover({
  params,
  token,
  textDocument,
  languageId,
  serverState,
  settings,
  parserInit,
  byteRepresentation,
}: {
  params: HoverParams[0];
  token: HoverParams[1];
  textDocument: TextDocument;
  languageId: string;
  serverState: ServerState;
  settings: UserConfiguration;
  parserInit: typeof import("@swc/wasm-web/wasm-web.js");
  byteRepresentation: StringAsBytes;
}) {
  const text = textDocument.getText();

  if (!settings.hover) return null;

  const startOffset = calculateStartOffset(textDocument);

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
    return undefined;
  }

  let moduleStart = 0;

  const stateManager = new StateManager();

  // Resulting hover
  let hover: Hover | null = null;

  const paramByte = byteRepresentation.charIndexToByteOffset(
    textDocument.offsetAt(params.position),
  );

  await walk<{
    parentClass: string[];
    callInside: string | null | undefined;
    callerIdentifier: string | null | undefined;
    propertyType: string | null;
  }>(
    parseResult,
    {
      Module(node) {
        moduleStart = node.span.start - startOffset;
        stateManager.pushConstantScope();
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

      BlockStatement() {
        stateManager.pushConstantScope();
      },

      "BlockStatement:exit"() {
        stateManager.popConstantScope();
      },

      VariableDeclaration(node) {
        if (node.kind === "const") {
          for (const declaration of node.declarations) {
            if (!declaration.init || declaration.id.type !== "Identifier")
              continue;

            const result = evaluate(declaration.init, stateManager);

            if (result.static && "value" in result) {
              stateManager.addConstantToScope(
                declaration.id.value,
                result.value,
              );
            }
          }
        }
      },

      VariableDeclarator(node) {
        handleRequires(node, stateManager, settings);
      },

      ImportDeclaration(node) {
        handleImports(node, stateManager, settings);

        return false;
      },

      CallExpression(node, state, parent) {
        let verifiedImport: string | undefined;

        if (
          (node.callee.type === "MemberExpression" &&
            node.callee.object.type === "Identifier" &&
            stateManager.verifyStylexIdentifier(node.callee.object.value) &&
            node.callee.property.type === "Identifier" &&
            (verifiedImport = node.callee.property.value)) ||
          (node.callee.type === "Identifier" &&
            ["create", "createTheme", "defineVars", "keyframes"].includes(
              (verifiedImport = stateManager.verifyNamedImport(
                node.callee.value,
              )) || "",
            ) &&
            verifiedImport)
        ) {
          const callerID =
            parent?.type === "VariableDeclarator"
              ? parent.id
              : state.callerIdentifier && state.callerIdentifier.startsWith("1")
                ? {
                    type: "Identifier",
                    value: state.callerIdentifier.slice(1),
                  }
                : null;

          state.callInside = verifiedImport;
          state.callerIdentifier =
            callerID?.type === "Identifier" ? callerID.value : null;
          if (verifiedImport === "create" || verifiedImport === "keyframes") {
            return state;
          } else if (
            verifiedImport === "createTheme" ||
            verifiedImport === "defineVars"
          ) {
            return {
              state,
              ignore: [
                verifiedImport === "createTheme" ? "arguments.0" : "",
                "callee",
              ],
            };
          }
        } else if (
          node.callee.type === "MemberExpression" &&
          isStyleXPropertyType(node.callee, stateManager)
        ) {
          state.propertyType = dashify(node.callee.property.value);
          return state;
        }

        state.callInside = null;
        state.callerIdentifier = null;
        return state;
      },

      WithStatement() {
        return false;
      },

      async KeyValueProperty(node, state) {
        if (state && state.callInside) {
          let key: string | undefined;

          if (
            node.key.type === "Identifier" ||
            node.key.type === "StringLiteral"
          ) {
            key = node.key.value;
          } else if (node.key.type === "Computed") {
            if (node.key.expression.type === "StringLiteral") {
              key = node.key.expression.value;
            } else if (node.key.expression.type === "Identifier") {
              key = stateManager
                .getConstantFromScope(node.key.expression.value)
                ?.toString();
            }
          }

          if (!key) return;

          let nodeValue = node.value;
          let propertyType = state.propertyType;

          if (
            node.value.type === "CallExpression" &&
            node.value.callee.type === "MemberExpression" &&
            isStyleXPropertyType(node.value.callee, stateManager)
          ) {
            if (node.value.arguments.length > 0) {
              const newNodeValue = node.value.arguments[0].expression;
              propertyType = dashify(node.value.callee.property.value);
              nodeValue = newNodeValue;
            } else {
              return false;
            }
          }

          if (
            nodeValue.type === "ObjectExpression" ||
            nodeValue.type === "ArrowFunctionExpression"
          ) {
            state.parentClass.push(key);
            return state;
          }

          if (
            node.value.type === "CallExpression" &&
            ((node.value.callee.type === "Identifier" &&
              stateManager.verifyNamedImport(node.value.callee.value) ===
                "keyframes") ||
              (node.value.callee.type === "MemberExpression" &&
                node.value.callee.object.type === "Identifier" &&
                node.value.callee.property.type === "Identifier" &&
                stateManager.verifyStylexIdentifier(
                  node.value.callee.object.value,
                ) &&
                node.value.callee.property.value === "keyframes"))
          ) {
            state.parentClass = [];
            state.callInside = "keyframes";
            state.callerIdentifier = "1" + key;
            return state;
          }

          // Don't use out of range nodes
          if (
            paramByte > node.key.span.end - moduleStart ||
            paramByte < node.key.span.start - moduleStart
          ) {
            return state;
          }

          const classLine = [];
          if (
            state.callInside !== "create" &&
            state.callInside !== "keyframes"
          ) {
            classLine.push(
              state.callerIdentifier ? `.${state.callerIdentifier}` : ":root",
            );
          }
          classLine.push(
            ...state.parentClass.slice(
              state.callInside === "create" || state.callInside === "keyframes"
                ? 0
                : 1,
            ),
            key,
          );

          const atIncluded = classLine.filter((className) =>
            className.startsWith("@"),
          );
          if (state.callInside === "keyframes") {
            atIncluded.unshift(
              `@keyframes ${state.callerIdentifier || "unknown"}`,
            );
          }
          const indentation = "  ".repeat(atIncluded.length + 1);

          let cssLines: string[] = [];

          classLine.reverse();
          const propertyName =
            (state.callInside === "create" || state.callInside === "keyframes"
              ? classLine.find(
                  (className) =>
                    !(
                      className.startsWith(":") ||
                      className.startsWith("@") ||
                      className === "default"
                    ),
                )
              : precedeDoubleDash(state.parentClass[0] || key)) || "unknown";
          classLine.reverse();
          const dashifyPropertyKey = dashify(propertyName);

          if (propertyType) {
            cssLines.push(`@property ${dashifyPropertyKey} {`);
            cssLines.push(`  syntax: "<${propertyType}>";`);
            cssLines.push("}");
            cssLines.push("");
          }

          let indentSize = 0;

          for (const atInclude of atIncluded) {
            cssLines.push(`${"  ".repeat(indentSize++)}${atInclude} {`);
          }

          const parentSelector =
            state.callInside === "create"
              ? "." +
                (classLine
                  .slice(0)
                  .filter(
                    (className, index) =>
                      index === 0 || className.startsWith(":"),
                  )
                  .sort()
                  .reverse()
                  .join("") || "unknown")
              : classLine[0];

          cssLines.push(`${indentation.slice(2)}${parentSelector} {`);

          const staticValue = evaluate(nodeValue, stateManager);

          const stylexConfig = {
            dev: true,
            test: false,
            classNamePrefix: "",
            styleResolution: "application-order",
            useRemForFontSize: settings.useRemForFontSize,
          } satisfies Parameters<typeof transformValue>[2];

          if (staticValue.static) {
            if ("value" in staticValue) {
              if (staticValue.value == null) {
                cssLines.push(`${indentation}${dashifyPropertyKey}: initial;`);
              } else if (typeof staticValue.value === "string") {
                cssLines.push(
                  `${indentation}${dashifyPropertyKey}: ${transformValue(
                    propertyName,
                    staticValue.value,
                    stylexConfig,
                  )};`,
                );
              } else if (Array.isArray(staticValue.value)) {
                for (const element of staticValue.value) {
                  if (element.static) {
                    if ("value" in element) {
                      if (typeof element.value === "string") {
                        cssLines.push(
                          `${indentation}${dashifyPropertyKey}: ${transformValue(
                            propertyName,
                            element.value,
                            stylexConfig,
                          )};`,
                        );
                      } else if (element.value == null) {
                        cssLines.push(
                          `${indentation}${dashifyPropertyKey}: initial;`,
                        );
                      } else if (typeof element.value === "number") {
                        cssLines.push(
                          `${indentation}${dashifyPropertyKey}: ${transformValue(
                            propertyName,
                            element.value,
                            stylexConfig,
                          )};`,
                        );
                      }
                    } else if ("id" in element) {
                      cssLines.push(
                        `${indentation}${dashifyPropertyKey}: ${
                          ["animation", "animationName"].includes(propertyName)
                            ? element.id
                            : `var(--${element.id})`
                        };`,
                      );
                    }
                  }
                }
              } else if (typeof staticValue.value === "number") {
                cssLines.push(
                  `${indentation}${dashifyPropertyKey}: ${transformValue(
                    propertyName,
                    staticValue.value,
                    stylexConfig,
                  )};`,
                );
              } else {
                return States.EXIT;
              }
            } else if ("id" in staticValue) {
              cssLines.push(
                `${indentation}${dashifyPropertyKey}: ${
                  ["animation", "animationName"].includes(propertyName)
                    ? staticValue.id
                    : `var(--${staticValue.id})`
                };`,
              );
            } else {
              return States.EXIT;
            }
          } else {
            return States.EXIT;
          }

          cssLines.push(`${indentation.slice(2)}}`);

          for (let atIndex = 0; atIndex < atIncluded.length; ++atIndex) {
            cssLines.push(`${"  ".repeat(--indentSize)}}`);
          }

          if (cssLines.length > 2) {
            cssLines = [
              (
                await prettier.format(
                  stylexBabelPlugin.processStylexRules(
                    [["abcd", { ltr: cssLines.join("\n"), rtl: null }, 3000]],
                    false,
                  ),
                  {
                    parser: "css",
                  },
                )
              ).trim(),
            ];

            hover = {
              contents: {
                kind: MarkupKind.Markdown,
                value: ["```css", ...cssLines, "```"].join("\n"),
              },
              range: {
                start: textDocument.positionAt(
                  byteRepresentation.byteOffsetToCharIndex(
                    node.key.span.start - moduleStart,
                  ),
                ),
                end: textDocument.positionAt(
                  byteRepresentation.byteOffsetToCharIndex(
                    node.key.span.end - moduleStart,
                  ),
                ),
              },
            };

            console.log("Successfully found hover", hover);
            return States.EXIT;
          }
        }

        return state;
      },
    },
    token,
    {
      parentClass: [],
      callInside: null,
      callerIdentifier: undefined,
      propertyType: null,
    },
  );

  return hover;
}

export default onHover;
