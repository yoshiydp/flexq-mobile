import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 52,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.accent.goldPrimary,
  },
  disabledContainer: {
    opacity: 0.2,
  },
  label: {
    fontFamily: 'NotoSansJP_700Bold',
    color: COLORS.font.pageTitle,
    fontSize: 36,
    lineHeight: 43,
  },
});
