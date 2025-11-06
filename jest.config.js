const path = require('path');

module.exports = {
  preset: 'react-native',
  testEnvironment: 'jsdom',

  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    '@testing-library/jest-dom',
  ],

  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native' +
      '|@react-native' +
      '|@react-navigation' +
      '|@expo' +
      '|expo-modules-core' +
      '|unimodules' +
      '|@testing-library' +
      '|react-clone-referenced-element' +
      '|react-native-svg' +
      ')',
  ],

  moduleNameMapper: {
    '\\.(css|scss)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo$': '<rootDir>/__mocks__/expo.js',
  },

  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { configFile: path.resolve(__dirname, 'babel.config.js') },
    ],
  },

  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  collectCoverage: false,
};
