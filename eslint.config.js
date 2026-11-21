import { builtinModules } from 'node:module'

import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Import zone (AGENTS.md): the battle script, the Gen 3 game backend and the BPS codec are plain
// TypeScript. They use no DOM or browser API, import nothing from the pages and no emulator.
const PURE_MODULES = ['src/script/**/*.ts', 'src/gen3/**/*.ts', 'src/patch/**/*.ts']

// Environment-neutral helpers that browsers list among their globals and Node has as well.
const NEUTRAL_GLOBALS = new Set([
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',
  'structuredClone',
])
const BROWSER_GLOBALS = Object.keys(globals.browser).filter((name) => !NEUTRAL_GLOBALS.has(name))
const NO_BROWSER_MESSAGE =
  'src/script/, src/gen3/ and src/patch/ use no DOM or browser API; take data from the caller.'

const PURE_IMPORT_PATTERNS = [
  {
    group: ['**/web', '**/web/**'],
    message: 'src/script/, src/gen3/ and src/patch/ import nothing from the pages in src/web/.',
  },
  {
    group: ['@thenick775/*'],
    message: 'src/script/, src/gen3/ and src/patch/ import no emulator.',
  },
]

const pureZone = {
  files: PURE_MODULES,
  rules: {
    'no-restricted-globals': [
      'error',
      ...BROWSER_GLOBALS.map((name) => ({ name, message: NO_BROWSER_MESSAGE })),
    ],
    // The same names as types (`HTMLElement`, `Document`), which the rule above does not see.
    '@typescript-eslint/no-restricted-types': [
      'error',
      { types: Object.fromEntries(BROWSER_GLOBALS.map((name) => [name, NO_BROWSER_MESSAGE])) },
    ],
    'no-restricted-imports': ['error', { patterns: PURE_IMPORT_PATTERNS }],
  },
}

// The battle script is game-neutral (ADR 0004): a game backend imports it, never the other way.
// Flat config replaces a rule's options per file, so this block repeats the pure patterns.
const scriptZone = {
  files: ['src/script/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...PURE_IMPORT_PATTERNS,
          {
            group: ['**/gen3', '**/gen3/**'],
            message: 'src/script/ is game-neutral and imports nothing from a game backend.',
          },
        ],
      },
    ],
  },
}

// The BPS codec runs in the build and on the page (#8), so it imports nothing from Node either.
// This block repeats the pure patterns for the same reason as the one above.
const NO_NODE_MESSAGE = 'src/patch/ runs on the page as well; it imports nothing from Node.'
const patchZone = {
  files: ['src/patch/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: builtinModules.map((name) => ({ name, message: NO_NODE_MESSAGE })),
        patterns: [...PURE_IMPORT_PATTERNS, { group: ['node:*'], message: NO_NODE_MESSAGE }],
      },
    ],
  },
}

// Ceilings (AGENTS.md): fixed for every TypeScript file from the first commit.
const ceilings = {
  files: ['**/*.ts'],
  rules: {
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': [
      'error',
      { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true },
    ],
    complexity: ['error', 10],
    'max-depth': ['error', 3],
    'max-params': ['error', 4],
  },
}

// Specs group their cases in long describe blocks; the file ceiling still holds.
const specs = {
  files: ['**/*.test.ts'],
  rules: { 'max-lines-per-function': 'off' },
}

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.waves', '.cache', 'build']),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // strict forbids `x!`; this stylistic rule would demand it instead of `as T`.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      eqeqeq: 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/web/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.config.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  pureZone,
  scriptZone,
  patchZone,
  ceilings,
  specs,
  prettier,
])
