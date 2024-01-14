import { describe, expect } from "vitest";
import { testParser } from "../helpers/parseSetup";
import type { ExpressionStatement, Program } from "@swc/types";
import { evaluate } from "../../src/lib/evaluate";
import StateManager from "../../src/lib/state-manager";

function evaluateModule(
  program: Program,
  state: StateManager = new StateManager(),
) {
  return evaluate((program.body[0] as ExpressionStatement).expression, state);
}

async function assertEvaluation(
  src: string,
  real: any,
  stateManager: StateManager = new StateManager(),
  parser: typeof import("@swc/wasm-web"),
) {
  const evaluationRequest = await evaluateModule(
    await parser.parse(src),
    stateManager,
  );
  return expect(
    "value" in evaluationRequest ? evaluationRequest.value : undefined,
    "Evaluation Request result: " + JSON.stringify(evaluationRequest),
  ).toStrictEqual(real);
}

describe("evaluate", () => {
  testParser("evaluates simple expressions", async ({ parser }) => {
    assertEvaluation("1 + 2", 3, undefined, parser);
    assertEvaluation("1 + 2 + 3", 6, undefined, parser);
    assertEvaluation(`"hello " + "world"`, "hello world", undefined, parser);
    assertEvaluation('`${"amazing"}world`', "amazingworld", undefined, parser);
    assertEvaluation("1", 1, undefined, parser);
    assertEvaluation("true", true, undefined, parser);
    assertEvaluation("false", false, undefined, parser);
    assertEvaluation("null", null, undefined, parser);
    assertEvaluation("undefined", undefined, undefined, parser);
    assertEvaluation("({})", {}, undefined, parser);
    assertEvaluation("[]", [], undefined, parser);
    assertEvaluation(
      '({ ["test1"]: "foo" })',
      {
        test1: {
          value: "foo",
          static: true,
          span: {
            ctxt: 0,
            end: 111,
            start: 106,
          },
        },
      },
      undefined,
      parser,
    );
  });
});
