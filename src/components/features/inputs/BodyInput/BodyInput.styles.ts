import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  richText: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navigation.bg,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  toolbarButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 36,
    alignItems: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
  },
  toolbarButtonText: {
    color: COLORS.form.default.text,
    fontSize: 14,
    fontWeight: '600',
  },
  toolbarButtonTextActive: {
    color: COLORS.accent.goldPrimary,
  },
});
