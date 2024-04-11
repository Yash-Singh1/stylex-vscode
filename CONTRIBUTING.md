# Contributing

Contributions are always welcome!

## Structure

This is the basic structure of the extension. The language client is the actual VSCode extension, while the language server runs in a separate process and connects with the language client.

```text
.
├── client // Language Client
│   ├── src
│   │   ├── test/ // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        ├── lib/ // Utilities for the server side
        └── server.ts // Language Server entry point
```

## Running Locally

See [LOCAL.md](./LOCAL.md) for instructions on starting up a development environment.

## Publishing

```sh
vsce package --baseImagesUrl https://stylexvscode.pages.dev/
```
