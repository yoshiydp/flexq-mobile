import React, { useCallback } from 'react';
import { Animated, View, ActivityIndicator } from 'react-native';
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
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
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

        const updated = (profile?.socialAccounts ?? []).map((acc, i) =>
          i === index ? { ...acc, username: userInfo.name, isLinked: true } : acc,
        );
        await saveSocialAccounts(
          updated.map((acc) => ({
            ...acc,
            icon: SOCIAL_ICON_MAP[acc.provider as keyof typeof SOCIAL_ICON_MAP] ?? acc.icon,
          })),
        );
      } catch (err) {
        console.error('Failed to link Google account:', err);
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
      <Animated.ScrollView style={[styles.container, getAnimStyle(scrollAnim)]}>
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
      </Animated.ScrollView>
    </HomeTabsScreenTemplate>
  );
}
