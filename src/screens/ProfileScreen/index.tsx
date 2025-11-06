import React from 'react';
import { Animated, View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import styles from './ProfileScreen.styles';

export default function ProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();
  const { profile, loading } = useFetchProfile();
  const { showConfirmModal, showLoading, hideLoading, closeModal } = useModal();
  const { logout } = useAuthContext();

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

  if (loading || !profile) {
    return (
      <HomeTabsScreenTemplate
        title="PROFILE"
        titleAnim1={titleAnim1}
        titleAnim2={titleAnim2}
      >
        <View style={styles.container}>
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
