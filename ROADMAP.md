# Roadmap

## Users

- Add configuration options for ignoring larger files and detecting StyleX codebases
- Auto completion for keys (tough to do this because the code will be parsed invalid when the user wants autocomplete)
- Add more concrete documentation
- Support `@stylexjs/open-props` for document colors
- Explore strategies on handling larger files for document colors
- Resolve imports for computed properties that are constants

## Tech Debt

- Performance Improvements -- caching
- E2E tests for extension itself
- Move to monorepo
- Use pnpm as primary package manager
- More insightful logging
- Move away from swc due to offsets breaking
