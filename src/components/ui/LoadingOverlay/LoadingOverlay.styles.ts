import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.base.bgOverlay,
  },
  indicator: {
    color: COLORS.icon.navigation,
  },
  message: {
    marginTop: 16,
    paddingHorizontal: 32,
    color: COLORS.font.default,
    fontSize: 14,
    textAlign: 'center',
  },
});
