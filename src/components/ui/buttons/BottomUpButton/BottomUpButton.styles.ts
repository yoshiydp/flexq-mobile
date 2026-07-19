import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 8,
    marginHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.navigation.bg,
  },
  label: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.navigation,
    fontSize: 30,
  },
  icon: {
    color: COLORS.font.navigation,
  },
});
