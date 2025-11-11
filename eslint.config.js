// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__mocks__/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'eslint-comments/no-unused-disable': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
