import { useEffect, useState, useCallback } from 'react';
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';
import { withRequestTimeout } from '@/utils/requestTimeout';
import { SOCIAL_ICON_MAP } from '@/constants/socialIconMap';

export interface SocialAccount {
  provider: string;
  icon: FC<SvgProps>;
  username: string;
  isLinked: boolean;
}

export interface ProfileType {
  username: string;
  email: string;
  thumbnail: { uri: string };
  socialAccounts: SocialAccount[];
}

const SOCIAL_PROVIDERS = Object.keys(SOCIAL_ICON_MAP) as (keyof typeof SOCIAL_ICON_MAP)[];

export function useFetchProfile(
  options: {
    /** フォアグラウンド復帰時の自動再フェッチ（既定: true）。編集画面では false にして編集内容の上書きを防ぐ */
    refreshOnForeground?: boolean;
  } = {},
) {
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await withRequestTimeout(DefaultService.getProfile());

      const mappedAccounts: SocialAccount[] = (res.socialAccounts ?? []).map(
        (acc: { provider: keyof typeof SOCIAL_ICON_MAP; username: string; isLinked: boolean }) => ({
          provider: acc.provider,
          // 未実装の連携（x / instagram）は SOCIAL_ICON_MAP に存在しないため
          // フォールバック先も無い（socialIconMap.ts の TODO 参照）
          icon: SOCIAL_ICON_MAP[acc.provider],
          username: acc.username,
          isLinked: acc.isLinked,
        }),
      );

      const socialAccounts = SOCIAL_PROVIDERS.map((provider) => {
        const existing = mappedAccounts.find((a) => a.provider === provider);
        return existing ?? {
          provider,
          icon: SOCIAL_ICON_MAP[provider],
          username: '',
          isLinked: false,
        };
      });

      setProfile({
        ...res,
        thumbnail: { uri: res.thumbnail },
        socialAccounts,
      });
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // フォアグラウンド復帰時にプロフィール（画像の Presigned URL 含む）を再フェッチ（TASK-47）
  useForegroundRefresh(fetchProfile, {
    enabled: options.refreshOnForeground ?? true,
  });

  return { profile, loading, error, refreshProfile: fetchProfile };
}
