import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const toWarnings = (rules = {}) =>
  Object.fromEntries(
    Object.entries(rules).map(([ruleName, ruleConfig]) => [
      ruleName,
      Array.isArray(ruleConfig) ? ['warn', ...ruleConfig.slice(1)] : 'warn',
    ])
  );

const browserGlobals = {
  Audio: 'readonly',
  console: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  window: 'readonly',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.vercel/**', '.cursor/**'],
  },
  {
    files: ['**/*.{ts,tsx,js,cjs}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...browserGlobals,
        global: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...toWarnings(tseslint.configs.recommended.at(-1)?.rules),
      ...toWarnings(reactPlugin.configs.recommended.rules),
      ...toWarnings(reactHooks.configs.recommended.rules),
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
];
