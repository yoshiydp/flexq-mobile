import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, ActivityIndicator, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import OverlayScreenTemplate from '@/components/features/overlay/OverlayScreenTemplate';
import ProfileIcon from '@/components/features/profile/ProfileIcon';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import { MODAL_MESSAGES } from '@/constants/messages';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { useFetchProfile } from '@/hooks/useFetchProfile';
import type { SocialAccount } from '@/hooks/useFetchProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { SOCIAL_ICON_MAP } from '@/constants/socialIconMap';
import styles from './ProfileEditScreen.styles';

const SOCIAL_DISPLAY_NAMES: Record<string, string> = {
  // TODO: X連携を実装したら下記を追加する
  // x: 'X',

  // TODO: Instagram連携を実装したら下記を追加する
  // instagram: 'Instagram',

  google: 'Google',
};

const DEFAULT_SOCIAL_ACCOUNTS: SocialAccount[] = (
  Object.keys(SOCIAL_ICON_MAP) as (keyof typeof SOCIAL_ICON_MAP)[]
).map((provider) => ({
  provider,
  icon: SOCIAL_ICON_MAP[provider],
  username: '',
  isLinked: false,
}));

export default function ProfileEditScreen() {
  const navigation = useNavigation();
  const { profile, loading } = useFetchProfile();
  const { pickThumbnail, uploadThumbnail, updateProfile } = useUpdateProfile();
  const { showConfirmModal, showInputModal, showLoading, hideLoading, closeModal } = useModal();
  const { signIn: googleSignIn } = useGoogleAuth();

  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [changedUsername, setChangedUsername] = useState<string | null>(null);
  const [localSocialAccounts, setLocalSocialAccounts] = useState<SocialAccount[]>(DEFAULT_SOCIAL_ACCOUNTS);

  useEffect(() => {
    if (profile?.socialAccounts?.length) {
      setLocalSocialAccounts(profile.socialAccounts);
    }
  }, [profile]);

  const saveSocialAccounts = useCallback(async (updated: SocialAccount[]) => {
    await updateProfile({
      socialAccounts: updated.map(({ provider, username, isLinked }) => ({
        provider,
        username,
        isLinked,
      })),
    });
    setLocalSocialAccounts(
      updated.map((acc) => ({
        ...acc,
        icon: SOCIAL_ICON_MAP[acc.provider as keyof typeof SOCIAL_ICON_MAP] ?? acc.icon,
      })),
    );
  }, [updateProfile]);

  const handlePickThumbnail = async () => {
    const uri = await pickThumbnail();
    if (!uri) return;
    setThumbnailUri(uri);
  };

  const onSaveProfile = async () => {
    Keyboard.dismiss();
    if (!profile) return;
    showLoading();
    try {
      let thumbnailKey: string | undefined;
      if (thumbnailUri) {
        thumbnailKey = await uploadThumbnail(thumbnailUri);
      }

      await updateProfile({
        username: changedUsername ?? profile.username,
        email: profile.email,
        ...(thumbnailKey ? { thumbnailKey } : {}),
      });

      navigation.goBack();
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      hideLoading();
    }
  };

  const linkWithGoogle = useCallback(async (index: number) => {
    showLoading();
    try {
      const userInfo = await googleSignIn();
      if (!userInfo) return;

      const updated = localSocialAccounts.map((acc, i) =>
        i === index ? { ...acc, username: userInfo.name, isLinked: true } : acc,
      );
      await saveSocialAccounts(updated);
    } catch (err) {
      console.error('Failed to link Google account:', err);
    } finally {
      hideLoading();
    }
  }, [googleSignIn, localSocialAccounts, saveSocialAccounts, showLoading, hideLoading]);

  const linkWithInput = useCallback((index: number) => {
    const target = localSocialAccounts[index];
    if (!target) return;
    const displayName = SOCIAL_DISPLAY_NAMES[target.provider] ?? target.provider;

    showInputModal({
      placeholder: MODAL_MESSAGES.confirmLinkAccount.placeholder(displayName),
      onSubmit: async (username: string) => {
        closeModal();
        showLoading();
        try {
          const updated = localSocialAccounts.map((acc, i) =>
            i === index ? { ...acc, username, isLinked: true } : acc,
          );
          await saveSocialAccounts(updated);
        } catch (err) {
          console.error('Failed to link account:', err);
        } finally {
          hideLoading();
        }
      },
    });
  }, [localSocialAccounts, saveSocialAccounts, showInputModal, showLoading, hideLoading, closeModal]);

  const onPressLinkAccount = useCallback((index: number) => {
    const target = localSocialAccounts[index];
    if (!target) return;

    if (target.provider === 'google') {
      linkWithGoogle(index);
    } else {
      linkWithInput(index);
    }
  }, [localSocialAccounts, linkWithGoogle, linkWithInput]);

  const onPressRemoveLink = useCallback((index: number) => {
    const target = localSocialAccounts[index];
    const displayName = SOCIAL_DISPLAY_NAMES[target?.provider ?? ''] ?? target?.provider ?? '';

    showConfirmModal({
      message: MODAL_MESSAGES.confirmRemoveLink.message(displayName),
      description: MODAL_MESSAGES.confirmRemoveLink.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmRemoveLink.submitButtonLabel,
        onPress: async () => {
          closeModal();
          showLoading();
          try {
            const updated = localSocialAccounts.map((acc, i) =>
              i === index ? { ...acc, username: '', isLinked: false } : acc,
            );
            await saveSocialAccounts(updated);
          } catch (err) {
            console.error('Failed to remove link:', err);
          } finally {
            hideLoading();
          }
        },
      },
    });
  }, [localSocialAccounts, saveSocialAccounts, showConfirmModal, showLoading, hideLoading, closeModal]);

  if (loading || !profile) {
    return (
      <OverlayScreenTemplate>
        <View style={styles.container}>
          <ActivityIndicator size="large" />
        </View>
      </OverlayScreenTemplate>
    );
  }

  const currentUsername = changedUsername ?? profile.username;
  const currentThumbnail = thumbnailUri ? { uri: thumbnailUri } : profile.thumbnail;

  return (
    <OverlayScreenTemplate>
      <ScrollView style={styles.container} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <ProfileIcon
          thumbnail={currentThumbnail}
          editable
          onPressUpload={handlePickThumbnail}
        />
        <View style={styles.formControlContainer}>
          <EditableFormControl
            key="username"
            label="User Name"
            formValue={profile.username}
            placeholder={PLACEHOLDERS.profileEdit.usernameInput}
            onChangeText={setChangedUsername}
          />
          <EditableFormControl
            key="email"
            label="Email"
            formValue={profile.email}
            placeholder={PLACEHOLDERS.profileEdit.emailInput}
            readOnly
          />
          <SubmitButton
            containerClassName={styles.saveButton}
            label="SAVE"
            onPress={onSaveProfile}
            disabled={!currentUsername}
          />
          <EditableFormControl
            label="Link Social Accounts"
            showSocialAccounts
            socialAccounts={localSocialAccounts}
            onPressRemoveLink={onPressRemoveLink}
            onPressLinkAccount={onPressLinkAccount}
          />
        </View>
      </ScrollView>
    </OverlayScreenTemplate>
  );
}
