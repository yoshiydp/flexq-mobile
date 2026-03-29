// jest.config.js
module.exports = {
  preset: 'jest-expo',

  // RNテストでは jsdom は基本いりません（web向け）
  testEnvironment: 'node',

  setupFiles: ['<rootDir>/jest.setup.js'],

  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@react-native/assets-registry/registry$':
      require.resolve('@react-native/assets-registry/registry'),
    '\\.(css|scss)$': 'identity-obj-proxy',
  },

  // Expo / RN / expo-router などをBabelで変換対象に含める
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native' +
      '|@react-native' +
      '|react-native' +
      '|@react-navigation' +
      '|expo' +
      '|expo-router' +
      '|expo-modules-core' +
      '|@expo' +
      '|unimodules' +
      '|@testing-library' +
      '|react-clone-referenced-element' +
      '|react-native-svg' +
      ')/',
  ],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  collectCoverage: false,
};
