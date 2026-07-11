/* eslint-env jest */
/* global jest */

// Jest 用の AsyncStorage 手動モック（テストではネイティブモジュールが存在しないため）
// https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
