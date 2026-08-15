import React, { useCallback } from 'react';
import { Animated, View, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HomeTabsScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import ProfileIcon from '@/components/features/profile/ProfileIcon';
import ReadOnlyFormControl from '@/components/ui/form/ReadOnlyFormControl';
import CancelButton from '@/components/ui/buttons/CancelButton';
import HeaderActionButton from '@/components/ui/buttons/HeaderActionButton';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import { useAnimatedSequence } from '@/hooks/useAnimatedSequence';
import { useModal } from '@/contexts/ModalContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { MODAL_MESSAGES } from '@/constants/messages';
import { useFetchProfile } from '@/hooks/useFetchProfile';
import type { SocialAccount } from '@/hooks/useFetchProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useDeleteAccount } from '@/hooks/useDeleteAccount';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { SOCIAL_ICON_MAP } from '@/constants/socialIconMap';
import styles from './ProfileScreen.styles';

export default function ProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();
  const { profile, loading, refreshProfile } = useFetchProfile();
  const { updateProfile } = useUpdateProfile();
  const { signIn: googleSignIn } = useGoogleAuth();
  const { showConfirmModal, showLoading, hideLoading, closeModal } = useModal();
  const { logout } = useAuthContext();
  const { deleteAccount } = useDeleteAccount();

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile]),
  );

  const scrollAnim = useAnimatedSequence({
    start: startListAnimation,
    fromY: 50,
    duration: 400,
  });

  const getAnimStyle = ({
    translateX,
    translateY,
    opacity,
  }: {
    translateX: Animated.Value;
    translateY: Animated.Value;
    opacity: Animated.Value;
  }) => ({
    opacity,
    transform: [{ translateX }, { translateY }],
  });

  const handleProfileEditPress = () => navigation.navigate('ProfileEdit', {});

  const onSubmitLogout = async () => {
    closeModal();
    showLoading();
    try {
      await logout();
      hideLoading();
    } catch (err) {
      console.error('Logout error:', err);
      hideLoading();
    }
  };

  const onPressLogout = () => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmLogout.message,
      description: MODAL_MESSAGES.confirmLogout.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmLogout.submitButtonLabel,
        onPress: onSubmitLogout,
      },
    });
  };

  // アカウント削除（退会・TASK-80）: 誤操作防止のため確認モーダルを 2 段階表示する。
  // 削除成功後は logout() でトークン破棄 + SignIn 画面へ遷移する
  // （削除済みユーザーの logout API 失敗は logout() 内で握りつぶされる）
  const onSubmitDeleteAccount = useCallback(async () => {
    closeModal();
    showLoading();
    try {
      await deleteAccount();
      await logout();
    } catch (err) {
      console.error('Failed to delete account:', err);
      Alert.alert(
        MODAL_MESSAGES.deleteAccountFailed.title,
        MODAL_MESSAGES.deleteAccountFailed.message,
      );
    } finally {
      hideLoading();
    }
  }, [closeModal, showLoading, hideLoading, deleteAccount, logout]);

  const onPressDeleteAccount = useCallback(() => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmDeleteAccount.message,
      description: MODAL_MESSAGES.confirmDeleteAccount.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmDeleteAccount.submitButtonLabel,
        onPress: () => {
          // 2 段階目: 復元不可の最終確認
          showConfirmModal({
            message: MODAL_MESSAGES.confirmDeleteAccountFinal.message,
            description: MODAL_MESSAGES.confirmDeleteAccountFinal.description,
            submitButton: {
              label: MODAL_MESSAGES.confirmDeleteAccountFinal.submitButtonLabel,
              onPress: onSubmitDeleteAccount,
            },
          });
        },
      },
    });
  }, [showConfirmModal, onSubmitDeleteAccount]);

  const saveSocialAccounts = useCallback(async (updated: SocialAccount[]) => {
    await updateProfile({
      socialAccounts: updated.map(({ provider, username, isLinked }) => ({
        provider,
        username,
        isLinked,
      })),
    });
    await refreshProfile();
  }, [updateProfile, refreshProfile]);

  const onPressLinkAccount = useCallback(async (index: number) => {
    const target = profile?.socialAccounts?.[index];
    if (!target) return;

    if (target.provider === 'google') {
      showLoading();
      try {
        const userInfo = await googleSignIn();
        if (!userInfo) return;

        // googleSub をサーバーへ保存し、連携済み Google アカウントでの
        // 再ログイン（post-auth-google の sub 照合）を可能にする (TASK-78)
        await DefaultService.postDataProfileLinkGoogle({
          accessToken: userInfo.accessToken,
        });

        const updated = (profile?.socialAccounts ?? []).map((acc, i) =>
          i === index ? { ...acc, username: userInfo.name, isLinked: true } : acc,
        );
        await saveSocialAccounts(
          updated.map((acc) => ({
            ...acc,
            icon: SOCIAL_ICON_MAP[acc.provider as keyof typeof SOCIAL_ICON_MAP] ?? acc.icon,
          })),
        );
      } catch (err: any) {
        console.error('Failed to link Google account:', err);
        if (err?.status === 409) {
          Alert.alert(
            'エラー',
            'この Google アカウントはすでに別のアカウントに連携されています。',
          );
        } else {
          Alert.alert('エラー', 'Google アカウントの連携に失敗しました。');
        }
      } finally {
        hideLoading();
      }
    }
    // TODO: X連携を実装したら provider === 'x' の分岐を追加する
    // TODO: Instagram連携を実装したら provider === 'instagram' の分岐を追加する
  }, [profile, googleSignIn, saveSocialAccounts, showLoading, hideLoading]);

  if (loading || !profile) {
    return (
      <HomeTabsScreenTemplate
        title="PROFILE"
        titleAnim1={titleAnim1}
        titleAnim2={titleAnim2}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </HomeTabsScreenTemplate>
    );
  }

  return (
    <HomeTabsScreenTemplate
      title="PROFILE"
      titleAnim1={titleAnim1}
      titleAnim2={titleAnim2}
    >
      <HeaderActionButton
        icon="edit"
        onPress={handleProfileEditPress}
        startAnimation={startListAnimation}
      />
      <Animated.ScrollView
        style={[styles.container, getAnimStyle(scrollAnim)]}
        contentContainerStyle={styles.scrollContent}
      >
        <ProfileIcon thumbnail={profile.thumbnail} />
        <View style={styles.formControlContainer}>
          <ReadOnlyFormControl label="User Name" formValue={profile.username} />
          <ReadOnlyFormControl label="Email" formValue={profile.email} />
          <ReadOnlyFormControl
            label="Link Social Accounts"
            showSocialAccounts
            socialAccounts={profile.socialAccounts}
            onPressLinkAccount={onPressLinkAccount}
          />
        </View>
        <View style={styles.border} />
        <CancelButton
          containerClassName={styles.logoutButton}
          label="LOGOUT"
          onPress={onPressLogout}
        />
        <CancelButton
          containerClassName={styles.deleteAccountButton}
          labelClassName={styles.deleteAccountLabel}
          label="DELETE ACCOUNT"
          onPress={onPressDeleteAccount}
          testID="delete-account-button"
        />
      </Animated.ScrollView>
    </HomeTabsScreenTemplate>
  );
}
