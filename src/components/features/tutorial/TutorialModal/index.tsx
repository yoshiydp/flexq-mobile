import React, { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import type { TutorialPage } from '@/constants/tutorial';
import TouchIndicatorBoundary from '@/components/dev/TouchIndicatorBoundary';
import TutorialCarousel from './TutorialCarousel';
import styles from './TutorialModal.styles';

interface TutorialModalProps {
  visible: boolean;
  pages: TutorialPage[];
  /** スキップ・「あとで」・Android の戻る操作で閉じたとき */
  onClose: () => void;
  /** 最終ページの主ボタン（既定: プロジェクトを作成する）を押したとき */
  onComplete: () => void;
  completeLabel?: string;
  /** 最終ページの副ボタン。null なら最終ページは主ボタンだけ（画面ごとのヒント） */
  laterLabel?: string | null;
}

/**
 * 初回チュートリアル（TASK-139）・画面ごとの初回ヒント（TASK-140）のカルーセル型ポップアップ。
 * ページの内容は constants/tutorial.ts の定義から描画し、表示制御（初回のみ・完了の記録）は
 * 呼び出し側（useFirstTimeTutorial / PROFILE の「HOW TO USE」）が持つ。
 */
export default function TutorialModal({
  visible,
  pages,
  onClose,
  onComplete,
  completeLabel,
  laterLabel,
}: TutorialModalProps) {
  // 開き直したときは先頭のページから表示する（カルーセルを作り直す）
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    if (visible) setOpenCount((c) => c + 1);
  }, [visible]);

  if (pages.length === 0) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      // Android の edge-to-edge でオーバーレイがシステムバーの背後まで覆うようにする（BaseModal と同じ）
      statusBarTranslucent
      navigationBarTranslucent
    >
      <TouchIndicatorBoundary>
        <View style={styles.overlay}>
          <View style={styles.container} testID="tutorial-modal">
            <TutorialCarousel
              key={openCount}
              pages={pages}
              onClose={onClose}
              onComplete={onComplete}
              completeLabel={completeLabel}
              laterLabel={laterLabel}
            />
          </View>
        </View>
      </TouchIndicatorBoundary>
    </Modal>
  );
}
