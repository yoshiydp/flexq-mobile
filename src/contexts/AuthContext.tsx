import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { Alert } from 'react-native';
import {
  saveAuthTokens,
  getAccessToken,
  clearAuthTokens,
} from '@/utils/authStorage';
import { setOnSessionExpired } from '@/utils/authTokenInterceptor';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { AuthUser } from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  loading: false,
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await DefaultService.postDataAuthLogin({ email, password });
      if (!res || !res.token) throw new Error('Invalid credentials');

      await saveAuthTokens(res.token);
      setUser(res);
    } catch (err) {
      console.error('Login failed:', err);
      Alert.alert('Login Failed', 'Invalid email or password.');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await DefaultService.postDataAuthLogout();
    } catch {
      console.warn('Logout API call failed (offline mode).');
    } finally {
      await clearAuthTokens();
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await DefaultService.getProfile();
      if (profile) {
        setUser(profile);
      }
    } catch (err: any) {
      console.error('Failed to refresh profile:', err);
      if (err?.status === 404) {
        // ユーザー削除(404)の場合はトークンを破棄してログアウト
        await clearAuthTokens();
        setUser(null);
      } else if (err?.status === 401) {
        // セッション失効による 401 はインターセプター側でトークン破棄済み。
        // 一時的なリフレッシュ失敗（ネットワーク・5xx）ではトークンを保持し、
        // 次回のリクエスト/起動時に再試行できるようにここでは破棄しない。
        setUser(null);
      }
    }
  }, []);

  // トークンリフレッシュ不能（セッション期限切れ）時の強制ログアウト導線。
  // トークン破棄はインターセプター側で実施済みのため、ここでは
  // ユーザーへの通知とログイン画面への遷移（user を null に）のみ行う。
  useEffect(() => {
    setOnSessionExpired(() => {
      setUser((prev) => {
        if (prev) {
          Alert.alert(
            'セッションの有効期限が切れました',
            'お手数ですが、再度ログインしてください。'
          );
        }
        return null;
      });
    });
    return () => setOnSessionExpired(null);
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          await refreshProfile();
        }
      } catch (err) {
        console.error('Auto login failed:', err);
      } finally {
        setLoading(false);
      }
    };
    initializeAuth();
  }, [refreshProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);
