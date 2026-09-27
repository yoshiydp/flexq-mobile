import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    // React Native は CSS の position: 'fixed' を解釈できず relative に
    // フォールバックするため、実際の表示と同じ relative を明示する
    position: 'relative',
    bottom: 20,
    left: '50%',
    transform: [{ translateX: '-50%' }],
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: 48,
    height: 48,
    borderRadius: '50%',
    backgroundColor: COLORS.navigation.bg,
  },
  icon: {
    color: COLORS.accent.purple,
  },
});
