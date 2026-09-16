import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 80,
    rowGap: 12,
  },
  message: {
    color: COLORS.font.default,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  description: {
    marginBottom: 12,
    color: COLORS.font.label,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    width: '90%',
  },
});
