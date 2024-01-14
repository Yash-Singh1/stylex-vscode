export interface UserConfiguration {
  includedLanguages: Record<string, string>;
  aliasModuleNames: string[];
  useRemForFontSize: boolean;
  hover: boolean;
  suggestions: boolean;
  colorDecorators: boolean;
}

export const defaultSettings = {
  includedLanguages: {},
  aliasModuleNames: [],
  hover: true,
  suggestions: true,
  colorDecorators: true,
  useRemForFontSize: false,
} satisfies UserConfiguration;
