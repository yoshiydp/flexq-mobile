import React from 'react';
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
import styles from './ProfileEditScreen.styles';

export default function ProfileEditScreen() {
  const navigation = useNavigation();
  const { profile, loading } = useFetchProfile();
  const { showConfirmModal, showLoading, hideLoading, closeModal } = useModal();

  const onSaveProfile = () => {
    showLoading();
    // TODO: 実際には PATCH / PUT API 呼び出しを行う
    setTimeout(() => {
      hideLoading();
      navigation.goBack();
    }, 3000);
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

  return (
    <OverlayScreenTemplate>
      <ScrollView style={styles.container}>
        <ProfileIcon thumbnail={profile.thumbnail} editable />
        <View style={styles.formControlContainer}>
          <EditableFormControl
            label="User Name"
            formValue={profile.username}
            placeholder={PLACEHOLDERS.profileEdit.usernameInput}
          />
          <EditableFormControl
            label="Email"
            formValue={profile.email}
            placeholder={PLACEHOLDERS.profileEdit.emailInput}
          />
          <SubmitButton
            containerClassName={styles.saveButton}
            label="SAVE"
            onPress={onSaveProfile}
            disabled={!profile.username || !profile.email}
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
