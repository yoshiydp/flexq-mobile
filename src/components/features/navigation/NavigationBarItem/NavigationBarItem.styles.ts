import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  item: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: COLORS.icon.navigation,
  },
  activeIcon: {
    color: COLORS.accent.goldPrimary,
  },
  label: {
    fontFamily: 'BebasNeue',
    fontSize: 14,
    lineHeight: 14,
    color: COLORS.icon.navigation,
    marginTop: 8,
  },
  activeLabel: {
    color: COLORS.accent.goldPrimary,
  },
});
