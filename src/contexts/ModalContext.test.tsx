/**
 * ModalContext のフルスクリーンローディングのユニットテスト。
 * showLoading の任意メッセージと updateLoadingMessage による差し替えを検証する。
 */
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ModalProvider, useModal } from './ModalContext';

// 録音モーダルは WebView（tentap エディター）に依存するため、ネイティブ実装を差し替える
jest.mock('@/components/ui/modals/RecRecordingModal', () => () => null);

let modal: ReturnType<typeof useModal>;

function Consumer() {
  modal = useModal();
  return <Text>consumer</Text>;
}

const renderProvider = () =>
  render(
    <ModalProvider>
      <Consumer />
    </ModalProvider>,
  );

describe('ModalContext のローディング', () => {
  it('showLoading にメッセージを渡すと表示される', () => {
    const { queryByTestId } = renderProvider();
    act(() => modal.showLoading('音源データをアップロード中…'));
    expect(queryByTestId('loading-overlay-message')?.props.children).toBe(
      '音源データをアップロード中…',
    );
  });

  it('メッセージなしの showLoading ではテキストを表示しない', () => {
    const { queryByTestId } = renderProvider();
    act(() => modal.showLoading());
    expect(queryByTestId('loading-overlay-message')).toBeNull();
  });

  it('updateLoadingMessage で表示中の文言を差し替えられる', () => {
    const { queryByTestId } = renderProvider();
    act(() => modal.showLoading('音源データをアップロード中…'));
    act(() => modal.updateLoadingMessage('音源データをアップロード中… 42%'));
    expect(queryByTestId('loading-overlay-message')?.props.children).toBe(
      '音源データをアップロード中… 42%',
    );
  });

  it('ローディング非表示のときは updateLoadingMessage を無視する', () => {
    const { queryByTestId } = renderProvider();
    act(() => modal.updateLoadingMessage('残ってはいけない文言'));
    act(() => modal.showLoading());
    expect(queryByTestId('loading-overlay-message')).toBeNull();
  });

  it('hideLoading で 0 件になったらメッセージも破棄する', () => {
    const { queryByTestId } = renderProvider();
    act(() => modal.showLoading('音源データをアップロード中…'));
    act(() => modal.hideLoading());
    act(() => modal.showLoading());
    expect(queryByTestId('loading-overlay-message')).toBeNull();
  });

  it('重ねて showLoading しても、後勝ちで文言を保持する', () => {
    const { queryByTestId } = renderProvider();
    act(() => modal.showLoading('音源データをアップロード中…'));
    // 文言なしの重ね掛けでは既存の文言を消さない
    act(() => modal.showLoading());
    expect(queryByTestId('loading-overlay-message')?.props.children).toBe(
      '音源データをアップロード中…',
    );
    // 1 件残っている間はメッセージも維持する
    act(() => modal.hideLoading());
    expect(queryByTestId('loading-overlay-message')?.props.children).toBe(
      '音源データをアップロード中…',
    );
  });
});
