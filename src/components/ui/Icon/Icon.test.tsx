import React from 'react';
import { render } from '@testing-library/react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Icon from './index';

describe('Icon コンポーネント', () => {
  it('指定した名前のアイコンが表示される', () => {
    const { getByTestId } = render(
      <Icon
        component={FontAwesome6}
        name="link"
        size={22}
        testID="icon-test"
      />,
    );

    expect(getByTestId('icon-test')).toBeTruthy();
  });
});
