import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  formContainer: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: 16,
    marginTop: 24,
    paddingHorizontal: 20,
  },
  submitButton: {
    marginHorizontal: 20,
    marginTop: 32,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginHorizontal: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.font.label,
    opacity: 0.4,
  },
  dividerText: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.label,
    fontSize: 16,
    letterSpacing: 1,
  },
  googleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginHorizontal: 20,
    // SubmitButton（CREATE）と同じ高さに揃える
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.font.label,
  },
  googleButtonLabel: {
    color: COLORS.font.default,
    fontSize: 14,
    fontWeight: '600',
  },
  verifyNotice: {
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
