/* eslint-env jest */
/* global jest */

/**
 * expo-keep-awake の Jest 用モック（TASK-111）。
 * ネイティブモジュール（ExpoKeepAwake）を持たないため、テストからは
 * `useKeepAwake` が呼ばれたことだけを検証する
 */
module.exports = {
  ExpoKeepAwakeTag: 'ExpoKeepAwakeDefaultTag',
  useKeepAwake: jest.fn(),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
