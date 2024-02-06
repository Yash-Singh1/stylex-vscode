import * as path from "node:path";
import { minimatch } from "minimatch";
import {
  workspace,
  type ExtensionContext,
  type WorkspaceFolder,
  type Uri,
  RelativePattern,
  type TextDocument,
} from "vscode";
import normalizePath from "normalize-path";
import * as braces from "braces";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

const clients: Map<string, LanguageClient> = new Map();
let ctx: ExtensionContext = null;

const CLIENT_ID = "stylex";
const CLIENT_NAME = "StyleX Language Server";

const TRIGGER_GLOB =
  "**/{package.json,package-lock.json,*.stylex.js,*.stylex.ts,*.stylex.tsx,*.stylex.jsx}";

function createWorkspaceClient(folder: WorkspaceFolder) {
  if (clients.has(folder.uri.toString())) {
    return;
  }

  // Placeholder to prevent multiple servers booting
  clients.set(folder.uri.toString(), null);

  // The server is implemented in node
  const serverModule = ctx.asAbsolutePath(
    path.join("server", "out", "server.cjs"),
  );

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ["--experimental-specifier-resolution=node"],
      },
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ["--experimental-specifier-resolution=node"],
      },
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
      ].map((lang) => ({
        schema: "file",
        language: lang,
        pattern: normalizePath(
          `${folder.uri.fsPath.replace(/[[]\{\}]/g, "?")}/**/*`,
        ),
      })),
    ],
    connectionOptions: {
      maxRestartCount: 5,
    },
    workspaceFolder: folder,
  };

  // Create the language client and start the client.
  const languageClient = new LanguageClient(
    CLIENT_ID,
    CLIENT_NAME,
    serverOptions,
    clientOptions,
  );
  clients.set(folder.uri.toString(), languageClient);
  languageClient.start();
}

// From Tailwind CSS Intellisense exclude logic

function getExcludePatterns(folder: WorkspaceFolder) {
  return [
    ...Object.entries(
      workspace.getConfiguration("files", folder).get("exclude"),
    )
      .filter(([, value]) => value === true)
      .map(([key]) => key)
      .filter(Boolean),
    "**/node_modules",
  ];
}

// TODO: Have custom configuration for excluded files
function isExcluded(file: string, folder: WorkspaceFolder) {
  const excludePatterns = getExcludePatterns(folder);

  for (const pattern of excludePatterns) {
    if (minimatch(file, path.join(folder.uri.fsPath, pattern))) {
      return true;
    }
  }

  return false;
}

async function validateJSON(uri: Uri) {
  try {
    const json = Buffer.from(await workspace.fs.readFile(uri)).toString("utf8");
    if (
      json.includes("stylex") ||
      workspace
        .getConfiguration("stylex", uri)
        .get<string[]>("aliasModuleNames")
        .some((alias) => json.includes(alias))
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function runIfStyleXWorkspace(folder: WorkspaceFolder) {
  console.log("Checking if run needed", folder);

  const excludePatterns = getExcludePatterns(folder);

  const exclude = `{${excludePatterns
    .flatMap((pattern) => braces.expand(pattern))
    .join(",")
    .replace(/{/g, "%7B")
    .replace(/}/g, "%7D")}}`;

  console.log("Exclude patterns", exclude, excludePatterns);
  const searchingFiles = await workspace.findFiles(
    new RelativePattern(folder, TRIGGER_GLOB),
    exclude,
  );

  console.log("Searching files", searchingFiles);

  for (const uri of searchingFiles) {
    if (uri.fsPath.endsWith(".json")) {
      if (await validateJSON(uri)) {
        return createWorkspaceClient(folder);
      }
    } else {
      return createWorkspaceClient(folder);
    }
  }
}

export function activate(context: ExtensionContext) {
  ctx = context;

  console.info("StyleX VSCode extension activated.");

  function handler(uri: Uri) {
    console.log("Triggered", uri);

    const folder = workspace.getWorkspaceFolder(uri);
    if (!folder || isExcluded(uri.fsPath, folder)) {
      return;
    }

    if (uri.fsPath.endsWith(".json") && validateJSON(uri)) {
      createWorkspaceClient(folder);
    }
  }

  const searchedFolders = new Set<string>();

  function didOpenTextDocument(document: TextDocument) {
    console.log("Opened document", document);

    // We are only interested in language mode text
    if (document.uri.scheme !== "file") {
      return;
    }

    const uri = document.uri;
    const folder = workspace.getWorkspaceFolder(uri);

    // Files outside a folder can't be handled. This might depend on the language.
    // Single file languages like JSON might handle files outside the workspace folders.
    if (!folder) {
      return;
    }

    if (searchedFolders.has(folder.uri.toString())) {
      return;
    }

    searchedFolders.add(folder.uri.toString());

    runIfStyleXWorkspace(folder);
  }

  workspace.textDocuments.forEach(didOpenTextDocument);
  ctx.subscriptions.push(workspace.onDidOpenTextDocument(didOpenTextDocument));

  const watcher = workspace.createFileSystemWatcher(TRIGGER_GLOB);
  watcher.onDidChange(handler);
  watcher.onDidCreate(handler);
  watcher.onDidDelete(handler);
}

export async function deactivate(): Promise<void> | undefined {
  for (const client of clients.values()) {
    await client.stop();
  }
}
