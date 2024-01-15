import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  ColorInformation,
  Hover,
  MarkupKind,
  CompletionItem,
  CompletionList,
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
import type {
  Identifier,
  KeyValueProperty,
  Module,
  StringLiteral,
  TsLiteralType,
  TsUnionType,
} from "@swc/types";
import { evaluate } from "./lib/evaluate";
import StateManager from "./lib/state-manager";
import { handleImports, handleRequires } from "./lib/imports-handler";
import dashify from "@stylexjs/shared/lib/utils/dashify";
import transformValue from "@stylexjs/shared/lib/transform-value";
import stylexBabelPlugin from "@stylexjs/babel-plugin";

import * as prettier from "prettier";
import { calculateStartOffset, parse } from "./lib/parser";
import { defaultSettings, type UserConfiguration } from "./lib/settings";
import { CSSVirtualDocument } from "./lib/virtual-document";
import { getCSSLanguageService } from "vscode-css-languageservice";
import { inspect } from "node:util";
import { StringAsBytes } from "./lib/string-bytes";

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

  const dashifyFn = (
    dashify as unknown as typeof import("@stylexjs/shared/lib/utils/dashify")
  ).default;

  const _transformValueFn = (
    transformValue as unknown as typeof import("@stylexjs/shared/lib/transform-value")
  ).default;

  const transformValueFn: typeof _transformValueFn = function (...args) {
    if (typeof args[1] === "string" && args[1] === "") return '""';
    return _transformValueFn(...args);
  };

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
          triggerCharacters: ['"', "'"],
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

  // The global settings, used when the `workspace/configuration` request is not supported by the client.
  // Please note that this is not the case when using this server with the client provided in this example
  // but could happen with other clients.
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
  const parseCache = new Map<string, Module>();

  const virtualDocumentFactory = new CSSVirtualDocument();

  // Clear cache for documents that closed
  documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
    colorCache.delete(e.document.uri);
    parseCache.delete(e.document.uri);
  });

  documents.onDidChangeContent((e) => {
    parseCache.delete(e.document.uri);
  });

  connection.onDidOpenTextDocument((_change) => {
    // Monitored files have change in VSCode
    connection.console.log("We received a file change event");
  });

  const cssLanguageService = getCSSLanguageService();
  cssLanguageService.configure({
    completion: {
      completePropertyWithSemicolon: false,
      triggerPropertyValueCompletion: false,
    },
  });

  function calculateKeyValue(
    node: KeyValueProperty,
    stateManager: StateManager,
  ) {
    return <string>(
      (node.key.type === "Identifier"
        ? node.key.value
        : node.key.type === "Computed"
          ? node.key.expression.type === "StringLiteral"
            ? node.key.expression.value
            : node.key.expression.type === "Identifier"
              ? stateManager
                  .getConstantFromScope(node.key.expression.value)
                  ?.toString()
              : "--custom"
          : "--custom")
    );
  }

  // This handler provides the completion items.
  connection.onCompletion(async (params, token) => {
    const textDocument = documents.get(params.textDocument.uri)!;
    const text = textDocument.getText();
    const byteRepresentation = new StringAsBytes(text);

    const settings = await getDocumentSettings(params.textDocument.uri);
    const languageId = await getLanguageId(
      params.textDocument.uri,
      textDocument,
    );

    if (!settings.suggestions) return null;

    let parseResult;
    try {
      if (parseCache.has(params.textDocument.uri)) {
        parseResult = parseCache.get(params.textDocument.uri)!;
      } else {
        parseResult = await parse({
          source: text,
          languageId,
          parser: init,
          token,
        });
        parseCache.set(params.textDocument.uri, parseResult);
      }
    } catch (e) {
      console.log(e);
      return [];
    }

    let completions: CompletionItem[] = [];
    let itemDefaults: CompletionList["itemDefaults"];
    const stateManager = new StateManager();
    let moduleStart = 0;

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
          if ("span" in node && node.type !== "VariableDeclaration") {
            const startSpanRelative = textDocument.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.span.start - moduleStart,
              ),
            );
            const endSpanRelative = textDocument.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.span.end - moduleStart,
              ),
            );

            if (
              params.position.line > endSpanRelative.line ||
              params.position.line < startSpanRelative.line
            ) {
              return false;
            }
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
              return {
                ...state,
                callInside: verifiedImport,
                propertyDeep: 1,
              };
            } else if (
              verifiedImport === "createTheme" ||
              verifiedImport === "defineVars"
            ) {
              return {
                state: {
                  ...state,
                  callInside: verifiedImport,
                  propertyDeep: 1,
                },
                ignore: [
                  verifiedImport === "createTheme" ? "arguments.0" : "",
                  "callee",
                ],
              };
            } else if (verifiedImport === "firstThatWorks") {
              return;
            }
          }

          return {
            ...state,
            callInside: null,
          };
        },

        KeyValueProperty(node, state) {
          if (state && state.callInside) {
            if (
              (state.callInside === "create" ||
                state.callInside === "keyframes") &&
              state.propertyDeep === 2
            ) {
              return {
                ...state,
                propertyName: calculateKeyValue(node, stateManager),
                propertyDeep: 3,
              };
            } else if (
              state.callInside === "createTheme" ||
              state.callInside === "defineVars"
            ) {
              if (node.value.type === "ObjectExpression") {
                state.propertyDeep += 1;
              }
              return {
                ...state,
                // TODO: Manually pull out all possible completions for variables
                // We choose background because it provides a good amount of property types supported in the grammar
                propertyName: "background",
              };
            } else {
              return {
                ...state,
                propertyDeep: state.propertyDeep + 1,
              };
            }
          }
        },

        StringLiteral(node, state) {
          if (state && state.callInside && state.propertyName !== "content") {
            const startSpanRelative = textDocument.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.span.start - moduleStart,
              ),
            );
            const endSpanRelative = textDocument.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.span.end - moduleStart,
              ),
            );

            if (
              params.position.line > endSpanRelative.line ||
              params.position.line < startSpanRelative.line ||
              (params.position.line === endSpanRelative.line &&
                params.position.character > endSpanRelative.character) ||
              (params.position.line === startSpanRelative.line &&
                params.position.character < startSpanRelative.character)
            ) {
              return false;
            }

            const doc = virtualDocumentFactory.createVirtualDocument(
              dashifyFn(state.propertyName || "--custom"),
              node.value,
            );

            const relativePosition = doc.positionAt(
              virtualDocumentFactory.mapOffsetToVirtualOffset(
                doc,
                params.position.character - startSpanRelative.character,
              ),
            );

            const cssCompletions = cssLanguageService.doComplete(
              doc,
              relativePosition,
              cssLanguageService.parseStylesheet(doc),
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

            itemDefaults = cssCompletions.itemDefaults;

            console.log("Found completions", completions);

            return States.EXIT;
          }
        },
      },
      token,
      { propertyName: undefined, propertyDeep: 0, callInside: undefined },
    );

    return { items: completions, isIncomplete: true, itemDefaults };
  });

  async function getLanguageId(uri: string, document: TextDocument) {
    const { includedLanguages } = await getDocumentSettings(uri);

    let languageId = document.languageId;
    if (includedLanguages[languageId]) {
      languageId = includedLanguages[languageId];
    }

    return languageId;
  }

  // We might want to limit this to color restricted properties to allow further reliability (idk)
  // @see https://github.com/microsoft/vscode-css-languageservice/blob/main/src/data/webCustomData.ts
  connection.onDocumentColor(async (params, token) => {
    const textDocument = documents.get(params.textDocument.uri)!;
    const text = textDocument.getText();
    const byteRepresentation = new StringAsBytes(text);

    const settings = await getDocumentSettings(params.textDocument.uri);
    const languageId = await getLanguageId(
      params.textDocument.uri,
      textDocument,
    );

    if (!settings.colorDecorators) return null;

    let parseResult;
    try {
      if (parseCache.has(params.textDocument.uri)) {
        parseResult = parseCache.get(params.textDocument.uri)!;
      } else {
        parseResult = await parse({
          source: text,
          languageId,
          parser: init,
          token,
        });
        parseCache.set(params.textDocument.uri, parseResult);
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
                      member.typeAnnotation.typeAnnotation.type ===
                        "TsUnionType")
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
      token,
      { callInside: null },
    );

    colorCache.delete(params.textDocument.uri);
    colorCache.set(params.textDocument.uri, colors);

    console.log("Found colors", inspect(colors, { depth: 10 }));

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

  connection.onHover(async (params, token) => {
    const document = documents.get(params.textDocument.uri)!;
    const text = document.getText();
    const byteRepresentation = new StringAsBytes(text);

    const settings = await getDocumentSettings(params.textDocument.uri);
    const languageId = await getLanguageId(params.textDocument.uri, document);

    if (!settings.hover) return null;

    const startOffset = calculateStartOffset(document);

    let parseResult;
    try {
      if (parseCache.has(params.textDocument.uri)) {
        parseResult = parseCache.get(params.textDocument.uri)!;
      } else {
        parseResult = await parse({
          source: text,
          languageId,
          parser: init,
          token,
        });
        parseCache.set(params.textDocument.uri, parseResult);
      }
    } catch (e) {
      console.log(e);
      return undefined;
    }

    let moduleStart = 0;

    const stateManager = new StateManager();

    // Resulting hover
    let hover: Hover | undefined = undefined;

    await walk<{
      parentClass: string[];
      callInside: string | null | undefined;
      callerIdentifier: string | null | undefined;
    }>(
      parseResult,
      {
        Module(node) {
          moduleStart = node.span.start - startOffset;
          stateManager.pushConstantScope();
        },

        "*"(node) {
          if ("span" in node && node.type !== "VariableDeclaration") {
            const startSpanRelative = document.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.span.start - moduleStart,
              ),
            );
            const endSpanRelative = document.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.span.end - moduleStart,
              ),
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

        async KeyValueProperty(node, state) {
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
            if (
              node.value.type === "ObjectExpression" ||
              node.value.type === "ArrowFunctionExpression"
            ) {
              return { ...state, parentClass: [...state.parentClass, key] };
            }

            const startSpanRelative = document.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.key.span.start - moduleStart,
              ),
            );
            const endSpanRelative = document.positionAt(
              byteRepresentation.byteOffsetToCharIndex(
                node.key.span.end - moduleStart,
              ),
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
              useRemForFontSize: settings.useRemForFontSize,
            } satisfies Parameters<typeof transformValueFn>[2];

            if (staticValue.static) {
              if ("value" in staticValue) {
                if (staticValue.value == null) {
                  cssLines.push(
                    `${indentation}${dashifyPropertyKey}: initial;`,
                  );
                } else if (typeof staticValue.value === "string") {
                  cssLines.push(
                    `${indentation}${dashifyPropertyKey}: ${transformValueFn(
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
                  start: document.positionAt(
                    byteRepresentation.byteOffsetToCharIndex(
                      node.key.span.start - moduleStart,
                    ),
                  ),
                  end: document.positionAt(
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
      { parentClass: [], callInside: null, callerIdentifier: undefined },
    );

    return hover;
  });

  // Make the text document manager listen on the connection
  // for open, change and close text document events
  documents.listen(connection);

  // Listen on the connection
  connection.listen();
})();
