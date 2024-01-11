# Roadmap

## Users

- Add configuration options for ignoring larger files and detecting StyleX codebases
- Streaming for large files
- Add more concrete documentation
- Support `@stylexjs/open-props` for document colors
- Better support for dynamic styles
- Explore strategies on handling larger files for document colors
- Resolve imports for computed properties that are constants
- Document colors on `StyleXStyles` and `StaticStyles`

## Tech Debt

- Performance Improvements -- caching
- Use CSS Language Service utilities for auto-completion
  - Might need to figure out how to filter out typed styles (e.g. `StyleXStyles` and `StaticStyles`)
- Unit testing for AST Utilities
- E2E tests for extension itself
- Move to monorepo
- Use pnpm as primary package manager
- More insightful logging
- Move away from swc due to offsets breaking
