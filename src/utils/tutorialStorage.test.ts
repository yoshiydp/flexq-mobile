import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isOnboardingTutorialCompleted,
  markOnboardingTutorialCompleted,
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
});
