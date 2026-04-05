import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontFamily: 'NotoSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 700,
  },
  lightLabel: {
    color: COLORS.form.default.text,
  },
  darkLabel: {
    color: COLORS.font.label,
  },
  textInput: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginTop: 6,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
  },
  lightTextInput: {
    color: COLORS.form.search.default,
    backgroundColor: COLORS.form.overlay.background,
  },
  darktextInput: {
    color: COLORS.form.default.text,
    borderStyle: 'solid',
    borderColor: COLORS.form.default.border,
    borderWidth: 1,
    backgroundColor: COLORS.form.default.background,
  },
  formValue: {
    paddingHorizontal: 12,
    marginTop: 12,
    color: COLORS.form.default.text,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 20,
    lineHeight: 30,
    fontWeight: 600,
  },
  socialAccountContainer: {
    marginTop: 16,
    paddingHorizontal: 10,
  },
  readOnly: {
    opacity: 0.5,
  },
});
