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

function removeSpan(obj: any) {
  delete obj.span;
  return obj;
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
    "value" in evaluationRequest
      ? Array.isArray(evaluationRequest.value)
        ? evaluationRequest.value.map((el) => {
            return removeSpan(el);
          })
        : typeof evaluationRequest.value === "object" &&
            evaluationRequest.value !== null &&
            !(evaluationRequest.value instanceof RegExp)
          ? Object.fromEntries(
              Object.entries(evaluationRequest.value).map(([key, value]) => {
                return [key, removeSpan(value)];
              }),
            )
          : evaluationRequest.value
      : undefined,
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
        },
      },
      undefined,
      parser,
    );
  });

  testParser("evaluates firstThatWorks", async ({ parser }) => {
    const stateManager = new StateManager();

    assertEvaluation("stylex.firstThatWorks()", [], stateManager, parser);
    assertEvaluation(
      'stylex.firstThatWorks("red", "blue")',
      [
        { static: true, value: "blue" },
        { static: true, value: "red" },
      ],
      stateManager,
      parser,
    );

    stateManager.addNamedImport("firstThatWorks", "firstThatWorks");
    assertEvaluation("firstThatWorks()", [], stateManager, parser);
  });
});
