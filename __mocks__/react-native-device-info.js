/* eslint-env jest */
/* global jest */

const isHeadphonesConnected = jest.fn().mockResolvedValue(false);
const isWiredHeadphonesConnected = jest.fn().mockResolvedValue(false);
const isBluetoothHeadphonesConnected = jest.fn().mockResolvedValue(false);

const DeviceInfo = {
  isHeadphonesConnected,
  isWiredHeadphonesConnected,
  isBluetoothHeadphonesConnected,
};

module.exports = {
  __esModule: true,
  default: DeviceInfo,
  isHeadphonesConnected,
  isWiredHeadphonesConnected,
  isBluetoothHeadphonesConnected,
};
