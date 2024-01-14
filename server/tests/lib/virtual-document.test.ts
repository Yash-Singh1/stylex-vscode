import { describe, test, expect } from "vitest";
import { CSSVirtualDocument } from "../../src/lib/virtual-document";
import { TextDocument } from "vscode-languageserver-textdocument";

const testFactory = test.extend<{ vdFactory: CSSVirtualDocument }>({
  vdFactory: async ({}, use) => {
    await use(new CSSVirtualDocument());
  },
});

describe("virtual document factory", () => {
  testFactory("creates a virtual document", async ({ vdFactory }) => {
    const vd = vdFactory.createVirtualDocument("color", "red");
    expect(vd).toBeDefined();

    expect(vd.getText()).toMatchSnapshot();
    expect(vd.positionAt(7)).toStrictEqual({
      line: 1,
      character: 0,
    });
    expect(vd.offsetAt({ line: 1, character: 0 })).toBe(7);
    expect(vdFactory.mapOffsetToVirtualOffset(vd, 7)).toBe(
      (CSSVirtualDocument.wrapperPreRoot + "color:").length + 7,
    );
  });
});
