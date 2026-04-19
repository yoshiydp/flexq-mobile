import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.base.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    backgroundColor: COLORS.accent.purple,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  buttonWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: 24,
    marginTop: 20,
  },
  buttonContainer: {
    minWidth: 86,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 0,
  },
  buttonText: {
    fontSize: 28,
    lineHeight: 28,
  },
  cancelButton: {
    backgroundColor: COLORS.form.default.background,
  },
  cancelButtonText: {
    color: COLORS.accent.purple,
  },
  submitButton: {
    backgroundColor: COLORS.accent.goldPrimary,
  },
  submitButtonText: {
    color: COLORS.accent.purple,
  },
});
