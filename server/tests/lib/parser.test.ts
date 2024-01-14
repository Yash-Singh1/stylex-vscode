import { test, expect, describe } from "vitest";

import { calculateStartOffset, parse } from "../../src/lib/parser";
import { TextDocument } from "vscode-languageserver-textdocument";
import { testParser } from "../helpers/parseSetup";

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
      return Math.max(src.indexOf("import"), src.indexOf("{"));
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
  });
});
