import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

import licenseHeader from "eslint-plugin-license-header";

export default tseslint.config(
  {
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      eslintPluginPrettierRecommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'license-header': licenseHeader
    },
    files: ["src/**/*.ts"],
    rules: {
      'prettier/prettier': 'error',
      'linebreak-style': ['error', 'unix'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors : 'none'}],
      'prefer-const': ['error', { destructuring: 'all' }],
      'license-header/header': ['error', './resources/license-header.js'],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    }
  },
  {
    ignores: ['out/**', 'test-workspaces/**', 'src/typings/**', 'resources/**', '*.js', '*.mjs', '.vscode-test/**'],
  }
);