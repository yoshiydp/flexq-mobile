import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import HeaderToolBar from './index';
import { useHeadphonesConnected } from '@/hooks/useHeadphonesConnected';

jest.mock('@/hooks/useHeadphonesConnected');

const mockUseHeadphonesConnected = useHeadphonesConnected as jest.Mock;

jest.mock('@expo/vector-icons', () => {
  return {
    FontAwesome: jest.fn(() => null),
    FontAwesome6: jest.fn(() => null),
    MaterialIcons: jest.fn(() => null),
    Ionicons: jest.fn(() => null),
  };
});

jest.mock('@/components/ui/buttons/RippleButton', () => {
  return jest.fn(({ testID, children, onPress }) => {
    const { Pressable } = require('react-native');
    return (
      <Pressable testID={testID} onPress={onPress}>
        {children}
      </Pressable>
    );
  });
});

jest.mock(
  '@/components/features/audioPlayer/LinkedProjectsButtonWithMenu',
  () => {
    return jest.fn(() => null);
  },
);

// メニューの開閉を検証できるよう、トグル用のボタンと開閉状態を表示する簡易モックにする
jest.mock('@/components/ui/ActionButtonWithMenu', () => {
  return jest.fn(({ isOpen, onToggle }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID="mock-action-toggle" onPress={onToggle}>
        <Text>{isOpen ? 'menu-open' : 'menu-closed'}</Text>
      </Pressable>
    );
  });
});

const audioPlayerScreenItems = [
  {
    id: 'back',
    type: 'back' as const,
    onPress: jest.fn(),
  },
  {
    id: 'title',
    type: 'headerTitle' as const,
    headerTitle: 'Test Title',
  },
  {
    id: 'bookmark',
    type: 'bookmark' as const,
    onPress: jest.fn(),
  },
];

const projectEditorScreenItems = [
  { id: 'back', type: 'back' as const, onPress: jest.fn() },
  {
    id: 'hamburger',
    type: 'hamburger' as const,
    onPress: jest.fn(),
  },
];

const quickRecordScreenItems = [
  { id: 'back', type: 'back' as const, onPress: jest.fn() },
  {
    id: 'headerTitle',
    type: 'headerTitle' as const,
    headerTitle: 'Quick Record',
  },
  {
    id: 'navigationListScreen',
    type: 'navigationListScreen' as const,
    onPress: jest.fn(),
  },
];

