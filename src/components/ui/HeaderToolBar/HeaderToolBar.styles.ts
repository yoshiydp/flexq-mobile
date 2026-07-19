import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    height: 70,
    backgroundColor: COLORS.base.bgDefault,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    position: 'relative',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  button: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
  },
  defaultColor: {
    color: COLORS.icon.default,
  },
  primaryColor: {
    color: COLORS.accent.goldPrimary,
  },
  headerTitle: {
    fontFamily: 'BebasNeue',
    color: COLORS.icon.default,
    fontSize: 28,
  },
  iconAngleLeft: {
    marginRight: 3,
    marginBottom: 2,
  },
});
