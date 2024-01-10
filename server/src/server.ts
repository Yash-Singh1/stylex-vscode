import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  DocumentColorParams,
  ColorInformation,
  Hover,
  MarkupKind,
} from "vscode-languageserver/node";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const wasmBuffer = readFileSync(
  join(__dirname, "../node_modules/@swc/wasm-web/wasm-web_bg.wasm"),
);

import { TextDocument } from "vscode-languageserver-textdocument";
import { States, walk } from "./lib/walk";
import { culoriColorToVscodeColor, getColorFromValue } from "./lib/color-logic";
import { type Color, formatHex8, formatRgb, formatHsl } from "culori";
import type { Identifier, StringLiteral } from "@swc/types";
import { evaluate } from "./lib/evaluate";
import StateManager from "./lib/state-manager";
import { handleImports } from "./lib/imports-handler";
import dashify from "@stylexjs/shared/lib/utils/dashify";
import transformValue from "@stylexjs/shared/lib/transform-value";
import stylexBabelPlugin from "@stylexjs/babel-plugin";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// Wrap server in async functions to allow "top-level await"
(async function () {
  // Import swc and initialize the WASM module
  const init = await import("@swc/wasm-web/wasm-web.js");
  await init.default(wasmBuffer);

  connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // Tell the client that this server supports code completion.
        completionProvider: {
          // triggerCharacters: ['"', "'"],
        },
        colorProvider: true,
        hoverProvider: true,
      },
    };

    if (hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true,
        },
      };
    }

    return result;
  });

  connection.onInitialized(() => {
    if (hasConfigurationCapability) {
      // Register for all configuration changes.
      connection.client.register(
        DidChangeConfigurationNotification.type,
        undefined,
      );
    }

    if (hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders((_event) => {
        connection.console.log("Workspace folder change event received.");
      });
    }
  });
  interface UserConfiguration {
    includedLanguages: Record<string, string>;
  }

  // The global settings, used when the `workspace/configuration` request is not supported by the client.
  // Please note that this is not the case when using this server with the client provided in this example
  // but could happen with other clients.
  const defaultSettings = {
    includedLanguages: {},
  } satisfies UserConfiguration;
  let globalSettings: UserConfiguration = defaultSettings;

  // Cache the settings of all open documents
  const documentSettings: Map<string, Thenable<UserConfiguration>> = new Map();

  connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
      // Reset all cached document settings
      documentSettings.clear();
    } else {
      globalSettings = <UserConfiguration>(
        (change.settings.stylex || defaultSettings)
      );
    }
  });

  function getDocumentSettings(resource: string): Thenable<UserConfiguration> {
    if (!hasConfigurationCapability) {
      return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
      result = connection.workspace.getConfiguration({
        scopeUri: resource,
        section: "stylex",
      });
      documentSettings.set(resource, result);
    }
    return result;
  }

  const colorCache = new Map<string, ColorInformation[]>();

  // Clear cache for documents that closed
  documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
    colorCache.delete(e.document.uri);
  });

  connection.onDidOpenTextDocument((_change) => {
    // Monitored files have change in VSCode
    connection.console.log("We received a file change event");
  });

  // This handler provides the completion items.
  connection.onCompletion(
    (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
      const textDocument = documents.get(
        textDocumentPosition.textDocument.uri,
      )!;
      const text = textDocument.getText();

      let doubleQuoteCount = 0,
        singleQuoteCount = 0;
      for (const char of text) {
        if (char === '"') doubleQuoteCount++;
        else if (char === "'") singleQuoteCount++;
      }

      let quote = "'";
      if (doubleQuoteCount > singleQuoteCount) {
        quote = '"';
      }

      return [
        // TODO: Make this have a code action maybe? Or it would be better if StyleX shifted away from all imports
        // @see https://github.com/facebook/stylex/discussions/261
        {
          label: "Import StyleX Namespace",
          kind: CompletionItemKind.Reference,
          insertText: `import * as stylex from ${quote}@stylexjs/stylex${quote};`,
        },
        // TODO: Look into using CSS Language Server for more completion items
      ];
    },
  );

  async function getLanguageId(uri: string, document: TextDocument) {
    const { includedLanguages } = await getDocumentSettings(uri);

    let languageId = document.languageId;
    if (includedLanguages[languageId]) {
      languageId = includedLanguages[languageId];
    }

    return languageId;
  }

  function calculateStartOffset(textDocument: TextDocument) {
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

  // We might want to limit this to color restricted properties to allow further reliability (idk)
  // @see https://github.com/microsoft/vscode-css-languageservice/blob/main/src/data/webCustomData.ts
  connection.onDocumentColor(async (params: DocumentColorParams) => {
    const textDocument = documents.get(params.textDocument.uri)!;
    const text = textDocument.getText();

    const languageId = await getLanguageId(
      params.textDocument.uri,
      textDocument,
    );

    let parseResult;
    try {
      parseResult = await init.parse(text, {
        syntax: "typescript",
        tsx: languageId.endsWith("react"),
        target: "es2022",
        comments: true,
        decorators: true,
        dynamicImport: true,
      });
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

      console.log(
        "Found color",
        color,
        node.value,
        node.span.start,
        moduleStart,
      );

      return {
        range: {
          // Offsets to keep colors inside the quotes
          start: textDocument.positionAt(
            node.span.start - moduleStart + startOffset + 1,
          ),
          end: textDocument.positionAt(
            node.span.end - moduleStart + startOffset - 1,
          ),
        },
        color: culoriColorToVscodeColor(color),
      };
    }

    walk(
      parseResult,
      {
        Module(node) {
          moduleStart = node.span.start;
        },

        ImportDeclaration(node) {
          handleImports(node, stateManager);

          return false;
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
            const resultingValue = evaluate(node.value, stateManager);

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
      { callInside: null },
    );

    colorCache.delete(params.textDocument.uri);
    colorCache.set(params.textDocument.uri, colors);

    return colors;
  });

  connection.onColorPresentation((params) => {
    const prevColors = colorCache.get(params.textDocument.uri) || [];

    // Binary Search for color we are looking for
    let left = 0,
      right = prevColors.length - 1,
      ans = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      if (
        prevColors[mid].range.start.line < params.range.start.line ||
        (prevColors[mid].range.start.line === params.range.start.line &&
          prevColors[mid].range.start.character < params.range.start.character)
      ) {
        left = mid + 1;
      } else if (
        prevColors[mid].range.start.line > params.range.start.line ||
        (prevColors[mid].range.start.line === params.range.start.line &&
          prevColors[mid].range.start.character > params.range.start.character)
      ) {
        right = mid - 1;
      } else {
        ans = mid;
        break;
      }
    }

    const prevColor = ans >= 0 ? prevColors[ans] : undefined;

    const colorValue = prevColor
      ? ({
          mode: "rgb",
          r: prevColor.color.red,
          g: prevColor.color.green,
          b: prevColor.color.blue,
          alpha: prevColor.color.alpha,
        } satisfies Color)
      : undefined;

    const newColor = {
      mode: "rgb",
      r: params.color.red,
      g: params.color.green,
      b: params.color.blue,
      alpha: params.color.alpha,
    } satisfies Color;
    let hexValue = formatHex8(newColor);

    if (
      params.color.alpha === 1 &&
      (!colorValue || !colorValue.alpha || colorValue.alpha === 1)
    ) {
      hexValue = hexValue.replace(/ff$/, "");
    }

    return [
      {
        label: hexValue,
      },
      {
        label: formatRgb(newColor),
      },
      {
        label: formatHsl(newColor),
      },
    ];
  });

  const hoverCache = new Map<string, Required<Hover>[]>();

  connection.onHover(async (params) => {
    const document = documents.get(params.textDocument.uri)!;
    const text = document.getText();

    const languageId = await getLanguageId(params.textDocument.uri, document);

    // TODO: Actually get caching working
    if (hoverCache.has(params.textDocument.uri)) {
      const styleHovers = hoverCache.get(params.textDocument.uri)!;

      // TODO: Use binary search for perf on large files
      for (const styleHover of styleHovers) {
        const start = styleHover.range.start;
        const end = styleHover.range.end;

        if (
          params.position.line >= start.line &&
          (params.position.line !== start.line ||
            params.position.character >= start.character) &&
          params.position.line <= end.line &&
          (params.position.line !== end.line ||
            params.position.character <= end.character)
        ) {
          return styleHover;
        }
      }
    }

    const startOffset = calculateStartOffset(document);

    let parseResult;
    try {
      parseResult = await init.parse(text, {
        syntax: "typescript",
        tsx: languageId.endsWith("react"),
        target: "es2022",
        comments: true,
        decorators: true,
        dynamicImport: true,
      });
    } catch (e) {
      console.log(e);
      return undefined;
    }

    let moduleStart = 0;

    const stateManager = new StateManager();

    // Resulting hover
    let hover: Hover | undefined = undefined;

    walk(
      parseResult,
      {
        Module(node) {
          moduleStart = node.span.start - startOffset;
          stateManager.pushConstantScope();
        },

        "*"(node) {
          if ("span" in node) {
            const startSpanRelative = document.positionAt(
              node.span.start - moduleStart,
            );
            const endSpanRelative = document.positionAt(
              node.span.end - moduleStart,
            );

            if (
              params.position.line > endSpanRelative.line ||
              params.position.line < startSpanRelative.line
            ) {
              return false;
            }
          }
        },

        BlockStatement() {
          stateManager.pushConstantScope();
        },

        "BlockStatement:exit"() {
          stateManager.popConstantScope();
        },

        VariableDeclaration(node, state) {
          if (node.kind === "const") {
            for (const declaration of node.declarations) {
              // TODO: Support more static things for constants
              if (
                declaration.init &&
                declaration.init.type === "StringLiteral" &&
                declaration.id.type === "Identifier"
              ) {
                stateManager.addConstantToScope(
                  declaration.id.value,
                  declaration.init.value,
                );
              }
            }
          }
        },

        ImportDeclaration(node) {
          handleImports(node, stateManager);

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
              parent?.type === "VariableDeclarator" ? parent.id : null;

            if (verifiedImport === "create" || verifiedImport === "keyframes") {
              return {
                ...state,
                callInside: verifiedImport,
                callerIdentifier:
                  callerID?.type === "Identifier" ? callerID.value : null,
              };
            } else if (
              verifiedImport === "createTheme" ||
              verifiedImport === "defineVars"
            ) {
              return {
                state: {
                  ...state,
                  callInside: verifiedImport,
                  callerIdentifier:
                    callerID?.type === "Identifier" ? callerID.value : null,
                },
                ignore: [
                  verifiedImport === "createTheme" ? "arguments.0" : "",
                  "callee",
                ],
              };
            }
          }

          return {
            ...state,
            callInside: null,
          };
        },

        WithStatement() {
          return false;
        },

        KeyValueProperty(node, state) {
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

          if (state && key && state.callInside) {
            if (node.value.type === "ObjectExpression") {
              return { ...state, parentClass: [...state.parentClass, key] };
            }

            const startSpanRelative = document.positionAt(
              node.key.span.start - moduleStart,
            );
            const endSpanRelative = document.positionAt(
              node.key.span.end - moduleStart,
            );

            // Don't use out of range nodes
            if (
              !(
                params.position.line >= startSpanRelative.line &&
                params.position.line <= endSpanRelative.line &&
                (params.position.line !== startSpanRelative.line ||
                  params.position.character >= startSpanRelative.character) &&
                (params.position.line !== endSpanRelative.line ||
                  params.position.character <= endSpanRelative.character)
              )
            ) {
              return state;
            }

            const classLine = [
              ...(state.callInside === "create" ||
              state.callInside === "keyframes"
                ? []
                : [
                    state.callerIdentifier
                      ? `.${state.callerIdentifier}`
                      : ":root",
                  ]),
              ...(<string[]>state.parentClass).slice(
                state.callInside === "create" ||
                  state.callInside === "keyframes"
                  ? 0
                  : 1,
              ),
              key,
            ];

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
                        index === 0 ||
                        (className !== "default" && className.startsWith(":")),
                    )
                    .sort()
                    .reverse()
                    .join("") || "unknown")
                : classLine[0];

            const dashifyFn = (
              dashify as unknown as typeof import("@stylexjs/shared/lib/utils/dashify")
            ).default;

            const transformValueFn = (
              transformValue as unknown as typeof import("@stylexjs/shared/lib/transform-value")
            ).default;

            const propertyName =
              (state.callInside === "create" || state.callInside === "keyframes"
                ? classLine
                    .reverse()
                    .find(
                      (className) =>
                        !(
                          className.startsWith(":") ||
                          className.startsWith("@") ||
                          className === "default"
                        ),
                    )
                : `--${state.parentClass[0] || key}`) || "unknown";

            cssLines.push(`${indentation.slice(2)}${parentSelector} {`);

            const staticValue = evaluate(node.value, stateManager);
            const dashifyPropertyKey = dashifyFn(propertyName);

            const stylexConfig = {
              dev: true,
              test: false,
              classNamePrefix: "",
              styleResolution: "application-order",
              useRemForFontSize: false,
            } as const;

            if (staticValue.static) {
              if ("value" in staticValue) {
                if (staticValue.value == null) {
                  cssLines.push(
                    `${indentation}${dashifyPropertyKey}: initial;`,
                  );
                } else if (typeof staticValue.value === "string") {
                  cssLines.push(
                    `${indentation}${dashifyPropertyKey}: ${staticValue.value};`,
                  );
                } else if (Array.isArray(staticValue.value)) {
                  for (const element of staticValue.value) {
                    if (element.static) {
                      if ("value" in element) {
                        if (typeof element.value === "string") {
                          cssLines.push(
                            `${indentation}${dashifyPropertyKey}: ${transformValueFn(
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
                            `${indentation}${dashifyPropertyKey}: ${transformValueFn(
                              propertyName,
                              element.value,
                              stylexConfig,
                            )};`,
                          );
                        }
                      } else if ("id" in element) {
                        cssLines.push(
                          `${indentation}${dashifyPropertyKey}: ${
                            ["animation", "animationName"].includes(
                              propertyName,
                            )
                              ? element.id
                              : `var(--${element.id})`
                          };`,
                        );
                      }
                    }
                  }
                } else if (typeof staticValue.value === "number") {
                  cssLines.push(
                    `${indentation}${dashifyPropertyKey}: ${transformValueFn(
                      propertyName,
                      staticValue.value,
                      stylexConfig,
                    )};`,
                  );
                }
              } else if ("id" in staticValue) {
                cssLines.push(
                  `${indentation}${dashifyPropertyKey}: ${
                    ["animation", "animationName"].includes(propertyName)
                      ? staticValue.id
                      : `var(--${staticValue.id})`
                  };`,
                );
              }
            }

            cssLines.push(`${indentation.slice(2)}}`);

            for (let atIndex = 0; atIndex < atIncluded.length; ++atIndex) {
              cssLines.push(`${"  ".repeat(--indentSize)}}`);
            }

            if (cssLines.length > 2) {
              cssLines = [
                stylexBabelPlugin.processStylexRules(
                  [["abcd", { ltr: cssLines.join("\n"), rtl: null }, 3000]],
                  false,
                ),
              ];
              hover = {
                contents: {
                  kind: MarkupKind.Markdown,
                  value: ["```css", ...cssLines, "```"].join("\n"),
                },
                range: {
                  start: document.positionAt(node.key.span.start - moduleStart),
                  end: document.positionAt(node.key.span.end - moduleStart),
                },
              };

              console.log("Successfully found hover", hover);
              return States.EXIT;
            }
          }

          return state;
        },
      },
      { parentClass: [], callInside: null },
    );

    return hover;
  });

  // Make the text document manager listen on the connection
  // for open, change and close text document events
  documents.listen(connection);

  // Listen on the connection
  connection.listen();
})();
