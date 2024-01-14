import { expect, test, describe } from "vitest";
import {
  culoriColorToVscodeColor,
  getColorFromValue,
} from "../../src/lib/color-logic";

describe("getColorFromValue", () => {
  test("invalid colors", () => {
    expect(getColorFromValue(123)).toBe(null);
    expect(getColorFromValue("")).toBe(null);
    expect(getColorFromValue(" ")).toBe(null);
    expect(getColorFromValue("foo")).toBe(null);
  });

  test("keyword colors", () => {
    expect(getColorFromValue("transparent")).toBe("transparent");
    expect(getColorFromValue("currentcolor")).toBe("currentColor");
  });

  test("rgb", () => {
    expect(getColorFromValue("rgb(255, 0, 0)")).toEqual({
      mode: "rgb",
      r: 1,
      g: 0,
      b: 0,
    });
    expect(getColorFromValue(" rgb( 0, 3, 0)")).toEqual({
      mode: "rgb",
      r: 0,
      g: 3 / 255,
      b: 0,
    });
    expect(getColorFromValue("rgba(0, 0, 0, 0.5)")).toEqual({
      mode: "rgb",
      r: 0,
      g: 0,
      b: 0,
      alpha: 0.5,
    });
  });

  test("hsl", () => {
    expect(getColorFromValue("hsl(0, 100%, 50%)")).toEqual({
      mode: "hsl",
      h: 0,
      s: 1,
      l: 0.5,
    });
    expect(getColorFromValue("hsla(0, 100%, 50%, 0.5)")).toEqual({
      mode: "hsl",
      h: 0,
      s: 1,
      l: 0.5,
      alpha: 0.5,
    });
  });
});

describe("culoriColorToVscodeColor", () => {
  test("rgb", () => {
    expect(culoriColorToVscodeColor({ mode: "rgb", r: 1, g: 0, b: 0 })).toEqual(
      {
        red: 1,
        green: 0,
        blue: 0,
        alpha: 1,
      },
    );

    expect(
      culoriColorToVscodeColor({
        mode: "rgb",
        r: 0,
        g: 3 / 255,
        b: 0,
        alpha: 0.5,
      }),
    ).toEqual({
      red: 0,
      green: 3 / 255,
      blue: 0,
      alpha: 0.5,
    });
  });
});
