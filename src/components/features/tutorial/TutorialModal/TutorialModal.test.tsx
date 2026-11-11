/**
 * TutorialModal のユニットテスト (TASK-139)
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import TutorialModal from './index';
import {
  ONBOARDING_TUTORIAL_PAGES,
  TUTORIAL_LABELS,
} from '@/constants/tutorial';

jest.mock('expo-av', () => {
  const { View } = require('react-native');
  return {
    Video: (props: any) => <View {...props} />,
    ResizeMode: { CONTAIN: 'contain' },
  };
});

const renderModal = (
  overrides: Partial<React.ComponentProps<typeof TutorialModal>> = {},
) => {
  const onClose = jest.fn();
  const onComplete = jest.fn();
  const utils = render(
    <TutorialModal
      visible
      pages={ONBOARDING_TUTORIAL_PAGES}
      onClose={onClose}
      onComplete={onComplete}
      {...overrides}
    />,
  );
  return { ...utils, onClose, onComplete };
};

describe('TutorialModal', () => {
  it('最初はようこそページを表示し、動画は出さない', () => {
    const { getByTestId, queryByTestId, getByText } = renderModal();
    expect(getByTestId('tutorial-title-welcome')).toBeTruthy();
    expect(getByText('PROJECT')).toBeTruthy();
    expect(getByText('DRAFTS')).toBeTruthy();
    expect(getByText('TRACK LIST')).toBeTruthy();
    expect(queryByTestId('tutorial-video')).toBeNull();
    expect(getByText(TUTORIAL_LABELS.skip)).toBeTruthy();
    expect(getByText(TUTORIAL_LABELS.next)).toBeTruthy();
  });

  it('次へで作成ページに進み、無音・ループで動画を再生する', () => {
    const { getByTestId, getByText } = renderModal();
    fireEvent.press(getByTestId('tutorial-next-button'));

    expect(getByTestId('tutorial-title-create-project')).toBeTruthy();
    const video = getByTestId('tutorial-video');
    expect(video.props.isMuted).toBe(true);
    expect(video.props.isLooping).toBe(true);
    expect(video.props.shouldPlay).toBe(true);
    // 読み込み中は先頭フレームの静止画を出す（黒画面を避ける）
    expect(video.props.usePoster).toBe(true);
    expect(video.props.posterSource).toBeDefined();
    expect(getByText(TUTORIAL_LABELS.later)).toBeTruthy();
    expect(getByText(TUTORIAL_LABELS.createProject)).toBeTruthy();
  });

  it('最終ページの主ボタンで onComplete を呼ぶ', () => {
    const { getByTestId, onComplete, onClose } = renderModal();
    fireEvent.press(getByTestId('tutorial-next-button'));
    fireEvent.press(getByTestId('tutorial-next-button'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('スキップ / あとでで onClose を呼ぶ', () => {
    const { getByTestId, onClose } = renderModal();
    fireEvent.press(getByTestId('tutorial-skip-button'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('tutorial-next-button'));
    fireEvent.press(getByTestId('tutorial-skip-button'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('開き直すと先頭のページに戻る', () => {
    const { getByTestId, rerender, onClose, onComplete } = renderModal();
    fireEvent.press(getByTestId('tutorial-next-button'));
    expect(getByTestId('tutorial-title-create-project')).toBeTruthy();

    const props = { pages: ONBOARDING_TUTORIAL_PAGES, onClose, onComplete };
    rerender(<TutorialModal visible={false} {...props} />);
    rerender(<TutorialModal visible {...props} />);
    expect(getByTestId('tutorial-title-welcome')).toBeTruthy();
  });

  it('文字サイズを大きくしても閉じる操作に届くよう、内容だけをスクロールさせ文字の拡大に上限を設ける', () => {
    const { getByTestId, getByText } = renderModal();
    // 内容（タイトル〜説明）はスクロール領域の中、ボタンはその外（常に下端に表示）
    const scroll = getByTestId('tutorial-scroll');
    expect(scroll).toBeTruthy();
    expect(getByText(TUTORIAL_LABELS.skip).props.maxFontSizeMultiplier).toBe(
      1.6,
    );
    expect(getByText(TUTORIAL_LABELS.next).props.maxFontSizeMultiplier).toBe(
      1.6,
    );
    expect(
      getByTestId('tutorial-title-welcome').props.maxFontSizeMultiplier,
    ).toBe(1.6);
  });

  it('2 つのボタンは固定の高さを持たず、同じ最小の高さでそろう（Android で高さがずれた不具合）', () => {
    const { getByTestId } = renderModal();
    const skip = StyleSheet.flatten(
      getByTestId('tutorial-skip-button').props.style,
    );
    const next = StyleSheet.flatten(
      getByTestId('tutorial-next-button').props.style,
    );
    // SubmitButton の既定の height: 52 を打ち消していること
    expect(next.height).toBe('auto');
    expect(skip.height ?? 'auto').toBe('auto');
    expect(next.minHeight).toBe(skip.minHeight);
  });

  it('completeLabel で最終ページの主ボタンの文言を変えられる', () => {
    const { getByTestId, getByText } = renderModal({ completeLabel: 'OK' });
    fireEvent.press(getByTestId('tutorial-next-button'));
    expect(getByText('OK')).toBeTruthy();
  });
});
