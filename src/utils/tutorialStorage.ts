import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * チュートリアル・画面ごとの初回ヒントの完了フラグを AsyncStorage で管理する。
 * 端末単位の記録（サーバーには持たない）。再インストール・機種変更では再表示の対象に戻るが、
 * 表示する側（useFirstTimeTutorial）がすでに使い慣れたユーザーには出さずに完了扱いにする。
 *
 * - onboarding: ログイン後の PROJECT LIST の初回チュートリアル（TASK-139）
 * - projectEdit: プロジェクト編集を初めて開いたときのヒント（TASK-140）
 * - drafts: DRAFTS を初めて開いたときのヒント（TASK-140）
 */
export type TutorialId = 'onboarding' | 'projectEdit' | 'drafts';

// onboarding のキーは TASK-139 で配信済みの値（tutorial.onboarding.completed）と同じ
const completedKey = (id: TutorialId) => `tutorial.${id}.completed`;

/** 完了（スキップ・閉じるを含む）済みか */
export async function isTutorialCompleted(id: TutorialId): Promise<boolean> {
  return (await AsyncStorage.getItem(completedKey(id))) === 'true';
}

/** 完了済みとして記録する（以降は自動表示しない） */
export async function markTutorialCompleted(id: TutorialId): Promise<void> {
  await AsyncStorage.setItem(completedKey(id), 'true');
}

/** 初回チュートリアル（TASK-139）を完了済みか */
export function isOnboardingTutorialCompleted(): Promise<boolean> {
  return isTutorialCompleted('onboarding');
}

/** 初回チュートリアル（TASK-139）を完了済みとして記録する */
export function markOnboardingTutorialCompleted(): Promise<void> {
  return markTutorialCompleted('onboarding');
}
