const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', './src/apiClient/*'],
  },
  // Audio / Screen 系は exhaustive-deps を無効化
  // TODO: 将来的に修正する
  {
    files: ['**/screens/**/*.tsx', '**/features/audioPlayer/**/*.tsx'],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__mocks__/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'eslint-comments/no-unused-disable': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
