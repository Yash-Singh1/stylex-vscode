# Changelog

## 0.0.11

- Remove Intl.Segmenter polyfill
- Attempt at fixing CPU spikes with empty files

## 0.0.10

- Detect StyleX workspaces
- Minify bundles for performance and reduce in size
- Fix offsetted colors and hovers when text contains graphemes or surrogate pairs

## 0.0.9

- Decrease memory usage for byte offset to string index data structure

## 0.0.8

- Support all CSS grammar restrictions on variables
- Support keyframes inside of `defineVars` (<https://github.com/facebook/stylex/pull/315>)

## 0.0.7

- Fix completions in the middle of a string

## 0.0.6

- Hotfix for CJS imports not working due to backtracking variable declarations

## 0.0.5

- Move default modules to settings
- Fixes for multi-byte characters in files
- Run Linting and testing in CI

## 0.0.4

- Various bug fixes and stability improvement

## 0.0.3

- Autocompletion support
- Format CSS in hovers
- More configuration options
  - Alias module names
  - Configure capabilities
  - `useRemForFontSize` option
- Color decorators for generics
- Use cancellation tokens to abort processing if tab is closed
- Cache parser values
- Fix previously broken static evaluation for template literals
- Use `tsup` for compiling client

## 0.0.2

- Icon
- CDN for image assets
- Smaller builds
- Backtracking on hover provider
- Color cache with binary search
- Calculate start offset to circumvent swc-project/swc#1366
- Transform values that are strings
- Support for CommonJS

## 0.0.1

Initial Release
