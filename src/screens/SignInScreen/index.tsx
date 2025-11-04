import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppLogo from '@/components/ui/AppLogo';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { PLACEHOLDERS } from '@/constants/placeholders';
import styles from './SignInScreen.styles';

export default function SignInScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { showLoading, hideLoading } = useModal();
  const { login, isAuthenticated } = useAuthContext();

  const submitSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    showLoading();
    await login(email, password);
    hideLoading();

    if (isAuthenticated) {
      navigation.navigate('HomeTabs', { screen: 'ProjectList' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.appLogoContainer}>
        <AppLogo />
      </View>
      <View style={styles.formControlContainer}>
        <EditableFormControl
          label="Your Email"
          darkMode
          formValue={email}
          onChangeText={setEmail}
          placeholder={PLACEHOLDERS.signIn.emailInput}
        />
        <EditableFormControl
          label="Password"
          darkMode
          secureTextEntry
          formValue={password}
          onChangeText={setPassword}
          placeholder={PLACEHOLDERS.signIn.passwordInput}
        />
      </View>
      <View style={styles.signInButtonWrapper}>
        <SubmitButton
          label="Sign In"
          onPress={submitSignIn}
          disabled={!email || !password}
        />
      </View>
    </View>
  );
}
