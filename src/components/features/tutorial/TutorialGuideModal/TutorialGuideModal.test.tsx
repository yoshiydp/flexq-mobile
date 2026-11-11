/**
 * TutorialGuideModal（PROFILE の「HOW TO USE」）のユニットテスト (TASK-140)
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import TutorialGuideModal from './index';
import { TUTORIAL_GUIDES, TUTORIAL_LABELS } from '@/constants/tutorial';

jest.mock('expo-av', () => {
  const { View } = require('react-native');
  return {
    Video: (props: any) => <View {...props} />,
    ResizeMode: { CONTAIN: 'contain' },
  };
});

const renderGuide = () => {
  const onClose = jest.fn();
  const onCreateProject = jest.fn();
  const utils = render(
    <TutorialGuideModal visible onClose={onClose} onCreateProject={onCreateProject} />,
  );
  return { ...utils, onClose, onCreateProject };
};

const goToLastPage = (getByTestId: (id: string) => any, pageCount: number) => {
  for (let i = 0; i < pageCount - 1; i++) {
    fireEvent.press(getByTestId('tutorial-next-button'));
  }
};

describe('TutorialGuideModal', () => {
  it('はじめに・プロジェクト編集・DRAFTS の一覧を出す', () => {
    const { getByTestId, getByText } = renderGuide();
    expect(getByText(TUTORIAL_LABELS.guideTitle)).toBeTruthy();
    expect(getByTestId('tutorial-guide-onboarding')).toBeTruthy();
    expect(getByTestId('tutorial-guide-projectEdit')).toBeTruthy();
    expect(getByTestId('tutorial-guide-drafts')).toBeTruthy();
  });

  it('一覧の「閉じる」で閉じる', () => {
    const { getByTestId, onClose } = renderGuide();
    fireEvent.press(getByTestId('tutorial-guide-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('はじめには自動表示と同じく、最後に「プロジェクトを作成する」で作成画面へ進める', () => {
    const { getByTestId, getByText, onCreateProject } = renderGuide();
    fireEvent.press(getByTestId('tutorial-guide-onboarding'));
    expect(getByTestId('tutorial-title-welcome')).toBeTruthy();
    goToLastPage(getByTestId, TUTORIAL_GUIDES[0].pages.length);
    fireEvent.press(getByText(TUTORIAL_LABELS.createProject));
    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });

  it('画面ごとのヒントは最後に「閉じる」だけを出して閉じる', () => {
    const { getByTestId, queryByTestId, onClose, onCreateProject } = renderGuide();
    fireEvent.press(getByTestId('tutorial-guide-projectEdit'));
    expect(getByTestId('tutorial-title-project-edit-lyrics')).toBeTruthy();
    const pages = TUTORIAL_GUIDES.find((g) => g.id === 'projectEdit')!.pages;
    goToLastPage(getByTestId, pages.length);
    expect(getByTestId('tutorial-title-project-edit-rec')).toBeTruthy();
    expect(queryByTestId('tutorial-skip-button')).toBeNull();
    fireEvent.press(getByTestId('tutorial-next-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreateProject).not.toHaveBeenCalled();
  });

  it('開き直すと一覧から表示する', () => {
    const props = { onClose: jest.fn(), onCreateProject: jest.fn() };
    const { getByTestId, rerender } = render(<TutorialGuideModal visible {...props} />);
    fireEvent.press(getByTestId('tutorial-guide-drafts'));
    expect(getByTestId('tutorial-title-drafts-quick-memo')).toBeTruthy();

    rerender(<TutorialGuideModal visible={false} {...props} />);
    rerender(<TutorialGuideModal visible {...props} />);
    expect(getByTestId('tutorial-guide-drafts')).toBeTruthy();
  });
});
