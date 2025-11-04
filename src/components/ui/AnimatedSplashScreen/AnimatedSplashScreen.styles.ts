import { Dimensions, StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

const { width, height } = Dimensions.get('window');

export default StyleSheet.create({
  container: {
    backgroundColor: COLORS.accent.purple,
    justifyContent: 'center',
    alignItems: 'center',
    width,
    height,
    zIndex: 9999,
  },
});
