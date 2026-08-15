import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 80,
    backgroundColor: COLORS.base.bgDefault,
  },
  appLogoContainer: {
    alignSelf: 'center',
  },
  formControlContainer: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: 16,
    marginTop: 40,
  },
  resetPasswordLink: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  resetPasswordText: {
    color: COLORS.accent.purple,
    fontSize: 14,
    marginTop: 8,
  },
  signInButtonWrapper: {
    marginTop: 32,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.font.label,
    opacity: 0.4,
  },
  dividerText: {
    color: COLORS.font.label,
    fontSize: 12,
  },
  googleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.font.label,
  },
  googleButtonLabel: {
    color: COLORS.font.default,
    fontSize: 14,
    fontWeight: '600',
  },
  registerLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 8,
  },
  registerLinkLabel: {
    color: COLORS.font.label,
    fontSize: 14,
  },
  registerLinkText: {
    color: COLORS.accent.goldPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
