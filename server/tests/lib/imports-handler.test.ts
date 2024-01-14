import { describe, expect } from "vitest";
import { testParser } from "../helpers/parseSetup";
import StateManager from "../../src/lib/state-manager";
import { walk } from "../../src/lib/walk";
import { type CancellationToken } from "vscode-languageserver";
import { handleImports, handleRequires } from "../../src/lib/imports-handler";
import { defaultSettings } from "../../src/lib/settings";

const testImportHandler = testParser.extend<{
  stateManager: StateManager;
  cancellationToken: CancellationToken;
}>({
  stateManager: async ({}, use) => {
    await use(new StateManager());
  },

  cancellationToken: async ({}, use) => {
    await use({
      isCancellationRequested: false,
      onCancellationRequested: () => {
        return { dispose() {} };
      },
    });
  },
});

describe("imports handler", () => {
  testImportHandler(
    "handles esm imports",
    async ({ parser, stateManager, cancellationToken }) => {
      const source = `import stylex2 from "@stylexjs/stylex";
import { color } from "./colors";
import { color as color2 } from "./colors";
import * as stylex3 from "@stylexjs/stylex";
import { firstThatWorks as thirdThatWorks } from "./colors";
import { firstThatWorks as secondThatWorks } from "@stylexjs/stylex";
`;

      const module = await parser.parse(source);

      await walk(
        module,
        {
          ImportDeclaration(node) {
            handleImports(node, stateManager, defaultSettings);
          },
        },
        cancellationToken,
        {},
      );

      expect(stateManager.verifyStylexIdentifier("stylex")).toBe(true);
      expect(stateManager.verifyStylexIdentifier("stylex2")).toBe(true);
      expect(stateManager.verifyStylexIdentifier("stylex3")).toBe(true);
      expect(stateManager.verifyNamedImport("color")).toBe(undefined);
      expect(stateManager.verifyNamedImport("thirdThatWorks")).toBe(undefined);
      expect(stateManager.verifyNamedImport("secondThatWorks")).toBe(
        "firstThatWorks",
      );
    },
  );

  testImportHandler(
    "handles cjs imports",
    async ({ parser, stateManager, cancellationToken }) => {
      const source = `
const {default: stylex2} = require("@stylexjs/stylex");
const { color } = require("./colors");
const { color: color2 } = require("./colors");
const stylex3 = require("@stylexjs/stylex");
const { firstThatWorks: thirdThatWorks } = require("./colors");
const { firstThatWorks: secondThatWorks } = require("@stylexjs/stylex");
`;

      const module = await parser.parse(source);

      await walk(
        module,
        {
          VariableDeclarator(node) {
            handleRequires(node, stateManager, defaultSettings);
          },
        },
        cancellationToken,
        {},
      );

      expect(stateManager.verifyStylexIdentifier("stylex")).toBe(true);
      expect(stateManager.verifyStylexIdentifier("stylex2")).toBe(true);
      expect(stateManager.verifyStylexIdentifier("stylex3")).toBe(true);
      expect(stateManager.verifyNamedImport("color")).toBe(undefined);
      expect(stateManager.verifyNamedImport("thirdThatWorks")).toBe(undefined);
      expect(stateManager.verifyNamedImport("secondThatWorks")).toBe(
        "firstThatWorks",
      );
    },
  );
});
