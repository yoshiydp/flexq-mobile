import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: COLORS.base.borderDefault,
    borderRadius: 4,
  },
  isLinked: {
    borderColor: COLORS.accent.goldPrimary,
    backgroundColor: COLORS.navigation.bg,
  },
  username: {
    color: COLORS.form.default.text,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 600,
  },
  notLinkedContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
  },
  notLinkedText: {
    color: COLORS.base.borderDefault,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: 600,
  },
  notLinkedIcon: {
    marginRight: 6,
    color: COLORS.base.borderDefault,
  },
  socialIconContainer: {
    marginRight: 'auto',
  },
  linkIcon: {
    marginLeft: 'auto',
    color: COLORS.accent.goldPrimary,
  },
  removeButton: {
    marginLeft: 'auto',
  },
  removeButtonText: {
    marginLeft: 'auto',
    color: COLORS.action.record,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: 700,
  },
  linkButton: {
    marginLeft: 'auto',
    borderRadius: 2,
    backgroundColor: COLORS.accent.goldPrimary,
  },
  linkButtonText: {
    padding: 6,
    paddingHorizontal: 12,
    color: COLORS.accent.purple,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: 700,
  },
});
