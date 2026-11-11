import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isOnboardingTutorialCompleted,
  isTutorialCompleted,
  markOnboardingTutorialCompleted,
  markTutorialCompleted,
} from './tutorialStorage';

describe('tutorialStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('未記録のときは未完了を返す', async () => {
    await expect(isOnboardingTutorialCompleted()).resolves.toBe(false);
  });

  it('完了を記録すると完了済みを返す', async () => {
    await markOnboardingTutorialCompleted();
    await expect(isOnboardingTutorialCompleted()).resolves.toBe(true);
  });

  it('初回チュートリアルは TASK-139 で配信済みのキーを使い続ける', async () => {
    await markOnboardingTutorialCompleted();
    await expect(
      AsyncStorage.getItem('tutorial.onboarding.completed'),
    ).resolves.toBe('true');
  });

  it('画面ごとのヒントは別々に記録する（TASK-140）', async () => {
    await markTutorialCompleted('projectEdit');
    await expect(isTutorialCompleted('projectEdit')).resolves.toBe(true);
    await expect(isTutorialCompleted('drafts')).resolves.toBe(false);
    await expect(isTutorialCompleted('onboarding')).resolves.toBe(false);
  });
});
