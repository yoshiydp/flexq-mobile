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
