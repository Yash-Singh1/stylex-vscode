export interface UserConfiguration {
  includedLanguages: Record<string, string>;
  aliasModuleNames: string[];
  useRemForFontSize: boolean;
  hover: boolean;
  suggestions: boolean;
  colorDecorators: boolean;
  inspectPort: number | null;
}

export const defaultSettings = {
  includedLanguages: {},
  aliasModuleNames: ["@stylexjs/stylex", "stylex"],
  hover: true,
  suggestions: true,
  colorDecorators: true,
  useRemForFontSize: false,
  inspectPort: null,
} satisfies UserConfiguration;
