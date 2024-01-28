import type { Module } from "@swc/types";
import type { ColorInformation } from "vscode-languageserver";
import type { StringAsBytes } from "./string-bytes";
import { CSSVirtualDocument } from "./virtual-document";
import {
  getCSSLanguageService,
  type LanguageService as CSSLanguageService,
} from "vscode-css-languageservice";

interface IServerState {
  setupCSSLanguageService(): void;
}

export default class ServerState implements IServerState {
  public static readonly STYLEX_CUSTOM_PROPERTY = "stylex-lsp-custom-property";

  public parserCache = new Map<string, Module>();
  public colorCache = new Map<string, ColorInformation[]>();
  public bytePrefixCache = new Map<string, StringAsBytes>();
  public virtualDocumentFactory = new CSSVirtualDocument();
  public cssLanguageService: CSSLanguageService | null = null;

  private cssLanguageServiceIsSetup = false;

  constructor() {}

  public setupCSSLanguageService() {
    if (this.cssLanguageServiceIsSetup) return;

    this.cssLanguageService = getCSSLanguageService();
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
          ];
        },
      },
    ]);
    this.cssLanguageServiceIsSetup = true;
  }
}
