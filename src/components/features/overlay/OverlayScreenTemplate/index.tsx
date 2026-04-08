import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import CloseButton from '@/components/ui/buttons/CloseButton';
import styles from './OverlayScreenTemplate.styles';

interface OverlayScreenTemplateProps {
  children: React.ReactNode;
  onClose?: () => void;
}

export default function OverlayScreenTemplate({
  children,
  onClose,
}: OverlayScreenTemplateProps) {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      {children}
      <CloseButton onPress={onClose ?? (() => navigation.goBack())} />
    </View>
  );
}
