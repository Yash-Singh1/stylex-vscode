import * as path from "path";
import { workspace, ExtensionContext } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  console.log("StyleX VSCode extension activated.");

  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.cjs"),
  );

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
      args: ["--experimental-specifier-resolution=node"],
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      args: ["--experimental-specifier-resolution=node"],
    },
  };

  const supportedLanguages = [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
  ];

  const includedLanguages = (workspace
    .getConfiguration("stylex")
    .get("includedLanguages") || {}) as Record<string, string>;

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [
      ...[
        ...supportedLanguages,
        ...Object.entries(includedLanguages)
          .filter(([_newLang, oldLang]) => supportedLanguages.includes(oldLang))
          .map(([newLang]) => newLang),
      ].map((lang) => ({ schema: "file", language: lang })),
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "stylex",
    "StyleX Language Server",
    serverOptions,
    clientOptions,
  );

  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
