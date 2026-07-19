import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 40,
  },
  playIcon: {
    marginLeft: 4,
  },
  repeatButton: {
    position: 'absolute',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: 44,
    height: 44,
  },
  cueRepeatButton: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: 44,
    height: 44,
    marginRight: 15,
  },
  icon: {
    color: COLORS.font.default,
  },
  disabledIcon: {
    color: COLORS.icon.default,
  },
  controlButton: {
    padding: 12,
    borderRadius: 8,
  },
  controlButtonText: {
    color: COLORS.font.default,
    fontSize: 14,
  },
  controlAllCueResetText: {
    textAlign: 'center',
    fontFamily: 'BebasNeue',
    color: COLORS.font.default,
    fontSize: 20,
  },
  disabledText: {
    color: COLORS.icon.default,
  },
});
