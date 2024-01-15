import { test, expect, describe } from "vitest";

import { calculateStartOffset, parse } from "../../src/lib/parser";
import { TextDocument } from "vscode-languageserver-textdocument";
import { testParser } from "../helpers/parseSetup";

const textEncoder = new TextEncoder();

describe("parse", () => {
  testParser("parses a simple file", async ({ parser }) => {
    const source = `import stylex from "@stylexjs/stylex";

const styles = stylex.create({
  red: {
    color: "red",
  },
});
`;

    const module = await parse({
      source,
      languageId: "typescript",
      parser,
      token: {
        isCancellationRequested: false,
        onCancellationRequested: () => {
          return { dispose() {} };
        },
      },
    });

    expect(module).toMatchSnapshot();
  });

  testParser(
    "handles typescript that conflicts with tsx",
    async ({ parser }) => {
      const source = `import stylex from "@stylexjs/stylex";

interface Main {
  foo: string;
}

const config = <Main>{}; // This should not be parsed as a JSX element
`;

      let module = await parse({
        source,
        languageId: "typescript",
        parser,
        token: {
          isCancellationRequested: false,
          onCancellationRequested: () => {
            return { dispose() {} };
          },
        },
      });

      expect(module).toMatchSnapshot();

      const source2 = `import stylex from "@stylexjs/stylex";

      interface Main {
        foo: string;
      }
      
      const config = <Main>{"hello world"}</Main>; // This should be parsed as a JSX element
      `;
      module = await parse({
        source: source2,
        languageId: "typescriptreact",
        parser,
        token: {
          isCancellationRequested: false,
          onCancellationRequested: () => {
            return { dispose() {} };
          },
        },
      });

      expect(module).toMatchSnapshot();
    },
  );
});

describe("calculateStartOffset", () => {
  test("handles calculations correctly", () => {
    function realOffset(src: string) {
      const importIdx = src.indexOf("import");
      const blockIdx = src.indexOf("{");
      const offset = Math.min(
        importIdx < 0 ? src.length : importIdx,
        blockIdx < 0 ? src.length : blockIdx,
      );
      return textEncoder.encode(src.slice(0, offset)).length;
    }

    function assertOffsetCorrect(src: string) {
      expect(
        calculateStartOffset(
          TextDocument.create("untitled://example.ts", "typescript", 1, src),
        ),
        "Failed while calculating offset for " + src,
      ).toBe(realOffset(src));
    }

    assertOffsetCorrect(`import stylex from "@stylexjs/stylex"`);
    assertOffsetCorrect(`  import stylex from "@stylexjs/stylex"`);
    assertOffsetCorrect(`
    import stylex from "@stylexjs/stylex"`);

    assertOffsetCorrect(`import stylex from "@stylexjs/stylex"`);
    assertOffsetCorrect(`/**/
import stylex from "@stylexjs/stylex"`);
    assertOffsetCorrect(`
      import stylex from "@stylexjs/stylex"`);

    assertOffsetCorrect(`import stylex from "@stylexjs/stylex"`);
    assertOffsetCorrect(`/**
    @flow strict
    **/
   // more information

   /**/

   // help info

    
   import stylex from "@stylexjs/stylex"`);

    assertOffsetCorrect(`/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. ♥️♥️♥️
 *
 *
 */

import stylex from '@stylexjs/stylex';
import Card from './Card';
import {
  globalTokens as $,
  spacing,
  text,
  scales,
} from './globalTokens.stylex';
import Counter from './Counter';

const HOMEPAGE = 'https://stylexjs.com';
`);
  });
});
