/* eslint-env jest */
/* global jest */

if (typeof global.TextDecoderStream === 'undefined') {
  global.TextDecoderStream = class {};
}
if (typeof global.TextEncoderStream === 'undefined') {
  global.TextEncoderStream = class {};
}

jest.mock('@expo/vector-icons', () => {
  const React = require('react');

  const MockIcon = ({ testID }) => {
    return React.createElement('View', { testID: testID || 'mock-icon' });
  };

  return {
    FontAwesome6: MockIcon,
    Ionicons: MockIcon,
    MaterialIcons: MockIcon,
    MaterialCommunityIcons: MockIcon,
    AntDesign: MockIcon,
    Entypo: MockIcon,
    Feather: MockIcon,
  };
});
