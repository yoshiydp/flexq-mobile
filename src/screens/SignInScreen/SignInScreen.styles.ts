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
    alignSelf: 'center',
    width: '76%',
    marginTop: 28,
    gap: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.font.label,
    opacity: 0.6,
  },
  dividerText: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.label,
    fontSize: 18,
    letterSpacing: 1,
  },
  googleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: '76%',
    gap: 10,
    marginTop: 28,
    height: 48,
    borderRadius: 10,
    backgroundColor: COLORS.base.borderWhite,
  },
  googleButtonLabel: {
    color: COLORS.font.pageTitle,
    fontSize: 15,
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
