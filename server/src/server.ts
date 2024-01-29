import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  type InitializeResult,
} from "vscode-languageserver/node";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const wasmBuffer = readFileSync(
  join(__dirname, "../node_modules/@swc/wasm-web/wasm-web_bg.wasm"),
);

import { TextDocument } from "vscode-languageserver-textdocument";

import { defaultSettings, type UserConfiguration } from "./lib/settings";
import { getByteRepresentation } from "./lib/string-bytes";
import ServerState from "./lib/server-state";
import onCompletion from "./capabilities/completions";
import onDocumentColor from "./capabilities/document-colors";
import onColorPresentation from "./capabilities/color-presentation";
import onHover from "./capabilities/hover";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

export type Connection = typeof connection;

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

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

  const serverState = new ServerState();

  // Clear cache for documents that closed
  documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
    serverState.colorCache.delete(e.document.uri);
    serverState.parserCache.delete(e.document.uri);
    serverState.bytePrefixCache.delete(e.document.uri);
  });

  documents.onDidChangeContent((e) => {
    serverState.parserCache.delete(e.document.uri);
    serverState.bytePrefixCache.delete(e.document.uri);
  });

  connection.onDidOpenTextDocument((_change) => {
    // Monitored files have change in VSCode
    connection.console.log("We received a file change event");
  });

  async function getLanguageId(uri: string, document: TextDocument) {
    const { includedLanguages } = await getDocumentSettings(uri);

    let languageId = document.languageId;
    if (includedLanguages[languageId]) {
      languageId = includedLanguages[languageId];
    }

    return languageId;
  }

  // This handler provides the completion items.
  connection.onCompletion(async (params, token) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument) {
      return null;
    }

    const text = textDocument.getText();
    const languageId = await getLanguageId(
      params.textDocument.uri,
      textDocument,
    );
    const settings = await getDocumentSettings(params.textDocument.uri);

    const byteRepresentation = getByteRepresentation(
      params.textDocument.uri,
      text,
      serverState,
    );

    serverState.setupCSSLanguageService();

    return await onCompletion({
      languageId,
      params,
      token,
      parserInit: init,
      serverState,
      settings,
      textDocument,
      byteRepresentation,
    });
  });

  // We might want to limit this to color restricted properties to allow further reliability (idk)
  // @see https://github.com/microsoft/vscode-css-languageservice/blob/main/src/data/webCustomData.ts
  connection.onDocumentColor(async (params, token) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument) {
      return null;
    }

    const text = textDocument.getText();
    const languageId = await getLanguageId(
      params.textDocument.uri,
      textDocument,
    );
    const settings = await getDocumentSettings(params.textDocument.uri);

    const byteRepresentation = getByteRepresentation(
      params.textDocument.uri,
      text,
      serverState,
    );

    return await onDocumentColor({
      languageId,
      params,
      token,
      parserInit: init,
      serverState,
      settings,
      textDocument,
      byteRepresentation,
    });
  });

  connection.onColorPresentation(async (params) => {
    return await onColorPresentation({
      params,
      serverState,
    });
  });

  connection.onHover(async (params, token) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument) {
      return null;
    }

    const text = textDocument.getText();
    const languageId = await getLanguageId(
      params.textDocument.uri,
      textDocument,
    );
    const settings = await getDocumentSettings(params.textDocument.uri);

    const byteRepresentation = getByteRepresentation(
      params.textDocument.uri,
      text,
      serverState,
    );

    return await onHover({
      languageId,
      params,
      token,
      parserInit: init,
      serverState,
      settings,
      textDocument,
      byteRepresentation,
    });
  });

  // Make the text document manager listen on the connection
  // for open, change and close text document events
  documents.listen(connection);

  // Listen on the connection
  connection.listen();
})();
