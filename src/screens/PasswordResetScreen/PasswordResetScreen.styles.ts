import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  formContainer: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: 16,
    marginTop: 32,
    paddingHorizontal: 20,
  },
  submitButton: {
    marginHorizontal: 20,
    marginTop: 40,
  },
  notice: {
    color: COLORS.font.default,
    fontSize: 13,
    lineHeight: 20,
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resendLabel: {
    color: COLORS.font.default,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  resendLabelDisabled: {
    color: COLORS.font.label,
    textDecorationLine: 'none',
  },
});
