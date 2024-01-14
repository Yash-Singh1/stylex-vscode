export interface UserConfiguration {
  includedLanguages: Record<string, string>;
  aliasModuleNames: string[];
  useRemForFontSize: boolean;
  hover: boolean;
  suggestions: boolean;
  colorDecorators: boolean;
}
