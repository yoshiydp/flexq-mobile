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
});
