import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 初回チュートリアル（TASK-139）の完了フラグを AsyncStorage で管理する。
 * 端末単位の記録（サーバーには持たない）。再インストール・機種変更では再表示されるが、
 * プロジェクトが 1 件以上あるユーザーには出さないため既存ユーザーには影響しない。
 */
const ONBOARDING_COMPLETED_KEY = 'tutorial.onboarding.completed';

/** 初回チュートリアルを完了（スキップ・作成への遷移を含む）済みか */
export async function isOnboardingTutorialCompleted(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)) === 'true';
}

/** 初回チュートリアルを完了済みとして記録する（以降は自動表示しない） */
export async function markOnboardingTutorialCompleted(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
}
