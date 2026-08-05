import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Global ESLint flat config — applied to every workspace (shell, host-platform,
 * runtime-loader) via config discovery. Packages that need framework rules
 * (e.g. the Next.js shell) import this as a base and layer their own config on
 * top; `eslint-config-prettier` is intentionally last so it always wins.
 *
 * Deps live at the repo root so the whole toolchain is shared.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.pnpm-store/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      /* ── TypeScript ─────────────────────────────────────────────── */
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',

      /* ── Imports ────────────────────────────────────────────────── */
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': ['error', { considerQueryString: true }],
      'import-x/first': 'error',
      'import-x/newline-after-import': ['error', { count: 1 }],
      // Resolution-dependent rules are disabled: TypeScript path aliases +
      // bundlers (Next, tsup) handle resolution, and they false-positive on
      // CJS/ESM interop (e.g. `axios`) without a type-aware resolver.
      'import-x/no-unresolved': 'off',
      'import-x/default': 'off',
      'import-x/named': 'off',
      'import-x/namespace': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },
  prettier,
);
