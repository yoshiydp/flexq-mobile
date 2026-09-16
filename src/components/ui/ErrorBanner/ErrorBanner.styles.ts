import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.action.record,
    backgroundColor: COLORS.surface.waveform,
  },
  message: {
    flexShrink: 1,
    color: COLORS.font.default,
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: COLORS.accent.goldPrimary,
  },
  retryLabel: {
    color: COLORS.accent.goldPrimary,
    fontSize: 12,
    lineHeight: 18,
  },
});
