import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heading: {
    fontFamily: 'NotoSansJP_700Bold',
    color: COLORS.font.default,
    fontSize: 24,
    lineHeight: 29,
  },
  badge: {
    backgroundColor: COLORS.font.label,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: {
    color: COLORS.font.default,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  content: {
    marginTop: 12,
  },
});
