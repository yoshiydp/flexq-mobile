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
    color: COLORS.font.label,
    fontSize: 12,
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
});
