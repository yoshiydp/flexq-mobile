import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 40,
    backgroundColor: COLORS.icon.navigation,
  },
  label: {
    color: COLORS.accent.purple,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 13,
    fontWeight: '700',
  },
  icon: {
    color: COLORS.accent.purple,
  },
});