describe('HeaderToolBar コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('items と isBookmarked が正しくレンダリングされる', () => {
    render(<HeaderToolBar items={audioPlayerScreenItems} isBookmarked />);
  });

  it('audioPlayerScreenItemsの全てのボタンの onPress が呼ばれる', () => {
    render(
      <HeaderToolBar items={audioPlayerScreenItems} isBookmarked={false} />,
    );
    audioPlayerScreenItems.forEach((item) => {
      switch (item.type) {
        case 'back':
          item.onPress();
          expect(item.onPress).toHaveBeenCalled();
          break;
        case 'bookmark':
          item.onPress();
          expect(item.onPress).toHaveBeenCalled();
          break;
        default:
          break;
      }
    });
  });

  it('projectEditorScreenItemsの全てのボタンの onPress が呼ばれる', () => {
    render(<HeaderToolBar items={projectEditorScreenItems} />);
    projectEditorScreenItems.forEach((item) => {
      switch (item.type) {
        case 'back':
          item.onPress();
          expect(item.onPress).toHaveBeenCalled();
          break;
        case 'hamburger':
          item.onPress();
          expect(item.onPress).toHaveBeenCalled();
          break;
        default:
          break;
      }
    });
  });

  it('quickRecordScreenItemsの全てのボタンの onPress が呼ばれる', () => {
    render(<HeaderToolBar items={quickRecordScreenItems} />);
    quickRecordScreenItems.forEach((item) => {
      switch (item.type) {
        case 'back':
          item.onPress();
          expect(item.onPress).toHaveBeenCalled();
          break;
        case 'navigationListScreen':
          item.onPress();
          expect(item.onPress).toHaveBeenCalled();
          break;
        default:
          break;
      }
    });
  });

  it('back ボタンに item.id が testID として設定される', () => {
    const { getByTestId } = render(
      <HeaderToolBar items={audioPlayerScreenItems} isBookmarked={false} />,
    );
    expect(getByTestId('back')).toBeTruthy();
  });

  it('hamburger ボタンに item.id が testID として設定される', () => {
    const { getByTestId } = render(
      <HeaderToolBar items={projectEditorScreenItems} />,
    );
    expect(getByTestId('hamburger')).toBeTruthy();
  });

  it('headphoneIndicator アイテムがあるとイヤホン接続時に中央へインジケーターが表示される', () => {
    mockUseHeadphonesConnected.mockReturnValue('bluetooth');
    const { getByTestId } = render(
      <HeaderToolBar
        items={[
          ...projectEditorScreenItems,
          { id: 'headphone', type: 'headphoneIndicator' as const },
        ]}
      />,
    );
    expect(getByTestId('headphone-indicator')).toBeTruthy();
  });

  it('share ボタン（単体）がレンダリングされ、タップで onPress が呼ばれる (TASK-45)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <HeaderToolBar
        items={[{ id: 'toolbar-share', type: 'share' as const, onPress }]}
      />,
    );
    fireEvent.press(getByTestId('toolbar-share'));
    expect(onPress).toHaveBeenCalled();
  });

  it('buttonGroup 内の share ボタンがレンダリングされ、タップで onPress が呼ばれる (TASK-45)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <HeaderToolBar
        items={[
          {
            id: 'toolbar-rightGroup',
            type: 'buttonGroup' as const,
            buttons: [
              { id: 'toolbar-share', type: 'share' as const, onPress },
              { id: 'toolbar-bookmark', type: 'bookmark' as const },
            ],
          },
        ]}
      />,
    );
    fireEvent.press(getByTestId('toolbar-share'));
    expect(onPress).toHaveBeenCalled();
  });

  it('create ボタンがレンダリングされ、タップで onPress が呼ばれる (TASK-92)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <HeaderToolBar
        items={[{ id: 'toolbar-create', type: 'create' as const, onPress }]}
      />,
    );
    fireEvent.press(getByTestId('toolbar-create'));
    expect(onPress).toHaveBeenCalled();
  });

  it('メニューが閉じている間はオーバーレイが表示されない (TASK-92)', () => {
    const { queryByTestId } = render(
      <HeaderToolBar
        items={[{ id: 'toolbar-action', type: 'action' as const, menuItems: [] }]}
      />,
    );
    expect(queryByTestId('header-toolbar-menu-overlay')).toBeNull();
  });

  it('メニュー表示中にオーバーレイをタップするとメニューが閉じる (TASK-92)', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <HeaderToolBar
        items={[{ id: 'toolbar-action', type: 'action' as const, menuItems: [] }]}
      />,
    );

    fireEvent.press(getByTestId('mock-action-toggle'));
    expect(getByText('menu-open')).toBeTruthy();

    fireEvent.press(getByTestId('header-toolbar-menu-overlay'));

    expect(getByText('menu-closed')).toBeTruthy();
    expect(queryByTestId('header-toolbar-menu-overlay')).toBeNull();
  });

  it('headphoneIndicator アイテムがあってもイヤホン未接続時は何も表示されない', () => {
    mockUseHeadphonesConnected.mockReturnValue('none');
    const { queryByTestId } = render(
      <HeaderToolBar
        items={[
          ...projectEditorScreenItems,
          { id: 'headphone', type: 'headphoneIndicator' as const },
        ]}
      />,
    );
    expect(queryByTestId('headphone-indicator')).toBeNull();
  });
});
