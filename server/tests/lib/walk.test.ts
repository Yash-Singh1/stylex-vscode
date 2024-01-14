import { expect, describe } from "vitest";
import { States, walk } from "../../src/lib/walk";
import { testParser } from "../helpers/parseSetup";
import { type CancellationToken } from "vscode-languageserver";

describe("walk", () => {
  testParser("walks a simple expression", async ({ parser }) => {
    const ast = await parser.parse("1 + 2");
    await walk(
      ast,
      {
        BinaryExpression(node) {
          expect(node.left.type).toBe("NumericLiteral");
          expect("value" in node.left ? node.left.value : undefined).toBe(1);
          expect(node.right.type).toBe("NumericLiteral");
          expect("value" in node.right ? node.right.value : undefined).toBe(2);
        },
      },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => {
          return { dispose() {} };
        },
      },
      {},
    );
  });

  testParser("walks a simple expression with a state", async ({ parser }) => {
    const ast = await parser.parse("1 + 2");
    await walk(
      ast,
      {
        BinaryExpression(_node, state) {
          expect(state).toStrictEqual({ inNumber: false, inBinaryExpr: false });
          return { ...state, inBinaryExpr: true };
        },

        NumericLiteral(_node, state) {
          expect(state).toStrictEqual({ inNumber: false, inBinaryExpr: true });
          return { ...state, inNumber: true };
        },
      },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => {
          return { dispose() {} };
        },
      },
      { inNumber: false, inBinaryExpr: false },
    );
  });

  testParser("backtracks", async ({ parser }) => {
    const ast = await parser.parse("(1 + 2) + 3");
    let numbersWalked = 0;

    await walk(
      ast,
      {
        ParenthesisExpression() {
          return false;
        },

        NumericLiteral() {
          numbersWalked++;
        },
      },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => {
          return { dispose() {} };
        },
      },
      {},
    );

    expect(numbersWalked).toBe(1);
  });

  testParser("can cancel in visitor", async ({ parser }) => {
    const ast = await parser.parse("1 + 2 + 3");
    let numbersWalked = 0;

    await walk(
      ast,
      {
        NumericLiteral(node) {
          numbersWalked++;
          if (node.value === 2) {
            return States.EXIT;
          }
        },
      },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => {
          return { dispose() {} };
        },
      },
      {},
    );

    expect(numbersWalked).toBe(2);
  });

  testParser("recognizes already cancelled walk", async ({ parser }) => {
    const ast = await parser.parse("1 + 2 + 3");
    let numbersWalked = 0;

    await walk(
      ast,
      {
        NumericLiteral() {
          numbersWalked++;
        },
      },
      {
        isCancellationRequested: true,
        onCancellationRequested: () => {
          return { dispose() {} };
        },
      },
      {},
    );

    expect(numbersWalked).toBe(0);
  });

  testParser("recognizes forced cancel", async ({ parser }) => {
    const ast = await parser.parse("1 + 2 + 3");
    let numbersWalked = 0;
    let cancellationEvent:
      | Parameters<CancellationToken["onCancellationRequested"]>[0]
      | undefined = undefined;

    await walk(
      ast,
      {
        NumericLiteral(node) {
          numbersWalked++;
          if (node.value === 2 && cancellationEvent) {
            cancellationEvent(undefined);
          }
        },
      },
      {
        isCancellationRequested: false,
        onCancellationRequested: (eventHandler) => {
          cancellationEvent = eventHandler;
          return { dispose() {} };
        },
      },
      {},
    );

    expect(numbersWalked).toBe(2);
  });
});
