import { readFileSync } from "node:fs";
import { join } from "node:path";
import type * as swc from "@swc/wasm-web";
import { webcrypto } from 'node:crypto';

import { test } from "vitest";

// @ts-expect-error -- Overrides the global crypto object
// @see https://docs.rs/getrandom/latest/getrandom/#nodejs-es-module-support
globalThis.crypto = webcrypto;

const wasmBuffer = readFileSync(
  join(__dirname, "../../node_modules/@swc/wasm-web/wasm-web_bg.wasm"),
);

export const testParser = test.extend<{ parser: typeof swc }>({
  parser: async ({}, use) => {
    // Import swc and initialize the WASM module
    const init = await import("@swc/wasm-web/wasm-web.js");
    await init.default(wasmBuffer);

    await use(init);
  },
});
