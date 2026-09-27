import React from 'react';
import { render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import LoadingOverlay from './index';

describe('LoadingOverlay コンポーネント', () => {
  it('visible が true の時、ローディングインジケーターが表示される', () => {
    render(<LoadingOverlay visible />);
  });
  it('visible が false の時、何も表示されない', () => {
    render(<LoadingOverlay visible={false} />);
  });
  it('message を渡すと文言が表示される', () => {
    const { getByText } = render(
      <LoadingOverlay visible message="音源データをアップロード中… 42%" />,
    );
    expect(getByText('音源データをアップロード中… 42%')).toBeTruthy();
  });
  it('message 未指定のときは文言を表示しない', () => {
    const { queryByTestId } = render(<LoadingOverlay visible />);
    expect(queryByTestId('loading-overlay-message')).toBeNull();
  });

  describe('Android のシステム back（TASK-113）', () => {
    let removeMock: jest.Mock;
    let addEventListenerSpy: jest.SpyInstance;

    beforeEach(() => {
      removeMock = jest.fn();
      addEventListenerSpy = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockReturnValue({ remove: removeMock } as never);
    });

    afterEach(() => {
      addEventListenerSpy.mockRestore();
    });

    it('表示中は hardwareBackPress を消費して（true を返して）画面側の処理に渡さないこと', () => {
      render(<LoadingOverlay visible />);

      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
      const [eventName, handler] = addEventListenerSpy.mock.calls[0];
      expect(eventName).toBe('hardwareBackPress');
      expect(handler()).toBe(true);
    });

    it('非表示のときはリスナーを登録しないこと', () => {
      render(<LoadingOverlay visible={false} />);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('非表示になったとき / アンマウント時にリスナーを解除すること', () => {
      const { rerender, unmount } = render(<LoadingOverlay visible />);

      rerender(<LoadingOverlay visible={false} />);
      expect(removeMock).toHaveBeenCalledTimes(1);

      rerender(<LoadingOverlay visible />);
      unmount();
      expect(removeMock).toHaveBeenCalledTimes(2);
    });
  });
});
