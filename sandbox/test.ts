import * as stylex from "@stylexjs/stylex";
import stylex2 from "@stylexjs/stylex";
import { createTheme as createThemee } from "@stylexjs/stylex";
import { colors, spacing } from "./tokens.stylex";
const stylex3 = require("@stylexjs/stylex");

// A constant can be used to avoid repeating the media query
const DARK = "@media (prefers-color-scheme: dark)";

export const vars = stylex.defineVars({
  fadeIn: stylex.keyframes({
    "0%": { opacity: 0 },
    "100%": { opacity: 1 },
  }),
  vari: stylex3.types.color<string>({
    default: "cyan",
    [DARK]: "navy",
  }),
  vari2: stylex3.types.color<string>("red"),
  vari3: stylex3.types.angle<string>("45rad"),
  "--purple": "#f0f",
});

// Dracula theme
export const dracula = createThemee(colors, {
  primaryText: { default: "purple", [DARK]: ["lightpurple", "deeppink"] },
  secondaryText: {
    default: "pink",
    [DARK]: stylex.firstThatWorks("pink", 4, null, "deeppink"),
  },
  accent: "red",
  background: { default: `#${"4"}44`, [DARK]: stylex.firstThatWorks("black") },
  fontSize: 42,
  lineColor: "red",
});

const styles = stylex3.create({
  root: {
    width: "100%",
    maxWidth: 800,
    minHeight: 40,
  },
  child: {
    backgroundColor: "red",
    content: "",
    marginBlock: "1rem",
  },
});

const styles = stylex2.create({
  header: {
    position: stylex.firstThatWorks(
      "sticky",
      "-webkit-sticky",
      "fixed",
      dracula.secondaryText,
    ),
    color: dracula.primaryText,
  },
  button: {
    color: {
      default: "var(--blue-link)",
      ":focus": "blue",
      ":hover": {
        default: null,
        "@media (hover: hover)": stylex.firstThatWorks(
          "green",
          "-webkit-sticky",
          "fixed",
        ),
      },
      ":active": "scale(0.9)",
    },
  },
});

export const colors = stylex.defineVars({
  primaryText: { default: `#782121`, [DARK]: "white" },
  secondaryText: { default: "#333", [DARK]: "#ccc" },
  accent: { default: "blue", [DARK]: "lightblue" },
  background: { default: "white", [DARK]: "black" },
  lineColor: { default: "gray", [DARK]: "lightgray" },
});

export const spacing = stylex.defineVars({
  none: "0px",
  xsmall: "4px",
  small: "8px",
  medium: "12px",
  large: "20px",
  xlarge: "32px",
  xxlarge: "48px",
  xxxlarge: "96px",
});

const MEDIA_MOBILE = "@media (max-width: 700px)";

const s = stylex3.create({
  h1: {
    fontSize: "2rem",
    lineHeight: spacing.small,
    fontFamily: "system-ui, sans-serif",
    fontWeight: 400,
    textAlign: "center",
    display: "flex",
    gap: 8,
    whiteSpace: "nowrap",
    flexDirection: {
      default: "row",
      [MEDIA_MOBILE]: "column",
    },
  },
  body: {
    fontSize: "1rem",
    fontFamily: "system-ui, sans-serif",
  },
  p: {
    marginTop: 16,
    lineHeight: 1.4,
  },
  li: {
    marginTop: 8,
  },
  link: {
    color: "#0f4a7b",
  },
  emoji: {
    position: "relative",
    fontFamily: "sans-serif",
    top: {
      default: 0,
      [MEDIA_MOBILE]: 2,
    },
    fontSize: {
      default: 100,
      "@supports (contain: inline-size)": {
        [MEDIA_MOBILE]: 100,
        default: 10,
      },
    },
  },
});

const pulse = stylex.keyframes({
  "0%": { transform: "scale(1)", color: "red" },
  "50%": { transform: "scale(1.1)", color: "blue" },
  "100%": { transform: "scale(1)", color: "green" },
});

const styles = stylex.create({
  root: {
    backgroundColor: "red",
    padding: "1rem",
    paddingInlineStart: "2rem",
    animationName: pulse,
    animationDuration: 1,
  },
  dynamic: (r, g, b) => ({
    color: `rgb(${r}, ${g}, ${b})`,
  }),
});

const fadeIn = stylex.keyframes({
  "0%": { opacity: 0 },
  "100%": { opacity: 1 },
});

const fadeOut = stylex.keyframes({
  "0%": { opacity: 1 },
  "100%": { opacity: 0 },
});

export const animations = stylex.defineVars({
  pulse,
  fadeIn,
  fadeOut,
});
