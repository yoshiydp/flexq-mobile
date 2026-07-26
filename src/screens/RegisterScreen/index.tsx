import React, { useState } from 'react';
import { View, ScrollView, Alert, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import ProfileIcon from '@/components/features/profile/ProfileIcon';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useModal } from '@/contexts/ModalContext';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { PLACEHOLDERS } from '@/constants/placeholders';
import type { RootStackParamList } from '@/navigation/types';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './RegisterScreen.styles';

export default function RegisterScreen() {
  // Android のシステム back ジェスチャー / 戻るボタンによる誤操作の画面戻りを防止（TASK-67）
  useBlockAndroidBackGesture();

  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList>>();
  const { login } = useAuthContext();
  const { uploadThumbnail, updateProfile } = useUpdateProfile();
  const { showLoading, hideLoading } = useModal();

  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoBack = () => navigation.goBack();

  const handlePickThumbnail = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    Keyboard.dismiss();
    if (!username || !email || !password) {
      Alert.alert('Error', '全ての項目を入力してください。');
      return;
    }

    showLoading();
    try {
      await DefaultService.postDataAuthRegister({ username, email, password });
      await login(email, password);

      // ログイン後、サムネイルを S3 アップロード → プロフィール更新
      if (thumbnailUri) {
        const thumbnailKey = await uploadThumbnail(thumbnailUri);
        await updateProfile({ username, thumbnailKey });
      }

      // 全処理完了後に遷移
      navigation.navigate('HomeTabs');
    } catch (err: any) {
      const status = err?.status;
      if (status === 409) {
        Alert.alert('エラー', 'このメールアドレスはすでに登録されています。');
      } else {
        Alert.alert('エラー', '登録に失敗しました。');
      }
    } finally {
      hideLoading();
    }
  };

  const headerItems: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    {
      ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
      headerTitle: 'REGISTER',
    },
  ];

  const thumbnail = thumbnailUri ? { uri: thumbnailUri } : undefined;

  return (
    <View style={styles.container}>
      <HeaderToolBar items={headerItems} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <ProfileIcon
          thumbnail={thumbnail}
          editable
          onPressUpload={handlePickThumbnail}
        />
        <View style={styles.formContainer}>
          <EditableFormControl
            label="User Name"
            darkMode
            formValue={username}
            onChangeText={setUsername}
            placeholder={PLACEHOLDERS.register.usernameInput}
          />
          <EditableFormControl
            label="Email"
            darkMode
            formValue={email}
            onChangeText={setEmail}
            placeholder={PLACEHOLDERS.register.emailInput}
          />
          <EditableFormControl
            label="Password"
            darkMode
            secureTextEntry
            formValue={password}
            onChangeText={setPassword}
            placeholder={PLACEHOLDERS.register.passwordInput}
          />
        </View>
        <SubmitButton
          containerClassName={styles.submitButton}
          label="CREATE"
          onPress={handleCreate}
          disabled={!username || !email || !password}
        />
      </ScrollView>
    </View>
  );
}
