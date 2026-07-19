import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.accent.goldPrimary,
  },
  label: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.pageTitle,
  },
  iconContainer: {
    position: 'absolute',
    top: '50%',
    right: 10,
    transform: [{ translateY: '-20%' }],
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    flex: 1,
  },
  icon: {
    color: COLORS.font.pageTitle,
  },
});
