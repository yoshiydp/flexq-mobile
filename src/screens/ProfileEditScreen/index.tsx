import React, { useState } from 'react';
import { ScrollView, View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import OverlayScreenTemplate from '@/components/features/overlay/OverlayScreenTemplate';
import ProfileIcon from '@/components/features/profile/ProfileIcon';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import { MODAL_MESSAGES } from '@/constants/messages';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { useFetchProfile } from '@/hooks/useFetchProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import styles from './ProfileEditScreen.styles';

export default function ProfileEditScreen() {
  const navigation = useNavigation();
  const { profile, loading } = useFetchProfile();
  const { pickThumbnail, uploadThumbnail, updateProfile } = useUpdateProfile();
  const { showConfirmModal, showLoading, hideLoading, closeModal } = useModal();

  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  // 変更分のみ追跡。null = 未変更 (profile の値をそのまま使う)
  const [changedUsername, setChangedUsername] = useState<string | null>(null);

  const handlePickThumbnail = async () => {
    const uri = await pickThumbnail();
    if (!uri) return;
    setThumbnailUri(uri);
  };

  const onSaveProfile = async () => {
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

  const onPressRemoveLink = (serviceName: string) => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmRemoveLink.message(serviceName),
      description: MODAL_MESSAGES.confirmRemoveLink.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmRemoveLink.submitButtonLabel,
        onPress: () => {
          closeModal();
          showLoading();
          setTimeout(() => {
            hideLoading();
            closeModal();
          }, 3000);
        },
      },
    });
  };

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
      <ScrollView style={styles.container}>
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
            socialAccounts={profile.socialAccounts}
            onPressRemoveLink={(index: number) => {
              const target = profile.socialAccounts?.[index];
              const serviceName = target
                ? (target as any).provider ?? 'SNS'
                : 'SNS';
              onPressRemoveLink(serviceName);
            }}
          />
        </View>
      </ScrollView>
    </OverlayScreenTemplate>
  );
}
