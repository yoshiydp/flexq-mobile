import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  editor: {
    minHeight: 200,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navigation.bg,
  },
  toolbar: {
    backgroundColor: COLORS.navigation.bg,
    paddingVertical: 4,
  },
  toolbarFlex: {
    flex: 1,
  },
  micButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: COLORS.accent.goldPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  richEditor: {
    color: COLORS.form.default.text,
    fontSize: 18,
    fontWeight: 600,
    backgroundColor: COLORS.base.bgDefault,
  },
});
