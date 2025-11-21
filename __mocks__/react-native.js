/* eslint-env jest */
/* global jest */
const React = require('react');
const RN = jest.requireActual('react-native');

RN.Image = function MockImage({ source }) {
  return <RN.Text>mocked-image:{source.uri}</RN.Text>;
};

module.exports = RN;
