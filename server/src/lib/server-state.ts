import type { Module } from "@swc/types";
import type { ColorInformation } from "vscode-languageserver";
import type { StringAsBytes } from "./string-bytes";
import { CSSVirtualDocument } from "./virtual-document";
import {
  IPropertyData,
  getCSSLanguageService,
  type LanguageService as CSSLanguageService,
} from "vscode-css-languageservice";
import LRUCache from "./lru-cache";

interface IServerState {
  setupCSSLanguageService(): void;
}

export default class ServerState implements IServerState {
  public static readonly STYLEX_CUSTOM_PROPERTY = "stylex-lsp-custom-property";

  public parserCache = new LRUCache<string, Module>(20);
  public colorCache = new Map<string, ColorInformation[]>();
  public bytePrefixCache = new LRUCache<string, StringAsBytes>(20);
  public virtualDocumentFactory = new CSSVirtualDocument();
  public cssLanguageService: CSSLanguageService | null = null;

  private cssLanguageServiceIsSetup = false;

  constructor() {}

  public setupCSSLanguageService() {
    if (this.cssLanguageServiceIsSetup) return;

    this.cssLanguageService = getCSSLanguageService();
    this.cssLanguageServiceIsSetup = true;
    this.cssLanguageService.configure({
      completion: {
        completePropertyWithSemicolon: false,
        triggerPropertyValueCompletion: false,
      },
    });
    this.cssLanguageService.setDataProviders(true, [
      {
        provideAtDirectives() {
          return [];
        },
        providePseudoClasses() {
          return [];
        },
        providePseudoElements() {
          return [];
        },
        provideProperties() {
          type Restriction =
            | "enum"
            | "time"
            | "timing-function"
            | "box"
            | "color"
            | "repeat"
            | "url"
            | "line-style"
            | "image"
            | "length"
            | "identifier"
            | "number(0-1)"
            | "number"
            | "font"
            | "string"
            | "angle"
            | "integer"
            | "property"
            | "percentage"
            | "unicode-range"
            | "line-width"
            | "geometry-box"
            | "position"
            | "positon"
            | "shape"
            | "frequency"
            | "resolution";

          const typeToRestriction: {
            [K in keyof typeof import("@stylexjs/stylex").types]?: Restriction[];
          } = {
            angle: ["angle"],
            image: ["image", "url"],
            length: ["length", "number"],
            number: ["number"],
            integer: ["number"],
            lengthPercentage: ["percentage", "length"],
            percentage: ["percentage"],
            resolution: ["resolution"],
            time: ["time"],
            url: ["url"],
          };

          return [
            {
              name: ServerState.STYLEX_CUSTOM_PROPERTY,
              restrictions: [
                "enum",
                "time",
                "timing-function",
                "box",
                "color",
                "repeat",
                "url",
                "line-style",
                "image",
                "length",
                "identifier",
                "number(0-1)",
                "number",
                "font",
                "string",
                "angle",
                "integer",
                "property",
                "percentage",
                "unicode-range",
                "line-width",
                "geometry-box",
                "position",
                "positon",
                "shape",
              ],
            },
            ...Object.entries(typeToRestriction).map(
              ([type, restrictions]) => ({
                name: `${ServerState.STYLEX_CUSTOM_PROPERTY}-${type}`,
                restrictions,
              }),
            ),
          ];
        },
      },
    ]);
  }
}
