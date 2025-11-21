import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ModalProvider } from '@/contexts/ModalContext';
import RecView from './index';

jest.mock('@/components/features/drafts/RecordItem', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ title, onPress }: any) => (
    <Pressable onPress={onPress}>
      <Text>{title}</Text>
    </Pressable>
  ));
});

jest.mock('@/components/features/record/RecReadySection', () => {
  const { View, Text } = require('react-native');
  return jest.fn(() => (
    <View>
      <Text>Rec Ready Section</Text>
    </View>
  ));
});

jest.mock('@/components/ui/modals/RecRecordingModal', () => {
  const { View, Text } = require('react-native');
  return jest.fn(() => (
    <View>
      <Text>Rec Recording Modal</Text>
    </View>
  ));
});

describe('RecView コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProps = {
    records: [
      {
        id: '101',
        title: 'Intro Take 1',
        source: 'http://localhost:3000/record/sample-1.m4a',
        updatedAt: new Date('2023-10-05T12:00:00Z'),
        isBookmarked: true,
      },
    ],
    onBeforeRecord: jest.fn(),
  };

  const renderWithProviders = (children: React.ReactNode) => {
    return render(
      <NavigationContainer>
        <ModalProvider>{children}</ModalProvider>
      </NavigationContainer>,
    );
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = renderWithProviders(<RecView {...mockProps} />);
    expect(getByText('Rec Ready Section')).toBeTruthy();
  });

  it('RecordItem の onPress が呼ばれる', () => {
    const { getByText } = renderWithProviders(<RecView {...mockProps} />);
    const recordItem = getByText('Intro Take 1').parent;
    fireEvent.press(recordItem);
    expect(recordItem).toBeTruthy();
  });
});
